'use strict';
(() => {
  const data=window.HKU_DATA, model=HKUModel;
  const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(!data){$('#programme-list').textContent='課程資料未載入。請確認 data/site-data.js 與 index.html 在同一份完整資料夾。';return;}
  const codes=data.programmes.map(p=>p.code), byCode=Object.fromEntries(data.programmes.map(p=>[p.code,p]));
  const key='hku2027-workbench-v1';let state=model.cleanState({},codes),storage=true;
  try{const saved=localStorage.getItem(key);if(saved)state=model.cleanState(JSON.parse(saved),codes);}catch{storage=false;}
  const persist=()=>{try{localStorage.setItem(key,JSON.stringify(state));}catch{storage=false;}if(!storage)$('#storage-status').textContent='瀏覽器儲存不可用；目前筆記只在本次開啟期間保留，請匯出。';};
  let timer;
  const toast=text=>{clearTimeout(timer);$('#toast').textContent=text;$('#toast').classList.add('show');timer=setTimeout(()=>$('#toast').classList.remove('show'),3500);};
  const link=(title,url)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)} ↗</a>`;
  const list=items=>`<ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
  const admission=p=>{
    const b=p.admission2026,s=model.score(p.code,state.grades);
    return `<div class="admission-block" data-admissions="${p.code}"><span class="muted">2026 實際取錄分布 · ${link('PDF第'+b.page+'頁',b.source+'#page='+b.page)}</span><dl class="admission-strip"><div><dt>LQ 下四分位</dt><dd>${b.lq.toFixed(2)}</dd></div><div><dt>Median 中位</dt><dd>${b.median.toFixed(2)}</dd></div><div><dt>UQ 上四分位</dt><dd>${b.uq.toFixed(2)}</dd></div><div class="current-score"><dt>目前預測折算</dt><dd data-current-score="${p.code}">${s.value.toFixed(2)}</dd></div></dl><p class="formula">${esc(s.formula)}</p></div>`;
  };
  const badge=p=>{const e=model.eligibility(p.code,state.grades,state.csd);return `<span class="tag ${e.status==='blocked'?'blocked':e.status==='historical'?'warning':''}">${esc(e.text)}</span>`;};
  const buttons=(p,detail=false)=>`${detail?'':`<button data-open="${p.code}">閱讀完整資料 ↗</button>`}<button data-compare="${p.code}" aria-pressed="${state.compare.includes(p.code)}" class="${state.compare.includes(p.code)?'active':''}">${state.compare.includes(p.code)?'已比較':'＋ 比較'}</button><button data-save="${p.code}" aria-pressed="${state.plan.includes(p.code)}" class="${state.plan.includes(p.code)?'active':''}">${state.plan.includes(p.code)?'已加入':'＋ 志願'}</button>`;
  function renderGrades(){
    $('#grade-inputs').innerHTML=Object.entries(model.subjects).map(([k,label])=>`<label>${label}<select data-grade="${k}" aria-label="${label}成績">${Object.keys(model.points).map(g=>`<option value="${g}" ${state.grades[k]===g?'selected':''}>${g}</option>`).join('')}</select></label>`).join('');
    $('#csd').value=state.csd;
    $('#grade-summary').textContent=Object.entries(model.subjects).map(([k,v])=>`${v} ${state.grades[k]}`).join(' · ');
    const s=model.summary(state.grades);
    $('#score-summary').innerHTML=`<div class="scores"><div class="score-item"><strong>${s.best5.toFixed(2)}</strong><span>最佳五科 · HKU 8.5 換算</span></div><div class="score-item"><strong>${s.best6.toFixed(2)}</strong><span>最佳六科 · 含 M1</span></div><div class="score-item"><strong>${s.business.toFixed(2)}</strong><span>2026 商科公式折算</span></div></div><p class="muted">公民科預設按你的指示假設 Attained，不計入分數。各課程採用 <a href="data/hku26.pdf">hku26.pdf 的2026實際取錄分布與公式</a>。LQ是第25百分位、Median是中位、UQ是第75百分位；它們不是2027門檻或最低取錄分。修改預測成績會同步重算「目前預測折算」。</p>`;
  }
  function renderProgrammes(){
    const query=$('#search').value.trim().toLowerCase(),field=$('#field').value,status=$('#status').value;
    const items=data.programmes.filter(p=>{
      const e=model.eligibility(p.code,state.grades,state.csd);
      const match=!query||(/^(?:js)?\d{4}$/.test(query)?p.code.toLowerCase()===('js'+query.replace(/^js/,'')):JSON.stringify(p).toLowerCase().includes(query));
      return (field==='all'||p.field===field)&&(status!=='eligible'||['meets','pending'].includes(e.status))&&(status!=='priority'||p.priority)&&(status!=='saved'||state.plan.includes(p.code))&&match;
    });
    $('#result-count').textContent=`${items.length} / ${codes.length} 個課程代碼`;
    $('#programme-list').innerHTML=items.length?items.map(p=>`<article class="programme"><div class="code">${p.code}${p.priority?'<br><span class="tag">優先探索</span>':''}</div><div><h3><button class="name-button" data-open="${p.code}">${esc(p.name)}</button></h3><p class="english">${esc(p.englishName)}</p>${badge(p)}<p class="summary">${esc(p.advice)}</p>${admission(p)}</div><div><p class="meta">${p.years} 年 · ${esc(p.fieldLabel)}</p><p class="meta">${esc(p.quota)}</p><p class="muted">${p.reviews.length} 條經驗／討論記錄，含證據限制</p></div><div class="actions">${buttons(p)}</div></article>`).join(''):'<div class="empty">沒有符合篩選的課程。清除搜尋或改回「所有課程」。</div>';
    $('#compare-count').textContent=state.compare.length;
  }
  function renderCompare(){
    const items=state.compare.map(c=>byCode[c]);
    if(!items.length){$('#comparison').innerHTML='<div class="empty">到課程列表點「＋ 比較」，最多選四項。<br><a href="#explore">返回探索課程 ↗</a></div>';return;}
    const rows=[['修讀／學額',p=>`${p.years} 年<br>${esc(p.quota)}`],['2026分布／目前分數／公式',admission],['已知入學資格',badge],['課程內容',p=>list(p.curriculum)],['入讀後加第二主修',p=>esc(p.secondWith)],['作別人的第二主修',p=>esc(p.secondAs)],['出路（顧問分析）',p=>list(p.careers)],['薪酬與統計限制',p=>esc(p.salary)],['升學準備',p=>list(p.postgraduate)],['學生經驗／討論',p=>p.reviews.map(r=>`<p>${esc(r.kind)} · ${esc(r.date)}<br>${esc(r.summary)}<br>${link('原帖',r.url)}</p>`).join('')],['給你的建議',p=>esc(p.advice)]];
    $('#comparison').innerHTML=`<p class="muted">橫向捲動查看全部課程。每欄可移除，已保存的志願不受影響。</p><div class="compare-scroll" tabindex="0" aria-label="課程比較表，可橫向捲動"><table><thead><tr><th scope="col">比較項目</th>${items.map(p=>`<th scope="col"><span class="code">${p.code}</span><h3>${esc(p.name)}</h3><button data-compare="${p.code}">移除比較</button> <button data-open="${p.code}">詳情</button></th>`).join('')}</tr></thead><tbody>${rows.map(([title,fn])=>`<tr><th scope="row">${title}</th>${items.map(p=>`<td>${fn(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function renderPlan(){
    $('#plan-list').innerHTML=state.plan.length?state.plan.map((c,i)=>{const p=byCode[c];return `<article class="plan-item"><div class="rank">${i+1}<small>Band ${i<3?'A':i<6?'B':i<10?'C':i<15?'D':'E'}</small></div><div><span class="code">${c}</span><h3>${esc(p.name)}</h3>${badge(p)}<label>選擇理由與待確認事項<textarea data-note="${c}" rows="3" placeholder="我想讀它，因為……">${esc(state.notes[c]||'')}</textarea></label></div><div class="plan-actions"><button data-move="${c}" data-direction="-1" ${i===0?'disabled':''} aria-label="將${esc(p.name)}上移">↑ 上移</button><button data-move="${c}" data-direction="1" ${i===state.plan.length-1?'disabled':''} aria-label="將${esc(p.name)}下移">↓ 下移</button><button data-open="${c}">詳情</button><button data-save="${c}">移出志願</button></div></article>`;}).join(''):'<div class="empty">尚未加入課程。從探索列表加入後，再按自己的真實意願排序。<br><a href="#explore">探索課程 ↗</a></div>';
    $('#global-notes').value=state.globalNotes;
  }
  function openDetail(code){
    const p=byCode[code];if(!p)return;
    const s=model.score(code,state.grades),e=model.eligibility(code,state.grades,state.csd);
    $('#detail-code').textContent=`${code} · 2027 入學研究`;
    $('#detail-content').innerHTML=`<h2>${esc(p.name)}</h2><p class="english">${esc(p.englishName)}</p>${badge(p)}<div class="notice"><strong>給你的建議（顧問判斷）</strong><p>${esc(p.advice)}</p></div><div class="actions">${buttons(p,true)}</div><article class="prose"><h2>學制、學額與資格</h2><p>${p.years} 年。${esc(p.quota)}</p><p>${esc(p.eligibility)}</p><p>目前情境：${esc(e.text)}</p><h2>2026取錄分布與目前折算分</h2>${admission(p)}<p class="muted">這是2026已取錄群體的分布；LQ並非最低取錄分，也不代表2027門檻或個人錄取概率。當前分數來自你的預測，並非已取得的正式考試成績。</p><p>PDF原文公式：${esc(p.admission2026.formulaOriginal)}</p><details><summary>查看逐科計分過程</summary><ul class="calculation">${s.terms.map(t=>`<li>${esc(t.label)} ${esc(t.grade)}：${t.points} × ${t.weight} = ${t.value.toFixed(2)}</li>`).join('')}</ul><p>合計：<strong>${s.value.toFixed(2)}</strong>；公民科只作資格條件，不加分。</p><p>與2026 Median差額：${s.value>=p.admission2026.median?'+':''}${(s.value-p.admission2026.median).toFixed(2)}。</p></details><h2>教學內容</h2>${list(p.curriculum)}<h2>第二主修：兩種不同問題</h2><h3>其他課程學生，能把這個學科當第二主修嗎？</h3><p>${esc(p.secondAs)}</p><h3>入讀這個課程後，可以再加甚麼？</h3><p>${esc(p.secondWith)}</p><h2>工作前景與薪酬</h2><p>以下職涯是依學習內容作的方向分析；需符合僱主技能與經驗要求。</p>${list(p.careers)}<p>${esc(p.salary)}</p><p class="muted">2027 入學一般在 2031／2032 畢業；現有薪酬資料是歷史觀測，沒有足夠依據預測你的畢業年薪金。</p><h2>升學前景</h2>${list(p.postgraduate)}<h2>找到的學生經驗與討論</h2><p class="muted">保留正面、負面及證據不足的記錄。匿名身份未獨立驗證；官方精選分享有篩選偏差；申請人疑問不算在讀課程評價。</p>${p.reviews.map(r=>`<div class="review"><small>${esc(r.kind)} · ${esc(r.date)}</small><p>${esc(r.summary)}</p>${link('閱讀原始來源',r.url)}</div>`).join('')}<h2>限制與待確認</h2>${list(p.caveats)}<h2>官方與補充來源</h2><ul class="source-list">${p.sources.map(s=>`<li>${link(s.title,s.url)}</li>`).join('')}</ul><p class="muted">查核日與適用年份按各來源標示；整理於 2026-10-22 至 2026-10-23。</p></article>`;
    if(!$('#detail').open)$('#detail').showModal();$('#detail').scrollTop=0;
  }
  function refresh(){renderGrades();renderProgrammes();renderCompare();renderPlan();persist();}
  function route(){const id=location.hash.slice(1);const name=['explore','compare','plan','guide','evidence'].includes(id)?id:'explore';document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==name);document.querySelectorAll('nav a').forEach(el=>{if(el.hash==='#'+name)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});if(name==='compare')renderCompare();if(name==='plan')renderPlan();}
  document.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.open)openDetail(b.dataset.open);
    if(b.dataset.compare){const c=b.dataset.compare;if(state.compare.includes(c))state.compare=state.compare.filter(x=>x!==c);else if(state.compare.length<4)state.compare.push(c);else return toast('最多同時比較四項，請先移除一項。');refresh();if($('#detail').open)openDetail(c);}
    if(b.dataset.save){const c=b.dataset.save;if(state.plan.includes(c)){state.plan=state.plan.filter(x=>x!==c);toast('已移出志願；原有課程筆記仍保留。');}else{if(c==='JS6224')return toast('2027 請加入 JS6999；JS6224 保留作歷史資料。');if(model.eligibility(c,state.grades,state.csd).status==='blocked')toast('已加入研究草稿，請先處理標示的資格限制。');else toast('已加入我的志願，可到志願頁調整次序。');state.plan.push(c);}refresh();if($('#detail').open)openDetail(c);}
    if(b.dataset.move){const i=state.plan.indexOf(b.dataset.move),j=i+Number(b.dataset.direction);if(i>=0&&j>=0&&j<state.plan.length){[state.plan[i],state.plan[j]]=[state.plan[j],state.plan[i]];renderPlan();persist();const moved=document.querySelector(`[data-move="${b.dataset.move}"][data-direction="${b.dataset.direction}"]`);moved?.focus();}}
  });
  document.addEventListener('change',event=>{if(event.target.dataset.grade){state.grades[event.target.dataset.grade]=event.target.value;refresh();}if(event.target.id==='csd'){state.csd=event.target.value;refresh();}});
  document.addEventListener('input',event=>{if(event.target.dataset.note){state.notes[event.target.dataset.note]=event.target.value;persist();}if(event.target.id==='global-notes'){state.globalNotes=event.target.value;persist();}});
  $('#search').addEventListener('input',renderProgrammes);$('#field').addEventListener('change',renderProgrammes);$('#status').addEventListener('change',renderProgrammes);
  $('#reset-grades').addEventListener('click',()=>{state.grades={...model.defaults};state.csd='attained';refresh();});
  $('#close-detail').addEventListener('click',()=>$('#detail').close());$('#detail').addEventListener('click',e=>{if(e.target===$('#detail')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  document.querySelectorAll('#export, #export-plan').forEach(button=>button.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='hku-2027-my-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
  $('#import').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2_000_000)throw Error('檔案過大');const imported=JSON.parse(await f.text());if(![1,2].includes(imported.version))throw Error('不是受支援的筆記版本');state=model.cleanState(imported,codes);refresh();toast('已匯入筆記並取代目前草稿。');}catch(err){toast('未匯入：'+err.message);}e.target.value='';});
  $('#guide-content').innerHTML=data.guideHtml;$('#evidence-content').innerHTML=data.evidenceHtml;
  window.addEventListener('hashchange',()=>{route();window.scrollTo(0,0);});refresh();route();
})();
