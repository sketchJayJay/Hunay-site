import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,rm,readFile,readdir,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import {setTimeout as wait} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../',import.meta.url));
async function freePort(){return await new Promise((resolve,reject)=>{const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});}
async function stop(p){if(!p||p.exitCode!==null)return;await new Promise(resolve=>{p.once('exit',resolve);p.kill('SIGTERM');});}
function command(cmd,args,options){return new Promise((ok,no)=>{const p=spawn(cmd,args,options);let output='';p.stdout?.on('data',x=>output+=x);p.stderr?.on('data',x=>output+=x);p.on('error',no);p.on('exit',code=>code===0?ok(output):no(new Error(output)));});}
test('Pacote Coolify: autenticação, arquivos, estoque e persistência',async t=>{
 const work=await mkdtemp(join(tmpdir(),'hunay-integration-'));const runtime=join(work,'runtime'),data=join(work,'data');await mkdir(runtime);await cp(join(project,'dist'),join(runtime,'dist'),{recursive:true});await cp(join(project,'server'),join(runtime,'server'),{recursive:true});await cp(join(project,'package.json'),join(runtime,'package.json'));
 const port=await freePort(),base='http://127.0.0.1:'+port,password=randomBytes(20).toString('base64url');let proc,logs='';let currentPassword=password;
 async function start(){proc=spawn(process.execPath,['server/index.mjs'],{cwd:runtime,env:{...process.env,ADMIN_USERNAME:'admin',ADMIN_PASSWORD:currentPassword,DATA_DIR:data,PORT:String(port),APP_URL:base,NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});proc.stdout.on('data',x=>logs+=x);proc.stderr.on('data',x=>logs+=x);for(let n=0;n<80;n++){if(proc.exitCode!==null)throw new Error(logs);try{if((await fetch(base+'/healthz')).ok)return;}catch{}await wait(75);}throw new Error('O servidor não iniciou: '+logs);}
 t.after(async()=>{await stop(proc);await rm(work,{recursive:true,force:true});});await start();
 let cookie='';async function request(path,{method='GET',body,authenticated=true,headers={}}={}){const r=await fetch(base+path,{method,headers:{...(authenticated&&cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});let d;try{d=await r.json();}catch{}return{r,d,status:r.status};}
 await t.test('Interface compilada e login independente',async()=>{const r=await fetch(base+'/admin');assert.equal(r.status,200);assert.match(await r.text(),/Hunay Personalizados/);assert.equal((await request('/api/admin',{authenticated:false})).status,403);assert.equal((await request('/api/admin',{authenticated:false,headers:{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'admin@example.test'}})).status,403);const bad=await request('/api/auth/login',{method:'POST',body:{username:'admin',password:'invalid-test'}});assert.equal(bad.status,401);const login=await request('/api/auth/login',{method:'POST',body:{username:'admin',password}});assert.equal(login.status,200);cookie=login.r.headers.get('set-cookie').split(';')[0];assert.match(login.r.headers.get('set-cookie'),/HttpOnly/);assert.equal((await request('/api/auth/session')).d.authenticated,true);assert.equal((await request('/api/admin')).status,200);});
 let product,id,token;
 await t.test('Dados, preços, privacidade e artes persistentes',async()=>{const store=await request('/api/store');assert.ok(store.d.products.length>=6);product=store.d.products[0];const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=';const payload={id:crypto.randomUUID(),name:'Cliente de teste',phone:'32999990000',shippingId:'pickup',items:[{productId:product.id,qty:2,price:1,design:{text:'Hunay',color:png,bw:png,original:png}}]};const saved=await request('/api/orders',{method:'POST',body:payload});assert.equal(saved.status,201);id=saved.d.id;token=saved.d.access_token;assert.equal(saved.d.total,2*product.price);assert.equal((await request('/api/orders',{method:'POST',body:payload})).status,200);assert.equal((await request('/api/orders/'+id,{authenticated:false})).status,404);const order=await request('/api/orders/'+id+'?token='+token,{authenticated:false});assert.equal(order.status,200);const key=order.d.items[0].art.bw;assert.equal((await fetch(base+'/api/'+key)).status,404);const art=await fetch(base+'/api/'+key+'?token='+token);assert.equal(art.status,200);assert.equal(art.headers.get('content-type'),'image/png');assert.equal(Buffer.from(await art.arrayBuffer()).subarray(1,4).toString(),'PNG');});
 await t.test('Upload de foto do produto e proteção de escrita',async()=>{const file=new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=','base64')],{type:'image/png'});const f=new FormData();f.set('file',file,'teste.png');const r=await fetch(base+'/api/product-image',{method:'POST',headers:{cookie},body:f});assert.equal(r.status,200);const d=await r.json();assert.equal((await fetch(base+d.url)).status,200);assert.equal((await request('/api/admin/settings',{authenticated:false,method:'PUT',body:{}})).status,403);assert.equal((await request('/api/admin/settings',{method:'PUT',body:{},headers:{origin:'https://outro.example'}})).status,403);});
 await t.test('Entrada mínima, reserva única e cancelamento',async()=>{assert.equal((await request('/api/admin/orders/'+id,{method:'PATCH',body:{status:'arte',paid:1}})).status,400);const deposit=product.price;assert.equal((await request('/api/admin/orders/'+id,{method:'PATCH',body:{status:'arte',paid:deposit}})).status,200);assert.equal((await request('/api/store')).d.products[0].stock,product.stock-2);assert.equal((await request('/api/admin/orders/'+id,{method:'PATCH',body:{status:'producao',paid:deposit}})).status,200);assert.equal((await request('/api/store')).d.products[0].stock,product.stock-2);assert.equal((await request('/api/admin/orders/'+id,{method:'PATCH',body:{status:'cancelado',paid:deposit}})).status,200);assert.equal((await request('/api/store')).d.products[0].stock,product.stock);});
 await t.test('Concorrência não vende mais que o estoque',async()=>{const p={...product,id:'limited-test',stock:1};assert.equal((await request('/api/admin/products',{method:'POST',body:p})).status,200);const create=()=>request('/api/orders',{method:'POST',body:{id:crypto.randomUUID(),name:'Teste concorrente',phone:'32999990000',shippingId:'pickup',items:[{productId:p.id,qty:1}]}});const [a,b]=await Promise.all([create(),create()]);const pay=o=>request('/api/admin/orders/'+o.d.id,{method:'PATCH',body:{status:'arte',paid:p.price}});const status=(await Promise.all([pay(a),pay(b)])).map(x=>x.status).sort();assert.deepEqual(status,[200,400]);assert.equal((await request('/api/store')).d.products.find(x=>x.id===p.id).stock,0);});

 let colored;
 const tinyPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=';
 const orderFor=(items)=>request('/api/orders',{method:'POST',body:{id:crypto.randomUUID(),name:'Cliente das cores',phone:'32999990000',shippingId:'pickup',items}});
 const colorItem=(variantId='rose')=>({productId:'colors-test',variantId,qty:1,mode:'shop',request:{name:'Maria',brief:'Flores delicadas em volta do nome',reference:tinyPng}});
 await t.test('Cores têm preço, foto e estoque próprios; orçamento aguarda WhatsApp',async()=>{
  colored={...product,id:'colors-test',name:'Garrafa 600 ml de teste',hasVariants:true,stock:99999,variants:[{id:'rose',name:'Rosé',color:'#d5a598',image:product.image,price:4000,stock:2},{id:'preta',name:'Preta',color:'#242823',image:'/images/tumbler.webp',price:5500,stock:1}]};
  const saved=await request('/api/admin/products',{method:'POST',body:colored});assert.equal(saved.status,200);assert.equal(saved.d.product.stock,3);
  assert.equal((await orderFor([{...colorItem(),variantId:''}])).status,400);
  assert.equal((await orderFor([{...colorItem(),variantId:'inexistente'}])).status,400);
  assert.equal((await orderFor([{...colorItem(),qty:2},colorItem()])).status,400);
  const made=await orderFor([{...colorItem('preta'),price:1,variantName:'Preço falso',image:'/images/mug.webp'}]);assert.equal(made.status,201);assert.equal(made.d.total,5500);
  const detail=(await request('/api/orders/'+made.d.id+'?token='+made.d.access_token,{authenticated:false})).d;
  assert.equal(detail.paid,0);assert.equal(detail.reserved,0);assert.equal(detail.status,'orcamento');assert.equal(detail.items[0].variantName,'Preta');assert.equal(detail.items[0].image,'/images/tumbler.webp');assert.equal(detail.items[0].request.brief,'Flores delicadas em volta do nome');assert.equal(detail.items[0].mode,'shop');
  assert.equal((await fetch(base+'/api/'+detail.items[0].art.original)).status,404);
  assert.equal((await fetch(base+'/api/'+detail.items[0].art.original+'?token='+made.d.access_token)).status,200);
  assert.equal((await request('/api/store')).d.products.find(p=>p.id==='colors-test').stock,3);
 });
 await t.test('Entrada manual reserva só a cor escolhida e cancelamento devolve uma vez',async()=>{
  const made=await orderFor([colorItem()]);const change=(status,paid)=>request('/api/admin/orders/'+made.d.id,{method:'PATCH',body:{status,paid}});
  assert.equal((await change('arte',2000)).status,200);
  let p=(await request('/api/store')).d.products.find(p=>p.id==='colors-test');assert.equal(p.stock,2);assert.equal(p.variants.find(v=>v.id==='rose').stock,1);assert.equal(p.variants.find(v=>v.id==='preta').stock,1);
  assert.equal((await change('aprovacao',2000)).status,200);assert.equal((await request('/api/store')).d.products.find(p=>p.id==='colors-test').stock,2);
  assert.equal((await change('cancelado',2000)).status,200);assert.equal((await change('cancelado',2000)).status,400);
  p=(await request('/api/store')).d.products.find(p=>p.id==='colors-test');assert.equal(p.variants.find(v=>v.id==='rose').stock,2);assert.equal(p.variants.find(v=>v.id==='preta').stock,1);
 });
 await t.test('Concorrência por cor e falha parcial preservam o estoque',async()=>{
  const [a,b]=await Promise.all([orderFor([colorItem('preta')]),orderFor([colorItem('preta')])]);
  const failing=await orderFor([colorItem(),colorItem('preta')]);assert.equal(failing.status,201);
  const pay=o=>request('/api/admin/orders/'+o.d.id,{method:'PATCH',body:{status:'arte',paid:5500}});
  assert.deepEqual((await Promise.all([pay(a),pay(b)])).map(r=>r.status).sort(),[200,400]);
  let p=(await request('/api/store')).d.products.find(p=>p.id==='colors-test');assert.equal(p.stock,2);assert.equal(p.variants.find(v=>v.id==='preta').stock,0);assert.equal(p.variants.find(v=>v.id==='rose').stock,2);
  const fail=await request('/api/admin/orders/'+failing.d.id,{method:'PATCH',body:{status:'arte',paid:9500}});assert.equal(fail.status,400);
  assert.equal((await request('/api/orders/'+failing.d.id)).d.reserved,0);
  p=(await request('/api/store')).d.products.find(p=>p.id==='colors-test');assert.equal(p.variants.find(v=>v.id==='rose').stock,2);assert.equal(p.stock,2);
 });
 await t.test('Coleções controlam alterações e preservam a estampa no pedido',async()=>{
  const store=(await request('/api/store')).d;assert.ok(store.templates.length>0);
  const stamp={...store.templates[0],id:'template-test',collection:'Natal de teste',name:'Estampa fixa',productIds:[product.id],allowPhrase:false,allowElements:false};
  assert.equal((await request('/api/admin/templates',{method:'POST',body:stamp,authenticated:false})).status,403);
  assert.equal((await request('/api/admin/templates',{method:'POST',body:stamp})).status,200);
  const payload={productId:product.id,qty:1,mode:'collection',templateId:stamp.id,design:{text:'Maria',phrase:'Frase adulterada',font:'Outra fonte',ink:'#000000',template:'minimal',color:tinyPng,bw:tinyPng}};
  const made=await orderFor([payload]);assert.equal(made.status,201);
  const detail=(await request('/api/orders/'+made.d.id)).d.items[0];assert.equal(detail.collectionName,stamp.collection);assert.equal(detail.templateName,stamp.name);assert.equal(detail.design.phrase,stamp.phrase);assert.equal(detail.design.font,stamp.font);assert.equal(detail.design.color,stamp.ink);assert.equal(detail.design.template,stamp.template);assert.equal(detail.design.text,'Maria');
  assert.equal((await orderFor([{...payload,productId:'colors-test',variantId:'rose'}])).status,400);
  assert.equal((await request('/api/admin/templates/'+stamp.id,{method:'DELETE'})).status,200);
  assert.equal((await orderFor([payload])).status,400);
  assert.equal((await request('/api/orders/'+made.d.id)).d.items[0].collectionName,stamp.collection);
  const exported=await request('/api/admin/export');assert.ok(exported.d.templates.length);assert.ok(exported.d.variants.length);
 });
 await t.test('Configurações, dados e sessão sobrevivem ao reinício',async()=>{const settings=(await request('/api/store')).d.settings;settings.pickupAddress='Endereço de teste persistente';await request('/api/admin/settings',{method:'PUT',body:settings});await stop(proc);await start();assert.equal((await request('/api/store')).d.settings.pickupAddress,settings.pickupAddress);assert.equal((await request('/api/orders/'+id)).status,200);assert.equal((await request('/api/auth/session')).d.authenticated,true);});
 await t.test('Backup inclui banco e artes',async()=>{const out=await command(process.execPath,['server/backup.mjs'],{cwd:runtime,env:{...process.env,DATA_DIR:data},stdio:['ignore','pipe','pipe']});assert.match(out,/Backup criado:/);const folder=join(data,'backups');const names=await readdir(folder);assert.equal(names.length,1);const listing=await command('tar',['-tzf',join(folder,names[0])],{stdio:['ignore','pipe','pipe']});assert.match(listing,/hunay.sqlite/);assert.match(listing,/uploads\/art/);assert.match(listing,/auth-salt/);});
 await t.test('Troca de senha encerra sessões e preserva pedidos',async()=>{await stop(proc);currentPassword=randomBytes(22).toString('base64url');await start();assert.equal((await request('/api/auth/session')).d.authenticated,false);const login=await request('/api/auth/login',{method:'POST',body:{username:'admin',password:currentPassword}});assert.equal(login.status,200);cookie=login.r.headers.get('set-cookie').split(';')[0];assert.equal((await request('/api/orders/'+id)).status,200);await request('/api/auth/logout',{method:'POST',body:{}});assert.equal((await request('/api/auth/session')).d.authenticated,false);});
});
