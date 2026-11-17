import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {isSale,financialState,balanceDescription,saleWhere} from '../server/order-finance.mjs';

const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
const order=patch=>({status:'orcamento',source:'site',paid:0,reserved:0,total:4000,...patch});

test('Aguardando entrada compõe o saldo; orçamento sem confirmação e cancelado ficam identificados',()=>{
 const pending=order({status:'entrada',total:49500});
 assert.equal(isSale(pending),true);
 assert.equal(balanceDescription(pending,money),money(49500)+' a receber');
 assert.equal(isSale(order()),false);
 assert.equal(balanceDescription(order(),money),'Orçamento a confirmar');
 assert.equal(balanceDescription(order({total:0}),money),'Orçamento a confirmar');
 const cancelled=order({status:'cancelado',source:'manual',total:66000,paid:10000,reserved:1});
 assert.equal(isSale(cancelled),false);
 assert.equal(balanceDescription(cancelled,money),'Cancelado · fora do saldo');
 assert.equal(financialState(order({paid:4000})).kind,'sale');
 assert.equal(balanceDescription(order({paid:4000}),money),'Quitado');
});

test('Reprodução da divergência: R$ 660 + R$ 495 de entrada = R$ 1.155, sem somar orçamentos',()=>{
 const rows=[
  order({source:'manual',status:'arte',total:66000}),
  order({status:'entrada',total:49500}),
  order({total:4000}),order({total:73800}),
  order({paid:4000}),order({status:'pronto',total:24480,paid:24480}),
  order({status:'cancelado',total:90000,paid:5000})
 ];
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE orders(status TEXT,source TEXT,total INTEGER,paid INTEGER,reserved INTEGER)');
  for(const r of rows)db.prepare('INSERT INTO orders VALUES(?,?,?,?,?)').run(r.status,r.source,r.total,r.paid,r.reserved);
  const totals=db.prepare('SELECT COUNT(*) AS count,SUM(total) AS total,SUM(paid) AS paid,SUM(total-paid) AS due FROM orders WHERE '+saleWhere).get();
  assert.deepEqual({...totals},{count:4,total:143980,paid:28480,due:115500});
  const captions=rows.filter(isSale).map(r=>financialState(r).balance);
  assert.equal(captions.reduce((a,b)=>a+b,0),totals.due);
  assert.equal(rows.filter(r=>financialState(r).kind==='quote').length,2);
 }finally{db.close();}
});

test('A regra SQL e a regra da interface concordam para todas as etapas e origens',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE orders(id INTEGER,status TEXT,source TEXT,total INTEGER,paid INTEGER,reserved INTEGER)');
  let id=0;const rows=[];
  for(const status of ['orcamento','entrada','arte','aprovacao','producao','pronto','entregue','cancelado'])for(const source of ['site','manual'])for(const paid of [0,2000,4000])for(const reserved of [0,1]){
   const row=order({status,source,paid,reserved});rows.push(row);db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?)').run(id++,status,source,row.total,paid,reserved);
  }
  const selected=new Set(db.prepare('SELECT id FROM orders WHERE '+saleWhere).all().map(r=>r.id));
  rows.forEach((r,i)=>assert.equal(selected.has(i),isSale(r),JSON.stringify(r)));
 }finally{db.close();}
});
