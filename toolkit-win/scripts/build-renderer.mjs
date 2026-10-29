import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {root} from '../src/platform/runtime.js';
import path from 'node:path';
await mkdir(path.join(root,'.generated'),{recursive:true});
await build({entryPoints:[path.join(root,'node_modules','mermaid','dist','mermaid.core.mjs')],outfile:path.join(root,'.generated','mermaid.js'),bundle:true,minify:true,format:'iife',globalName:'ToolkitMermaid',platform:'browser',target:['firefox128','chrome124','safari17.4'],footer:{js:'globalThis.mermaid = ToolkitMermaid.default;'},logLevel:'warning'});
console.log('Built local SVG renderer from installed, audited dependencies.');
