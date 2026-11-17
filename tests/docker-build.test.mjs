import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,cp,stat,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,basename,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const project=fileURLToPath(new URL('../',import.meta.url));
function build(cwd){return new Promise((resolve,reject)=>{
 const p=spawn(process.execPath,[join(cwd,'node_modules/vite/bin/vite.js'),'build'],{cwd,stdio:['ignore','pipe','pipe']});
 let output='';p.stdout.on('data',x=>output+=x);p.stderr.on('data',x=>output+=x);
 p.on('error',reject);p.on('close',code=>resolve({code,output}));
});}

test('Build isolado resolve o financeiro apenas com os arquivos COPY da etapa Docker',async()=>{
 const work=await mkdtemp(join(tmpdir(),'hunay-docker-build-'));
 try{
  const dockerfile=await readFile(join(project,'Dockerfile'),'utf8');
  const stage=dockerfile.split(/\r?\nFROM /i)[0];
  const beforeBuild=stage.split(/^\s*RUN\s+npm\s+run\s+build(?:\s|$)/im);
  assert.equal(beforeBuild.length,2,'A etapa deve conter RUN npm run build');
  const copies=beforeBuild[0].split(/\r?\n/).map(x=>x.trim()).filter(x=>/^COPY /i.test(x));
  assert.ok(copies.length>0);
  for(const line of copies){
   const args=line.slice(5).trim().startsWith('[')?JSON.parse(line.slice(5)):line.slice(5).trim().split(/\s+/);
   const destination=args.pop();assert.ok(args.every(x=>!x.startsWith('--')),'Adapte a montagem do teste para esta opção COPY: '+line);
   for(const name of args){
    const source=join(project,name),info=await stat(source);
    const target=resolve(work,destination,info.isDirectory()||!destination.endsWith('/')&&args.length===1?'':basename(name));
    assert.ok(target.startsWith(work+'/'));
    await mkdir(dirname(target),{recursive:true});await cp(source,target,{recursive:true});
   }
  }
  // Dependencies reuse the checkout's installed lockfile; no source tree is linked.
  await symlink(join(project,'node_modules'),join(work,'node_modules'),'dir');
  const result=await build(work);assert.equal(result.code,0,result.output);
  assert.match(await readFile(join(work,'dist/index.html'),'utf8'),/Hunay Personalizados/);
 }finally{await rm(work,{recursive:true,force:true});}
});
