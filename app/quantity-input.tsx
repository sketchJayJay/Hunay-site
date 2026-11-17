import {useState,useEffect} from 'react';
export default function QuantityInput({qty,max,label,onChange}:{qty:number;max:number;label:string;onChange:(qty:number)=>void}){
 const [value,setValue]=useState(String(qty));
 useEffect(()=>setValue(String(qty)),[qty]);
 return <input type="number" inputMode="numeric" min="1" max={Math.max(1,max)} step="1" aria-label={label} value={value} onChange={e=>{const text=e.target.value;setValue(text);const n=Number(text);if(text&&Number.isSafeInteger(n)&&n>=1&&n<=max)onChange(n);}} onBlur={()=>{const n=Number(value);if(!value||!Number.isSafeInteger(n)||n<1||n>max)setValue(String(qty));}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/>;
}
