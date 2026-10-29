import test from 'node:test';
import assert from 'node:assert/strict';
import { codeFlowchart, restoreCodeLabels } from '../src/flowchart/index.js';
import { renderMermaid } from '../src/core/mermaid.js';
import { createToolkit } from '../src/server.js';

function graph(source) {
  const output = codeFlowchart(source);
  const labels = new Map([...output.matchAll(/^(n\d+)[\[{(]+"([^\n]*)"[\]})]+$/gm)].map(m => [m[1], restoreCodeLabels(m[2]).replaceAll("&lt;", "<").replaceAll("&gt;", ">")]));
  const edges = [...output.matchAll(/^(n\d+) -->(?:\|"([^"\n]*)"\|)? (n\d+)$/gm)].map(m => ({ from: labels.get(m[1]), to: labels.get(m[3]), label: m[2] }));
  return { output, edges };
}
test('flowchart builds branch, loop, continue, break, switch fallthrough and return edges', () => {
  const { edges, output } = graph('function f(x) { for(let i=0;i<3;i++){ if(x) continue; else break; } return x; x++; }');
  for (const expected of [
    { from: 'x', to: 'continue;', label: 'true' },
    { from: 'x', to: 'break;', label: 'false' },
    { from: 'continue;', to: 'i++', label: undefined },
    { from: 'i++', to: 'i<3', label: undefined },
    { from: 'break;', to: 'return x;', label: undefined },
    { from: 'return x;', to: 'End', label: undefined },
  ]) assert.ok(edges.some(edge => JSON.stringify(edge) === JSON.stringify(expected)), JSON.stringify(expected));
  assert.ok(!edges.some(e => e.from === 'return x;' && e.to === 'x++;'));
  assert.ok(!output.includes('x++;'));
  const switched = graph('switch (x) { case 1: a(); case 2: b(); break; default: c(); }');
  assert.ok(switched.edges.some(e => e.from === 'a();' && e.to === 'b();'));
  const post = graph('do { a(); } while (x);');
  assert.ok(post.edges.some(e => e.from === 'Start' && e.to === 'a();'));
});
test('JS/MJS parsing, named arrows, syntax errors, hostile labels and size limits', () => {
  const output = codeFlowchart('export const f = async x => x + 1; class C { m() { return 2; } }', 'a.mjs');
  assert.match(output, /f\(x\)/); assert.match(output, /m\(\)/);
  assert.throws(() => codeFlowchart('const = ;'), /Invalid JavaScript/);
  assert.throws(() => codeFlowchart(''), /enter code/);
  assert.throws(() => codeFlowchart(' '.repeat(102401) + 'x'), /100 KB/);
  assert.throws(() => codeFlowchart('x();'.repeat(251)), /250 nodes/);
  const hostile = codeFlowchart('console.log("<script>alert(1)</script>", "x|y", "#quot;");');
  assert.ok(!hostile.includes('<script>')); assert.ok(restoreCodeLabels(hostile).includes('&lt;script&gt;'));
});
test('real SVG rendering and authenticated API reject invalid code without executing it', async t => {
  const input = 'export function f(x) { if (x < 3) return "<svg onload=alert(1)>"; while(x > 0) x--; return x; }';
  const [result] = await renderMermaid([codeFlowchart(input, 'sample.mjs')]);
  assert.ok(result.svg, result.error);
  result.svg = restoreCodeLabels(result.svg);
  assert.match(result.svg, /<svg/); assert.ok(!/<script\b|<foreignObject\b|<[^>]+\sonload=/i.test(result.svg));
  const app = await createToolkit({ port: 0 }); t.after(() => app.close());
  const first = await fetch(app.url), cookie = first.headers.get('set-cookie').split(';')[0]; await first.text();
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const view = await (await fetch(`${app.url}api/views`, { method:'POST', headers, body:'{}' })).json();
  headers['X-Toolkit-View'] = view.viewId;
  const endpoint = `${app.url}api/flowchart`;
  assert.equal((await fetch(endpoint, { method:'POST', body:'{}' })).status, 403);
  const invalid = await fetch(endpoint, { method:'POST', headers, body:JSON.stringify({source:'const =',filename:'a.js'}) });
  assert.equal(invalid.status,400); assert.match((await invalid.json()).error,/Invalid JavaScript/);
  const response = await fetch(endpoint, { method:'POST', headers, body:JSON.stringify({source:'throw new Error("NOT EXECUTED");',filename:'a.mjs'}) });
  assert.equal(response.status,200); assert.match((await response.json()).svg.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '), /NOT EXECUTED/);
});
