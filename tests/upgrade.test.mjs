import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as wait} from 'node:timers/promises';

test('Atualização preserva produto real, pedido antigo e estoque reservado',async t=>{
 const folder=await mkdtemp(join(tmpdir(),'hunay-upgrade-'));await mkdir(join(folder,'uploads'),{recursive:true});
 const sql=new DatabaseSync(join(folder,'hunay.sqlite'));
 sql.exec('CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,hash TEXT NOT NULL,applied_at TEXT NOT NULL)');
 for(const name of ['0000_late_paper_doll.sql','0001_local_auth.sql']){const text=await readFile(new URL('../server/migrations/'+name,import.meta.url),'utf8');sql.exec(text);sql.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(name,createHash('sha256').update(text).digest('hex'),new Date().toISOString());}
 const p={id:'real-old',name:'Caneca já cadastrada',category:'Canecas',price:4000,stock:4,image:'/images/mug.webp',description:'Descrição real preservada',badge:'',color:'#ffffff',weight:.4,width:12,height:11,length:12,customizable:true,type:'mug'};
 sql.prepare('INSERT INTO products VALUES(?,?,?,?)').run(p.id,JSON.stringify(p),4,1);
 sql.prepare('INSERT INTO settings VALUES(?,?)').run('initialized','{}');sql.prepare('INSERT INTO settings VALUES(?,?)').run('store',JSON.stringify({demo:false,whatsapp:'32999990000',pickupAddress:'Endereço real'}));
 sql.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('old-order','HN-ANTIGO','private-token','Cliente antigo','32999990000','arte',4000,2000,1,JSON.stringify([{productId:p.id,name:p.name,qty:1,price:p.price,image:p.image,design:null,art:{}}]),JSON.stringify({id:'pickup',name:'Retirada',price:0,subtotal:4000}),'Observação antiga','','2026-11-13T20:00:00Z','2026-11-13T20:00:00Z');
 sql.close();
 const port=await new Promise((resolve,reject)=>{const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
 const base='http://127.0.0.1:'+port,password=randomBytes(20).toString('base64url');let logs='';
 const proc=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,DATA_DIR:folder,ADMIN_PASSWORD:password,PORT:String(port),APP_URL:base},stdio:['ignore','pipe','pipe']});
 proc.stdout.on('data',x=>logs+=x);proc.stderr.on('data',x=>logs+=x);
 t.after(async()=>{if(proc.exitCode===null)await new Promise(resolve=>{proc.once('exit',resolve);proc.kill('SIGTERM');});await rm(folder,{recursive:true,force:true});});
 let healthy=false;for(let n=0;n<60;n++){if(proc.exitCode!==null)throw new Error(logs);try{if((await fetch(base+'/healthz')).ok){healthy=true;break;}}catch{}await wait(75);}assert.ok(healthy,logs);
 const store=await (await fetch(base+'/api/store')).json();assert.equal(store.products.length,1);assert.equal(store.products[0].description,p.description);assert.equal(store.products[0].stock,4);assert.equal(store.settings.pickupAddress,'Endereço real');assert.deepEqual(store.templates,[]);
 const order=await (await fetch(base+'/api/orders/old-order?token=private-token')).json();assert.equal(order.paid,2000);assert.equal(order.reserved,1);assert.equal(order.notes,'Observação antiga');assert.equal(order.items[0].productId,p.id);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const cancel=await fetch(base+'/api/admin/orders/old-order',{method:'PATCH',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({status:'cancelado',paid:2000})});assert.equal(cancel.status,200);assert.equal((await (await fetch(base+'/api/store')).json()).products[0].stock,5);
});
