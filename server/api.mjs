import { env } from './runtime.mjs';
import { admin, bootstrap, database, fail, getProducts, getSettings, int, shapeOrder, str } from './store.mjs';
import { categories, statuses,              } from './catalog.mjs';
export const dynamic='force-dynamic';
const json=(x        ,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const safeImage=(v       )=>v.startsWith('/images/')||/^\/api\/product-image\/[a-zA-Z0-9.-]+$/.test(v);
async function shipping(b    ){
 const cfg=await getSettings(); const cep=str(b.cep).replace(/\D/g,'');
 const options      =[{id:'pickup',name:'Retirada na loja',price:0,days:0,detail:cfg.pickupAddress}];
 if(cep.length===8 && cfg.localPrefix && cep.startsWith(cfg.localPrefix))options.push({id:'local',name:cfg.localName,price:cfg.localFee,days:0,detail:'Prazo a combinar com a loja'});
 let connected=Boolean(env.MELHOR_ENVIO_TOKEN && cfg.originCep.length===8);
 if(connected && cep.length===8){
  const catalog=await getProducts();
  const products=(b.items||[]).map((i    )=>{const p=catalog.find(p=>p.id===i.productId);if(!p)throw new Error('Produto indisponível.');return {id:p.id,width:p.width,height:p.height,length:p.length,weight:p.weight,insurance_value:p.price/100,quantity:int(i.qty,1,500)};});
  if(!products.length)throw new Error('Adicione produtos para calcular o frete.');
  const r=await fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate',{method:'POST',headers:{Authorization:`Bearer ${env.MELHOR_ENVIO_TOKEN}`,'Content-Type':'application/json',Accept:'application/json','User-Agent':'Hunay Personalizados'},body:JSON.stringify({from:{postal_code:cfg.originCep},to:{postal_code:cep},products,services:'1,2'})});
  if(!r.ok)throw new Error('Não foi possível consultar o frete agora. Escolha frete a combinar ou tente novamente.');
  const rates    =await r.json();for(const rate of Array.isArray(rates)?rates:[]){if(!rate.error && Number.isFinite(Number(rate.custom_price??rate.price)))options.push({id:'postal-'+rate.id,name:(rate.company?.name||'Correios')+' · '+rate.name,price:Math.round(Number(rate.custom_price??rate.price)*100),days:rate.custom_delivery_time??rate.delivery_time,detail:'Prazo de transporte, após a produção'});}
 }
 options.push({id:'consult',name:'Envio pelos Correios · a combinar',price:null,days:null,detail:'A loja confirma valor e prazo antes do pagamento'});
 return {options,connected,cep,productionDays:cfg.productionDays};
}
async function saveArt(orderId       ,kind       ,data       ){
 if(!env.BUCKET)throw new Error('Armazenamento de artes indisponível.');
 const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data);if(!m)throw new Error('Formato de imagem inválido.');
 const bytes=Uint8Array.from(atob(m[2]),c=>c.charCodeAt(0));if(bytes.length>2500000)throw new Error('A imagem deve ter até 2,5 MB.');
 const key=`art/${orderId}/${kind}-${crypto.randomUUID()}.${m[1]==='jpeg'?'jpg':m[1]}`;
 await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/'+m[1]}});return key;
}
async function route(req        ,parts         ){
 const url=new URL(req.url);const path=parts.join('/'); const method=req.method;
 if(method!=='GET'&&req.headers.get('origin')&&req.headers.get('origin')!==url.origin)return fail('Origem da solicitação inválida.',403);
 if(method!=='GET'&&Number(req.headers.get('content-length')||0)>9000000)return fail('Pedido muito grande. Reduza as imagens.',413);
 if(path==='store'&&method==='GET'){await bootstrap();const [products,settings,isAdmin]=await Promise.all([getProducts(),getSettings(),admin()]);return json({products,settings,isAdmin,shippingConnected:!!env.MELHOR_ENVIO_TOKEN});}
 if(path==='shipping'&&method==='POST'){return json(await shipping(await req.json()));}
 if(path==='orders'&&method==='POST'){
  await bootstrap();const b    =await req.json();if(JSON.stringify(b).length>9000000)return fail('Pedido muito grande.',413);
  const id=str(b.id,80);if(!/^[0-9a-f-]{36}$/i.test(id))return fail('Identificador do pedido inválido.');
  const prior=await database().prepare('SELECT id,code,access_token,total FROM orders WHERE id=?').bind(id).first();if(prior)return json(prior);
  const name=str(b.name,100),phone=str(b.phone,20).replace(/\D/g,'');if(name.length<3||phone.length<10||phone.length>13)return fail('Informe seu nome e um WhatsApp válido.');
  if(!Array.isArray(b.items)||b.items.length<1||b.items.length>20)return fail('Adicione de 1 a 20 itens ao orçamento.');
  const catalog=await getProducts();let subtotal=0;const used=new Map               ();const items      =[];
  for(let n=0;n<b.items.length;n++){
   const i=b.items[n];const p=catalog.find(p=>p.id===i.productId);if(!p)return fail('Um produto não está mais disponível.');const qty=int(i.qty,1,500);used.set(p.id,(used.get(p.id)||0)+qty);if(used.get(p.id) >p.stock)return fail(`Estoque insuficiente para ${p.name}. Atualize o carrinho.`);
   subtotal+=p.price*qty;const design=i.design?{text:str(i.design.text,50),phrase:str(i.design.phrase,100),font:str(i.design.font,40),color:str(i.design.ink,20),template:str(i.design.template,20),photoX:Number(i.design.x)||0,photoY:Number(i.design.y)||0,photoScale:Number(i.design.scale)||1}:null;
   items.push({productId:p.id,name:p.name,image:p.image,price:p.price,qty,design,art:{}});
  }
  const quote=await shipping({cep:b.cep,items:b.items});const selected=quote.options.find(x=>x.id===b.shippingId);if(!selected)return fail('Selecione uma opção de entrega válida.');
  if(selected.id!=='pickup' && str(b.cep).replace(/\D/g,'').length!==8)return fail('Informe o CEP para entrega.');
  const address=str(b.address,350);if(selected.id!=='pickup'&&address.length<8)return fail('Informe o endereço completo de entrega.');
  const total=subtotal+(selected.price||0),token=crypto.randomUUID()+crypto.randomUUID();
  for(let n=0;n<items.length;n++){const d=b.items[n].design;if(d){for(const kind of ['color','bw','original'])if(d[kind])items[n].art[kind]=await saveArt(id,`${n}-${kind}`,d[kind]);}}
  const code='HN-'+new Date().toISOString().slice(2,10).replace(/-/g,'')+'-'+id.slice(0,5).toUpperCase(),now=new Date().toISOString();
  const delivery={...selected,cep:quote.cep,address,subtotal,productionDays:quote.productionDays};
  await database().batch([database().prepare('INSERT INTO orders(id,code,access_token,name,phone,status,total,paid,reserved,items,shipping,notes,desired_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,code,token,name,phone,'orcamento',total,0,0,JSON.stringify(items),JSON.stringify(delivery),str(b.notes,1500),str(b.desiredDate,10),now,now),database().prepare('INSERT INTO events(id,order_id,message,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),id,'Orçamento recebido pelo site.',now)]);
  return json({id,code,access_token:token,total},201);
 }
 if(parts[0]==='orders'&&parts[1]&&method==='GET'){
  const row=await database().prepare('SELECT * FROM orders WHERE id=?').bind(parts[1]).first     ();if(!row||!(await admin())&&url.searchParams.get('token')!==row.access_token)return fail('Pedido não encontrado.',404);
  return json(shapeOrder(row));
 }
 if(parts[0]==='art'&&method==='GET'){
  const key=parts.join('/');const oid=parts[1];const row=await database().prepare('SELECT access_token,items FROM orders WHERE id=?').bind(oid).first     ();if(!row||!(await admin())&&url.searchParams.get('token')!==row.access_token)return fail('Arte não encontrada.',404);
  if(!row.items.includes(key))return fail('Arte não encontrada.',404);const obj=await env.BUCKET?.get(key);if(!obj)return fail('Arquivo não encontrado.',404);
  return new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(parts[0]==='product-image'&&parts[1]&&method==='GET'){
  if(!/^[a-zA-Z0-9.-]+$/.test(parts[1]))return fail('Arquivo inválido.');const o=await env.BUCKET?.get('products/'+parts[1]);if(!o)return fail('Imagem não encontrada.',404);return new Response(o.body,{headers:{'Content-Type':o.httpMetadata?.contentType||'image/png','Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'}});
 }
 if(path.startsWith('admin')||path==='product-image'){
  if(!await admin())return fail('Faça login na área da loja.',403);await bootstrap();const db=database();
  if(path==='admin'&&method==='GET'){const [orders,events]=await Promise.all([db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 500').all     (),db.prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT 500').all     ()]);return json({orders:orders.results.map(shapeOrder),events:events.results});}
  if(path==='product-image'&&method==='POST'){
   const data=await req.formData();const f=data.get('file');if(!(f instanceof File)||!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>2500000)return fail('Envie PNG, JPG ou WebP de até 2,5 MB.');const key=crypto.randomUUID()+'.'+(f.type==='image/jpeg'?'jpg':f.type.split('/')[1]);await env.BUCKET?.put('products/'+key,await f.arrayBuffer(),{httpMetadata:{contentType:f.type}});return json({url:'/api/product-image/'+key});
  }
  if(path==='admin/products'&&method==='POST'){
   const b    =await req.json();const id=str(b.id,100)||crypto.randomUUID();if(!/^[a-z0-9-]+$/i.test(id))return fail('Identificador inválido.');const name=str(b.name,100);if(name.length<3||!categories.includes(b.category)||b.category==='Todos')return fail('Informe nome e categoria.');const price=int(b.price,1),stock=int(b.stock,0,99999),image=str(b.image,200);if(!safeImage(image))return fail('Use uma imagem enviada ao catálogo.');
   const p        ={id,name,price,stock,image,category:b.category,description:str(b.description,1500),badge:str(b.badge,40),color:/^#[0-9a-f]{6}$/i.test(b.color)?b.color:'#d5a598',weight:Number(b.weight),height:Number(b.height),width:Number(b.width),length:Number(b.length),customizable:!!b.customizable,type:['mug','tumbler','notebook','pen','kit'].includes(b.type)?b.type:'mug'};
   if([p.weight,p.height,p.width,p.length].some(n=>!Number.isFinite(n)||n<=0||n>1000))return fail('Preencha peso e medidas positivos.');
   await db.prepare('INSERT INTO products(id,data,stock,active) VALUES(?,?,?,1) ON CONFLICT(id) DO UPDATE SET data=excluded.data,stock=excluded.stock,active=1').bind(id,JSON.stringify(p),stock).run();return json({product:p});
  }
  if(parts[1]==='products'&&parts[2]&&method==='DELETE'){await db.prepare('UPDATE products SET active=0 WHERE id=?').bind(parts[2]).run();return json({ok:true});}
  if(path==='admin/settings'&&method==='PUT'){
   const b    =await req.json();const whatsapp=str(b.whatsapp,20).replace(/\D/g,'');if(whatsapp&&!/^\d{10,13}$/.test(whatsapp))return fail('WhatsApp inválido. Inclua DDD.');const prefix=str(b.localPrefix,8).replace(/\D/g,'');
   const next={name:str(b.name,80)||'Hunay Personalizados',whatsapp,originCep:str(b.originCep,10).replace(/\D/g,''),productionDays:int(b.productionDays,1,120),localPrefix:prefix,localFee:int(b.localFee,0,999999),localName:str(b.localName,80)||'Entrega na região',pickupAddress:str(b.pickupAddress,250),demo:!!b.demo,instagram:str(b.instagram,150)};
   if(next.originCep&&next.originCep.length!==8)return fail('CEP de origem inválido.');await db.prepare('INSERT INTO settings(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind('store',JSON.stringify(next)).run();return json({settings:next});
  }
  if(parts[1]==='orders'&&parts[2]&&method==='PATCH'){
   const row    =await db.prepare('SELECT * FROM orders WHERE id=?').bind(parts[2]).first();if(!row)return fail('Pedido não encontrado.',404);const b    =await req.json();const status=str(b.status,30);if(!statuses[status])return fail('Etapa inválida.');const delivery=JSON.parse(row.shipping);if(b.freight!==undefined&&delivery.id!=='pickup'&&b.status!=='cancelado'){delivery.price=int(b.freight,0,9999999);if(delivery.id==='consult')delivery.name='Envio pelos Correios';}const total=delivery.subtotal+(delivery.price||0);const paid=int(b.paid,0,total);if(row.status==='cancelado')return fail('Pedidos cancelados não podem ser reabertos. Crie um novo orçamento.');
   if(['arte','aprovacao','producao','pronto','entregue'].includes(status)&&paid<Math.ceil(total/2))return fail('Confirme pelo menos 50% de entrada para iniciar a arte e a produção.');
   const items=JSON.parse(row.items),statements                      =[];const reserving=paid>=Math.ceil(total/2)&&status!=='cancelado';const restore=(status==='cancelado'||!reserving)&&row.reserved;
   if(reserving&&!row.reserved){for(const i of items)statements.push(db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND reserved=0)').bind(i.qty,i.productId,row.id));}
   if(restore){for(const i of items)statements.push(db.prepare('UPDATE products SET stock=stock+? WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND reserved=1)').bind(i.qty,i.productId,row.id));}
   const now=new Date().toISOString();statements.push(db.prepare('UPDATE orders SET status=?,paid=?,reserved=?,total=?,shipping=?,updated_at=? WHERE id=?').bind(status,paid,reserving?1:0,total,JSON.stringify(delivery),now,row.id),db.prepare('INSERT INTO events(id,order_id,message,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),row.id,`${statuses[status]} · recebido R$ ${(paid/100).toFixed(2).replace('.',',')}`,now));
   try{await db.batch(statements);}catch(e){if(String(e).includes('stock_nonnegative'))return fail('Estoque insuficiente para reservar este pedido. Reponha o produto antes de confirmar a entrada.');throw e;}return json({ok:true});
  }
  if(path==='admin/export'&&method==='GET'){
   const [products,settings,orders,events]=await Promise.all([db.prepare('SELECT * FROM products').all(),getSettings(),db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all(),db.prepare('SELECT * FROM events').all()]);return new Response(JSON.stringify({exportedAt:new Date().toISOString(),notice:'Exportação de cadastros e pedidos. Baixe as artes separadamente no pedido.',products:products.results,settings,orders:orders.results,events:events.results},null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="hunay-cadastros-pedidos.json"'}});
  }
 }
 return fail('Não encontrado.',404);
}
async function handle(req        ,context    ){try{const params=await context.params;return await route(req,params.path||[]);}catch(e){const msg=e instanceof Error?e.message:'Não foi possível concluir.';console.error('Hunay API:',msg);return fail(msg.includes('no such table')?'A loja está sendo preparada. Tente novamente em instantes.':msg.includes('D1_')?'Não foi possível salvar. Tente novamente.':msg,400);}}
export const GET=handle;export const POST=handle;export const PUT=handle;export const PATCH=handle;export const DELETE=handle;
