import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
import {parseDocument} from 'htmlparser2';import {findAll} from 'domutils';
import {markdownModule} from '../src/modules/markdown/index.js';import {applyLayout,normalizeLayout} from '../src/core/layout.js';
import {createToolkit} from '../src/server.js';
const elements=html=>findAll(node=>Boolean(node.attribs?.['data-layout-id']),parseDocument(html).children);
async function fixture(t){const folder=await mkdtemp(path.join(tmpdir(),'toolkit-layout-'));t.after(()=>rm(folder,{recursive:true,force:true}));return {folder,filename:path.join(folder,'notes.md')};}

test('SVG paths, HTML, inline SVG and SVG fences become self-contained images with live dependencies',async t=>{
 const {folder,filename}=await fixture(t),svg='<svg viewBox="0 0 100 40"><defs><linearGradient id="g"><stop stop-color="red"/></linearGradient></defs><rect width="100" height="40" fill="url(#g)"/><text y="20">Vector</text></svg>';
 await writeFile(path.join(folder,'drawing.svg'),svg);
 const result=await markdownModule.render(`![Local](drawing.svg)\n\n<img src="drawing.svg" width="60">\n\n${svg}\n\n~~~svg\n${svg}\n~~~`,{filename});
 const images=findAll(node=>node.name==='img',parseDocument(result.html).children);assert.equal(images.length,4);
 for(const image of images){assert.match(image.attribs.src,/^data:image\/svg\+xml;base64,/);const xml=Buffer.from(image.attribs.src.split(',')[1],'base64').toString();assert.match(xml,/viewBox=/);assert.match(xml,/<linearGradient/);assert.match(xml,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);}
 assert.deepEqual(result.dependencies,[path.join(folder,'drawing.svg')]);assert.deepEqual(result.warnings,[]);
});

test('manual page markers split heading groups while code stays literal and heading references resolve',async t=>{
 const {filename}=await fixture(t);const result=await markdownModule.render('# First\n\n[Next](#Subtitle)\n\nA\n\n<!-- pagebreak -->\n\nB\n\n\\newpage\n\n## Subtitle\n\nC\n\n~~~md\n<!-- pagebreak -->\n~~~',{filename});
 assert.equal((result.html.match(/manual-page-start/g)||[]).length,2);assert.match(result.html,/href="#subtitle"/);assert.match(result.html,/&lt;!-- pagebreak --&gt;/);
 assert.ok(result.layoutBlocks.every(block=>block.id));
});

test('layout positions, resizing, reordering and page boundaries apply without rewriting source',async t=>{
 const {filename}=await fixture(t);const state=await markdownModule.render('# Heading\n\nAlpha\n\nBeta\n\n| A | B |\n|---|---|\n| 1 | 2 |',{filename});
 const alpha=state.layoutBlocks.find(b=>b.label==='Alpha').id,beta=state.layoutBlocks.find(b=>b.label==='Beta').id,table=state.layoutBlocks.find(b=>b.kind==='table').id;
 const order=state.layoutBlocks.filter(b=>!b.parent).map(b=>b.id);[order[1],order[2]]=[order[2],order[1]];
 const layout=normalizeLayout({revision:state.layoutRevision,order,blocks:{[alpha]:{x:12,y:-2,align:'center'},[beta]:{pageBefore:true},[table]:{width:50,height:40}}},state);
 const html=applyLayout(state.html,layout),nodes=elements(html);assert.ok(html.indexOf('Beta')<html.indexOf('Alpha'));
 assert.match(nodes.find(n=>n.attribs['data-layout-id']===alpha).attribs.style,/translate\(12mm,-2mm\)/);assert.match(html,/manual-page-start/);
 assert.match(nodes.find(n=>n.name==='table').attribs.style,/width:50%;height:40mm/);
 assert.equal(applyLayout(state.html,null),state.html);assert.equal(normalizeLayout({revision:state.layoutRevision,reset:true},state),null);
 assert.throws(()=>normalizeLayout({...layout,revision:'old'},state),/changed/);assert.throws(()=>normalizeLayout({...layout,blocks:{[alpha]:{x:'url(x)'}}},state),/Invalid x/);
 assert.throws(()=>normalizeLayout({...layout,order:[order[0],order[0],...order.slice(2)]},state),/order/);
 assert.throws(()=>normalizeLayout({...layout,blocks:{unknown:{width:20}}},state),/Unknown/);
});

test('layout API is authenticated, revision-bound, per-view and resets on a saved source change',async t=>{
 const {folder,filename}=await fixture(t);const source='# Document\n\nParagraph';await writeFile(filename,source);
 const app=await createToolkit({port:0,filename,interval:30});t.after(()=>app.close());
 const denied=await fetch(app.url+'api/layout',{method:'POST',body:'{}'});assert.equal(denied.status,403);await denied.text();
 const page=await fetch(app.url);const headers={Cookie:page.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'};await page.text();
 const first=await(await fetch(app.url+'api/views',{method:'POST',headers,body:'{}'})).json(),second=await(await fetch(app.url+'api/views',{method:'POST',headers,body:'{}'})).json();
 const state=first.state,block=state.layoutBlocks.at(-1).id,payload={revision:state.layoutRevision,order:state.layoutBlocks.filter(b=>!b.parent).map(b=>b.id),blocks:{[block]:{x:10,width:60}}};
 const own={...headers,'X-Toolkit-View':first.viewId};let response=await fetch(app.url+'api/layout',{method:'POST',headers:own,body:JSON.stringify(payload)});assert.equal(response.status,200);assert.match((await response.json()).html,/translate\(10mm,0mm\)/);
 const other=await(await fetch(app.url+'api/info',{headers:{...headers,'X-Toolkit-View':second.viewId}})).json();assert.equal(other.state.layout,null);
 response=await fetch(app.url+'api/layout',{method:'POST',headers:own,body:JSON.stringify({...payload,revision:'stale'})});assert.equal(response.status,409);await response.text();
 assert.equal(await readFile(filename,'utf8'),source);await writeFile(filename,source+' updated');
 let next;for(let i=0;i<80;i++){next=await(await fetch(app.url+'api/info',{headers:own})).json();if(next.state.source!==source)break;await new Promise(r=>setTimeout(r,25));}
 assert.equal(next.state.layout,null);assert.match(next.state.html,/updated/);assert.deepEqual(await readdir(folder),['notes.md']);
});
