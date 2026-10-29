const $=id=>document.getElementById(id);
let busy=false,pending=false,timer,preview;
function status(text){$('scribd-status').textContent=text;}
function update(){for(const id of ['url','name','generate'])$(`scribd-${id}`).disabled=busy||pending;$('scribd-cancel').hidden=!busy;$('scribd-cancel').disabled=pending;}
function reset(){preview=null;$('scribd-result').hidden=true;$('scribd-preview').hidden=true;$('scribd-preview').removeAttribute('src');for(const id of ['scribd-download','scribd-open'])$(id).removeAttribute('href');}
async function request(action,method='GET',data){
 const view=history.state?.toolkitView;if(!view)throw new Error('The toolkit is still connecting. Try again shortly.');
 const response=await fetch('/api/scribd/'+action,{method,headers:{'X-Toolkit-View':view,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Scribd export failed.');return result;
}
function render(result){
 busy=result.state==='working';status(result.message);update();
 if(result.state==='ready'){
  $('scribd-download').href=result.link+'?download=1';$('scribd-download').download=result.filename;
  $('scribd-open').href=result.link;$('scribd-result').hidden=false;
  if(preview!==result.link){preview=result.link;$('scribd-preview').src=result.link+'#view=FitH&zoom=page-width&navpanes=0';$('scribd-preview').hidden=false;}
 }else reset();
}
async function poll(){try{render(await request('status'));}catch(error){status(error.message);update();}if(busy)timer=setTimeout(poll,1000);}
async function action(fn){if(pending)return;pending=true;clearTimeout(timer);update();try{await fn();}catch(error){status(error.message);}finally{pending=false;update();if(busy)timer=setTimeout(poll,500);}}
$('scribd-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{reset();render(await request('start','POST',{url:$('scribd-url').value,filename:$('scribd-name').value}));});});
$('scribd-cancel').addEventListener('click',()=>action(async()=>{render(await request('cancel','POST'));status('Cancelled.');}));
$('scribd-url').addEventListener('input',()=>{reset();status('');});

window.addEventListener('pagehide',()=>{clearTimeout(timer);if(busy&&history.state?.toolkitView)fetch('/api/scribd/cancel',{method:'POST',headers:{'X-Toolkit-View':history.state.toolkitView},keepalive:true}).catch(()=>{});});
