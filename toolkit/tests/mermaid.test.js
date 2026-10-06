import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownModule } from '../src/modules/markdown/index.js';

const fence = source => `~~~mermaid\n${source}\n~~~`;
const diagramsFrom = html => [...html.matchAll(/src="data:image\/svg\+xml;base64,([^"]+)"/g)].map(match => Buffer.from(match[1], 'base64').toString());

test('Mermaid renders flowcharts, sequences and CJK locally while ordinary code remains code', async () => {
  const { html, warnings } = await markdownModule.render([
    '# Diagrams',
    fence('flowchart LR\n  A[開始] --> B{Saved?}\n  B -->|Yes| C[Export PDF]'),
    fence('sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi'),
    fence('classDiagram\n  Animal <|-- Duck\n  Animal : +int age'),
    fence('stateDiagram-v2\n  [*] --> Ready\n  Ready --> Done'),
    '~~~js\nconst answer = 42;\n~~~'
  ].join('\n\n'), { filename: '/tmp/mermaid-test.md' });
  assert.deepEqual(warnings, []);
  const diagrams = diagramsFrom(html);
  assert.equal(diagrams.length, 4);
  assert.match(diagrams[0], /開始/);
  assert.match(diagrams[1], /Alice/);
  assert.match(diagrams[2], /Animal/);
  assert.match(diagrams[3], /Ready/);
  assert.ok(diagrams.every(svg => /<svg/.test(svg) && /viewBox=/.test(svg) && /width="[\d.]+"/.test(svg)));
  assert.match(html, /hljs-keyword/);
});

test('invalid Mermaid retains its source without losing other diagrams or Markdown', async () => {
  const { html, warnings } = await markdownModule.render([
    '# Mixed', fence('flowchart LR\n  A -->'),
    'Still readable.', fence('flowchart LR\n  X[Working] --> Y[Done]')
  ].join('\n\n'), { filename: '/tmp/mermaid-invalid.md' });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Mermaid diagram 1:.*Source is shown instead\./s);
  assert.match(html, /language-mermaid/);
  assert.match(html, /Still readable/);
  assert.equal(diagramsFrom(html).length, 1);
});

test('diagram directives cannot enable script callbacks or active document HTML', async () => {
  const source = '%%{init: {"securityLevel": "loose"}}%%\nflowchart LR\n  A[Safe] --> B[End]\n  click A call dangerous()';
  const { html, warnings } = await markdownModule.render(fence(source), { filename: '/tmp/mermaid-safe.md' });
  assert.deepEqual(warnings, []);
  const [svg] = diagramsFrom(html);
  assert.ok(svg);
  assert.doesNotMatch(svg, /<script|onclick=|href="javascript:/);
  assert.doesNotMatch(html, /<svg|<script/); // Only inert SVG image data enters the document.
});

test('oversized Mermaid falls back to source and leaves text-only rendering unaffected', async () => {
  const result = await markdownModule.render(fence(`flowchart LR\n${' '.repeat(50001)}`), { filename: '/tmp/mermaid-large.md' });
  assert.match(result.warnings[0], /50,000 character limit/);
  assert.equal(diagramsFrom(result.html).length, 0);
  const plain = await markdownModule.render('# Plain\n\nNo diagrams.', { filename: '/tmp/mermaid-plain.md' });
  assert.deepEqual(plain.warnings, []);
  assert.match(plain.html, /No diagrams/);
});
