import {chromium, expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const jobs=await mkdtemp(join(tmpdir(),'sheetvis-tuning-')), url='http://127.0.0.1:4288';
const server=spawn('python',['server.py','--port','4288'],{stdio:'ignore',env:{...process.env,SHEETVIS_JOBS_DIR:jobs,SHEETVIS_DEFAULT_SCORE:''}});
let browser;
try {
  for(let i=0;i<50;i++){try{if((await fetch(url+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({viewport:{width:1440,height:1040}}), errors=[], uploads=[], external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()!=='GET')uploads.push(r.url());});
  await page.route('**/*',route=>{
    const address=route.request().url();
    if(/^https?:/.test(address)&&!address.startsWith(url+'/')){external.push(address);return route.abort();}
    return route.continue();
  });
  await page.addInitScript(()=>{
    window.__micCalls=0;window.__micStops=0;window.__deny=false;window.__pending=false;window.__pianoStarts=0;
    const original=AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource=function(){const source=original.call(this),start=source.start.bind(source);source.start=(...a)=>{window.__pianoStarts++;return start(...a);};return source;};
    navigator.mediaDevices.getUserMedia=async()=>{
      window.__micCalls++;if(window.__deny)throw new DOMException('denied','NotAllowedError');
      const context=new AudioContext();await context.resume();
      const oscillator=context.createOscillator(),gain=context.createGain(),out=context.createMediaStreamDestination();
      gain.gain.value=0;oscillator.connect(gain);gain.connect(out);oscillator.start();
      window.__hz=(hz,amp=.2)=>{oscillator.frequency.setValueAtTime(hz,context.currentTime);gain.gain.setValueAtTime(amp,context.currentTime);};
      for(const track of out.stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{window.__micStops++;stop();void context.close();};}
      if(window.__pending)await new Promise(resolve=>{window.__resolve=resolve;});
      return out.stream;
    };
  });
  const hz=midi=>430*2**((midi-69)/12), tone=(frequency,amp=.2)=>page.evaluate(([f,a])=>window.__hz(f,a),[frequency,amp]);
  const target=()=>page.locator('#teaching-target'), index=()=>target().getAttribute('data-index');
  const open=async()=>{await page.locator('#toolbar-toggle').click();await page.locator('#teaching-settings > summary').click();};
  await page.goto(url+'/?demo');await expect(page.locator('#piece-meta')).toContainText('56 个音符');await open();
  expect(await page.evaluate(()=>window.__micCalls)).toBe(0);
  await page.locator('#autoplay').uncheck();
  const notes=['C','D','E'].map(step=>`<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`).join('');
  const xml=`<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${notes}</measure></part></score-partwise>`;
  await page.locator('#file').setInputFiles({name:'tuning.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
  await expect(page.locator('#piece-meta')).toContainText('3 个音符');
  // An actual detuned input fails the unchanged 35-cent gate before calibration.
  await page.locator('#tuning-before').uncheck();await page.locator('#teaching-start').click();
  await expect(page.locator('#teaching-status')).toContainText('麦克风开启');await tone(hz(60));
  await expect(page.locator('#teaching-heard')).toContainText('C4');await page.waitForTimeout(500);expect(await index()).toBe('0');
  await page.locator('#teaching-stop').click();
  // Default teaching entry routes through A4 plus the prompted scale, never seeking the score.
  await page.locator('#tuning-before').check();await page.locator('#teaching-start').click();
  await expect(page.locator('#teaching-status')).toContainText('音阶校准');await expect(target()).toContainText('A4');
  await expect(page.locator('#progress')).toBeDisabled();await expect(page.locator('#teaching-skip')).toBeHidden();
  await tone(hz(60));await page.waitForTimeout(450);await expect(target()).toContainText('A4');
  await tone(430);await expect(target()).toContainText('C4',{timeout:5000});
  const sequence=[60,62,64,65,67,69,71,72], names=['C4','D4','E4','F4','G4','A4','B4','C5'];
  for(let i=0;i<sequence.length;i++){
    await expect(target()).toContainText(names[i]);
    const frequency=hz(sequence[i])*(i===0?2**(12/1200):1);await tone(frequency);
    if(i<sequence.length-1)await expect(target()).toContainText(names[i+1],{timeout:5000});
    else await expect(page.locator('#teaching-panel')).toBeHidden({timeout:5000});
  }
  await expect(page.locator('#tuning-status')).toContainText('尚未采用');
  await expect(page.locator('#tuning-result-panel')).toBeVisible();
  await expect(page.locator('#progress')).toHaveValue('0');
  await expect(page.locator('#tuning-profile')).toContainText('440.00');
  expect(await page.evaluate(()=>localStorage.getItem('sheetvis.tuning.v1'))).toBeNull();
  expect(await page.evaluate(()=>window.__micStops)).toBe(2);
  await mkdir('test-results/tuning',{recursive:true});
  await page.screenshot({path:'test-results/tuning/collected.png'});
  await expect(page.locator('#tuning-accept')).toHaveText('采用并开始教学');
  await page.locator('#tuning-panel-accept').click();await expect(page.locator('#teaching-status')).toContainText('麦克风开启');
  await expect(page.locator('#tuning-result-panel')).toBeHidden();
  const profile=await page.evaluate(()=>JSON.parse(localStorage.getItem('sheetvis.tuning.v1')));
  expect(Math.abs(profile.a4-430)).toBeLessThan(.2);expect(Object.keys(profile.notes)).toHaveLength(8);
  expect(await index()).toBe('0');
  await tone(hz(60)*2**(12/1200));await expect.poll(index).toBe('1');
  // This was rejected before calibration; now it passes as the correct known note.
  await tone(hz(62));await expect.poll(index).toBe('2');
  await tone(hz(76));await page.waitForTimeout(450);expect(await index()).toBe('2');
  await page.locator('#teaching-stop').click();
  expect(await page.evaluate(()=>window.__pianoStarts)).toBe(0);
  // Manual override rejects conflicts without destroying the adopted key table.
  await page.locator('#tuning-a4').fill('460');await page.locator('#tuning-manual').click();
  await expect(page.locator('#tuning-status')).toContainText('超过 45');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sheetvis.tuning.v1')).a4)).toBe(profile.a4);
  await page.reload();await expect(page.locator('#piece-meta')).toContainText('56 个音符');await open();
  expect(await page.evaluate(()=>window.__micCalls)).toBe(0);await page.locator('#tuning-settings > summary').click();
  await expect(page.locator('#tuning-profile')).toContainText('已测 8 键');
  await expect(page.locator('#tuning-before')).toBeChecked();
  await page.getByRole('button',{name:'删除 C4 校准',exact:true}).click();
  await expect(page.locator('#tuning-profile')).toContainText('已测 7 键');
  // Calibration does not require any selected playback hand, nor create audio playback.
  await page.locator('#hand-mode').selectOption('silent');await expect(page.locator('#teaching-start')).toBeDisabled();
  await page.locator('#tuning-start').click();await expect(page.locator('#teaching-status')).toContainText('音阶校准');
  await page.locator('#teaching-stop').click();await expect(page.locator('#tuning-profile')).toContainText('已测 7 键');
  // Cancellation cleans up a late permission grant and leaves the saved profile intact.
  await page.evaluate(()=>{window.__pending=true;});await page.locator('#tuning-start').click();
  await expect.poll(()=>page.evaluate(()=>!!window.__resolve)).toBe(true);
  await page.locator('#teaching-stop').click();await page.evaluate(()=>window.__resolve());
  await expect.poll(()=>page.evaluate(()=>window.__micStops)).toBe(2);
  await expect(page.locator('#teaching-panel')).toBeHidden();
  await page.evaluate(()=>{window.__pending=false;window.__deny=true;});await page.locator('#tuning-start').click();
  await expect(page.locator('#tuning-status')).toContainText('未获得麦克风权限');
  await page.locator('#tuning-reset').click();await expect(page.locator('#tuning-profile')).toContainText('440.00 Hz · 已测 0 键');
  await page.locator('#tuning-a4').fill('432');await page.locator('#tuning-manual').click();
  await expect(page.locator('#tuning-profile')).toContainText('432.00');
  // No microphone activation when resetting, editing or reloading.
  expect(await page.evaluate(()=>window.__micCalls)).toBe(3);
  await page.screenshot({path:'test-results/tuning/browser.png'});
  // Silence expires the current note, closes capture and leaves its previous profile.
  await page.evaluate(()=>{window.__deny=false;});await page.clock.install();
  await page.locator('#tuning-start').click();await expect(page.locator('#teaching-status')).toContainText('音阶校准');
  await page.clock.fastForward(20_050);
  await expect(page.locator('#teaching-panel')).toBeHidden();await expect(page.locator('#tuning-status')).toContainText('20 秒');
  await expect(page.locator('#tuning-profile')).toContainText('432.00');
  expect(await page.evaluate(()=>window.__micStops)).toBe(3);
  await page.clock.resume();
  // Damaged saved data falls back safely, and denied local storage is honest about session-only use.
  await page.evaluate(()=>localStorage.setItem('sheetvis.tuning.v1','{broken'));await page.reload();
  await expect(page.locator('#piece-meta')).toContainText('56 个音符');await open();
  await page.locator('#tuning-settings > summary').click();
  await expect(page.locator('#tuning-status')).toContainText('无效');await expect(page.locator('#tuning-profile')).toContainText('440.00');
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('blocked','SecurityError');};});
  await page.locator('#tuning-a4').fill('432');await page.locator('#tuning-manual').click();
  await expect(page.locator('#tuning-status')).toContainText('仅在本次页面有效');
  await expect(page.locator('#tuning-profile')).toContainText('432.00');
  expect(await page.evaluate(()=>window.__micCalls)).toBe(0);
  expect(errors).toEqual([]);expect(uploads).toEqual([]);expect(external).toEqual([]);
  console.log('PASS: actual MediaStream detuning rejection and compensation, guided A4/scale capture, per-key residual, explicit adoption and teaching, octave rejection, local persistence, manual conflict protection, reset/delete, silent-hand calibration, late-permission cancellation, denial, no playback/upload/external requests. Physical piano accuracy unverified.');
} catch(error){
  const page=browser?.contexts()[0]?.pages()[0];
  if(page){console.error(await page.evaluate(()=>({panel:document.getElementById('teaching-panel')?.innerText,tuning:document.getElementById('tuning-status')?.textContent,profile:document.getElementById('tuning-profile')?.textContent})));await mkdir('test-results/tuning',{recursive:true});await page.screenshot({path:'test-results/tuning/failure.png'});}
  throw error;
} finally {await browser?.close();server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));await rm(jobs,{recursive:true,force:true});}
