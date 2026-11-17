// Shared by the API and the interface. This module has no database or auth imports.
const saleStages=['entrada','arte','aprovacao','producao','pronto','entregue'];
export const saleWhere="status!='cancelado' AND (source='manual' OR paid>0 OR reserved=1 OR status IN ("+saleStages.map(s=>"'"+s+"'").join(',')+'))';

export function isSale(order){
 return order.status!=='cancelado'&&(order.source==='manual'||order.paid>0||order.reserved===1||order.reserved===true||saleStages.includes(order.status));
}

export function financialState(order){
 const kind=order.status==='cancelado'?'cancelled':isSale(order)?'sale':'quote';
 return {kind,balance:Math.max(0,order.total-order.paid)};
}

export function balanceDescription(order,formatMoney){
 const state=financialState(order);
 if(state.kind==='cancelled')return 'Cancelado · fora do saldo';
 if(state.kind==='quote')return 'Orçamento a confirmar';
 return state.balance>0?formatMoney(state.balance)+' a receber':'Quitado';
}
