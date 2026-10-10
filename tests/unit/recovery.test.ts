import {it,expect} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
// Host scripts are plain ESM so operators do not need project dependencies.
// @ts-expect-error -- JavaScript host tooling deliberately has no generated declarations.
import {options,verifySet} from '../../scripts/operations/recovery.mjs';
// @ts-expect-error -- Same shared ESM manifest validator is used in the image and host tool.
import {validateManifest} from '../../scripts/operations/recovery-manifest.mjs';
const sha='a'.repeat(64),key=randomUUID()+'.bin';
it('recovery refuses production/ambiguous targets and requires an explicit release for backup',()=>{
 for(const args of [['restore-drill','--project','griipbuddy-employee','--env-file','private.env','--directory','private'],['backup','--project','qa','--env-file','private.env','--directory','private'],['backup','--project','qa','--env-file','private.env','--directory','private','--release','r1','--overwrite','true']])expect(()=>options(args)).toThrow();
 expect(options(['restore-drill','--project','griipbuddy-restore-test','--env-file','private.env','--directory','private']).project).toBe('griipbuddy-restore-test');
});
it('recovery validates all references including retained/deleted files and rejects unsafe/duplicate keys',()=>{
 const file={key,sha256:sha,size:3};expect(validateManifest({version:1,files:[file],references:[file]}).size).toBe(1);
 for(const value of [{version:1,files:[],references:[file]},{version:1,files:[file,file],references:[]},{version:1,files:[{...file,key:'../../outside.bin'}],references:[]},{version:1,files:[{...file,size:10485761}],references:[]},{version:1,files:[file],references:[{...file,sha256:'b'.repeat(64)}]}])expect(()=>validateManifest(value)).toThrow();
});
it('local recovery verification rejects missing/tampered files and an incomplete set',async()=>{
 const root=await mkdtemp(join(tmpdir(),'griipbuddy-recovery-unit-'));try{
 await mkdir(join(root,'documents'),{mode:0o700});const data=Buffer.from('synthetic'),file={key,sha256:createHash('sha256').update(data).digest('hex'),size:data.length};
 const artifacts={'database.dump':Buffer.from('synthetic-dump'),'deployment.json':Buffer.from('{}'),'document-manifest.json':Buffer.from(JSON.stringify({version:1,files:[file],references:[file]})),['documents/'+key]:data};
 const checksums:Record<string,string>={};for(const [name,bytes] of Object.entries(artifacts)){await writeFile(join(root,name),bytes,{mode:0o600});checksums[name]=createHash('sha256').update(bytes).digest('hex');}
 await writeFile(join(root,'checksums.json'),JSON.stringify(checksums),{mode:0o600});await writeFile(join(root,'status.json'),JSON.stringify({status:'LOCAL_VALIDATED'}),{mode:0o600});expect((await verifySet(root)).references).toHaveLength(1);
 await writeFile(join(root,'documents',key),'tampered');await expect(verifySet(root)).rejects.toThrow();
 await writeFile(join(root,'status.json'),JSON.stringify({status:'INCOMPLETE'}));await expect(verifySet(root)).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true});}
});
