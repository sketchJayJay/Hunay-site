import test from 'node:test';
import assert from 'node:assert/strict';
import {discountFromInput} from '../server/pricing.mjs';

test('Desconto em reais ou porcentagem arredonda o resultado para centavos',()=>{
 assert.equal(discountFromInput('35.50','amount',38500),3550);
 assert.equal(discountFromInput('10','percent',38500),3850);
 assert.equal(discountFromInput('12.50','percent',19990),2499);
 assert.equal(discountFromInput('10.01','percent',9999),1001);
 assert.equal(discountFromInput('0','percent',19990),0);
});
