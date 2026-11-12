import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {markdownModule} from '../src/modules/markdown/index.js';

async function fixture(t){const folder=await mkdtemp(path.join(tmpdir(),'toolkit-html-'));t.after(()=>rm(folder,{recursive:true,force:true}));return {folder,filename:path.join(folder,'source.md')};}

test('Markdown table cells and standalone HTML render rich content with safe inline layout',async t=>{
  const {filename}=await fixture(t);
  const source=[
    '# A <span>formatted</span> title', '',
    '| Label | Content |','|---|---|',
    '| Lines | First<br>Second<br/>Third |',
    '| Chemistry | H<sub>2</sub>O / x<sup>2</sup> |',
    '| List | <ul><li>First item</li><li>Second item</li></ul> |',
    '| Color | <span style="color:#b00020;font-weight:bold">Styled cell</span> |','',
    '<div style="text-align:center;background-color:rgb(240, 240, 240);padding:8px">',
    '<strong>Outside block</strong><br><em>Italic</em><u>Underline</u><del>Old</del><mark>Highlight</mark>',
    '<ul><li>HTML list</li></ul></div>','',
    '<table><caption>HTML table</caption><tbody><tr><td rowspan="2" align="center" valign="middle" width="40%">Merged</td><td>A</td></tr><tr><td colspan="1">B</td></tr></tbody></table>','',
    '```html','<div>Literal code</div>','```', '', '`<span>inline code</span>`',
  ].join('\n');
  const {html,outline,warnings}=await markdownModule.render(source,{filename});
  assert.match(html,/<td>First<br\s*\/>Second<br\s*\/>Third<\/td>/);
  assert.match(html,/<td>Chemistry<\/td>[\s\S]*H<sub>2<\/sub>O \/ x<sup>2<\/sup>/);
  assert.match(html,/<span style="color:#b00020;font-weight:bold">Styled cell<\/span>/);
  assert.match(html,/<div style="text-align:center;background-color:rgb\(240, 240, 240\);padding:8px">/);
  assert.match(html,/<strong>Outside block<\/strong>/);assert.match(html,/<ul><li>HTML list<\/li><\/ul>/);
  assert.match(html,/<td[^>]+rowspan="2"[^>]+style="[^"]*text-align:center[^"]*vertical-align:middle[^"]*width:40%/);
  assert.match(html,/&lt;span&gt;inline code&lt;\/span&gt;/);
  assert.doesNotMatch(html,/<div>Literal code<\/div>/);
  assert.equal(outline[0].label,'A formatted title');assert.equal(outline[0].id,'a-formatted-title');
  assert.deepEqual(warnings,[]);
});

test('HTML images use the same bounded document-relative embedding as Markdown images',async t=>{
  const {folder,filename}=await fixture(t);await writeFile(path.join(folder,'local image.png'),Buffer.from('local pixel'));
  const {html,warnings}=await markdownModule.render([
    '<div><img src="local%20image.png" alt="HTML image" width="42"></div>', '',
    '| Picture | Text |','|---|---|','| <img src="local%20image.png" width="24"> | Cell |','',
    '<img src="https://example.com/remote.png" alt="remote" onerror="alert(1)" srcset="https://example.com/other.png 2x">',
    '<img src="../outside.png" alt="outside">',
  ].join('\n'),{filename});
  assert.equal((html.match(/data:image\/png;base64,bG9jYWwgcGl4ZWw=/g)||[]).length,2);
  assert.match(html,/width:42px/);assert.match(html,/width:24px/);
  assert.doesNotMatch(html,/onerror|srcset|src="https:|\.\.\/outside/);
  assert.equal(warnings.length,2);assert.match(html,/\[Image: remote\]/);
});

test('HTML strips executable elements, network resources, dangerous CSS and event handlers',async t=>{
  const {filename}=await fixture(t);
  const {html}=await markdownModule.render([
    '<div onclick="alert(1)" style="color:red;background-image:url(https://example.com/track);position:fixed;behavior:url(x);width:expression(alert(1))">Visible</div>', '',
    '<script>window.HACKED=true</script>', '<style>@import "https://example.com/style";</style>',
    '<iframe src="https://example.com/embed">Frame content</iframe>',
    '<object data="file:///etc/passwd">Object content</object>',
    '<svg><a href="javascript:alert(1)">SVG</a></svg>',
    '<meta http-equiv="refresh" content="0;url=https://example.com">',
    '<form action="https://example.com"><input type="text" autofocus onfocus="alert(1)"><button>Submit</button></form>', '',
    '<a href="javascript:alert(1)" target="_top">Bad</a>',
    '<a href="https://example.com/read" target="_parent" ping="https://example.com/log">Read</a>',
    '<a href="#a-formatted-title" target="_top">Jump</a>', '', '- [x] Markdown task',
  ].join('\n'),{filename});
  assert.match(html,/<div style="color:red">Visible<\/div>/);
  assert.doesNotMatch(html,/<(?:script|style|iframe|object|svg|meta|form|button)\b|HACKED|Frame content|Object content|onclick=|onfocus=|autofocus|javascript:|file:\/\/|background-image|position:|expression\(|ping=|target="_top"|target="_parent"/);
  assert.match(html,/<a href="https:\/\/example.com\/read" target="_blank" rel="noopener noreferrer">Read<\/a>/);
  assert.match(html,/<a href="#a-formatted-title">Jump<\/a>/);
  assert.match(html,/<input(?=[^>]*type="checkbox")(?=[^>]*\bdisabled\b)[^>]*>/);
  assert.doesNotMatch(html,/<input[^>]+type="text"/);
});
