import {type Product,money} from '../lib/catalog';
export default function QuantityPrices({product}:{product:Product}){
 if(!product.quantityPrices?.length)return null;
 return <div className="quantity-prices"><b>Leve mais, pague menos</b>{product.quantityPrices.map(t=><div key={t.minQty}><span>A partir de {t.minQty} unidades</span><strong>{money(t.price)} / un.</strong></div>)}<small>Vale para as unidades deste mesmo produto no orçamento{product.hasVariants?', somando as cores':''}.</small></div>;
}
