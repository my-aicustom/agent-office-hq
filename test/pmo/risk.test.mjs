import test from 'node:test';import assert from 'node:assert/strict';import {makePlatform,makeProject} from './test_utils.mjs';
test('risk severity is derived from probability and impact',()=>{const p=makePlatform();try{const x=makeProject(p);const r=p.governance.addRisk(x.id,{title:'Plywood terlambat',probability:.9,impact:.9});assert.equal(r.severity,'CRITICAL');}finally{p.close();}});
