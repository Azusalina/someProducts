import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { chromium } from 'playwright-core';
import { createToolkit } from '../src/server.js';
import { findChromium } from '../src/core/pdf.js';
const run = promisify(execFile);
const evidence='/tmp/toolkit-validation/photos'; await mkdir(evidence,{recursive:true});
const folder=await mkdtemp(path.join(os.tmpdir(),'toolkit-photos-'));
const app=await createToolkit({port:0});
const browser=await chromium.launch({executablePath:await findChromium(),headless:true});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage();
 const errors=[], external=[], uploads=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(new URL(app.url).origin)) external.push(r.url());if(r.method()==='POST') uploads.push(r.url());});
 await page.goto(app.url);
 const files=[];
 for(const [name,color,w,h] of [['red.png','#e00000',320,180],['blue.jpg','#0000e0',180,320]]){
  const data=await page.evaluate(({color,w,h,name})=>{
   const c=document.createElement('canvas');c.width=w;c.height=h;
   const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,w,h);ctx.fillStyle='white';ctx.font='20px sans-serif';ctx.fillText(name,20,40);
   return c.toDataURL(name.endsWith('.jpg')?'image/jpeg':'image/png').split(',')[1];
  },{name,color,w,h});
  const filename=path.join(folder,name);await writeFile(filename,Buffer.from(data,'base64'));files.push(filename);
 }
 await writeFile(path.join(folder,'broken.png'),'Not an image');
 // An EXIF orientation-6 phone photo must become portrait in the PDF too.
 await run('python3',['-c',"from PIL import Image; import sys; im=Image.new('RGB',(80,40),(0,180,0)); exif=im.getexif(); exif[274]=6; im.save(sys.argv[1],exif=exif)",path.join(folder,'phone.jpg')]);
 const before=new Map(await Promise.all((await readdir(folder)).map(async name=>[name,await readFile(path.join(folder,name))])));
 await page.getByRole('button',{name:'Photos to PDF',exact:true}).click();
 assert.equal(await page.locator('#photos-save').isDisabled(),true);
 const posts=uploads.length;
 await page.locator('#photos-files').setInputFiles(files);
 await page.locator('#photos-status').filter({hasText:'Photos ready'}).waitFor();
 assert.equal(await page.locator('#photos-list li').count(),2);
 await page.getByRole('button',{name:'Move photo 2 earlier',exact:true}).click();
 assert.match(await page.locator('#photos-list li').first().textContent(),/blue.jpg/);
 await page.locator('#photos-files').setInputFiles([path.join(folder,'phone.jpg'),path.join(folder,'broken.png')]);
 await page.locator('#photos-status').filter({hasText:'broken.png'}).waitFor();
 assert.equal(await page.locator('#photos-list li').count(),3);
 assert.match(await page.locator('#photos-list li').last().textContent(),/40 × 80/);
 await page.locator('#photos-name').fill('combined.pdf');
 const save=async name=>{
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Save photos as PDF',exact:true}).click();
  const download=await downloaded;assert.equal(download.suggestedFilename(),'combined.pdf');await download.saveAs(`${evidence}/${name}.pdf`);
  await page.locator('#photos-status').filter({hasText:'Downloaded'}).waitFor();
  return PDFDocument.load(await readFile(`${evidence}/${name}.pdf`));
 };
 const a4=await save('a4');assert.equal(a4.getPageCount(),3);
 assert.deepEqual(a4.getPages().map(p=>p.getWidth()>p.getHeight()),[false,true,false]);
 await page.locator('#photos-paper').selectOption('photo');
 const photo=await save('fit');assert.deepEqual(photo.getPages().map(p=>p.getSize()),[{width:135,height:240},{width:240,height:135},{width:30,height:60}]);
 await page.locator('#photos-paper').selectOption('Letter');const letter=await save('letter');
 assert.equal(letter.getPage(0).getWidth(),612);assert.equal(letter.getPage(1).getWidth(),792);
 await page.screenshot({path:`${evidence}/desktop.png`,fullPage:true});
 await page.getByRole('button',{name:'PDF pages',exact:true}).click();assert.equal(await page.locator('#pdf-save').isDisabled(),true);
 await page.getByRole('button',{name:'Photos to PDF',exact:true}).click();assert.equal(await page.locator('#photos-list li').count(),3);
 const second=await page.context().newPage();await second.goto(app.url);await second.locator('#photos-tab').click();assert.equal(await second.locator('#photos-save').isDisabled(),true);await second.close();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:`${evidence}/mobile.png`,fullPage:true});
 await page.getByRole('button',{name:'Remove photo 2',exact:true}).click();assert.equal(await page.locator('#photos-list li').count(),2);
 await page.getByRole('button',{name:'Clear photos',exact:true}).click();assert.equal(await page.locator('#photos-save').isDisabled(),true);
 for(const [name,bytes] of before)assert.deepEqual(await readFile(path.join(folder,name)),bytes);
 assert.equal(uploads.length,posts);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 await run('pdftoppm',['-scale-to','700','-png',`${evidence}/a4.pdf`,`${evidence}/page`]);
 await run('python3',['-c',"from PIL import Image; import sys; colors=[(0,0,224),(224,0,0),(0,180,0)];\nfor n,want in enumerate(colors,1):\n im=Image.open(sys.argv[1]+'/page-'+str(n)+'.png').convert('RGB'); got=im.getpixel((im.width//2,im.height//2)); assert max(abs(a-b) for a,b in zip(got,want))<12,(n,got,want)",evidence]);
 console.log('PASS photos: multi-select/append/order/remove/clear, EXIF orientation, corrupt-file recovery, A4/Letter/Fit photo, 3-page PDF dimensions and rendered color order, immutable originals, tab/tool isolation, mobile, no uploads or network.');
} finally{await browser.close();await app.close();await rm(folder,{recursive:true,force:true});}
