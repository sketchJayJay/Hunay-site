import {type Product,money} from '../lib/catalog';
export default function QuantityPrices({product,compact=false}:{product:Product;compact?:boolean}){
 if(!product.quantityPrices?.length)return null;
 if(compact){const tier=product.quantityPrices[0];return <div className="quantity-prices compact"><span>{tier.minQty}+ unidades</span><strong>{money(tier.price)} / un.</strong></div>;}
 return <div className="quantity-prices"><b>Leve mais, pague menos</b>{product.quantityPrices.map(t=><div key={t.minQty}><span>A partir de {t.minQty} unidades</span><strong>{money(t.price)} / un.</strong></div>)}<small>Vale para as unidades deste mesmo produto no orçamento{product.hasVariants?', somando as cores':''}.</small></div>;
}
