// Host-side operations: Node 24 + Docker Compose. No secrets are printed or passed as CLI passwords.
import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile,lstat,readdir,realpath,open} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateManifest} from './recovery-manifest.mjs';
export function options(args) {
  const mode=args.shift(),v={mode,files:['docker-compose.yml']};
  if(!['backup','verify','restore-drill'].includes(mode))throw new Error('Use backup, verify or restore-drill.');
  while(args.length){const flag=args.shift(),value=args.shift();if(!value)throw new Error('Missing option value.');
    if(flag==='--compose-file')v.files.push(value);
    else if(['--project','--env-file','--directory','--release'].includes(flag))v[flag.slice(2)]=value;
    else throw new Error('Unknown recovery option.');
  }
  if(!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(v.project??'')||!v['env-file']||!v.directory)throw new Error('Supply explicit project, env-file and private directory.');
  if(mode==='backup'&&!/^[a-zA-Z0-9._-]{1,100}$/.test(v.release??''))throw new Error('Supply an immutable release identifier.');
  if(mode==='restore-drill'&&!v.project.startsWith('griipbuddy-restore-'))throw new Error('Restore is restricted to disposable griipbuddy-restore-* projects.');
  return v;
}
async function hash(path) {const digest=createHash('sha256');for await(const c of createReadStream(path))digest.update(c);return digest.digest('hex');}
export async function verifySet(directory) {
  for(const path of [directory,join(directory,'documents')]){const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))throw new Error('Recovery directories must be private and real directories.');}
  for(const name of ['status.json','checksums.json']){const stat=await lstat(join(directory,name));if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))throw new Error('Recovery metadata must be private regular files.');}
  if(JSON.stringify((await readdir(directory)).sort())!==JSON.stringify(['checksums.json','database.dump','deployment.json','document-manifest.json','documents','status.json'].sort()))throw new Error('Unexpected recovery artifacts.');
  const status=JSON.parse(await readFile(join(directory,'status.json'),'utf8'));
  if(status.status!=='LOCAL_VALIDATED')throw new Error('Recovery set is incomplete.');
  const manifest=JSON.parse(await readFile(join(directory,'document-manifest.json'),'utf8')),files=validateManifest(manifest);
  const checksums=JSON.parse(await readFile(join(directory,'checksums.json'),'utf8'));
  const names=['database.dump','deployment.json','document-manifest.json',...[...files.keys()].map(k=>'documents/'+k)].sort();
  if(JSON.stringify(Object.keys(checksums).sort())!==JSON.stringify(names))throw new Error('Recovery checksum manifest is incomplete.');
  for(const name of names){const path=join(directory,name),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)||await hash(path)!==checksums[name])throw new Error('Recovery set failed checksum validation.');}
  for(const file of files.values())if((await lstat(join(directory,'documents',file.key))).size!==file.size||await hash(join(directory,'documents',file.key))!==file.sha256)throw new Error('Private document failed validation.');
  if(JSON.stringify((await readdir(join(directory,'documents'))).sort())!==JSON.stringify([...files.keys()].sort()))throw new Error('Unexpected recovery document files.');
  return manifest;
}
async function main() {
  process.umask(0o077);
  const v=options(process.argv.slice(2)),directory=resolve(v.directory),envFile=resolve(v['env-file']);
  if((await lstat(envFile)).isSymbolicLink()||(await lstat(envFile)).mode&0o077)throw new Error('Compose environment file must be private (0600).');
  if(await realpath(dirname(directory))!==dirname(directory))throw new Error('Recovery parent must not be a symlink.');
  for(const unsafe of ['public','src','.next','.git']){const root=resolve(unsafe);if(directory===root||directory.startsWith(root+'/'))throw new Error('Recovery directory must be private and outside application content.');}
  if(directory===process.cwd()||directory.startsWith(process.cwd()+'/'))throw new Error('Recovery sets must be outside the source checkout.');
  const base=['compose','--env-file',envFile,'--project-name',v.project,...v.files.flatMap(f=>['-f',f])];
  const child=(args,raw=false)=>{const p=spawn('docker',raw?args:[...base,...args],{stdio:['pipe','pipe','pipe'],timeout:args.includes('hold')?600000:120000});p.stderr.resume();return p;};
  const exit=(p)=>new Promise((res,rej)=>{p.once('error',()=>rej(new Error('Docker operation failed.')));p.once('close',code=>code===0?res():rej(new Error('Docker operation failed.')));});
  async function run(args,input=null,destination=null,raw=false){const p=child(args,raw),done=exit(p);done.catch(()=>{});let data='';
    const sent=input&&typeof input!=='string'&&!Buffer.isBuffer(input)?pipeline(input,p.stdin):new Promise((res,rej)=>{p.stdin.once('error',rej);p.stdin.end(input,res);});sent.catch(()=>{});
    if(destination)await pipeline(p.stdout,createWriteStream(destination,{flags:'wx',mode:0o600}));else for await(const c of p.stdout){data+=c;if(data.length>33554432){p.kill();throw new Error('Operation output exceeds limit.');}}
    await sent;await done;return data;
  }
  const db=(script)=>['exec','-T','employee-db','sh','-c',script];
  const psql=(sql)=>run(db('exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'),sql);
  const app=(mode,...args)=>['exec','-T','employee-app','node','scripts/operations/recovery-session.mjs',mode,...args];
  if(v.mode==='verify'){await verifySet(directory);await run(db('exec pg_restore --list'),createReadStream(join(directory,'database.dump')));console.log('Recovery set: local file checksums and PostgreSQL dump structure verified.');return;}
  if(v.mode==='restore-drill') {
    const manifest=await verifySet(directory),metadata=JSON.parse(await readFile(join(directory,'deployment.json'),'utf8'));
    if(metadata.project===v.project)throw new Error('Cannot restore into the source project.');
    const configuration=JSON.parse(await run(['config','--format','json']));
    const targetImage=(await run(['image','inspect',configuration.services['employee-app'].image,'--format','{{.Id}}'],null,null,true)).trim();
    if(!metadata.image.endsWith(targetImage.replace('sha256:',''))&&!targetImage.endsWith(metadata.image.replace('sha256:','')))throw new Error('Restore requires the recorded application image.');
    const empty=await psql("SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')+(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public');\n");
    if(empty.trim()!=='0')throw new Error('Restore target must be an empty database; no cleanup or replacement is performed.');
    const version=(await psql('SHOW server_version_num;\n')).trim();if(Math.floor(Number(version)/10000)!==metadata.postgresMajor)throw new Error('Restore requires the recorded PostgreSQL major.');
    const oneOff=['run','-T','--rm','--no-deps','--entrypoint','node','employee-app'];
    await run([...oneOff,'--input-type=module','-e',"import fs from 'node:fs';if(fs.readdirSync(process.env.PRIVATE_DOCUMENTS_DIR).length)process.exit(1)"]);
    await run(db('exec pg_restore --exit-on-error --single-transaction --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"'),createReadStream(join(directory,'database.dump')));
    await psql('ANALYZE;\n');
    // Grants come from the same reviewed tool used by normal migration operations.
    await run(['-f','docker-compose.tools.yml',...oneOff,'--import','tsx','scripts/runtime-grants.ts']);
    for(const file of manifest.files)await run([...oneOff,'scripts/operations/recovery-session.mjs','write',file.key,file.sha256,String(file.size)],createReadStream(join(directory,'documents',file.key)));
    const result=await run([...oneOff,'scripts/operations/recovery-session.mjs','verify'],JSON.stringify(manifest));
    console.log('Disposable restore verified: '+result.trim());console.log('Application ingress/jobs were not started. Invalidate restored sessions before any disaster-recovery production reopening.');return;
  }
  await mkdir(directory,{mode:0o700});await mkdir(join(directory,'documents'),{mode:0o700});
  await writeFile(join(directory,'status.json'),JSON.stringify({status:'INCOMPLETE'}),{mode:0o600});
  const lock=child(app('hold')),ended=exit(lock);ended.catch(()=>{});const lines=createInterface({input:lock.stdout})[Symbol.asyncIterator]();
  try {
    const ready=await lines.next();if(ready.done||!JSON.parse(ready.value).ready)throw new Error('Document lock was not acquired.');
    const snapshotAt=(await psql("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"');\n")).trim();
    await run(db('exec pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"'),null,join(directory,'database.dump'));
    lock.stdin.write('manifest\n');const line=await lines.next();if(line.done)throw new Error('Document manifest failed.');
    const manifest=JSON.parse(line.value);validateManifest(manifest);
    await writeFile(join(directory,'document-manifest.json'),JSON.stringify(manifest),{mode:0o600});
    for(const file of manifest.files){const target=join(directory,'documents',file.key);await run(app('read',file.key),null,target);if(await hash(target)!==file.sha256)throw new Error('Backup document hash mismatch.');}
    await run(db('exec pg_restore --list'),createReadStream(join(directory,'database.dump')));
    const image=(await run(['images','-q','employee-app'])).trim();
    const postgresMajor=Math.floor(Number((await psql('SHOW server_version_num;\n')).trim())/10000);
    const migrations=JSON.parse((await psql("SELECT coalesce(json_agg(migration_name ORDER BY migration_name),'[]'::json) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;\n")).trim());
    await writeFile(join(directory,'deployment.json'),JSON.stringify({version:1,snapshotAt,createdAt:new Date().toISOString(),project:v.project,release:v.release,image,postgresMajor,migrations}),{mode:0o600});
    const names=['database.dump','deployment.json','document-manifest.json',...manifest.files.map(f=>'documents/'+f.key)],checksums={};
    for(const name of names)checksums[name]=await hash(join(directory,name));
    await writeFile(join(directory,'checksums.json'),JSON.stringify(checksums),{mode:0o600});
    for(const name of [...names,'checksums.json']){const f=await open(join(directory,name),'r');try{await f.sync();}finally{await f.close();}}
    await writeFile(join(directory,'status.json'),JSON.stringify({status:'LOCAL_VALIDATED',createdAt:new Date().toISOString(),offsiteVerified:false}),{mode:0o600});
    await verifySet(directory);
    for(const path of [join(directory,'status.json'),join(directory,'documents'),directory,dirname(directory)]){const f=await open(path,'r');try{await f.sync();}finally{await f.close();}}
    console.log('Recovery set locally validated. Encrypt and verify offsite transfer before recording backup success. No retention deletion performed.');
  } catch(error) {await writeFile(join(directory,'status.json'),JSON.stringify({status:'INCOMPLETE'}),{mode:0o600});throw error;}
  finally {lock.stdin.end('release\n');await ended;}
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)main().catch(()=>{console.error('Recovery operation failed. No production database or old backup was deleted; incomplete sets are not successful backups.');process.exitCode=1;});
