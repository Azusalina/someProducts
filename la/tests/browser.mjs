import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { lessons } from '../js/lessons.js';
const base=process.env.LA_BASE_URL||'http://127.0.0.1:3001/';
const screenshots=process.env.LA_SCREENSHOTS||'/tmp/little-algebra-browser';
await mkdir(screenshots,{recursive:true});
const executablePath=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1050}});
const page=await context.newPage(),errors=[],failed=[],external=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))external.push(r.url());});
const go=async path=>{await page.goto(base+path,{waitUntil:'networkidle'});};
const range=async(key,value)=>{await page.locator(`[data-key="${key}"]`).evaluate((el,val)=>{el.value=val;el.dispatchEvent(new Event('input',{bubbles:true}));},String(value));};
const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`page overflows horizontally: ${page.url()}`);
try{
  await go('');assert.equal(await page.locator('.path-card').count(),14);await noOverflow();
  await page.screenshot({path:`${screenshots}/home-desktop.png`,fullPage:true});
  for(const l of lessons){
    await go(`index.html#${l.id}`);
    assert.ok((await page.locator('h1').innerText()).includes(l.title));
    assert.equal(await page.locator('.plot svg').count(),1,`${l.id} diagram`);
    assert.ok(await page.locator('.formula .katex').count(),`${l.id} formula renders`);
    assert.equal(await page.locator('.katex-error,.katex .mord.textcolor').count(),0,`${l.id} formula error`);
    const annotation=await page.locator('.math-output annotation').textContent();
    assert.ok(annotation&&!annotation.includes('NaN'),`${l.id} live math`);
    assert.equal(await page.locator('[data-answer]').count(),l.quiz.options.length);
    const wrong=(l.quiz.answer+1)%l.quiz.options.length;
    await page.locator(`[data-answer="${wrong}"]`).click();assert.ok((await page.locator('.quiz-feedback').innerText()).includes('Not quite'));
    await page.locator(`[data-answer="${l.quiz.answer}"]`).click();assert.ok((await page.locator('.quiz-feedback').innerText()).includes('Yes'));
    await page.locator('[data-code-lang="r"]').click();assert.equal(await page.locator('.code-card code').textContent(),l.r);
    await page.locator('[data-code-lang="py"]').click();assert.equal(await page.locator('.code-card code').textContent(),l.py);
    await noOverflow();console.log(`✓ ${l.id}: diagram, LaTeX, quiz, Python/R`);
  }
  await go('index.html#vectors');
  assert.ok((await page.locator('.math-output annotation').textContent()).includes('\\\\'),'column-vector row separators');
  await page.locator('[data-key="v.0"]').fill('4');await range('scale',-2);
  assert.ok((await page.locator('.math-output annotation').textContent()).includes('-8'));
  await page.locator('[data-complete]').click();assert.equal(await page.locator('[data-complete]').getAttribute('aria-pressed'),'true');
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('[data-complete]').getAttribute('aria-pressed'),'true');
  assert.ok((await page.locator('#progress-caption').innerText()).startsWith('1 / 14'));
  await page.locator('[data-drag="v"]').scrollIntoViewIfNeeded();
  const start=await page.locator('[data-drag="v"]').boundingBox();
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await page.mouse.move(start.x+45,start.y-25,{steps:5});await page.mouse.up();
  assert.notEqual(await page.locator('[data-key="v.0"]').inputValue(),'3','vector dragging changes coordinates');
  await page.screenshot({path:`${screenshots}/vectors-desktop.png`,fullPage:true});
  for(const id of ['vectors','span','matrices','determinants']){
    await go(`index.html#${id}`);await page.locator('[data-dim="3"]').click();await page.locator('canvas').waitFor();
    assert.equal(await page.locator('[data-dim="3"]').getAttribute('aria-pressed'),'true');
    if(id==='matrices'){
      assert.equal(await page.locator('.matrix-input input').count(),9);await page.locator('[data-key="A3.8"]').fill('2');
      await page.locator('[data-select="preset"]').selectOption('collapse');
    }else if(await page.locator('[data-key="v.2"]').count())await page.locator('[data-key="v.2"]').fill('2');
    await page.locator('[data-camera]').click();await page.screenshot({path:`${screenshots}/${id}-3d.png`,fullPage:true});
    await page.locator('[data-dim="2"]').click();assert.equal(await page.locator('canvas').count(),0);assert.equal(await page.locator('.plot svg').count(),1);
    console.log(`✓ ${id}: 3D, camera, switch back to 2D`);
  }
  await go('index.html#systems');for(const [preset,phrase] of [['none','no solution'],['infinite','infinitely many'],['unique','unique solution']]){await page.locator('[data-select="systemPreset"]').selectOption(preset);assert.ok((await page.locator('.live-note').textContent()).includes(phrase));}
  await go('index.html#dot');await page.locator('[data-key="u.0"]').fill('0');assert.ok((await page.locator('.live-note').innerText()).includes('undefined'));
  await go('index.html#eigen');await page.locator('[data-select="preset"]').selectOption('rotation');assert.ok((await page.locator('.live-note').textContent()).includes('No real eigenvectors'));
  await go('index.html#summary');await page.locator('[data-data]').fill('bad input');await page.locator('[data-apply]').click();assert.ok((await page.locator('.input-error').textContent()).includes('finite'));
  await page.locator('[data-data]').fill('4, 4, 4, 4');await page.locator('[data-apply]').click();assert.ok((await page.locator('.live-note').textContent()).includes('s² = 0'));
  await range('outlier',30);assert.ok((await page.locator('.math-output annotation').textContent()).includes('10.5'));
  await go('index.html#probability');await range('p',0);await page.locator('[data-run]').click();await range('k',0);assert.ok((await page.locator('.math-output annotation').textContent()).includes('P(X=0)=1'));
  await range('p',1);await range('n',3);assert.equal(await page.locator('[data-key="k"]').getAttribute('max'),'3');
  await go('index.html#normal');assert.ok((await page.locator('.math-output annotation').textContent()).includes('0.6827'));
  await go('index.html#sampling');assert.equal(await page.locator('.interval-list svg').count(),1);await page.locator('[data-select="population"]').selectOption('normal');await range('n',100);assert.ok((await page.locator('.math-output annotation').textContent()).includes('0.1'));
  await page.screenshot({path:`${screenshots}/sampling-desktop.png`,fullPage:true});
  await go('index.html#regression');const before=await page.locator('.math-output annotation').textContent(),point=await page.locator('[data-drag="point-2"]').boundingBox();await page.mouse.move(point.x+7,point.y+7);await page.mouse.down();await page.mouse.move(point.x+35,point.y-50,{steps:6});await page.mouse.up();assert.notEqual(await page.locator('.math-output annotation').textContent(),before);
  await go('index.html#bootstrap');await page.locator('[data-data]').fill('7,7,7');await page.locator('[data-apply]').click();assert.ok((await page.locator('.math-output annotation').textContent()).includes('[7,\\ 7]'));
  await go('notes.html');assert.ok(await page.locator('.table-wrap .katex').count());await noOverflow();
  for(const href of await page.locator('a[download]').evaluateAll(as=>as.map(a=>a.getAttribute('href'))))assert.equal((await page.request.get(base+href)).status(),200);
  await page.screenshot({path:`${screenshots}/notes-desktop.png`,fullPage:true});
  await page.locator('#theme-button').click();await page.locator('#language-button').click();await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('body').getAttribute('data-theme'),'dark');assert.equal(await page.locator('body').getAttribute('data-language'),'en');
  await page.screenshot({path:`${screenshots}/notes-dark.png`,fullPage:true});await page.locator('#theme-button').click();await page.locator('#language-button').click();
  await go('playground.html#regression');assert.equal(await page.locator('.playground-tabs a').count(),14);assert.ok(await page.locator('[data-drag]').count());
  await page.screenshot({path:`${screenshots}/playground-desktop.png`,fullPage:true});
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:900});
    for(const path of ['index.html#start',...lessons.map(l=>`index.html#${l.id}`),'notes.html','playground.html#regression']){await go(path);await noOverflow();}
    await go('index.html#vectors');await noOverflow();
    if(width<650){await page.locator('.mobile-menu').click();assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'),'true');await page.locator('[data-lesson="span"]').click();assert.ok((await page.locator('h1').innerText()).includes('Build a space'));}
    await page.screenshot({path:`${screenshots}/lesson-${width}.png`,fullPage:true});console.log(`✓ ${width}px: responsive layout and navigation`);
  }
  const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const touchPage=await touchContext.newPage();touchPage.on('pageerror',e=>errors.push(e.message));
  await touchPage.goto(base+'index.html#vectors',{waitUntil:'networkidle'});await touchPage.locator('[data-drag="v"]').scrollIntoViewIfNeeded();
  const handle=await touchPage.locator('[data-drag="v"]').boundingBox(),client=await touchContext.newCDPSession(touchPage),x=handle.x+handle.width/2,y=handle.y+handle.height/2;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=5;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+6*i,y:y-4*i}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.notEqual(await touchPage.locator('[data-key="v.0"]').inputValue(),'3','one-finger vector dragging');
  await touchPage.locator('[data-dim="3"]').click();await touchPage.locator('canvas').waitFor();
  await touchPage.screenshot({path:`${screenshots}/touch-3d.png`,fullPage:false});await touchContext.close();
  console.log('✓ One-finger vector dragging and 3D on a touch device');
  assert.deepEqual(errors,[],'browser errors');assert.deepEqual(failed,[],'failed HTTP responses');assert.deepEqual(external,[],'runtime uses only local resources');
  console.log(`✓ Browser checks passed. Screenshots: ${screenshots}`);
}finally{await browser.close();}
