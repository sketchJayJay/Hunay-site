import {sqlite} from './runtime.mjs';
import {statuses} from './catalog.mjs';
import {int,str} from './store.mjs';

function transaction(fn){sqlite.exec('BEGIN IMMEDIATE');try{const result=fn();sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
function syncStock(productId){sqlite.prepare('UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id=? AND active=1) WHERE id=?').run(productId,productId);}

export function writeProduct(p){return transaction(()=>{
 const old=sqlite.prepare('SELECT data FROM products WHERE id=?').get(p.id);
 if(old&&!!JSON.parse(old.data).hasVariants!==!!p.hasVariants){
  const reserved=sqlite.prepare('SELECT items FROM orders WHERE reserved=1 AND status!=?').all('cancelado');
  if(reserved.some(o=>JSON.parse(o.items).some(i=>i.productId===p.id)))throw new Error('Este produto tem unidades reservadas. Mantenha o tipo de estoque ou cadastre um novo produto para as cores.');
 }
 sqlite.prepare('INSERT INTO products(id,data,stock,active) VALUES(?,?,?,1) ON CONFLICT(id) DO UPDATE SET data=excluded.data,stock=excluded.stock,active=1').run(p.id,JSON.stringify(p),p.stock);
 sqlite.prepare('UPDATE product_variants SET active=0 WHERE product_id=?').run(p.id);
 for(const v of p.variants)sqlite.prepare('INSERT INTO product_variants(product_id,id,data,stock,active) VALUES(?,?,?,?,1) ON CONFLICT(product_id,id) DO UPDATE SET data=excluded.data,stock=excluded.stock,active=1').run(p.id,v.id,JSON.stringify(v),v.stock);
 if(p.hasVariants)syncStock(p.id);
 return p;
});}

// Read the order and change both the stock and order in one synchronous transaction.
// Repeated saves never reserve twice; a failure restores every preceding change.
export function updateOrderInventory(orderId,b){return transaction(()=>{
 const row=sqlite.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
 if(!row)throw new Error('Pedido não encontrado.');
 if(row.status==='cancelado')throw new Error('Pedidos cancelados não podem ser reabertos. Crie um novo orçamento.');
 const status=str(b.status,30);if(!statuses[status])throw new Error('Etapa inválida.');
 const delivery=JSON.parse(row.shipping);
 if(b.freight!==undefined&&delivery.id!=='pickup'&&status!=='cancelado'){delivery.price=int(b.freight,0,9999999);if(delivery.id==='consult')delivery.name='Envio pelos Correios';}
 if(status!=='cancelado'&&b.discount!==undefined&&!Number.isSafeInteger(b.discount))throw new Error('Informe um desconto válido em centavos inteiros.');
 const discount=status==='cancelado'||b.discount===undefined?row.discount:int(b.discount,0,delivery.subtotal);
 const discountReason=status==='cancelado'||b.discountReason===undefined?row.discount_reason:str(b.discountReason,300);
 const total=delivery.subtotal-discount+(delivery.price||0),paid=int(b.paid,0);
 if(paid>total)throw new Error('O total com desconto não pode ficar abaixo do valor recebido informado. Confira o desconto e os recebimentos.');
 if(['arte','aprovacao','producao','pronto','entregue'].includes(status)&&paid<Math.ceil(total/2))throw new Error('Confirme pelo menos 50% de entrada para iniciar a arte e a produção.');
 const reserving=status!=='cancelado'&&(total>0?paid>=Math.ceil(total/2):['arte','aprovacao','producao','pronto','entregue'].includes(status));
 if(!!row.reserved!==reserving){
  const items=JSON.parse(row.items),touched=new Set();
  for(const i of items){
   const product=sqlite.prepare('SELECT data,stock,active FROM products WHERE id=?').get(i.productId);
   if(!product)throw new Error('Produto do pedido não encontrado.');
   const p=JSON.parse(product.data),direction=reserving?-1:1;
   if(reserving&&(!product.active||!!p.hasVariants!==!!i.variantId))throw new Error('O produto ou suas opções mudaram. Atualize o orçamento com a loja.');
   if(i.variantId){
    const v=sqlite.prepare('SELECT stock,active FROM product_variants WHERE product_id=? AND id=?').get(i.productId,i.variantId);
    if(!v||(reserving&&(!v.active||v.stock<i.qty)))throw new Error('Estoque insuficiente para reservar a cor '+(i.variantName||'selecionada')+'. Atualize o orçamento ou reponha o estoque.');
    sqlite.prepare('UPDATE product_variants SET stock=stock+? WHERE product_id=? AND id=?').run(direction*i.qty,i.productId,i.variantId);
    touched.add(i.productId);
   }else{
    if(reserving&&product.stock<i.qty)throw new Error('Estoque insuficiente para reservar este pedido. Reponha o produto antes de confirmar a entrada.');
    sqlite.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(direction*i.qty,i.productId);
   }
  }
  for(const id of touched)syncStock(id);
 }
 const now=new Date().toISOString();
 sqlite.prepare('UPDATE orders SET status=?,paid=?,reserved=?,total=?,shipping=?,discount=?,discount_reason=?,updated_at=? WHERE id=?').run(status,paid,reserving?1:0,total,JSON.stringify(delivery),discount,discountReason,now,row.id);
 const discountHistory=discount!==row.discount||discountReason!==row.discount_reason?` · desconto R$ ${(discount/100).toFixed(2).replace('.',',')}${discountReason?' ('+discountReason+')':''}`:'';
 sqlite.prepare('INSERT INTO events(id,order_id,message,created_at) VALUES(?,?,?,?)').run(crypto.randomUUID(),row.id,`${statuses[status]} · recebido R$ ${(paid/100).toFixed(2).replace('.',',')}${discountHistory}`,now);
 return {ok:true};
});}
