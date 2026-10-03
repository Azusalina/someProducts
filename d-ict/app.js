'use strict';
(() => {
  const lessons = window.ICT_LESSONS;
  const challenges = window.ICT_CHALLENGES;
  const esc = window.ICT_ESC;
  const table = window.ICT_TABLE;
  const main = document.getElementById('main');
  const storageKey = 'ict-data-logic-v1';
  let saved = {completed:[], quizzes:{}, solved:[], drafts:{}, theme:'light'};
  let storageAvailable = true;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (parsed && typeof parsed === 'object') {
      saved.completed = Array.isArray(parsed.completed) ? parsed.completed.filter(x=>lessons.some(l=>l.id===x)) : [];
      saved.solved = Array.isArray(parsed.solved) ? parsed.solved.filter(x=>challenges.some(c=>c.id===x)) : [];
      saved.quizzes = parsed.quizzes && typeof parsed.quizzes === 'object' ? parsed.quizzes : {};
      saved.drafts = parsed.drafts && typeof parsed.drafts === 'object' ? parsed.drafts : {};
      saved.theme = parsed.theme === 'dark' ? 'dark' : 'light';
    }
  } catch { storageAvailable = false; }
  let current = 'start';
  let challengeId = challenges[0].id;
  let editorDraft = 'SELECT * FROM Student;';
  let results = [];
  let engineVersion = '';
  let worker = null;
  let ready = false;
  let requestCounter = 0;
  const pending = new Map();

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(saved)); }
    catch { storageAvailable = false; }
    document.getElementById('storage-note').textContent = storageAvailable ? 'Saved on this browser.' : 'Progress is kept for this session only.';
  }
  function updateProgress() {
    document.getElementById('progress').value = saved.completed.length;
    document.getElementById('progress-label').textContent = `${saved.completed.length} / ${lessons.length}`;
    renderNavigation();
  }
  function renderNavigation() {
    const query = document.getElementById('search').value.trim().toLowerCase();
    const entries = [
      {id:'start',title:'The learning path',group:'START HERE',num:'○'},
      ...lessons.map((l,i)=>({...l,num:String(i+1).padStart(2,'0')})),
      {id:'lab',title:'SQL playground',group:'Practice',num:'↗'},
      {id:'revision',title:'Revision & exam technique',group:'Practice',num:'✓'},
      {id:'sources',title:'Syllabus & references',group:'Reference',num:'↗'}
    ];
    let last = null;
    const html = entries.filter(l => !query || [l.title,l.group,l.scope||'',...(l.tags||[]),l.body||''].join(' ').replace(/<[^>]*>/g,' ').toLowerCase().includes(query)).map(l=>{
      const label = last !== l.group ? `<div class="nav-group">${esc(l.group)}</div>` : '';
      last = l.group;
      return `${label}<a class="nav-link${current===l.id?' active':''}" href="#${l.id}"${current===l.id?' aria-current="page"':''}><span class="nav-num">${l.num}</span><span>${esc(l.title)}</span>${saved.completed.includes(l.id)?'<span class="nav-tick" aria-label="Understood">✓</span>':''}</a>`;
    }).join('');
    document.getElementById('navigation').innerHTML = html || '<p class="empty-search">No matching topic. Try a shorter term.</p>';
  }
  function titleBlock(l,i) {
    return `<div class="eyebrow">${String(i+1).padStart(2,'0')} / ${esc(l.group)} <span class="scope-tag"> · ${esc(l.scope)}</span></div><h1>${l.heading}</h1><p class="intro">${l.intro}</p><div class="pills">${l.tags.map(t=>`<span class="pill">${esc(t)}</span>`).join('')}</div>`;
  }
  function quizHtml(l,print=false) {
    return `<section class="quiz" aria-label="Self-check"><div class="section-label">RETRIEVE, DON’T JUST REREAD</div><h2>Check your understanding.</h2><p class="small">Two questions. Choose an answer, then check the reasoning.</p>${l.quiz.map((q,i)=>`<fieldset><legend>${i+1}. ${esc(q.text)}</legend>${q.options.map((o,j)=>`<label><input type="radio" name="${l.id}-q${i}" value="${j}"><span>${esc(o)}</span></label>`).join('')}<div id="feedback-${i}" aria-live="polite"></div>${print?`<p class="print-answer">Answer: ${esc(q.options[q.answer])}. ${esc(q.explain)}</p>`:''}</fieldset>`).join('')}<button class="primary" id="check-quiz">Check answers</button><span class="quiz-score" id="quiz-score" role="status">${saved.quizzes[l.id] ? `Last score: ${saved.quizzes[l.id]} / 2` : ''}</span></section>`;
  }
  function startHtml() {
    return `<div class="eyebrow">HKDSE ICT 2026 / DATABASES</div><h1>Make data<br><em>make sense.</em></h1><p class="intro">A complete learning path through database foundations, SQL and relational design. Follow the ideas, run the examples, and explain what happens.</p><div class="button-row"><a class="link-button" href="#foundations">Start learning →</a><a class="link-button secondary" href="#lab">Go to the SQL lab ↗</a></div>
    <div class="stat-row"><div class="stat">16<small>LESSON CHAPTERS</small></div><div class="stat">32<small>SELF-CHECK QUESTIONS</small></div><div class="stat">12<small>SQL CHALLENGES</small></div></div>
    <div class="hero-panel"><div class="section-label">ONE DATABASE. CONNECTED IDEAS.</div><h2>Who studies what?</h2><pre class="hero-query">Student <span aria-hidden="true">──</span> Enrollment <span aria-hidden="true">──</span> Course</pre><p>Six students. Four courses. Nine enrolments. A small school database connects every query example, including missing marks and unmatched rows.</p></div>
    <div class="hero-grid"><div><div class="section-label">YOUR LEARNING ROUTE</div><h2>Build the model.<br>Then ask better questions.</h2><p class="small">New to SQL? Start with foundations. Revising the elective? Move through design, queries and management. Use the lab whenever an example raises a question.</p><div class="note"><b>How to use this page.</b> Read an explanation, predict its result, run the SQL, then try the self-check. Mark a chapter as understood when you can explain the idea without looking.</div></div><div class="roadmap"><a class="path-card" href="#foundations"><span class="path-number">01</span><span><strong>Understand the data</strong><small>Records, keys, domains and integrity.</small></span></a><a class="path-card" href="#er"><span class="path-number">02</span><span><strong>Design the relationships</strong><small>ER diagrams, normalisation and trade-offs.</small></span></a><a class="path-card" href="#select"><span class="path-number">03</span><span><strong>Speak SQL</strong><small>Filter, group, join and maintain tables.</small></span></a><a class="path-card" href="#transactions"><span class="path-number">04</span><span><strong>Manage the database</strong><small>Rollback, permissions and privacy.</small></span></a></div></div>
    <h2>What is covered?</h2><p>This companion covers the database-related compulsory material and all three strands of the Databases elective. The reference page maps the official learning outcomes to the lessons. Explanations, data and exercises are original; the practice questions are not past-paper questions.</p>
    ${table(['Official area','Recommended teaching time','Chapters'],[['Relational database concepts','6 hours','Keys, integrity, database creation, rollback'],['SQL','18 hours','Retrieval, expressions, functions, joins, subqueries, structure and data changes, views'],['Database design methodology','14 hours','ER modelling, normalisation, denormalisation, access rights']])}
    <p class="caption">These are the elective’s curriculum time allocations, not estimated reading times. Source: <a href="https://www.edb.gov.hk/attachment/en/curriculum-development/kla/technology-edu/curriculum-doc/ICT_C%26A_Guide_e_final.pdf" target="_blank" rel="noopener">EDB Curriculum and Assessment Guide (2021), printed pp. 8, 37–41</a>.</p>
    <div class="two-col"><div class="card"><div class="index">OFFLINE BY DESIGN</div><h3>Learn anywhere</h3><p>All scripts and the SQL engine are bundled locally. Open index.html with its accompanying files. Notes, examples and the lab work without a network connection.</p></div><div class="card"><div class="index">A CLEAR SQL DIALECT</div><h3>Real results, stated limits</h3><p>The lab uses SQLite, not a pretend query parser. Dialect-specific commands are identified in the lessons. Your syllabus or question’s stated syntax takes precedence.</p></div></div>`;
  }
  function sourcesHtml() {
    const guide = 'https://www.edb.gov.hk/attachment/en/curriculum-development/kla/technology-edu/curriculum-doc/ICT_C%26A_Guide_e_final.pdf';
    const rows = [
      ['Data hierarchy; sequential/direct access; data control','13','foundations','Database foundations'],
      ['DBMS use; forms; single-table queries; reports','15','views','Foundations, SELECT, views & reports'],
      ['Entity, relationship, attribute, domain, index and keys','38','keys','Relational model & keys'],
      ['Entity, referential and domain integrity','38','integrity','Data types & integrity'],
      ['Create related tables','38','structure','Creating & changing structure'],
      ['Purpose of rollback','38','transactions','Transactions & rollback'],
      ['Modify table structures','39','structure','Creating & changing structure'],
      ['Add, delete and modify records','39','changes','INSERT, UPDATE & DELETE'],
      ['Filtering, sorting and views','39','select','SELECT; conditions; views'],
      ['Arithmetic, comparison, logical, IN, BETWEEN and LIKE operators','39','conditions','Conditions; expressions & functions'],
      ['Simple aggregate and string functions','39','functions','Built-in functions; GROUP BY'],
      ['Equi-join, natural join, outer join; up to three tables','39','joins','Joining up to three tables'],
      ['Subqueries with one sub-level','39','subqueries','One-level subqueries'],
      ['Binary ER diagrams; relationship types; resolve M:N','39–41','er','ER diagrams & relationships'],
      ['Reduce redundancy; normalise to 3NF','40','normalisation','Normalisation'],
      ['Needs and procedures of denormalisation','40','normalisation','Denormalisation'],
      ['ER diagrams to relational tables','40','er','ER → tables'],
      ['Access rights for data privacy','40','security','Access rights & privacy']
    ];
    return `<div class="eyebrow">THE SCOPE / CHECKED 3 OCTOBER 2026</div><h1>A syllabus you can <em>trace.</em></h1><p class="intro">This page is aligned to the 2026 examination through the applicable official curriculum guide. Use the sources below to verify the boundary of each topic.</p>
    <h2>Which curriculum applies?</h2><p>The EDB lists the 2021 ICT Curriculum and Assessment Guide as effective from Secondary 4 in 2022/23, leading to the 2025 HKDSE and onwards. It is the applicable guide for 2026. Older 2007/2015 documents have different elective arrangements; this companion uses the revised guide.</p>
    <p>In the <a href="https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/ict/2026hkdse-e-ict.pdf" target="_blank" rel="noopener">2026 HKEAA assessment framework</a>, Paper 1 covers the compulsory part (55%, 2 hours). Paper 2 covers two selected electives (25%, 1 hour 30 minutes in total); Databases is Paper 2A. SBA accounts for 20% for school candidates. This companion addresses databases, rather than the entire ICT subject.</p>
    <h2>Coverage checklist</h2><p class="small">Page references below are the guide’s <strong>printed page numbers</strong>, not PDF viewer numbers. The links take you to the relevant learning chapter.</p>
    ${table(['Learning outcome / topic','Guide page','Where to learn it'],rows.map(r=>[r[0],r[1],`<a href="#${r[2]}">${r[3]}</a>`]))}
    <h2>How examples extend the outline</h2><p>The guide defines broad skills rather than a closed list of SQL function names. GROUP BY and HAVING are taught as practical ways to apply aggregate functions. Constraints, index creation and transaction commands make the concepts executable. ACID, NOT EXISTS, IF EXISTS, CSV export and the derived-list FULL JOIN example are marked as supporting context or extensions; they are not presented as extra independently mandated topics. Advanced stored procedures, triggers, optimisation internals and deeply nested queries are outside this companion’s required scope.</p>
    <h2>Official sources</h2><ol class="source-list"><li><a href="https://www.edb.gov.hk/en/curriculum-development/kla/technology-edu/curriculum-doc/index.html" target="_blank" rel="noopener">EDB: Technology Education curriculum documents</a><small>Establishes the effective curriculum and examination years.</small></li><li><a href="${guide}" target="_blank" rel="noopener">ICT Curriculum and Assessment Guide (Secondary 4–6), 2021</a><small>Compulsory database-related foundations: printed pp. 13, 15. Databases elective: pp. 37–41. Elective time allocations: p. 8.</small></li><li><a href="https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/ict/2026hkdse-e-ict.pdf" target="_blank" rel="noopener">HKEAA: 2026 HKDSE ICT Assessment Framework</a><small>Examination arrangement and assessment weighting. This learning page is independently authored and not endorsed by EDB or HKEAA.</small></li></ol>
    <h2>SQL implementation references</h2><ul class="source-list"><li><a href="https://www.sqlite.org/lang_select.html" target="_blank" rel="noopener">SQLite SELECT documentation</a><small>Join, grouping and result semantics for this playground.</small></li><li><a href="https://www.sqlite.org/lang_altertable.html" target="_blank" rel="noopener">SQLite ALTER TABLE documentation</a><small>Supported schema changes and limits.</small></li><li><a href="https://www.sqlite.org/lang_corefunc.html" target="_blank" rel="noopener">SQLite scalar functions</a> · <a href="https://www.sqlite.org/lang_aggfunc.html" target="_blank" rel="noopener">aggregate functions</a> · <a href="https://www.sqlite.org/lang_transaction.html" target="_blank" rel="noopener">transactions</a></li><li><a href="https://sql.js.org/documentation/" target="_blank" rel="noopener">sql.js documentation</a><small>sql.js 1.14.2, locally bundled asm.js build; MIT licence in vendor/sql.js-LICENSE. SQLite is public domain.</small></li></ul>`;
  }
  function revisionHtml() {
    const glossary = [
      ['Database / DBMS','Related stored data / the software that manages it.'],['Entity / attribute','A kind of thing / a property of it.'],['Domain','The permitted values for an attribute.'],['Candidate key','A minimal unique identifier.'],['Primary key','The chosen candidate key; unique and non-NULL.'],['Foreign key','A reference to a parent key; repeated child values are possible.'],['Composite key','A key with two or more attributes.'],['Index','A lookup structure with storage and write-maintenance costs.'],['NULL','Unknown, missing or inapplicable; not zero or an empty string.'],['Integrity','Preserving validity of identities, references and values.'],['Functional dependency','X → Y: each X value determines one Y value.'],['Normalisation','Decompose using dependencies to reduce redundancy and anomalies.'],['Denormalisation','Deliberately introduce selected redundancy for a measured need.'],['View','A named query acting as a virtual table.'],['Transaction','Related operations treated as a unit.'],['Rollback','Cancel uncommitted changes.'],['Authentication / authorisation','Establish identity / determine permissions.'],['Validation / verification','Check acceptability / compare entry with its source.']
    ];
    return `<div class="eyebrow">REVISION / PUT IT TOGETHER</div><h1>Explain the why.<br><em>Check the details.</em></h1><p class="intro">A correct SQL answer is more than familiar keywords. A correct design answer states the rules and shows where each fact belongs.</p>
    <h2>A six-step SQL answer routine</h2><ol class="checklist"><li><strong>Output:</strong> identify the exact columns, calculations and headings.</li><li><strong>Input:</strong> choose the tables and join paths; avoid unrelated pairs.</li><li><strong>Rows:</strong> translate the conditions; check boundaries and NULL.</li><li><strong>Groups:</strong> decide whether aggregation is per table or per group; distinguish WHERE and HAVING.</li><li><strong>Uniqueness and order:</strong> use DISTINCT only if needed; specify sort directions and tie-breakers.</li><li><strong>Trace:</strong> test a normal row, a boundary row, a missing value and an unmatched row.</li></ol>
    ${table(['Common mistake','Correction'],[['mark = NULL','mark IS NULL'],['Using WHERE AVG(mark) > 80','Use HAVING after grouping.'],['COUNT(*) for empty courses after LEFT JOIN','Count a non-NULL child key.'],['A right-table filter in WHERE after LEFT JOIN','Place it in ON if all left rows should remain.'],['UPDATE with half of a composite key','Identify the whole intended key.'],['SELECT with a non-grouped arbitrary field','Group every selected non-aggregate field in portable SQL.'],['NATURAL JOIN assumed to match only one key','Inspect all same-named columns.'],['NOT IN with nullable subquery values','Exclude NULLs or use an appropriate existence test.'],['Assuming an ordinary view is a backup','It reflects current underlying data.'],['Assuming ROLLBACK undoes a COMMIT','Correct in a new transaction or recover appropriately.']])}
    <h2>A design answer routine</h2><p>Write assumptions and business rules; identify entity types and candidate keys; label cardinality and participation; resolve M:N; list table schemas with PK/FK markings; state functional dependencies; explain each decomposition; then check integrity and access rights. For an anomaly question, give a concrete insert, update or deletion and explain the lost or inconsistent fact.</p>
    <div class="exercise"><div class="section-label">INTEGRATED DESIGN PRACTICE</div><p>A library has members and books. A member can borrow many books over time; a book can be borrowed by many members over time. Store the loan date, due date and return date. Design tables and explain why (member_id, book_id) alone may not be a suitable loan key.</p><details><summary>Reveal a model answer</summary><div><p>Member(member_id PK, name, …); Book(book_id PK, title, …); Loan(loan_id PK, member_id FK, book_id FK, loan_date, due_date, return_date). Each Loan requires one Member and one Book; parents can have zero loans. The same member can borrow the same book again, so the pair can repeat. A unique loan_id distinguishes each event; a justified composite key including a timestamp is another possibility if its uniqueness is guaranteed. Return date can be NULL while a loan is open. Validate due_date ≥ loan_date and protect members’ personal data.</p></div></details></div>
    <h2>Quick glossary</h2><dl class="term-grid">${glossary.map(([term,definition])=>`<div><dt>${esc(term)}</dt><dd>${esc(definition)}</dd></div>`).join('')}</dl><div class="button-row"><a class="link-button" href="#lab">Attempt the 12 SQL challenges →</a><a class="link-button secondary" href="#sources">Check the syllabus coverage ↗</a></div>`;
  }

  function schemaHtml() {
    return `<aside class="card schema-card" aria-label="Database schema"><h3>The school database</h3><p>PK = primary key · FK = foreign key<br>6 students · 4 courses · 9 enrolments<br>These are the original seed counts.</p><div><div class="table-name">Student</div><ul><li><strong>student_id · PK</strong></li><li>name</li><li>class</li><li>house</li><li>email · nullable, unique</li><li>join_date</li></ul><button data-inspect="Student">View rows</button></div><div><div class="table-name">Course</div><ul><li><strong>course_id · PK</strong></li><li>title</li><li>fee</li></ul><button data-inspect="Course">View rows</button></div><div><div class="table-name">Enrollment</div><ul><li><strong>student_id · PK / FK</strong></li><li><strong>course_id · PK / FK</strong></li><li>mark · nullable</li><li>PK is the pair of IDs.</li></ul><button data-inspect="Enrollment">View rows</button></div></aside>`;
  }
  function labHtml() {
    return `<div class="lab-header"><div class="eyebrow">PRACTICE / A REAL SQL ENGINE</div><div class="engine-status" id="engine-status">${ready?`SQLite ${esc(engineVersion)} · offline`:'Starting SQL engine…'}</div></div><h1>Ask it.<br><em>See what happens.</em></h1><p class="intro">Write SQL against the school database. Predict the result, then run it. Changes stay in this playground until Reset or a page reload.</p>
    <div class="lab-layout"><div><div class="editor"><label for="sql-editor">QUERY EDITOR · CTRL / CMD + ENTER TO RUN</label><textarea id="sql-editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="lab-help">${esc(editorDraft)}</textarea></div><div class="lab-actions"><button class="primary" id="run-sql" ${ready?'':'disabled'}>Run SQL →</button><button id="reset-db" ${ready?'':'disabled'}>Reset database</button><button id="export-csv" disabled>Export last result ↓</button></div><p id="lab-help" class="small">SQLite dialect. Separate statements with semicolons. Statements run in order; an error can leave earlier changes in place. Reset restores all original tables and rows. Results are limited to 200 displayed rows per statement.</p><div class="result-status" id="result-status" role="status">Ready when you are.</div><div class="results" id="results" aria-live="polite"></div></div>${schemaHtml()}</div>
    <section class="challenge-box" aria-label="SQL challenges"><div class="section-label">12 CHALLENGES / FRESH DATA EVERY TIME</div><label for="challenge-select" class="small">Choose a challenge · <span id="challenge-progress">${saved.solved.length} / 12 solved</span></label><select class="challenge-select" id="challenge-select">${challenges.map(c=>`<option value="${c.id}"${c.id===challengeId?' selected':''}>${esc(c.title)}${saved.solved.includes(c.id)?' ✓':''}</option>`).join('')}</select><div id="challenge-detail"></div><p class="small">Challenge checks use a separate fresh database, so playground edits cannot affect them. The checker compares output values and column positions on this dataset; aliases do not matter. It is a sample-result check, not proof of correctness for every possible dataset. Submit one SELECT statement.</p></section>
    <details><summary>SQL dialect notes</summary><div><p>The lab supports INNER, NATURAL, LEFT, RIGHT and FULL OUTER JOIN, one-level subqueries, GROUP BY, HAVING, views and transactions. String examples use UPPER, LOWER, LENGTH, SUBSTR, TRIM, COALESCE and ||. Some DBMSs use different function names.</p><p>SQLite does not implement SQL user accounts, GRANT/REVOKE or MySQL’s ALTER … MODIFY. It does not enforce VARCHAR lengths or DECIMAL precision in the same way as many server DBMSs. Dates in the sample are ISO text. Foreign-key checks are enabled. Use the stated dialect in your exam question.</p></div></details>`;
  }
  function updateChallenge() {
    const c = challenges.find(x=>x.id===challengeId) || challenges[0];
    document.getElementById('challenge-detail').innerHTML = `<h3>${esc(c.title)}</h3><p>${esc(c.task)}</p><div class="lab-actions"><button id="check-challenge" class="primary" ${ready?'':'disabled'}>Check editor answer</button><button id="blank-answer">Start a blank answer</button></div><p class="challenge-feedback" id="challenge-feedback" role="status"></p><details><summary>Need a hint?</summary><div>${esc(c.hint)}</div></details><details><summary>Reveal a worked answer</summary><div class="code-block"><pre><code>${esc(c.answer)}</code></pre><div class="code-head"><span>MODEL ANSWER</span><button data-answer="${esc(c.answer)}">Load in editor</button></div></div></details>`;
  }
  function updateEngineUi() {
    const status = document.getElementById('engine-status');
    if(status) status.textContent = ready ? `SQLite ${engineVersion} · offline` : 'Starting SQL engine…';
    ['run-sql','reset-db','check-challenge'].forEach(id=>{ const el=document.getElementById(id); if(el) el.disabled=!ready; });
  }
  function renderResults(output) {
    results = output;
    const target = document.getElementById('results');
    if (!target) return;
    target.innerHTML = output.map((r,i)=>`<div class="section-label">RESULT ${i+1}${r.truncated?' · FIRST 200 ROWS':''}</div>${table(r.columns.map(esc),r.values.map(row=>row.map(v=>v===null?'<span class="null">NULL</span>':esc(v))))}${r.values.length===0?'<p class="small">No matching rows.</p>':''}`).join('');
    document.getElementById('export-csv').disabled = !output.length;
  }

  /* The engine runs in a Blob worker. Embedding its function avoids fetching scripts from
     a worker, so direct file:// use remains offline and works in Chromium/Firefox. */
  function sqlWorker() {
    let SQL, db;
    function fresh(seed) {
      const d = new SQL.Database();
      d.run(seed);
      return d;
    }
    function run(d, query, singleSelect=false) {
      const output = [];
      let statements=0;
      for(const stmt of d.iterateStatements(query)) {
        statements++;
        if(singleSelect && (statements>1 || !/^\s*SELECT\b/i.test(stmt.getSQL()))) throw new Error('Submit one SELECT statement for a challenge (without leading comments).');
        const columns = stmt.getColumnNames();
        if(columns.length) {
          const values=[];
          let truncated=false;
          while(stmt.step()) {
            if(values.length===200) { truncated=true; break; }
            values.push(stmt.get());
          }
          output.push({columns,values,truncated});
        } else { stmt.step(); }
      }
      if(!statements) throw new Error('Write a SQL statement first.');
      return output;
    }
    self.onmessage = async ({data:m}) => {
      try {
        if(m.type==='init') {
          SQL = await initSqlJs();
          db = fresh(m.seed);
          self.postMessage({id:m.id,ok:true,version:db.exec('SELECT sqlite_version()')[0].values[0][0]});
        } else if(m.type==='reset') {
          db.close(); db=fresh(m.seed);
          self.postMessage({id:m.id,ok:true,output:[]});
        } else if(m.type==='run') {
          self.postMessage({id:m.id,ok:true,output:run(db,m.query)});
        } else if(m.type==='challenge') {
          const d = fresh(m.seed);
          try {
            const actual=run(d,m.query,true);
            const expected=run(d,m.answer,true);
            self.postMessage({id:m.id,ok:true,actual,expected});
          } finally {d.close();}
        }
      } catch(e) {self.postMessage({id:m.id,ok:false,error:e.message});}
    };
  }
  function startEngine() {
    ready = false;
    updateEngineUi();
    if(worker) worker.terminate();
    for(const [id,p] of pending) {clearTimeout(p.timer);p.reject(new Error('The SQL engine restarted. Its temporary data were reset.'));pending.delete(id);}
    if(typeof initSqlJs !== 'function') {
      engineFailed('SQL engine file missing. Keep vendor/sql-asm.js beside this page.');
      return;
    }
    const source = `var initSqlJsPromise; var initSqlJs = ${initSqlJs.toString()}; (${sqlWorker.toString()})();`;
    const url = URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    try {worker = new Worker(url);} catch(e) {URL.revokeObjectURL(url);engineFailed(e.message);return;}
    URL.revokeObjectURL(url);
    worker.onmessage = ({data:r}) => {
      const p=pending.get(r.id);
      if(!p) return;
      clearTimeout(p.timer);pending.delete(r.id);
      r.ok ? p.resolve(r) : p.reject(new Error(r.error));
    };
    worker.onerror = e => {
      engineFailed(e.message || 'Unable to start the SQL engine.');
      for(const [id,p] of pending) {clearTimeout(p.timer);p.reject(new Error('SQL engine error.'));pending.delete(id);}
    };
    request('init',{seed:window.ICT_SEED},20000).then(r=>{
      ready=true;engineVersion=r.version;updateEngineUi();
    }).catch(e=>engineFailed(e.message));
  }
  function engineFailed(message) {
    ready=false;
    const status=document.getElementById('engine-status');
    if(status)status.textContent='Engine unavailable';
    setStatus(message,true); updateEngineUi();
    if(status)status.textContent='Engine unavailable';
  }
  function request(type,body={},timeout=5000) {
    return new Promise((resolve,reject)=>{
      const id=++requestCounter;
      const timer=setTimeout(()=>{
        pending.delete(id);
        reject(new Error('Query time limit reached. The SQL engine and practice data were reset.'));
        startEngine();
      },timeout);
      pending.set(id,{resolve,reject,timer});
      worker.postMessage({id,type,...body});
    });
  }
  function setStatus(text,error=false) {
    const target=document.getElementById('result-status');
    if(target){target.textContent=text;target.classList.toggle('error',error);}
  }
  async function runSql() {
    if(!ready)return;
    const button=document.getElementById('run-sql');
    editorDraft=document.getElementById('sql-editor').value;
    if(!editorDraft.trim()){setStatus('Write a SQL statement first.',true);return;}
    button.disabled=true;
    setStatus('Running…');
    const start=performance.now();
    try {
      const r=await request('run',{query:editorDraft});
      renderResults(r.output);
      const rows=r.output.reduce((a,b)=>a+b.values.length,0);
      setStatus(r.output.length?`${r.output.length} result set${r.output.length===1?'':'s'} · ${rows} row${rows===1?'':'s'} shown · ${Math.round(performance.now()-start)} ms`:'Statement(s) completed. No result set.');
    } catch(e) {renderResults([]);setStatus(`${e.message} Earlier statements may already have changed the lab. Use ROLLBACK for an open transaction or Reset to restore the original data.`,true);}
    finally {if(document.getElementById('run-sql')===button)button.disabled=!ready;}
  }
  function equivalent(actual,expected,ordered) {
    if(actual.length!==1 || expected.length!==1)return false;
    const a=actual[0],b=expected[0];
    if(a.truncated || a.columns.length!==b.columns.length || a.values.length!==b.values.length)return false;
    // Numeric comparison permits harmless floating-point differences; NULL and text stay exact.
    const equalRow=(x,y)=>x.length===y.length&&x.every((v,i)=>typeof v==='number'&&typeof y[i]==='number'?Math.abs(v-y[i])<1e-8:v===y[i]);
    if(ordered)return a.values.every((r,i)=>equalRow(r,b.values[i]));
    const unmatched=b.values.slice();
    for(const row of a.values){const index=unmatched.findIndex(other=>equalRow(row,other));if(index<0)return false;unmatched.splice(index,1);}
    return true;
  }
  async function checkChallenge() {
    if(!ready)return;
    const c=challenges.find(x=>x.id===challengeId);
    const target=document.getElementById('challenge-feedback');
    const button=document.getElementById('check-challenge');
    const query=document.getElementById('sql-editor').value;
    button.disabled=true;target.className='challenge-feedback';target.textContent='Checking against fresh data…';
    try {
      const r=await request('challenge',{query,answer:c.answer,seed:window.ICT_SEED});
      const correct=equivalent(r.actual,r.expected,c.ordered);
      target.className=`challenge-feedback ${correct?'pass':'fail'}`;
      target.textContent=correct?'✓ Correct result for this dataset. Now explain why your query works.':`Not quite. Expected ${r.expected[0].columns.length} columns and ${r.expected[0].values.length} rows${c.ordered?', in the requested order':''}. Check selected columns, NULL handling and the hint.`;
      renderResults(r.actual);
      setStatus('Challenge result · separate fresh database. Playground data unchanged.');
      if(correct&&!saved.solved.includes(c.id)){
        saved.solved.push(c.id);persist();
        document.getElementById('challenge-progress').textContent=`${saved.solved.length} / 12 solved`;
        const option=document.querySelector(`#challenge-select option[value="${c.id}"]`);
        if(option)option.textContent=`${c.title} ✓`;
      }
    }catch(e){target.className='challenge-feedback fail';target.textContent=e.message;}
    finally {if(document.getElementById('check-challenge')===button)button.disabled=!ready;}
  }
  async function resetDb() {
    if(!ready)return;
    try{await request('reset',{seed:window.ICT_SEED});renderResults([]);setStatus('Database reset. Original schema, 6 students, 4 courses and 9 enrolments restored.');}
    catch(e){setStatus(e.message,true);}
  }
  function exportCsv() {
    const result=results.at(-1);if(!result)return;
    const cell=v=>v===null?'':`"${String(v).replace(/"/g,'""')}"`;
    const csv=[result.columns,...result.values].map(row=>row.map(cell).join(',')).join('\r\n');
    const a=document.createElement('a');const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
    a.href=url;a.download='ict-query-result.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setStatus(`Exported the last displayed result${result.truncated?' (first 200 rows only)':''}. NULL values are exported as empty cells.`);
  }
  function setEditor(query) {
    editorDraft=query;
    const editor=document.getElementById('sql-editor');
    if(editor){editor.value=query;editor.focus();}
  }
  function bindLab() {
    updateChallenge();
    document.getElementById('run-sql').addEventListener('click',runSql);
    document.getElementById('reset-db').addEventListener('click',resetDb);
    document.getElementById('export-csv').addEventListener('click',exportCsv);
    document.getElementById('sql-editor').addEventListener('input',e=>{
      editorDraft=e.target.value;
      saved.drafts[challengeId]=editorDraft;
      persist();
    });
    document.getElementById('sql-editor').addEventListener('keydown',e=>{
      if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();runSql();}
      if(e.key==='Tab'){e.preventDefault();const el=e.target;const start=el.selectionStart;el.setRangeText('  ',start,el.selectionEnd,'end');editorDraft=el.value;}
    });
    document.getElementById('challenge-select').addEventListener('change',e=>{
      saved.drafts[challengeId]=document.getElementById('sql-editor').value;
      challengeId=e.target.value;setEditor(saved.drafts[challengeId]||'SELECT\nFROM ;');
      updateChallenge();persist();
    });
    main.addEventListener('click',labClick);
  }
  function labClick(e) {
    const target=e.target.closest('button');if(!target)return;
    if(target.dataset.inspect){setEditor(`SELECT * FROM ${target.dataset.inspect};`);runSql();}
    if(target.id==='check-challenge')checkChallenge();
    if(target.id==='blank-answer'){setEditor('SELECT\nFROM ;');setStatus('Write your challenge answer in the editor, then use Check editor answer.');}
    if(target.dataset.answer)setEditor(target.dataset.answer);
  }
  function checkQuiz(l) {
    let score=0;
    l.quiz.forEach((q,i)=>{
      const selected=main.querySelector(`input[name="${l.id}-q${i}"]:checked`);
      const target=document.getElementById(`feedback-${i}`);
      if(!selected){target.className='quiz-feedback';target.textContent='Choose an answer before checking this question.';return;}
      const correct=Number(selected.value)===q.answer;
      if(correct)score++;
      target.className=`quiz-feedback${correct?' correct':''}`;
      target.textContent=`${correct?'✓ Correct.':'Not quite.'} ${q.explain}`;
    });
    document.getElementById('quiz-score').textContent=`${score} / 2 correct`;
    saved.quizzes[l.id]=score;persist();
  }
  function setTrace(stage=0) {
    const data=[['1','Ada','5A','Red'],['2','Ben','5A','Blue'],['3','Chloe','5B','Red'],['4','Daniel','5B','Green'],['5','Eva','5A','Blue'],['6','Felix','5B','Green']];
    const stages=[
      ['FROM Student: start with all six student rows.',['student_id','name','class','house'],data],
      ["WHERE class = '5A': retain three matching rows.",['student_id','name','class','house'],data.filter(r=>r[2]==='5A')],
      ['SELECT student_id, name: project two columns.',['student_id','name'],data.filter(r=>r[2]==='5A').map(r=>r.slice(0,2))],
      ['ORDER BY name ASC: Ada, Ben, Eva.',['student_id','name'],[['1','Ada'],['2','Ben'],['5','Eva']]]
    ];
    const s=stages[stage];
    document.getElementById('trace-output').innerHTML=`<p class="small">${esc(s[0])}</p>${table(s[1],s[2])}`;
    main.querySelectorAll('[data-trace]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.trace)===stage)));
  }
  function setNormal(stage=0) {
    const stages=[
      '<h3>1NF: atomic values, but duplicated facts</h3><p>Result(student_id, name, course_id, title, fee, mark). PK = (student_id, course_id). The student’s name depends on student_id alone; title and fee depend on course_id alone. These partial dependencies violate 2NF.</p>',
      '<h3>2NF: each non-key fact depends on the whole key</h3><p>Student(student_id PK, name, …)<br>Course(course_id PK, title, fee)<br>Enrollment(student_id PK/FK, course_id PK/FK, mark).</p><p>Assuming no additional transitive dependencies, these tables can also satisfy 3NF. Normalisation does not require creating a different table at every stage.</p>',
      '<h3>3NF: remove a non-key dependency chain when it exists</h3><p>If Student also stored room, and class → room, then student_id → class → room. Use Student(student_id PK, name, class FK) and ClassRoom(class PK, room). This is a separate added business rule; it is not present in the seed database.</p>'
    ];
    document.getElementById('normal-output').innerHTML=stages[stage];
    main.querySelectorAll('[data-normal]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.normal)===stage)));
  }

  function render(focus=false) {
    if(current==='lab')editorDraft=document.getElementById('sql-editor')?.value||editorDraft;
    main.removeEventListener('click',labClick);
    const id=location.hash.slice(1)||'start';
    current = ['start','lab','revision','sources',...lessons.map(l=>l.id)].includes(id)?id:'start';
    const index=lessons.findIndex(l=>l.id===current);
    const lesson=lessons[index];
    if(lesson){
      main.innerHTML=titleBlock(lesson,index)+lesson.body+quizHtml(lesson);
      document.getElementById('breadcrumb').textContent=`${String(index+1).padStart(2,'0')} / ${lesson.title.toUpperCase()}`;
      document.getElementById('check-quiz').addEventListener('click',()=>checkQuiz(lesson));
      if(current==='select')setTrace();
      if(current==='normalisation')setNormal();
    }else{
      const content={start:startHtml,lab:labHtml,revision:revisionHtml,sources:sourcesHtml};
      main.innerHTML=content[current]();
      document.getElementById('breadcrumb').textContent={start:'THE LEARNING PATH',lab:'SQL PLAYGROUND',revision:'REVISION & EXAM TECHNIQUE',sources:'SYLLABUS & REFERENCES'}[current];
      if(current==='lab'){bindLab();if(results.length)renderResults(results);}
    }
    document.title=`${lesson?lesson.title:({start:'Make data make sense',lab:'SQL playground',revision:'Revision',sources:'Syllabus & references'}[current])} — Data / Logic · HKDSE ICT 2026`;
    document.getElementById('lesson-footer').hidden=!lesson;
    document.getElementById('lesson-footer').style.display=lesson?'':'none';
    document.getElementById('completed').checked=saved.completed.includes(current);
    document.getElementById('previous').disabled=index<=0;
    document.getElementById('next').textContent=index===lessons.length-1?'Practice →':'Next →';
    renderNavigation();
    document.getElementById('sidebar').classList.remove('open');document.getElementById('menu').setAttribute('aria-expanded','false');
    if(focus){window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});}
  }
  function buildPrint() {
    document.getElementById('print-content').innerHTML=`<article><div class="print-heading"><div class="eyebrow">HKDSE ICT 2026</div><h1>Data / Logic<br>Database learning notes</h1><p>Database foundations, SQL and design. Original learning material with official source mapping.</p></div>${startHtml()}</article>${lessons.map((l,i)=>`<article>${titleBlock(l,i)}${l.body}${quizHtml(l,true)}</article>`).join('')}<article>${revisionHtml()}</article><article>${sourcesHtml()}</article>`;
    document.querySelectorAll('#print-content details').forEach(d=>{d.open=true;});
    // IDs only belong to the interactive view. Printed copies do not duplicate them.
    document.querySelectorAll('#print-content [id]').forEach(el=>el.removeAttribute('id'));
  }
  main.addEventListener('click',async e=>{
    const button=e.target.closest('[data-sql],[data-trace],[data-normal]');if(!button)return;
    if(button.dataset.sql){
      if(ready)await resetDb();
      editorDraft=button.dataset.sql;
      location.hash='lab';
    }
    if(button.dataset.trace!==undefined)setTrace(Number(button.dataset.trace));
    if(button.dataset.normal!==undefined)setNormal(Number(button.dataset.normal));
  });
  document.getElementById('search').addEventListener('input',renderNavigation);
  document.getElementById('completed').addEventListener('change',e=>{
    saved.completed=saved.completed.filter(x=>x!==current);if(e.target.checked)saved.completed.push(current);persist();updateProgress();
  });
  document.getElementById('previous').addEventListener('click',()=>{
    const i=lessons.findIndex(l=>l.id===current);if(i>0)location.hash=lessons[i-1].id;
  });
  document.getElementById('next').addEventListener('click',()=>{
    const i=lessons.findIndex(l=>l.id===current);location.hash=i<lessons.length-1?lessons[i+1].id:'lab';
  });
  function applyTheme(){document.body.classList.toggle('dark',saved.theme==='dark');const b=document.getElementById('theme');b.textContent=saved.theme==='dark'?'Light':'Dark';b.setAttribute('aria-label',`Switch to ${saved.theme==='dark'?'light':'dark'} theme`);}
  document.getElementById('theme').addEventListener('click',()=>{saved.theme=saved.theme==='dark'?'light':'dark';persist();applyTheme();});
  document.getElementById('menu').addEventListener('click',()=>{const open=document.getElementById('sidebar').classList.toggle('open');document.getElementById('menu').setAttribute('aria-expanded',String(open));});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.getElementById('sidebar').classList.remove('open');document.getElementById('menu').setAttribute('aria-expanded','false');}});
  document.getElementById('print').addEventListener('click',()=>{buildPrint();window.print();});
  window.addEventListener('beforeprint',buildPrint);
  window.addEventListener('hashchange',()=>render(true));
  applyTheme();persist();render();updateProgress();startEngine();
})();
