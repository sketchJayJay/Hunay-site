export type FinancialOrder={status:string;source?:string;total:number;paid:number;reserved?:number|boolean};
export const saleWhere:string;
export function isSale(order:FinancialOrder):boolean;
export function financialState(order:FinancialOrder):{kind:'sale'|'quote'|'cancelled';balance:number};
export function balanceDescription(order:FinancialOrder,formatMoney:(value:number)=>string):string;
