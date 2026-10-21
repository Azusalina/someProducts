import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTools} from '../public/tool-preferences.js';
test('tool preferences recover invalid data, retain hidden tools and make new tools visible',()=>{
 const ids=['md','pdf','omr'];
 assert.deepEqual(normalizeTools(null,ids),{order:ids,hidden:[]});
 assert.deepEqual(normalizeTools({order:['omr','md','omr','missing'],hidden:['omr','missing']},ids),{order:['omr','md','pdf'],hidden:['omr']});
 const allHidden=normalizeTools({hidden:ids},ids);assert.equal(allHidden.hidden.includes(allHidden.order[0]),false);
 assert.deepEqual(normalizeTools({order:'bad',hidden:23},ids),{order:ids,hidden:[]});
 assert.deepEqual(normalizeTools({order:ids,hidden:['omr']},[...ids,'new']).order,[...ids,'new']);
});
