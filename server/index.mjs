import http from 'node:http';
import {promises as fs,createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve,extname,sep} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {GET as api} from './api.mjs';
import {requestContext,sqlite} from './runtime.mjs';
import {authRoute,isAuthenticated} from './auth.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','dist');
const port=Number(process.env.PORT||3000);
const MAX_BODY=9000000;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.json':'application/json; charset=utf-8','.woff2':'font/woff2'};
function originFor(req){if(process.env.APP_URL)return new URL(process.env.APP_URL).origin;const proto=String(req.headers['x-forwarded-proto']||'http').split(',')[0].trim()==='https'?'https':'http';return proto+'://'+req.headers.host;}
async function bodyOf(req){if(Number(req.headers['content-length']||0)>MAX_BODY){const e=new Error('Pedido muito grande. Reduza as imagens.');e.status=413;throw e;}let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>MAX_BODY){const e=new Error('Pedido muito grande. Reduza as imagens.');e.status=413;throw e;}chunks.push(c);}return Buffer.concat(chunks);}
async function send(res,response){res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();}
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
 try{
  const base=originFor(req),url=new URL(req.url,base),path=url.pathname;
  if(path==='/healthz'){sqlite.prepare('SELECT 1').get();res.setHeader('Content-Type','application/json');return res.end('{"status":"ok"}');}
  if(path.startsWith('/api/')){
   if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==base)return await send(res,Response.json({error:'Origem da solicitação inválida.'},{status:403}));
   const body=['GET','HEAD'].includes(req.method)?undefined:await bodyOf(req);const request=new Request(url,{method:req.method,headers:req.headers,body});
   if(path.startsWith('/api/auth/'))return await send(res,await authRoute(request,String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0]));
   const response=await requestContext.run({isAdmin:isAuthenticated(request)},()=>api(request,{params:Promise.resolve({path:path.slice(5).split('/').map(x=>decodeURIComponent(x))})}));
   return await send(res,response);
  }
  if(!['GET','HEAD'].includes(req.method))return await send(res,new Response('Método não permitido.',{status:405}));
  let decoded;try{decoded=decodeURIComponent(path);}catch{return await send(res,new Response('Caminho inválido.',{status:400}));}
  if(decoded.includes('\0'))return await send(res,new Response('Caminho inválido.',{status:400}));
  const target=resolve(root,'.'+decoded);if(target!==root&&!target.startsWith(root+sep))return await send(res,new Response('Não encontrado.',{status:404}));
  let file=target;let stat;try{stat=await fs.stat(file);}catch{}
  if(!stat?.isFile()){
   if(decoded==='/'||decoded==='/admin'||decoded==='/admin/'||decoded==='/pedido'||decoded==='/pedido/')file=join(root,'index.html');
   else return await send(res,new Response('Não encontrado.',{status:404}));
  }
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control',file.endsWith('index.html')?'no-store':decoded.startsWith('/assets/')?'public, max-age=31536000, immutable':'public, max-age=3600');
  if(req.method==='HEAD')return res.end();await pipeline(createReadStream(file),res);
 }catch(e){console.error('Hunay:',e.message);if(!res.headersSent){res.statusCode=e.status||500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.status?e.message:'Não foi possível concluir. Tente novamente.'}));}else res.destroy();}
});
server.requestTimeout=60000;server.headersTimeout=15000;
server.listen(port,'0.0.0.0',()=>console.log(`Hunay Personalizados pronta na porta ${port}. Dados persistentes configurados.`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{sqlite.close();process.exit(0);}));
