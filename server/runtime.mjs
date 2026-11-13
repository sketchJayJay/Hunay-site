import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash,randomBytes } from 'node:crypto';
import { mkdirSync,readFileSync,readdirSync,existsSync } from 'node:fs';
import { promises as fs,createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname,join,resolve,extname,sep } from 'node:path';
import { Readable } from 'node:stream';
export const DATA_DIR=resolve(process.env.DATA_DIR||'./data');
export const UPLOAD_DIR=join(DATA_DIR,'uploads');
mkdirSync(UPLOAD_DIR,{recursive:true});
export const sqlite=new DatabaseSync(join(DATA_DIR,'hunay.sqlite'),{timeout:5000});
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, hash TEXT NOT NULL, applied_at TEXT NOT NULL)');
const migrationDir=join(dirname(fileURLToPath(import.meta.url)),'migrations');
for(const name of readdirSync(migrationDir).filter(n=>n.endsWith('.sql')).sort()){
 const sql=readFileSync(join(migrationDir,name),'utf8');const hash=createHash('sha256').update(sql).digest('hex');
 const previous=sqlite.prepare('SELECT hash FROM schema_migrations WHERE name=?').get(name);
 if(previous){if(previous.hash!==hash)throw new Error('A migração já aplicada foi alterada: '+name);continue;}
 sqlite.exec('BEGIN IMMEDIATE');try{sqlite.exec(sql);sqlite.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(name,hash,new Date().toISOString());sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
}
class Statement{
 constructor(sql,params=[]){this.sql=sql;this.params=params;}
 bind(...params){return new Statement(this.sql,params);}
 first(){return Promise.resolve(sqlite.prepare(this.sql).get(...this.params)||null);}
 all(){return Promise.resolve({success:true,results:sqlite.prepare(this.sql).all(...this.params)});}
 runSync(){const result=sqlite.prepare(this.sql).run(...this.params);return{success:true,results:[],meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}
 run(){return Promise.resolve(this.runSync());}
}
export const db={prepare(sql){return new Statement(sql);},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.runSync());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const mime={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
function storedPath(key){if(typeof key!=='string'||!key||key.includes('..')||!/^[-a-zA-Z0-9_./]+$/.test(key))throw new Error('Caminho de arquivo inválido.');const path=resolve(UPLOAD_DIR,key);if(!path.startsWith(UPLOAD_DIR+sep))throw new Error('Arquivo inválido.');return path;}
const bucket={async put(key,bytes){const path=storedPath(key);await fs.mkdir(dirname(path),{recursive:true});const temp=path+'.'+randomBytes(6).toString('hex')+'.tmp';try{await fs.writeFile(temp,new Uint8Array(bytes),{mode:0o600});await fs.rename(temp,path);}catch(e){await fs.rm(temp,{force:true});throw e;}},async get(key){const path=storedPath(key);try{const stat=await fs.stat(path);if(!stat.isFile())return null;return{body:Readable.toWeb(createReadStream(path)),httpMetadata:{contentType:mime[extname(path)]||'application/octet-stream'}};}catch(e){if(e.code==='ENOENT')return null;throw e;}}};
export const env={DB:db,BUCKET:bucket,MELHOR_ENVIO_TOKEN:process.env.MELHOR_ENVIO_TOKEN||''};
export const requestContext=new AsyncLocalStorage();
