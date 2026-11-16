import { env,requestContext } from './runtime.mjs';
import { defaults,seedProducts,seedTemplates } from './catalog.mjs';
export const database=()=>env.DB;
export async function admin(){return requestContext.getStore()?.isAdmin===true;}
export async function getSettings(){const r=await database().prepare('SELECT data FROM settings WHERE id=?').bind('store').first();return r?{...defaults,...JSON.parse(r.data)}:defaults;}
export async function getProducts(){
 const r=await database().prepare('SELECT id,data,stock,active FROM products WHERE active=1 ORDER BY rowid').all();
 const variants=await database().prepare('SELECT * FROM product_variants WHERE active=1 ORDER BY rowid').all();
 return r.results.map(x=>({...JSON.parse(x.data),id:x.id,stock:x.stock,active:x.active,variants:variants.results.filter(v=>v.product_id===x.id).map(v=>({...JSON.parse(v.data),id:v.id,stock:v.stock}))}));
}
export async function getTemplates(){const r=await database().prepare('SELECT id,data FROM design_templates WHERE active=1 ORDER BY rowid').all();return r.results.map(x=>({...JSON.parse(x.data),id:x.id}));}
export async function bootstrap(){
 const db=database();const exists=await db.prepare('SELECT id FROM settings WHERE id=?').bind('initialized').first();
 if(!exists)await db.batch([
  ...seedProducts.map(p=>db.prepare('INSERT OR IGNORE INTO products(id,data,stock,active) VALUES(?,?,?,1)').bind(p.id,JSON.stringify(p),p.stock)),
  ...seedProducts.flatMap(p=>(p.variants||[]).map(v=>db.prepare('INSERT OR IGNORE INTO product_variants(product_id,id,data,stock,active) VALUES(?,?,?,?,1)').bind(p.id,v.id,JSON.stringify(v),v.stock))),
  db.prepare('INSERT OR IGNORE INTO settings(id,data) VALUES(?,?)').bind('store',JSON.stringify(defaults)),
  db.prepare('INSERT OR IGNORE INTO settings(id,data) VALUES(?,?)').bind('initialized',JSON.stringify({at:new Date().toISOString()}))
 ]);
 const templatesReady=await db.prepare('SELECT id FROM settings WHERE id=?').bind('templates_initialized').first();
 if(!templatesReady){const settings=await getSettings();await db.batch([
  ...(settings.demo?seedTemplates:[]).map(t=>db.prepare('INSERT OR IGNORE INTO design_templates(id,data,active) VALUES(?,?,1)').bind(t.id,JSON.stringify(t))),
  db.prepare('INSERT OR IGNORE INTO settings(id,data) VALUES(?,?)').bind('templates_initialized',JSON.stringify({at:new Date().toISOString()}))
 ]);}
}
export function fail(message,status=400){return Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});}
export function shapeOrder(r){return{...r,items:JSON.parse(r.items),shipping:JSON.parse(r.shipping)};}
export function str(x,max=200){return typeof x==='string'?x.trim().slice(0,max):'';}
export function int(x,min=0,max=100000000){const n=Number(x);if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error('Valor numérico inválido.');return n;}
