import test from 'node:test';import assert from 'node:assert/strict';import {makePlatform} from './test_utils.mjs';
test('customer templates render project context',()=>{const p=makePlatform();try{const x=p.templates.render('DP_REMINDER',{client:'Ibu Eno',project:'Kitchen',amount:'Rp10.000.000'});assert.match(x,/Ibu Eno/);assert.match(x,/Rp10\.000\.000/);}finally{p.close();}});
