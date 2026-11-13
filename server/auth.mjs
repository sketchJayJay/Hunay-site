import {randomBytes,scryptSync,timingSafeEqual,createHash,createHmac} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {sqlite,DATA_DIR} from './runtime.mjs';
const username=process.env.ADMIN_USERNAME||'admin';
const password=process.env.ADMIN_PASSWORD||'';
if(password.length<10||password.length>128)throw new Error('Defina ADMIN_PASSWORD no Coolify com 10 a 128 caracteres. Não há senha padrão.');
const saltFile=join(DATA_DIR,'auth-salt');
if(!existsSync(saltFile))writeFileSync(saltFile,randomBytes(32),{mode:0o600,flag:'wx'});
const salt=readFileSync(saltFile);
const options={N:16384,r:8,p:1};
const passwordHash=scryptSync(password,salt,64,options);
const fingerprint=createHash('sha256').update(username).update(passwordHash).digest('hex');
const previous=sqlite.prepare('SELECT value FROM auth_state WHERE id=?').get('credential');
if(!previous||previous.value!==fingerprint){sqlite.exec('DELETE FROM admin_sessions');sqlite.prepare('INSERT OR REPLACE INTO auth_state VALUES(?,?)').run('credential',fingerprint);}
const cookieName='hunay_session';
const sha=s=>createHash('sha256').update(s).digest('hex');
function cookieToken(request){const c=request.headers.get('cookie')||'';return c.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';}
export function isAuthenticated(request){const token=cookieToken(request);if(!/^[a-f0-9]{64}$/.test(token))return false;return!!sqlite.prepare('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>?').get(sha(token),Date.now());}
function authCookie(value,request,clear=false){return`${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear?0:604800}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
const answer=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
export async function authRoute(request,ip){const path=new URL(request.url).pathname;
 if(path==='/api/auth/session'&&request.method==='GET')return answer({authenticated:isAuthenticated(request)});
 if(path==='/api/auth/logout'&&request.method==='POST'){const t=cookieToken(request);if(t)sqlite.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(sha(t));return answer({ok:true},200,{'Set-Cookie':authCookie('',request,true)});}
 if(path!=='/api/auth/login'||request.method!=='POST')return answer({error:'Não encontrado.'},404);
 const now=Date.now(),key=createHmac('sha256',salt).update(ip||'unknown').digest('hex');
 sqlite.prepare('DELETE FROM auth_attempts WHERE expires_at<?').run(now);
 const attempt=sqlite.prepare('SELECT failures,expires_at FROM auth_attempts WHERE ip_hash=?').get(key);
 if(attempt?.failures>=8)return answer({error:'Muitas tentativas. Aguarde 15 minutos e tente novamente.'},429,{'Retry-After':'900'});
 const b=await request.json();const input=typeof b.password==='string'?b.password:'';const inputHash=scryptSync(input.length<=128?input:'',salt,64,options);
 if(b.username!==username||!timingSafeEqual(inputHash,passwordHash)){
  sqlite.prepare('INSERT INTO auth_attempts VALUES(?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET failures=auth_attempts.failures+1').run(key,1,now+900000);
  return answer({error:'Usuário ou senha incorretos.'},401);
 }
 sqlite.prepare('DELETE FROM auth_attempts WHERE ip_hash=?').run(key);
 sqlite.prepare('DELETE FROM admin_sessions WHERE expires_at<?').run(now);
 const token=randomBytes(32).toString('hex');sqlite.prepare('INSERT INTO admin_sessions VALUES(?,?)').run(sha(token),now+604800000);
 return answer({ok:true},200,{'Set-Cookie':authCookie(token,request)});
}
