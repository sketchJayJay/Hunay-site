import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=stripTypeScriptTypes(readFileSync(new URL('../lib/ids.ts',import.meta.url),'utf8'),{mode:'strip'}).replace('export function createId','function createId');
function generator(crypto){return runInNewContext(`(()=>{${source};return createId})()`,{crypto});}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
test('Contexto HTTP sem crypto.randomUUID gera identificadores válidos e distintos',()=>{const createId=generator({getRandomValues:webcrypto.getRandomValues.bind(webcrypto)});const values=Array.from({length:1000},()=>createId());assert.equal(new Set(values).size,1000);for(const v of values)assert.match(v,uuid);});
test('Contexto seguro continua usando a função nativa',()=>{const createId=generator(webcrypto);assert.match(createId(),uuid);});
test('Navegador sem fonte segura de aleatoriedade recebe mensagem clara',()=>{assert.throws(()=>generator(undefined)(),/Atualize o navegador/);});
