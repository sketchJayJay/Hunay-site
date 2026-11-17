import {sqlite} from './runtime.mjs';
import {int,str,shapeOrder} from './store.mjs';
import {transaction,updateOrderInTransaction} from './inventory.mjs';
import {priceForQuantity,quantitiesByProduct} from './pricing.mjs';

export const todayBrazil=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
const money=(value)=>int(value,0,1000000000000);
function date(value,required=false){
 const s=str(value,10);if(!s){if(required)throw new Error('Informe a data da venda.');return '';}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T12:00:00Z'))||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)throw new Error('Informe uma data válida.');
 return s;
}
export function createManualSale(b){return transaction(()=>{
 const id=str(b.id,80);if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Identificador da venda inválido.');
 const previous=sqlite.prepare('SELECT * FROM orders WHERE id=?').get(id);
 if(previous){if(previous.source!=='manual')throw new Error('Identificador já utilizado. Abra uma nova venda.');return {created:false,order:shapeOrder(previous)};}
 const name=str(b.name,100),phone=str(b.phone,20).replace(/\D/g,''),document=str(b.customerDocument,30).replace(/\D/g,'');
 if(name.length<3)throw new Error('Informe o nome do cliente ou da empresa.');
 if(phone&&(phone.length<10||phone.length>13))throw new Error('Informe um WhatsApp com DDD ou deixe o campo vazio.');
 if(document&&![11,14].includes(document.length))throw new Error('O CPF/CNPJ deve ter 11 ou 14 números.');
 const saleDate=date(b.saleDate||todayBrazil(),true),dueDate=date(b.dueDate),desiredDate=date(b.desiredDate);
 if(saleDate>todayBrazil())throw new Error('A data da venda não pode estar no futuro. Use a data desejada para a entrega.');
 if(dueDate&&dueDate<saleDate)throw new Error('O vencimento deve ser na data da venda ou depois dela.');
 const status=str(b.status,30)||'arte';if(!['entrada','arte','aprovacao','producao','pronto','entregue'].includes(status))throw new Error('Escolha uma etapa válida para a venda.');
 const stockAction=b.stockAction===undefined?'manual':str(b.stockAction,20);if(!['manual','none'].includes(stockAction))throw new Error('Escolha como movimentar o estoque.');
 if(!Array.isArray(b.items)||!b.items.length||b.items.length>50)throw new Error('Inclua de 1 a 50 produtos ou serviços na venda.');
 const rawItems=b.items.map(i=>({...i,qty:int(i.qty,1,99999)})),quantities=quantitiesByProduct(rawItems),items=[];
 let subtotal=0;
 for(const i of rawItems){
  let productId='',variantId='',variantName='',name='',image='/favicon.svg',regularPrice=0,price=0,priceSource='manual';
  if(i.productId){
   const row=sqlite.prepare('SELECT id,data,stock FROM products WHERE id=? AND active=1').get(str(i.productId,100));
   if(!row)throw new Error('Um produto não está mais disponível. Use um item avulso para registrar uma venda antiga.');
   const p=JSON.parse(row.data);productId=row.id;name=p.name;image=p.image;regularPrice=p.price;
   if(p.hasVariants){const v=sqlite.prepare('SELECT id,data FROM product_variants WHERE product_id=? AND id=? AND active=1').get(row.id,str(i.variantId,100));if(!v)throw new Error('Escolha a cor de '+p.name+'.');const data=JSON.parse(v.data);variantId=v.id;variantName=data.name;image=data.image||image;regularPrice=data.price;}
   else if(i.variantId)throw new Error('Este produto não possui a cor informada.');
   if(i.unitPrice===undefined||i.unitPrice===null||i.unitPrice===''){price=priceForQuantity(p,quantities.get(row.id),regularPrice);priceSource=price<regularPrice?'quantity':'catalog';}
   else price=money(i.unitPrice);
  }else{
   name=str(i.name,120);if(name.length<3)throw new Error('Descreva o produto ou serviço avulso.');
   if(i.unitPrice===undefined||i.unitPrice===null||i.unitPrice==='')throw new Error('Informe o preço do item avulso.');
   price=money(i.unitPrice);regularPrice=price;
  }
  subtotal=money(subtotal+price*i.qty);
  items.push({productId,name,image,qty:i.qty,price,regularPrice,priceSource,variantId,variantName,mode:'shop',request:{name:'',brief:str(i.notes,1000)},design:null,art:{}});
 }
 const discount=money(b.discount??0);if(discount>subtotal)throw new Error('O desconto não pode superar o valor dos produtos.');
 const pickup=b.shippingId!=='manual',freight=pickup?0:money(b.freight??0),total=money(subtotal-discount+freight),paid=money(b.paid??0);
 if(paid>total)throw new Error('O valor recebido não pode superar o total da venda.');
 const paymentMethod=str(b.paymentMethod,30)||'A combinar';if(!['A combinar','Pix','Dinheiro','Cartão','Boleto','Transferência','Outro'].includes(paymentMethod))throw new Error('Escolha uma forma de pagamento válida.');
 const now=new Date().toISOString(),code='HN-'+saleDate.replace(/-/g,'').slice(2)+'-'+id.slice(0,8).toUpperCase();
 const row={id,code,access_token:crypto.randomUUID()+crypto.randomUUID(),name,phone,status:'entrada',total,paid:0,reserved:0,items:JSON.stringify(items),shipping:JSON.stringify({id:pickup?'pickup':'manual',name:pickup?'Retirada na loja':'Entrega combinada',price:freight,subtotal,address:str(b.address,350),cep:'',productionDays:0}),notes:str(b.notes,1500),desired_date:desiredDate,created_at:now,updated_at:now,discount,discount_reason:str(b.discountReason,300),source:'manual',sale_date:saleDate,stock_action:stockAction,customer_document:document,reference:str(b.reference,150),payment_method:paymentMethod,due_date:dueDate};
 const keys=Object.keys(row);
 sqlite.prepare('INSERT INTO orders('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...Object.values(row));
 sqlite.prepare('INSERT INTO events(id,order_id,message,created_at) VALUES(?,?,?,?)').run(crypto.randomUUID(),id,'Venda registrada diretamente no painel'+(row.reference?' · '+row.reference:'')+'.',now);
 updateOrderInTransaction(id,{status,paid});
 return {created:true,order:shapeOrder(sqlite.prepare('SELECT * FROM orders WHERE id=?').get(id))};
});}

