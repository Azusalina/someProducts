import { defineConfig } from 'vite';
import { cpSync, mkdirSync } from 'node:fs';
export default defineConfig({
  plugins: [{ name:'local-pdf-fonts', closeBundle() {
    mkdirSync('dist/pdfjs', { recursive:true });
    cpSync('node_modules/pdfjs-dist/standard_fonts','dist/pdfjs/fonts',{recursive:true});
    cpSync('node_modules/pdfjs-dist/cmaps','dist/pdfjs/cmaps',{recursive:true});
  } }],
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:4280' } },
  build: { chunkSizeWarningLimit: 1800 },
});
