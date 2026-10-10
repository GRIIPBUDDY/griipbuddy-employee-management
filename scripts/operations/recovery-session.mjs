// Internal one-off helper, never an HTTP endpoint. Invoked by the host recovery tool.
import pg from 'pg';
import { open, readdir, lstat, link, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { keyPattern, validateManifest } from './recovery-manifest.mjs';
const root = resolve(process.env.PRIVATE_DOCUMENTS_DIR ?? '/app/private/documents');
async function bytes(key) {
  if (!keyPattern.test(key)) throw new Error('Invalid document key.');
  if ((await lstat(root)).isSymbolicLink()) throw new Error('Invalid private directory.');
  const file = await open(join(root, key), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 10485760) throw new Error('Invalid private file.');
    return await file.readFile();
  } finally { await file.close(); }
}
async function stdin() { const chunks=[]; let size=0; for await (const c of process.stdin) { size+=c.length; if(size>33554432)throw new Error('Recovery input exceeds limit.');chunks.push(c); } return Buffer.concat(chunks); }
const client = new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:60000});
try {
  const mode=process.argv[2];
  if(mode==='read')process.stdout.write(await bytes(process.argv[3]));
  else if(mode==='write') {
    const key=process.argv[3],sha=process.argv[4],size=Number(process.argv[5]);
    validateManifest({version:1,references:[],files:[{key,sha256:sha,size}]});
    const data=await stdin();if(data.length!==size||createHash('sha256').update(data).digest('hex')!==sha)throw new Error('Recovery bytes failed integrity check.');
    const temp=join(root,randomUUID()+'.tmp'),file=await open(temp,'wx',0o600);
    try {await file.writeFile(data);await file.sync();}finally{await file.close();}
    await link(temp,join(root,key));await unlink(temp);
    const directory=await open(root,'r');try{await directory.sync();}finally{await directory.close();}
  } else {
    await client.connect();
    const references=async()=> (await client.query('SELECT storage_key AS key,file_size::int AS size,sha256 FROM employee_documents ORDER BY storage_key')).rows;
    if(mode==='hold') {
      if(!(await client.query('SELECT pg_try_advisory_lock_shared(73102302) AS locked')).rows[0].locked)throw new Error('Physical document cleanup is active. Retry later.');
      const deadline=setTimeout(()=>{console.error('Recovery lock timed out.');process.exit(1);},600000);
      console.log(JSON.stringify({ready:true}));
      for await (const line of createInterface({input:process.stdin})) {
        if(line==='release')break;
        if(line!=='manifest')throw new Error('Unknown recovery command.');
        const refs=await references(),files=[];
        for(const key of (await readdir(root)).filter(n=>keyPattern.test(n)).sort()) {
          const data=await bytes(key);files.push({key,size:data.length,sha256:createHash('sha256').update(data).digest('hex')});
        }
        const manifest={version:1,references:refs,files};validateManifest(manifest);console.log(JSON.stringify(manifest));
      }
      clearTimeout(deadline);
    } else if(mode==='verify') {
      const manifest=JSON.parse((await stdin()).toString('utf8')),files=validateManifest(manifest),refs=await references();
      for(const ref of refs){const file=files.get(ref.key);if(!file||file.sha256!==ref.sha256||file.size!==ref.size)throw new Error('Restored database references invalid file bytes.');}
      for(const file of files.values()){const data=await bytes(file.key);if(data.length!==file.size||createHash('sha256').update(data).digest('hex')!==file.sha256)throw new Error('Restored private file failed integrity check.');}
      console.log(JSON.stringify({verifiedReferences:refs.length,verifiedFiles:files.size}));
    } else throw new Error('Unknown recovery mode.');
  }
} catch { console.error('Recovery helper failed; no successful recovery set is recorded.');process.exitCode=1; }
finally {await client.end().catch(()=>{});}