const confirmedSalesWhere="status!='cancelado' AND (source='manual' OR paid>0 OR reserved=1 OR status IN ('arte','aprovacao','producao','pronto','entregue'))";
export function salesTotals(){return sqlite.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(total),0) AS total,COALESCE(SUM(paid),0) AS paid,COALESCE(SUM(total-paid),0) AS due FROM orders WHERE '+confirmedSalesWhere).get();}
export function salesReport(params){
 const today=todayBrazil(),from=date(params.get('from')||today.slice(0,7)+'-01',true),to=date(params.get('to')||today,true);
 if(from>to)throw new Error('A data inicial deve ser anterior à data final.');
 const source=params.get('source')||'all';if(!['all','site','manual'].includes(source))throw new Error('Origem inválida.');
 const clauses=[confirmedSalesWhere,"sale_date>=?","sale_date<=?"],values=[from,to];
 if(source!=='all'){clauses.push('source=?');values.push(source);}
 const search=str(params.get('q'),100);if(search){clauses.push("(name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\')");const q='%'+search.replace(/[\\%_]/g,'\\$&')+'%';values.push(q,q,q,q);}
 const where=clauses.join(' AND ');
 const summary=sqlite.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(total),0) AS total,COALESCE(SUM(paid),0) AS paid,COALESCE(SUM(total-paid),0) AS due FROM orders WHERE '+where).get(...values);
 const pages=Math.max(1,Math.ceil(summary.count/50)),page=Math.min(int(params.get('page')||1,1,1000000),pages);
 const orders=sqlite.prepare('SELECT * FROM orders WHERE '+where+' ORDER BY sale_date DESC,created_at DESC LIMIT 50 OFFSET ?').all(...values,(page-1)*50).map(shapeOrder);
 return {orders,summary,page,pages,from,to};
}
