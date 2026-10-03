import { cp, mkdir, copyFile } from 'node:fs/promises';
await mkdir('vendor/three', { recursive: true });
await cp('node_modules/katex/dist', 'vendor/katex', { recursive: true });
for (const name of ['three.module.js', 'three.core.js']) {
  await copyFile(`node_modules/three/build/${name}`, `vendor/three/${name}`);
}
await copyFile('node_modules/three/examples/jsm/controls/OrbitControls.js', 'vendor/three/OrbitControls.js');
await copyFile('node_modules/three/LICENSE', 'vendor/three/LICENSE');
await copyFile('node_modules/katex/LICENSE', 'vendor/katex/LICENSE');
console.log('Local Three.js and KaTeX assets are ready.');
