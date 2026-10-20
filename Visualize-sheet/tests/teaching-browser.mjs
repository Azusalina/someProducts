import {chromium, expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const jobs = await mkdtemp(join(tmpdir(), 'sheetvis-teaching-'));
const url = 'http://127.0.0.1:4286';
const server = spawn('python', ['server.py', '--port', '4286'], {stdio:'ignore', env:{...process.env,SHEETVIS_JOBS_DIR:jobs,SHEETVIS_DEFAULT_SCORE:''}});
let browser;
try {
  for (let i=0; i<50; i++) {try {if ((await fetch(url+'/api/health')).ok) break;} catch {} await new Promise(r=>setTimeout(r,100));}
  browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const page = await browser.newPage({viewport:{width:1440,height:1040}});
  const errors = [], network = [], external = [];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console', message=>{if(message.type()==='warning') console.error(message.text());});
  page.on('request',request=>network.push({url:request.url(),method:request.method()}));
  await page.route('**/*', route => {
    const address = route.request().url();
    if (/^https?:/.test(address) && !address.startsWith(url+'/')) {external.push(address);return route.abort();}
    return route.continue();
  });
  // Synthetic sound travels through real Chromium MediaStream and Web Audio
  // graphs into the production pitch detector. No physical microphone is used.
  await page.addInitScript(() => {
    window.__micCalls=0;window.__micStops=0;window.__pianoStarts=0;window.__pendingMic=false;window.__denyMic=false;
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function() {
      const source=original.call(this),start=source.start.bind(source);
      source.start=(...args)=>{window.__pianoStarts++;return start(...args);};return source;
    };
    navigator.mediaDevices.getUserMedia = async () => {
      window.__micCalls++;
      if(window.__denyMic)throw new DOMException('denied','NotAllowedError');
      const context=new AudioContext();await context.resume();
      const oscillator=context.createOscillator(),gain=context.createGain(),out=context.createMediaStreamDestination();
      oscillator.frequency.value=261.625565;gain.gain.value=0;
      oscillator.connect(gain);gain.connect(out);oscillator.start();
      window.__tone = (midi, amplitude=.2) => {
        oscillator.frequency.setValueAtTime(440*2**((midi-69)/12),context.currentTime);
        gain.gain.setValueAtTime(amplitude,context.currentTime);
      };
      for(const track of out.stream.getTracks()) {
        const stop=track.stop.bind(track);
        track.stop=()=>{window.__micStops++;stop();void context.close();};
      }
      if(window.__pendingMic)await new Promise(resolve=>{window.__resolveMic=resolve;});
      return out.stream;
    };
  });
  await page.goto(url+'/?demo');await expect(page.locator('#piece-meta')).toContainText('56 个音符');
  await page.locator('#toolbar-toggle').click();await page.locator('#autoplay').uncheck();
  const note = (step,octave=4,extra='') => `<note>${extra}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`;
  const xml = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>${note('C')}${note('C')}${note('D')}${note('E')}${note('G',4,'<chord/>')}</measure><measure number="2">${note('F')}<note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note></measure></part></score-partwise>`;
  await page.locator('#file').setInputFiles({name:'teaching.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
  await expect(page.locator('#piece-meta')).toContainText('6 个音符');
  await expect(page.locator('#score-view .seek-note')).toHaveCount(6);
  await page.locator('#teaching-settings > summary').click();
  expect(await page.evaluate(()=>window.__micCalls)).toBe(0);
  await page.locator('#tuning-before').uncheck();
  await page.locator('#teaching-start').click();
  await expect(page.locator('#teaching-status')).toContainText('麦克风开启');
  const index=()=>page.locator('#teaching-target').getAttribute('data-index');
  const tone=(midi,amp=.2)=>page.evaluate(([m,a])=>window.__tone(m,a),[midi,amp]);
  await page.waitForTimeout(350);expect(await index()).toBe('0');
  await tone(72);await expect(page.locator('#teaching-heard')).toContainText('C5');
  await page.waitForTimeout(400);expect(await index()).toBe('0');
  await tone(60);await expect.poll(index).toBe('1');
  await page.waitForTimeout(650);expect(await index()).toBe('1');
  expect(await page.evaluate(()=>window.__pianoStarts)).toBe(0);
  const canvas=page.locator('#waterfall');await canvas.click({position:{x:90,y:680}});
  expect(await page.evaluate(()=>window.__pianoStarts)).toBe(0);
  await tone(60,0);await page.waitForTimeout(400);await tone(60);await expect.poll(index).toBe('2');
  await tone(62);await expect.poll(index).toBe('3');
  await expect(page.locator('#teaching-result')).toContainText('和弦');
  await tone(64);await page.waitForTimeout(600);expect(await index()).toBe('3');
  await page.locator('#teaching-skip').click();await expect.poll(index).toBe('4');
  await expect(page.locator('#teaching-count')).toContainText('通过 3 · 跳过 1');
  await tone(65);await expect(page.locator('#teaching-panel')).toBeHidden();
  await expect(page.locator('#notice')).toContainText('通过 4，手动跳过 1');
  expect(await page.evaluate(()=>window.__micStops)).toBe(1);

  // Seeking while listening stays paused and moves the teaching target.
  await page.locator('#reset').click();await page.locator('#teaching-start').click();
  await expect(page.locator('#teaching-status')).toContainText('麦克风开启');
  await page.locator('#progress').evaluate(input=>{input.value='1';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect.poll(index).toBe('2');await expect(page.locator('#play')).toHaveText('停止教学');
  await page.locator('#waterfall').dispatchEvent('wheel',{deltaY:-200,deltaMode:0});await expect.poll(index).toBe('0');
  await page.locator('#score-view .seek-note').last().click();await expect.poll(index).toBe('4');
  expect(await page.evaluate(()=>window.__pianoStarts)).toBe(0);
  await page.locator('#zen').click();await expect(page.locator('#teaching-stop')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('#teaching-panel')).toBeHidden();
  expect(await page.evaluate(()=>window.__micStops)).toBe(2);
  expect(await page.locator('body').evaluate(body=>body.classList.contains('zen'))).toBe(false);

  // Space, hand switching, importing and backgrounding release the input.
  const start=async()=>{await page.locator('#reset').click();await page.locator('#teaching-start').click();await expect(page.locator('#teaching-status')).toContainText('麦克风开启');};
  await start();await page.keyboard.press('Space');await expect(page.locator('#teaching-panel')).toBeHidden();
  await start();await page.locator('#hand-mode').selectOption('right');await expect(page.locator('#teaching-panel')).toBeHidden();
  await start();await page.locator('#file').setInputFiles({name:'replacement.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
  await expect(page.locator('#teaching-panel')).toBeHidden();await expect(page.locator('#piece-meta')).toContainText('6 个音符');
  await start();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('#teaching-panel')).toBeHidden();
  expect(await page.evaluate(()=>window.__micStops)).toBe(6);
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:false}));

  await page.evaluate(()=>{window.__pendingMic=true;});
  await page.locator('#reset').click();await page.locator('#teaching-start').click();
  await expect(page.locator('#teaching-status')).toContainText('等待麦克风权限');
  await expect.poll(()=>page.evaluate(()=>!!window.__resolveMic)).toBe(true);
  await page.locator('#teaching-stop').click();await page.evaluate(()=>window.__resolveMic());
  await expect.poll(()=>page.evaluate(()=>window.__micStops)).toBe(7);
  await expect(page.locator('#teaching-panel')).toBeHidden();
  await page.evaluate(()=>{window.__pendingMic=false;window.__denyMic=true;});
  await page.locator('#teaching-start').click();await expect(page.locator('#notice')).toContainText('未获得麦克风权限');
  await expect(page.locator('#teaching-panel')).toBeHidden();
  expect(network.filter(r=>r.method!=='GET')).toEqual([]);expect(external).toEqual([]);expect(errors).toEqual([]);

  // Leave a useful, representative screenshot, with capture stopped afterward.
  await page.evaluate(()=>{window.__denyMic=false;});await start();
  await mkdir('test-results/teaching',{recursive:true});await page.screenshot({path:'test-results/teaching/browser.png'});
  await page.locator('#teaching-stop').click();

  // Reopen a cached PDF with known source coordinates; no recognition job or
  // extra cache directory is created. The coordinates are a UI fixture, not an
  // assertion about OMR mapping accuracy.
  const id='a'.repeat(32),base=`/api/jobs/${id}`;
  const positions=Object.fromEntries(['P1:0:0','P1:0:1','P1:0:2','P1:0:3','P1:0:4','P1:1:0'].map((source,i)=>[source,{page:1,x:.12+i*.07,y:.3,w:.02,h:.015,head:String(i),grade:1}]));
  await page.route(`**${base}`,route=>route.fulfill({json:{id,state:'done',filename:'teaching.pdf',total_pages:1,included_pages:[1],octave_audit:{upper:0,lower:0,native_labels:0,findings:[]},results:[{name:'result-0.musicxml',url:base+'/result-0.musicxml',mapping:base+'/result-0.map.json'}]}}));
  await page.route(`**${base}/score.pdf`,async route=>route.fulfill({body:await readFile('tests/fixtures/demo-score.pdf'),contentType:'application/pdf'}));
  await page.route(`**${base}/result-0.musicxml`,route=>route.fulfill({body:xml,contentType:'application/xml'}));
  await page.route(`**${base}/result-0.map.json`,route=>route.fulfill({json:{version:4,mapped:6,total:6,positions}}));
  await page.goto(`${url}/?cache=${id}`);await expect(page.locator('#piece-meta')).toContainText('6 个音符');
  await expect(page.locator('#pdf-view')).toHaveAttribute('aria-busy','false');
  await page.locator('#toolbar-toggle').click();await page.locator('#teaching-settings > summary').click();
  expect(await page.evaluate(()=>window.__micCalls)).toBe(0);
  await start();
  const pianoBeforeTeaching=await page.evaluate(()=>window.__pianoStarts);
  await expect(page.locator('.note-highlight')).toHaveAttribute('data-source','P1:0:0');
  await tone(60);await expect.poll(index).toBe('1');
  await expect(page.locator('.note-highlight')).toHaveAttribute('data-source','P1:0:1');
  const pdf=page.locator('#pdf-view .pdf-page');
  const box=await pdf.boundingBox();await page.mouse.click(box.x+box.width*.48,box.y+box.height*.3075);
  await expect.poll(index).toBe('4');await expect(page.locator('#play')).toHaveText('停止教学');
  expect(await page.evaluate(()=>window.__pianoStarts)).toBe(pianoBeforeTeaching);
  await page.screenshot({path:'test-results/teaching/pdf.png'});
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect(page.locator('#teaching-panel')).toBeHidden();expect(await page.evaluate(()=>window.__micStops)).toBe(1);
  expect(network.filter(r=>r.method!=='GET')).toEqual([]);expect(external).toEqual([]);expect(errors).toEqual([]);
  console.log('PASS: real synthetic MediaStream pitch recognition, correct-note stepping, octave rejection, held-note lock, release/repeated note, legato, manual chord skip, seek/PDF-staff navigation, Zen/Escape/Space, hand/import/visibility cleanup, delayed permission cancellation, denial, and no upload/external requests. Physical-microphone accuracy unverified.');
} catch (error) {
  const page=browser?.contexts()[0]?.pages()[0];
  if(page) {
    console.error(await page.evaluate(()=>({score:document.getElementById('score-view')?.innerHTML.slice(0,800),warnings:document.getElementById('warnings-list')?.textContent,status:document.getElementById('teaching-panel')?.innerText})));
    await mkdir('test-results/teaching',{recursive:true});await page.screenshot({path:'test-results/teaching/failure.png'});
  }
  throw error;
} finally {
  await browser?.close();server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));await rm(jobs,{recursive:true,force:true});
}
