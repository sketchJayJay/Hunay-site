import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefreshCoordinator,watchVisibleRefresh} from '../lib/live-refresh.ts';
import {api} from '../lib/client.ts';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('Atualizações em segundo plano compartilham a mesma consulta em andamento',async()=>{
 const response=deferred(),applied=[];let reads=0;
 const loader=createRefreshCoordinator({read:()=>{reads++;return response.promise;},apply:x=>applied.push(x),onError:assert.fail});
 const waiting=Array.from({length:20},()=>loader.refresh());assert.equal(reads,1);
 response.resolve({orders:13,due:115500});await Promise.all(waiting);
 assert.deepEqual(applied,[{orders:13,due:115500}]);loader.dispose();
});

test('Uma atualização após salvar descarta a resposta antiga e aguarda os valores novos',async()=>{
 const old=deferred(),latest=deferred(),applied=[];let reads=0;
 const loader=createRefreshCoordinator({read:()=>++reads===1?old.promise:latest.promise,apply:x=>applied.push(x),onError:assert.fail});
 const first=loader.refresh();const afterSave=loader.refresh(true);let finished=false;afterSave.then(()=>finished=true);
 old.resolve('antes de salvar');await Promise.resolve();await Promise.resolve();
 assert.equal(reads,2);assert.deepEqual(applied,[]);assert.equal(finished,false);
 latest.resolve('depois de salvar');await Promise.all([first,afterSave]);
 assert.deepEqual(applied,['depois de salvar']);loader.dispose();
});

test('Falha de consulta mantém o último resultado e permite tentar novamente',async()=>{
 const error=new Error('Conexão indisponível'),applied=[],errors=[],busy=[];let reads=0;
 const loader=createRefreshCoordinator({read:async()=>{if(++reads===1)throw error;return 'atualizado';},apply:x=>applied.push(x),onError:e=>errors.push(e),onBusy:x=>busy.push(x)});
 await loader.refresh();assert.deepEqual(applied,[]);assert.deepEqual(errors,[error]);
 await loader.refresh();assert.deepEqual(applied,['atualizado']);assert.deepEqual(busy,[true,false,true,false]);loader.dispose();
});

test('Sair do painel impede uma consulta antiga de aplicar dados depois da saída',async()=>{
 const response=deferred(),applied=[];let reads=0;
 const loader=createRefreshCoordinator({read:()=>{reads++;return response.promise;},apply:x=>applied.push(x),onError:assert.fail});
 const waiting=loader.refresh();loader.dispose();await waiting;response.resolve('antigo');await Promise.resolve();
 await loader.refresh(true);assert.equal(reads,1);assert.deepEqual(applied,[]);
});

test('Painel atualiza a cada dez segundos e ao voltar; pausa oculto ou durante edição',()=>{
 const win=new EventTarget(),doc=new EventTarget();let tick,cleared=false,allowed=true,calls=0;
 win.setInterval=(fn,ms)=>{assert.equal(ms,10000);tick=fn;return 7;};win.clearInterval=id=>{assert.equal(id,7);cleared=true;};doc.visibilityState='visible';
 const stop=watchVisibleRefresh(()=>calls++,()=>allowed,win,doc);
 tick();win.dispatchEvent(new Event('focus'));assert.equal(calls,2);
 doc.visibilityState='hidden';tick();win.dispatchEvent(new Event('focus'));assert.equal(calls,2);
 doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));assert.equal(calls,3);
 allowed=false;tick();win.dispatchEvent(new Event('focus'));assert.equal(calls,3);
 stop();assert.equal(cleared,true);allowed=true;win.dispatchEvent(new Event('focus'));doc.dispatchEvent(new Event('visibilitychange'));assert.equal(calls,3);
});

test('Consultas da interface pedem dados atuais sem reutilizar cache do navegador',async t=>{
 const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous);let request;
 globalThis.fetch=async(url,options)=>{request={url,options};return Response.json({orders:[],totals:{due:115500}});};
 const result=await api('admin');assert.equal(result.totals.due,115500);
 assert.equal(request.url,'/api/admin');assert.equal(request.options.cache,'no-store');assert.equal(request.options.method,'GET');
});
