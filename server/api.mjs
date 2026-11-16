import { env } from './runtime.mjs';
import { admin, bootstrap, database, fail, getProducts, getTemplates, getSettings, int, shapeOrder, str } from './store.mjs';
import { categories, decorations } from './catalog.mjs';
import {writeProduct,updateOrderInventory} from './inventory.mjs';
export const dynamic='force-dynamic';
const json=(x        ,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const safeImage=(v       )=>v.startsWith('/images/')||/^\/api\/product-image\/[a-zA-Z0-9.-]+$/.test(v);
function selectedVariant(p,id){if(!p.hasVariants){if(id)throw new Error('Esta opção de cor não está mais disponível.');return null;}const v=p.variants.find(v=>v.id===id);if(!v)throw new Error('Selecione uma cor disponível para '+p.name+'.');return v;}
async function shipping(b    ){
 const cfg=await getSettings(); const cep=str(b.cep).replace(/\D/g,'');
 const options      =[{id:'pickup',name:'Retirada na loja',price:0,days:0,detail:cfg.pickupAddress}];
 if(cep.length===8 && cfg.localPrefix && cep.startsWith(cfg.localPrefix))options.push({id:'local',name:cfg.localName,price:cfg.localFee,days:0,detail:'Prazo a combinar com a loja'});
 let connected=Boolean(env.MELHOR_ENVIO_TOKEN && cfg.originCep.length===8);
 if(connected && cep.length===8){
  const catalog=await getProducts();
  const products=(b.items||[]).map((i    )=>{const p=catalog.find(p=>p.id===i.productId);if(!p)throw new Error('Produto indisponível.');const v=selectedVariant(p,i.variantId);return {id:p.id+(v?'-'+v.id:''),width:p.width,height:p.height,length:p.length,weight:p.weight,insurance_value:(v?.price??p.price)/100,quantity:int(i.qty,1,500)};});
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
 if(path==='store'&&method==='GET'){await bootstrap();const [products,templates,settings,isAdmin]=await Promise.all([getProducts(),getTemplates(),getSettings(),admin()]);return json({products,templates,settings,isAdmin,shippingConnected:!!env.MELHOR_ENVIO_TOKEN});}
 if(path==='shipping'&&method==='POST'){return json(await shipping(await req.json()));}
 if(path==='orders'&&method==='POST'){
  await bootstrap();const b    =await req.json();if(JSON.stringify(b).length>9000000)return fail('Pedido muito grande.',413);
  const id=str(b.id,80);if(!/^[0-9a-f-]{36}$/i.test(id))return fail('Identificador do pedido inválido.');
  const prior=await database().prepare('SELECT id,code,access_token,total FROM orders WHERE id=?').bind(id).first();if(prior)return json(prior);
  const name=str(b.name,100),phone=str(b.phone,20).replace(/\D/g,'');if(name.length<3||phone.length<10||phone.length>13)return fail('Informe seu nome e um WhatsApp válido.');
  if(!Array.isArray(b.items)||b.items.length<1||b.items.length>20)return fail('Adicione de 1 a 20 itens ao orçamento.');
  const catalog=await getProducts(),templates=await getTemplates();let subtotal=0;const used=new Map();const items=[];
  for(let n=0;n<b.items.length;n++){
   const i=b.items[n];const p=catalog.find(p=>p.id===i.productId);if(!p)return fail('Um produto não está mais disponível.');
   const v=selectedVariant(p,i.variantId),qty=int(i.qty,1,500),stockKey=p.id+':'+(v?.id||'');used.set(stockKey,(used.get(stockKey)||0)+qty);if(used.get(stockKey)>(v?.stock??p.stock))return fail(`Estoque insuficiente para ${p.name}${v?' · '+v.name:''}. Atualize o carrinho.`);
   const mode=i.mode||(i.design?'custom':'shop');if(!['shop','collection','custom'].includes(mode))return fail('Escolha como deseja personalizar seu presente.');
   if(mode!=='shop'&&!p.customizable)return fail('Este produto recebe a arte com atendimento da Hunay.');
   let source=i.design,stamp=null;
   if(mode==='collection'){
    stamp=templates.find(t=>t.id===i.templateId);
    if(!stamp||stamp.productIds.length&&!stamp.productIds.includes(p.id))return fail('A estampa escolhida não está disponível para este produto.');
    if(!source||!str(source.text,50))return fail('Informe o nome para a estampa.');
    source={...source,phrase:stamp.allowPhrase?str(source.phrase,100):stamp.phrase,font:stamp.font,ink:stamp.ink,template:stamp.allowElements&&decorations.some(([id])=>id===source.template)?source.template:stamp.template,background:stamp.image,nameX:stamp.nameX,nameY:stamp.nameY};
   }
   if(mode==='custom'&&!source)return fail('Salve sua personalização antes de continuar.');
   const request=mode==='shop'?{name:str(i.request?.name,100),brief:str(i.request?.brief,1500)}:null;
   if(i.mode==='shop'&&!request.name&&!request.brief&&!i.request?.reference)return fail('Conte a ideia da arte que a Hunay vai preparar.');
   const design=mode!=='shop'&&source?{text:str(source.text,50),phrase:str(source.phrase,100),font:str(source.font,40),color:str(source.ink,20),template:str(source.template,20),background:stamp?.image||'',nameX:stamp?.nameX??50,nameY:stamp?.nameY??50,photoX:Number(source.x)||0,photoY:Number(source.y)||0,photoScale:Number(source.scale)||1}:null;
   const price=v?.price??p.price;subtotal+=price*qty;
   items.push({productId:p.id,name:p.name,image:v?.image||p.image,price,qty,variantId:v?.id||'',variantName:v?.name||'',mode,templateId:stamp?.id||'',collectionName:stamp?.collection||'',templateName:stamp?.name||'',request,design,art:{}});
  }
  const quote=await shipping({cep:b.cep,items:b.items});const selected=quote.options.find(x=>x.id===b.shippingId);if(!selected)return fail('Selecione uma opção de entrega válida.');
  if(selected.id!=='pickup' && str(b.cep).replace(/\D/g,'').length!==8)return fail('Informe o CEP para entrega.');
  const address=str(b.address,350);if(selected.id!=='pickup'&&address.length<8)return fail('Informe o endereço completo de entrega.');
  const total=subtotal+(selected.price||0),token=crypto.randomUUID()+crypto.randomUUID();
  for(let n=0;n<items.length;n++){const d=b.items[n].design;if(items[n].mode!=='shop'&&d){for(const kind of ['color','bw','original'])if(d[kind])items[n].art[kind]=await saveArt(id,`${n}-${kind}`,d[kind]);}if(items[n].mode==='shop'&&b.items[n].request?.reference)items[n].art.original=await saveArt(id,`${n}-reference`,b.items[n].request.reference);}
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
   const b=await req.json();const id=str(b.id,100)||crypto.randomUUID();if(!/^[a-z0-9-]+$/i.test(id))return fail('Identificador inválido.');const name=str(b.name,100);if(name.length<3||!categories.includes(b.category)||b.category==='Todos')return fail('Informe nome e categoria.');const price=int(b.price,1),image=str(b.image,200);if(!safeImage(image))return fail('Use uma imagem enviada ao catálogo.');
   const hasVariants=!!b.hasVariants,variants=[];
   if(hasVariants){
    if(!Array.isArray(b.variants)||!b.variants.length||b.variants.length>30)return fail('Cadastre de 1 a 30 cores do produto.');
    for(const raw of b.variants){const vid=str(raw.id,100)||crypto.randomUUID(),name=str(raw.name,60),photo=str(raw.image,200)||image;if(!/^[a-z0-9-]+$/i.test(vid)||variants.some(v=>v.id===vid)||!name)return fail('Informe cores com identificadores únicos e nome.');if(!safeImage(photo))return fail('Use uma foto enviada para cada cor.');variants.push({id:vid,name,color:/^#[0-9a-f]{6}$/i.test(raw.color)?raw.color:'#d5a598',image:photo,price:int(raw.price,1),stock:int(raw.stock,0,99999)});}
   }
   const stock=hasVariants?variants.reduce((s,v)=>s+v.stock,0):int(b.stock,0,99999);
   const p={id,name,price:hasVariants?Math.min(...variants.map(v=>v.price)):price,stock,image,category:b.category,description:str(b.description,1500),badge:str(b.badge,40),color:/^#[0-9a-f]{6}$/i.test(b.color)?b.color:'#d5a598',weight:Number(b.weight),height:Number(b.height),width:Number(b.width),length:Number(b.length),customizable:!!b.customizable,type:['mug','tumbler','notebook','pen','kit'].includes(b.type)?b.type:'mug',hasVariants,variants};
   if([p.weight,p.height,p.width,p.length].some(n=>!Number.isFinite(n)||n<=0||n>1000))return fail('Preencha peso e medidas positivos.');
   writeProduct(p);return json({product:p});
  }
  if(path==='admin/templates'&&method==='POST'){
   const b=await req.json(),id=str(b.id,100)||crypto.randomUUID();if(!/^[a-z0-9-]+$/i.test(id))return fail('Identificador inválido.');
   const name=str(b.name,100),collection=str(b.collection,80),image=str(b.image,200);if(name.length<3||collection.length<2)return fail('Informe o nome da coleção e da estampa.');if(image&&!safeImage(image))return fail('Use uma imagem enviada para a estampa.');
   if(!decorations.some(([id])=>id===b.template)||!['Georgia','Arial','cursive','Trebuchet MS'].includes(b.font)||!/^#[0-9a-f]{6}$/i.test(b.ink))return fail('Confira os detalhes da estampa.');
   const catalog=await getProducts(),productIds=Array.isArray(b.productIds)?[...new Set(b.productIds.map(x=>str(x,100)))]:[];if(productIds.some(id=>!catalog.some(p=>p.id===id&&p.customizable)))return fail('Escolha produtos disponíveis que permitam personalização.');
   const t={id,name,collection,image,productIds,description:str(b.description,1000),template:b.template,font:b.font,ink:b.ink,phrase:str(b.phrase,100),nameX:int(b.nameX,10,90),nameY:int(b.nameY,20,75),allowPhrase:!!b.allowPhrase,allowElements:!!b.allowElements};
   await db.prepare('INSERT INTO design_templates(id,data,active) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET data=excluded.data,active=1').bind(id,JSON.stringify(t)).run();return json({template:t});
  }
  if(parts[1]==='templates'&&parts[2]&&method==='DELETE'){await db.prepare('UPDATE design_templates SET active=0 WHERE id=?').bind(parts[2]).run();return json({ok:true});}
  if(parts[1]==='products'&&parts[2]&&method==='DELETE'){await db.prepare('UPDATE products SET active=0 WHERE id=?').bind(parts[2]).run();return json({ok:true});}
  if(path==='admin/settings'&&method==='PUT'){
   const b    =await req.json();const whatsapp=str(b.whatsapp,20).replace(/\D/g,'');if(whatsapp&&!/^\d{10,13}$/.test(whatsapp))return fail('WhatsApp inválido. Inclua DDD.');const prefix=str(b.localPrefix,8).replace(/\D/g,'');
   const next={name:str(b.name,80)||'Hunay Personalizados',whatsapp,originCep:str(b.originCep,10).replace(/\D/g,''),productionDays:int(b.productionDays,1,120),localPrefix:prefix,localFee:int(b.localFee,0,999999),localName:str(b.localName,80)||'Entrega na região',pickupAddress:str(b.pickupAddress,250),demo:!!b.demo,instagram:str(b.instagram,150)};
   if(next.originCep&&next.originCep.length!==8)return fail('CEP de origem inválido.');await db.prepare('INSERT INTO settings(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind('store',JSON.stringify(next)).run();return json({settings:next});
  }
  if(parts[1]==='orders'&&parts[2]&&method==='PATCH'){
   return json(updateOrderInventory(parts[2],await req.json()));
  }
  if(path==='admin/export'&&method==='GET'){
   const [products,variants,templates,settings,orders,events]=await Promise.all([db.prepare('SELECT * FROM products').all(),db.prepare('SELECT * FROM product_variants').all(),db.prepare('SELECT * FROM design_templates').all(),getSettings(),db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all(),db.prepare('SELECT * FROM events').all()]);return new Response(JSON.stringify({exportedAt:new Date().toISOString(),notice:'Exportação de cadastros e pedidos. Baixe as artes separadamente no pedido.',products:products.results,variants:variants.results,templates:templates.results,settings,orders:orders.results,events:events.results},null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="hunay-cadastros-pedidos.json"'}});
  }
 }
 return fail('Não encontrado.',404);
}
async function handle(req        ,context    ){try{const params=await context.params;return await route(req,params.path||[]);}catch(e){const msg=e instanceof Error?e.message:'Não foi possível concluir.';console.error('Hunay API:',msg);return fail(msg.includes('no such table')?'A loja está sendo preparada. Tente novamente em instantes.':msg.includes('D1_')?'Não foi possível salvar. Tente novamente.':msg,400);}}
export const GET=handle;export const POST=handle;export const PUT=handle;export const PATCH=handle;export const DELETE=handle;
