/* Original lessons; String.raw preserves LaTeX. */
window.BA_LESSONS = [
{
  id:"model",title:"成本函数",english:"Cost as a function",tag:"01 · MODEL",
  heading:"从一条直线，<em>理解成本。</em>",
  intro:"把业务量当作自变量，把总成本当作函数值。先确定单位与假设，再讨论斜率、截距及变化量。",
  pills:["线性模型","总量 ≠ 单位量","相关范围"],
  body:String.raw`
  <div class="hero-equation"><div class="section-label">THE CENTRAL MODEL</div>\[C(q)=vq+F\]<div class="equation-key"><span>\(q\) <b>业务量</b> / units</span><span>\(v\) <b>单位变动成本</b> / $ per unit</span><span>\(F\) <b>总固定成本</b> / $ per period</span></div><p class="caption">你的 \(f(x)=mx+c\)：\(x\leftrightarrow q,\ m\leftrightarrow v,\ c\leftrightarrow F\)。</p></div>
  <div class="three-col">
  <div class="card"><div class="index">01 / FIXED</div><h3>固定成本 Fixed cost</h3>\[C_F(q)=F\]<p>总额不随业务量改变。若 \(q&gt;0\)，单位固定成本为 \(F/q\)，并非固定。</p></div>
  <div class="card"><div class="index">02 / VARIABLE</div><h3>变动成本 Variable cost</h3>\[C_V(q)=vq\]<p>总额与业务量成正比。单位成本 \(v\) 保持不变，如每件原料 $30。</p></div>
  <div class="card"><div class="index">03 / MIXED</div><h3>混合成本 Mixed cost</h3>\[C_M(q)=vq+F\]<p>固定项与变动项并存。如月费 $500，加每分钟 $0.2。</p></div></div>
  <div class="note"><b>先限制定义域。</b> 模型只在 relevant range（相关范围）内成立：产能、工艺与成本条件不变。扩厂后 \(F\) 可能跳升；折扣后 \(v\) 可能改变。图中 \(q=0\) 是线性模型的截距，不自动代表停业后的真实成本。</div>
  <h2>总成本与平均成本，是两个函数</h2>
  <div class="derivation"><div class="step"><span class="step-num">①</span><div>\(C(q)=vq+F\)<p>总额 = 每件成本 × 件数 + 本期固定额。</p></div></div><div class="step"><span class="step-num">②</span><div>\(\displaystyle AC(q)=\frac{C(q)}q=v+\frac Fq,\quad q&gt;0\)<p>产量增加，固定成本被更多单位分摊；这不是总固定成本下降。</p></div></div><div class="step"><span class="step-num">③</span><div>\(C(q+1)-C(q)=v\)<p>多做一件的成本为 \(v\)，条件是没有触发新增固定成本。连续延伸时 \(C'(q)=v\)；微积分仅作理解辅助。</p></div></div></div>
  <div class="lab" data-lab="model"><div class="lab-head"><span class="lab-title">参数实验 / 改变斜率与截距</span><span class="live-tag">LIVE MODEL</span></div><div class="lab-grid"><div class="controls">
  <label>单位变动成本 \(v\)（$/件）<input name="v" type="number" min="0" max="10000" step="1" value="30"></label>
  <label>总固定成本 \(F\)（$/期）<input name="F" type="number" min="0" max="10000000" step="100" value="12000"></label>
  <label>业务量 \(q\)（件）<input name="q" type="number" min="0" max="2000" step="1" value="600"><input name="q-slider" aria-label="拖动业务量" type="range" min="0" max="2000" step="10" value="600"></label><p class="small">把产量加倍：总固定成本不变，单位固定成本减半。</p><button data-reset type="button">重置参数</button>
  </div><div class="lab-output" aria-live="polite"></div></div></div>
  <details><summary>两点确定一条直线：High–low 理解辅助</summary><div>选择最高与最低<strong>业务量</strong>对应的总成本，假设线性：\[
  v=\frac{C(q_H)-C(q_L)}{q_H-q_L},\qquad F=C(q_H)-vq_H
  \]例：200 件成本 $10,000；500 件成本 $16,000。于是 \(v=20,\ F=6{,}000\)。两点法受异常值影响；不能仅选最高、最低成本而忽略业务量。此处为模型扩展，不另称为官方独立必考项目。</div></details>
  <div class="note"><b>统一记号。</b> \(p\)：单位售价；\(k=p-v\)：单位贡献；\(\pi\)：利润。CVP 的 \(v\) 包含全部随销量变化的成本；存货估值的 \(v_m\) 仅指单位变动<strong>生产</strong>成本。</div>`
},
{
  id:"classification",title:"分类与成本流",english:"Classification & flow",tag:"02 · DEFINITIONS",
  heading:"三个分类轴，<em>独立判断。</em>",
  intro:"成本会计把资源消耗分配给产品或其他成本对象，为定价、控制与选择方案提供信息。分类依赖你问的维度。",
  pills:["可追溯性","成本行为","业务职能"],
  body:String.raw`
  <div class="hero-equation"><div class="section-label">A COST HAS MULTIPLE COORDINATES</div>\[\text{cost item}\longmapsto(\text{traceability},\ \text{behaviour},\ \text{function})\]<p class="caption">Direct 不推出 Variable；Indirect 也不推出 Fixed。</p></div>
  <div class="table-wrap"><table><thead><tr><th>分类轴</th><th>判断标准</th><th>例子 / 对象为某产品</th></tr></thead><tbody>
  <tr><td>Direct / Indirect<br>直接 / 间接</td><td>能否经济地、明确地追溯至该成本对象？<br>间接生产成本 = factory overhead。</td><td>产品用料 → direct<br>共用工厂租金 → indirect</td></tr>
  <tr><td>Fixed / Variable<br>固定 / 变动</td><td>相关范围内，总额是否随业务量变化？</td><td>月薪 → fixed<br>按件计酬 → variable</td></tr>
  <tr><td>Manufacturing / Non-manufacturing<br>生产 / 非生产</td><td>制造过程，还是销售、行政等职能？</td><td>厂房折旧 → manufacturing<br>办公室租金 → administrative</td></tr>
  </tbody></table></div>
  <div class="two-col"><div class="card"><div class="index">COUNTEREXAMPLE A</div><h3>直接且固定</h3><p>专门为产品 A 服务的设计师固定月薪：可追溯到 A，不随本月产量改变。</p></div><div class="card"><div class="index">COUNTEREXAMPLE B</div><h3>间接且变动</h3><p>各产品共用设备耗电：随使用量变化，却难以直接追溯到个别成品。</p></div></div>
  <h2>生产成本：先进入存货，再进入费用</h2>
  <div class="derivation">\[
  \text{prime cost}=\text{direct materials}+\text{direct labour}+\text{direct expenses}
  \]\[
  \text{production cost}=\text{prime cost}+\text{factory overhead}
  \]<p class="chip-line">间接材料、间接人工、厂房租金属于 factory overhead。销售及行政费用为 non-manufacturing costs，不计入成品存货。</p></div>
  <div class="table-wrap"><table><thead><tr><th>成本流 / Cost flow</th><th>守恒式</th></tr></thead><tbody>
  <tr><td>原料耗用</td><td>\(\text{materials used}=\text{opening RM}+\text{purchases}-\text{closing RM}\)<br>再区分直接材料与间接材料。</td></tr>
  <tr><td>完工转出</td><td>\(\text{COGM}=\text{opening WIP}+\text{production costs}-\text{closing WIP}\)</td></tr>
  <tr><td>成品售出</td><td>\(\text{COGS}=\text{opening FG}+\text{COGM}-\text{closing FG}\)<br>吸收法另加不足吸收或减超额吸收。</td></tr></tbody></table></div>
  <p class="chip-line">RM = 原料；WIP = 在制品；FG = 成品；COGM = cost of goods manufactured；COGS = cost of goods sold。</p>
  <h2>Product cost 与 Period cost</h2>
  <div class="two-col"><div class="card"><h3>产品成本 Product cost</h3><p>附着于存货。未售出 → 资产；售出 → COGS。包括哪些生产成本，取决于成本法。</p>\[\text{inventory}\xrightarrow{\text{sold}}\text{expense}\]</div><div class="card"><h3>期间成本 Period cost</h3><p>直接计入当期损益。如销售、行政费用；边际法下，固定生产间接费用也是期间成本。</p>\[\text{period cost}\longrightarrow\text{current expense}\]</div></div>
  <details><summary>快速判断：共用厂房租金属于哪类？</summary><div>间接、固定、生产成本。吸收法计入产品成本；边际法计入期间成本。分类条件要写明，不能只背一个标签。</div></details>`
},
{
  id:"cvp",title:"贡献与 CVP",english:"Contribution & break-even",tag:"03 · PROFIT",
  heading:"利润，是两条直线的<em>差。</em>",
  intro:"单一产品；售价、单位变动成本、总固定成本不变。以销量 q 建模；生产与销售相等，或采用边际成本的利润表达。",
  pills:["贡献 ≠ 利润","盈亏平衡","目标利润","安全边际"],
  body:String.raw`
  <div class="hero-equation"><div class="section-label">COST → CONTRIBUTION → PROFIT</div>\[\pi(q)=pq-(vq+F)=(p-v)q-F=kq-F\]<p class="caption">每卖一件，贡献 \(k\) 先弥补固定成本；弥补完毕后才成为利润。</p></div>
  <div class="derivation"><div class="step"><span class="step-num">①</span><div>\(K=R-VC=(p-v)q=kq\)<p>Total contribution（总贡献）扣除所有变动成本，包括变动销售费用；不同于 gross profit。</p></div></div><div class="step"><span class="step-num">②</span><div>\(\pi=0\Longrightarrow q_{\rm BE}=F/k,\quad k&gt;0\)<p>Break-even：固定成本恰被覆盖。商品不可分割时，不亏损最低整数销量为 \(\lceil F/k\rceil\)。</p></div></div><div class="step"><span class="step-num">③</span><div>\(\pi\ge T\Longrightarrow q\ge(F+T)/k\)<p>Target profit：固定成本与目标利润合并为需覆盖金额；整数销量向上取整。</p></div></div></div>
  <div class="two-col"><div class="card"><h3>用销售额而非件数</h3>\[\mathrm{CMR}=\frac{K}{R}=\frac{k}{p}\]\[R_{\rm BE}=\frac F{\mathrm{CMR}},\quad R_T=\frac{F+T}{\mathrm{CMR}}\]<p>CMR = contribution margin ratio。要求 \(p&gt;0,\ k&gt;0\)。理论销售额可连续，件数按题意取整。</p></div><div class="card"><h3>安全边际 Margin of safety</h3>\[\mathrm{MOS}_q=q_{\rm actual/budget}-q_{\rm BE}\]\[\mathrm{MOS}\%=\frac{q_{\rm actual/budget}-q_{\rm BE}}{q_{\rm actual/budget}}\times100\%\]<p>单产品、固定售价下，销售额法给出相同比率。负值表示低于盈亏平衡；销量为 0 时百分比无定义。</p></div></div>
  <div class="lab" data-lab="cvp"><div class="lab-head"><span class="lab-title">利润实验 / 寻找交点</span><span class="live-tag">LIVE MODEL</span></div><div class="lab-grid"><div class="controls">
  <label>单位售价 \(p\)（$/件）<input name="p" type="number" min="0" max="10000" step="1" value="80"></label>
  <label>全部单位变动成本 \(v\)（$/件）<input name="v" type="number" min="0" max="10000" step="1" value="50"></label>
  <label>总固定成本 \(F\)（$/期）<input name="F" type="number" min="0" max="10000000" step="100" value="12000"></label>
  <label>实际 / 预算销量 \(q\)（件）<input name="q" type="number" min="0" max="1000000" step="1" value="600"></label>
  <label>目标利润 \(T\)（$）<input name="T" type="number" min="0" max="10000000" step="100" value="9000"></label>
  <div class="actions"><button data-break-even type="button">移至不亏损销量</button><button data-reset type="button">重置</button></div>
  </div><div class="lab-output" aria-live="polite"></div></div></div>
  <h2>敏感性：分母才是关键</h2><div class="card">\[q_{\rm BE}=\frac{F}{p-v}\]<p>\(F\uparrow\Rightarrow q_{\rm BE}\uparrow\)；\(p\uparrow\Rightarrow q_{\rm BE}\downarrow\)；\(v\uparrow\Rightarrow q_{\rm BE}\uparrow\)。每次仅改变一个变量，且仍在相关范围。售价上调是否影响需求，需另作业务判断。</p></div>
  <div class="note"><b>退化情形。</b> \(k=0,F&gt;0\)：任何销量均无法弥补固定成本；\(k&lt;0\)：多卖一件反而降低利润。\(F=0\) 时 \(q=0\) 可使利润为 0，但 \(k&lt;0\) 时正销量仍亏损。不能机械地套 \(F/k\) 得出负的“盈亏平衡销量”。</div>
  <details><summary>完整算例：p = 80，v = 50，F = 12,000</summary><div>\(k=30\)，\(q_{\rm BE}=400\)，CMR = 37.5%，盈亏平衡销售额 $32,000。销量 600 → \(\pi=30(600)-12{,}000=6{,}000\)，MOS = 200 件，MOS% = 33.33%。目标利润 $9,000 → \(q_T=700\) 件。</div></details>
  <p class="chip-line">图表用于理解。官方补充说明不要求图形展示；答题应列公式、代入、金额或单位与结论。</p>`
},
{
  id:"costing",title:"两种成本法",english:"Marginal & absorption",tag:"04 · INVENTORY",
  heading:"差别在于，固定生产成本<em>何时成为费用。</em>",
  intro:"两法的核心差异是固定生产间接费用的归属。两者均把销售及行政费用作为期间费用。",
  pills:["存货估值","损益表","加权平均","不足 / 超额吸收"],
  body:String.raw`
  <div class="two-col"><div class="card"><div class="index">MARGINAL COSTING / MC</div><h3>边际成本法</h3>\[u_{\rm MC}=v_m\]<p>产品成本 = 变动生产成本。固定生产间接费用 \(F_m\) 全部当期扣除。</p></div><div class="card"><div class="index">ABSORPTION COSTING / AC</div><h3>吸收成本法</h3>\[u_{\rm AC}=v_m+h\]<p>产品成本 = 变动生产成本 + 分摊固定生产间接费用。\(h\) 为每件吸收额。</p></div></div>
  <div class="note"><b>本章记号。</b> \(P\) = 产量，\(S\) = 销量，\(v_m\) = 单位变动生产成本，\(v_s\) = 单位变动销售费用，\(F_n\) = 固定非生产费用。吸收率也可按机器小时等题目指定基准计算。</div>
  <h2>吸收率与实际费用：两个数不能混用</h2>
  <div class="derivation">\[h=\frac{\text{budgeted fixed factory overhead}}{\text{budgeted activity}},\quad H_{\rm absorbed}=h\times\text{actual activity}\]\[U=H_{\rm actual}-H_{\rm absorbed}\]<p class="chip-line">\(U&gt;0\) = under-absorption（不足吸收）→ 增加 COGS；\(U&lt;0\) = over-absorption（超额吸收）→ 减少 COGS。带符号表示：调整后 COGS = 调整前 COGS + \(U\)。</p></div>
  <h2>从存货守恒写出两张损益表</h2>
  <div class="table-wrap"><table><thead><tr><th>Marginal costing</th><th>Absorption costing</th></tr></thead><tbody>
  <tr><td>Sales \(pS\)</td><td>Sales \(pS\)</td></tr>
  <tr><td>− Variable production COGS<br>期初存货 + 本期变动生产成本 − 期末存货</td><td>− Production COGS<br>期初存货 + 本期吸收生产成本 − 期末存货</td></tr>
  <tr><td>− Variable selling / administrative expenses</td><td>COGS 调整：+ 不足吸收 / − 超额吸收</td></tr>
  <tr><td>= Contribution</td><td>= Gross profit</td></tr>
  <tr><td>− Fixed factory overhead<br>− Fixed non-manufacturing expenses</td><td>− 全部 selling / administrative expenses</td></tr>
  <tr class="total"><td>= Net profit</td><td>= Net profit</td></tr></tbody></table></div>
  <h2>有期初存货：加权平均</h2>
  <div class="card">\[\bar u=\frac{I_o u_o+P u_{\rm current}}{I_o+P},\quad I_c=I_o+P-S\]\[\text{closing inventory}=I_c\bar u,\quad \text{unadjusted COGS}=S\bar u\]<p>各成本法分别计算 \(\bar u\)。条件：同种同质成品，无其他存货流动，\(I_o+P&gt;0\)。期初 100 件 × $36，本期 300 件 × $40 → 平均 $39；售出 250 件 → COGS $9,750，期末 150 件 → $5,850。</p></div>
  <div class="lab" data-lab="costing"><div class="lab-head"><span class="lab-title">两张损益表 / 相同业务，不同确认时间</span><span class="live-tag">LIVE MODEL</span></div><div class="lab-grid"><div class="controls">
  <label>本期产量 \(P\)（件）<input name="P" type="number" min="0" max="100000" step="100" value="1000"></label>
  <label>本期销量 \(S\)（件）<input name="S" type="number" min="0" max="100000" step="100" value="800"></label>
  <label>单位售价 \(p\)（$/件）<input name="p" type="number" min="0" max="10000" step="1" value="80"></label>
  <label>变动生产成本 \(v_m\)（$/件）<input name="vm" type="number" min="0" max="10000" step="1" value="30"></label>
  <label>变动销售费用 \(v_s\)（$/件）<input name="vs" type="number" min="0" max="10000" step="1" value="5"></label>
  <label>实际固定生产费用 \(F_m\)（$）<input name="Fm" type="number" min="0" max="10000000" step="100" value="12000"></label>
  <label>每件固定生产吸收额 \(h\)（$/件）<input name="h" type="number" min="0" max="10000" step="1" value="12"></label>
  <label>固定非生产费用 \(F_n\)（$）<input name="Fn" type="number" min="0" max="10000000" step="100" value="4000"></label>
  <p class="small">期初成品及在制品为 0；全部完工，无损耗；按产量吸收。默认 h = 预算 $12,000 ÷ 1,000 件；修改实际产量时 h 不自动改变。</p><button data-reset type="button">重置参数</button>
  </div><div class="lab-output" aria-live="polite"></div></div></div>
  <details><summary>理解扩展：增产未售出，为什么也能改变吸收法利润？</summary><div>零期初存货、单位成本稳定、吸收差异已调整时：\[\pi_{\rm AC}-\pi_{\rm MC}=(P-S)h\]未售存货把部分固定生产成本留到以后扣除，不代表新增现金或销量。有期初存货或吸收率变化时，应比较期末与期初存货内含的固定生产费用，不能套此简式。<strong>官方不要求两法利润调节表；此推导仅作理解。</strong></div></details>
  <h2>适用性与局限</h2>
  <div class="two-col"><div class="card"><h3>边际成本法</h3><p>贡献清晰，便于 CVP 与短期决策；减少固定费用分摊对分析的干扰。但须可靠区分固定 / 变动成本；只看贡献不足以保证长期覆盖全部成本。</p></div><div class="card"><h3>吸收成本法</h3><p>全部生产成本归入产品，支持完整生产成本及存货分析；但分摊基准影响单位成本，存货变动改变本期利润。分摊成本不等于决策中的可避免成本。</p></div></div>`
},
{
  id:"decisions",title:"相关成本与决策",english:"Relevant costs & decisions",tag:"05 · DIFFERENCES",
  heading:"选方案，只比较<em>会改变的未来。</em>",
  intro:"设 A 为基准，B 为候选。未来收入与成本的共同项相消；已经发生的支出不随选择改变。",
  pills:["差量分析","机会成本","可避免成本","五类决策"],
  body:String.raw`
  <div class="hero-equation"><div class="section-label">THE DECISION RULE</div>\[\Delta\pi_{B-A}=(R_B-R_A)-(C_B-C_A)\]\[\Delta\pi&gt;0\Rightarrow B\text{ is financially preferable}\]<p class="caption">比较期间与范围须相同；无差别时，还需评价质量、风险等因素。</p></div>
  <div class="three-col"><div class="card"><div class="index">SUNK COST</div><h3>沉没成本</h3><p>已发生且不可收回。差量为 0，不参与选择。如设备原购价、已有账面值；设备现在的可售金额则不同。</p></div><div class="card"><div class="index">INCREMENTAL COST</div><h3>增量成本</h3><p>选择 B 而新增的成本。可以是变动成本，也可以是新租金、主管薪金等固定成本。</p></div><div class="card"><div class="index">OPPORTUNITY COST</div><h3>机会成本</h3><p>放弃的最佳可行替代收益。即使没有记账，也须考虑；不能与已列差量收入重复计算。</p></div></div>
  <div class="note"><b>相关性判据。</b> 未来发生 ∧ 因方案而异。固定成本仅可避免或新增部分相关；共同且不可避免项相消。已有材料不自动“免费”：若能转售或另用，须考虑失去的价值。</div>
  <h2>同一个框架，五类题目</h2>
  <div class="table-wrap"><table><thead><tr><th>候选 B / 基准 A</th><th>差量模型</th><th>检查条件</th></tr></thead><tbody>
  <tr><td>接受特殊订单 / 不接受</td><td>\(\Delta\pi=Q(p_s-v_{\rm relevant})-\Delta F-O\)</td><td>闲置产能？挤出正常销售？新增费用？\(O\) 为放弃的贡献。</td></tr>
  <tr><td>外购或租用 / 自制或自有</td><td>\(\Delta\pi=\text{avoided make cost}+\text{alternative contribution}-\text{buy cost}\)</td><td>仅比较可节省成本；释放资源有何收益？租用也比较同一期间总差量。</td></tr>
  <tr><td>更换设备 / 保留</td><td>\(\Delta\pi=\text{old disposal proceeds}+\text{operating savings}-\text{new outlay}\)</td><td>简式假设其他收入、期末残值无差别，不考虑税和折现；有差异须计入。旧账面值相消。</td></tr>
  <tr><td>进一步加工 / 立即出售</td><td>\(\Delta\pi=\text{incremental revenue}-\text{further processing cost}\)</td><td>共同已发生成本相消；额外固定费用或产能代价须计入。</td></tr>
  <tr><td>终止部门 / 保留</td><td>\(\Delta\pi=\text{avoidable fixed costs}-\text{lost contribution}\)</td><td>总部费用能否真的节省？关闭费用或连带收入影响另计。</td></tr></tbody></table></div>
  <details open><summary>算例 1 / 特殊订单</summary><div>闲置产能 200 件；售价 $45，相关单位变动成本 $30；新增设置费 $1,000。\[\Delta\pi=200(45-30)-1{,}000=2{,}000&gt;0\]无挤出与其他影响 → 财务上接受。若挤出 100 件、正常每件贡献 $25，则 \(O=2{,}500,\ \Delta\pi=-500\) → 拒绝。</div></details>
  <details><summary>算例 2 / 外购</summary><div>1,000 件：自制变动成本 $20/件，可避免固定成本 $4,000；外购 $25/件。共同固定费用 $6,000 不变。\[\Delta\pi_{\rm buy-make}=20{,}000+4{,}000-25{,}000=-1{,}000\]自制较好。释放资源若可赚贡献 $3,000，差量变为 +$2,000，外购较好。不能把不变的 $6,000 当作节省。</div></details>
  <details><summary>算例 3 / 更换设备</summary><div>比较未来两年：新机 $18,000，旧机现售 $4,000；每年节省运行成本 $8,000；收入相同，两方案期末残值均为 0。\[\Delta\pi_{\rm replace-retain}=4{,}000+2(8{,}000)-18{,}000=2{,}000\]财务上更换。旧账面值 $9,000 属过去成本；现售 $4,000 是相关金额。期间或期末残值变化则须重算。</div></details>
  <details><summary>算例 4 / 进一步加工</summary><div>1,000 件立即售价 $40/件；加工后 $55/件，新增加工成本 $12/件，无其他差量。\[\Delta\pi=1{,}000(55-40-12)=3{,}000\]财务上加工。两方案共同的原有生产成本不再扣一次。</div></details>
  <details><summary>算例 5 / 关闭亏损部门</summary><div>贡献 $15,000，可避免专属固定费用 $10,000，分摊总部费用 $8,000；总部费用不因关闭而变。账面亏损 $3,000，但：\[\Delta\pi_{\rm close-retain}=10{,}000-15{,}000=-5{,}000\]关闭令公司利润减少 $5,000，应保留（假设无其他影响）。</div></details>
  <div class="note"><b>结论范围。</b> 差量给出财务偏好；仍须按情境说明质量、交付可靠性、员工、客户与长期影响。没有证据时，不应假设这些因素为零。</div>`
},
{
  id:"mix",title:"多产品与限制因素",english:"Sales mix & scarce resources",tag:"06 · CONSTRAINTS",
  heading:"从加权平均，走向<em>资源配置。</em>",
  intro:"多产品 CVP 先固定销售组合；产能受限时，让每单位稀缺资源产生最大贡献。",
  pills:["销售组合","复合单位","贡献 / 限制因素","需求上限"],
  body:String.raw`
  <h2>固定比例，才能降为一元问题</h2>
  <div class="hero-equation"><div class="section-label">ONE COMPOSITE UNIT</div>\[(q_A,q_B)=(an,bn),\quad\pi(n)=(ak_A+bk_B)n-F\]\[n_{\rm BE}=\frac F{ak_A+bk_B}\]<p class="caption">\(a:b\) 为按件数的销量组合；\(n\) 为复合单位 / bundles 数。</p></div>
  <div class="card"><h3>算例 / A : B = 2 : 1</h3><p>A：售价 $70，变动成本 $40，贡献 $30。B：售价 $90，变动成本 $40，贡献 $50。固定成本 $11,000。</p>\[k_{\rm bundle}=2(30)+50=110,\qquad n_{\rm BE}=100\]<p>盈亏平衡 → A 200 件、B 100 件；销售额 \(100[2(70)+90]=\$23{,}000\)。目标利润 $5,500 → 150 bundles → A 300 件、B 150 件。严格整数套组时，先对 bundles 向上取整。</p></div>
  <div class="two-col"><div class="card"><h3>件数权重 \(w_i\)</h3>\[\bar k=\sum_iw_i k_i,\quad\sum_iw_i=1\]\[Q_{\rm BE}=F/\bar k\]<p>\(Q\) 为总件数。组合 2:1 的 \(\bar k=110/3\)。\(q_i=w_iQ\)；要保持整数比例，用 bundles 算。</p></div><div class="card"><h3>销售额权重 \(\alpha_i\)</h3>\[\overline{\mathrm{CMR}}=\sum_i\alpha_i\frac{k_i}{p_i}\]\[R_{\rm BE}=F/\overline{\mathrm{CMR}}\]<p>上例收入权重 \(140/230,\ 90/230\)，综合 CMR = \(110/230\)。不能把件数权重 2/3、1/3 直接当收入权重。</p></div></div>
  <div class="note"><b>前提。</b> 固定组合、售价及单位变动成本稳定、总固定成本在相关范围内不变。组合改变 → 盈亏平衡须重算。多产品 MOS 用同一组合的实际 / 预算总销售额减盈亏平衡销售额。</div>
  <h2>单一限制因素：每单位资源贡献</h2>
  <div class="derivation">\[r_i=\frac{k_i}{a_i},\qquad\max\sum_i k_iq_i\]\[\text{subject to}\quad\sum_i a_iq_i\le L,\quad 0\le q_i\le D_i\]<p class="chip-line">\(a_i\) = 每件所需资源，\(L\) = 资源总量，\(D_i\) = 最大需求。共同固定成本不变时，最大贡献也使利润最大。</p></div>
  <div class="table-wrap"><table><thead><tr><th>产品</th><th>贡献 / 件</th><th>小时 / 件</th><th>贡献 / 小时</th><th>需求上限</th></tr></thead><tbody><tr><td>A</td><td>$30</td><td>2 h</td><td>$15/h</td><td>200 件</td></tr><tr><td>B</td><td>$50</td><td>5 h</td><td>$10/h</td><td>150 件</td></tr></tbody></table></div>
  <div class="lab" data-lab="mix"><div class="lab-head"><span class="lab-title">配置实验 / 一小时应先给谁？</span><span class="live-tag">LIVE MODEL</span></div><div class="lab-grid"><div class="controls">
  <label>可用机器小时 \(L\)<input name="L" type="number" min="0" max="3000" step="10" value="600"><input name="L-slider" aria-label="拖动可用机器小时" type="range" min="0" max="1500" step="10" value="600"></label>
  <label>A 需求上限（件）<input name="DA" type="number" min="0" max="10000" step="1" value="200"></label>
  <label>B 需求上限（件）<input name="DB" type="number" min="0" max="10000" step="1" value="150"></label>
  <p class="small">A / B 参数如上表；允许连续产量，以突出资源配置逻辑。</p><button data-reset type="button">重置参数</button>
  </div><div class="lab-output" aria-live="polite"></div></div></div>
  <details><summary>为什么“每件贡献较高”不是充分理由？</summary><div>5 小时给 B 可赚 $50；同样 5 小时给 A（连续产量）可赚 \(2.5\times30=\$75\)。默认 600 小时 → A 200 件用 400 小时，剩 200 小时做 B 40 件，总贡献 $8,000。</div></details>
  <div class="note"><b>排序法边界。</b> 单一限制资源、稳定单位贡献与资源消耗、无其他约束且允许连续分配时，按 \(k_i/a_i\) 递减分配。整数件数可能使简单排序并非最优，应检查可行整数组合。多资源、最低订单、组合约束或新增固定费用不能只凭一个比率解决。负贡献产品在无其他义务时不生产。</div>`
},
{
  id:"practice",title:"检验理解",english:"Check your reasoning",tag:"07 · RETRIEVAL",
  heading:"用结论检验，<em>用条件纠错。</em>",
  intro:"原创自测。先判断模型、写出等式，再输入答案。反馈给出逻辑依据；章节掌握标记由你自行决定。",
  pills:["8 道自测","即时解释","公式速查"],
  body:String.raw`
  <div class="card"><span class="section-label">SELF-CHECK</span><div><span class="score" id="quiz-score">0 / 8</span><span class="chip-line">　已答对 · 可重复作答</span></div></div><div id="quiz-list"></div>
  <h2>一页公式骨架</h2>
  <div class="table-wrap"><table><thead><tr><th>问题</th><th>模型</th><th>前提</th></tr></thead><tbody>
  <tr><td>总成本</td><td>\(C(q)=vq+F\)</td><td>相关范围内线性</td></tr>
  <tr><td>单位成本</td><td>\(AC(q)=v+F/q\)</td><td>\(q&gt;0\)</td></tr>
  <tr><td>利润</td><td>\(\pi=(p-v)q-F\)</td><td>单产品 CVP；变动费用完整</td></tr>
  <tr><td>不亏损最低销量</td><td>\(\lceil F/(p-v)\rceil\)</td><td>\(p&gt;v\)，整数单位</td></tr>
  <tr><td>目标最低销量</td><td>\(\lceil(F+T)/(p-v)\rceil\)</td><td>\(p&gt;v\)，整数单位</td></tr>
  <tr><td>安全边际率</td><td>\((q-q_{\rm BE})/q\)</td><td>\(q&gt;0\)，理论盈亏平衡值</td></tr>
  <tr><td>存货单位成本</td><td>MC：\(v_m\)；AC：\(v_m+h\)</td><td>有期初存货则分别加权平均</td></tr>
  <tr><td>吸收调整</td><td>\(U=H_{\rm actual}-H_{\rm absorbed}\)</td><td>COGS 增加带符号 \(U\)</td></tr>
  <tr><td>方案选择</td><td>\(\Delta\pi=\Delta R-\Delta C\)</td><td>未来差量；机会成本不重复</td></tr>
  <tr><td>多产品盈亏平衡</td><td>\(n_{\rm BE}=F/\sum_i b_i k_i\)</td><td>\(b_i\) 为固定套组件数</td></tr>
  <tr><td>资源排序</td><td>\(r_i=k_i/a_i\)</td><td>\(a_i\) 为单位资源消耗；单一资源</td></tr>
  </tbody></table></div>
  <h2>答题语言，也可以很精简</h2>
  <div class="derivation"><div class="step"><span class="step-num">①</span><div><strong>定义</strong><p>“Let \(q\) denote units sold; \(k=p-v\).” 写清变量及单位。</p></div></div><div class="step"><span class="step-num">②</span><div><strong>等式与代入</strong><p>“\(\Delta\pi=200(45-30)-1{,}000=\$2{,}000\).” 保留足够 working。</p></div></div><div class="step"><span class="step-num">③</span><div><strong>条件与结论</strong><p>“Accept: incremental profit is positive, assuming spare capacity and no displacement of normal sales.” 结论不是只有数字。</p></div></div></div>`
},
{
  id:"sources",title:"课程边界与参考",english:"Scope & references",tag:"REFERENCE · 2026",
  heading:"公式简洁，<em>范围有据。</em>",
  intro:"以 2026 HKDSE BAFS Accounting strand 成本会计学习范围为目标。示例、推导与交互为原创教学表达。",
  pills:["官方来源","核对日期 2026-10-02","独立学习材料"],
  body:String.raw`
  <h2>课程范围</h2><p>覆盖成本分类、两种成本法及损益表、相关成本决策、CVP、安全边际、多产品与限制因素。教育局列明存货采用加权平均，不足 / 超额吸收计入 COGS。</p>
  <div class="note"><b>理解工具与考核要求。</b> 官方不要求两法利润调节、联合产品成本法或图形展示。本页用图形与受条件限制的利润差推导辅助理解；微积分、两点法和形式化约束不是新增官方考核要求。</div>
  <h2>官方参考</h2><ol class="source-list">
  <li><a href="https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/bafs/2026hkdse-e-bafs.pdf" target="_blank" rel="noopener">HKEAA · 2026 HKDSE BAFS Assessment Framework</a><small>2026 考试框架；详细教学内容结合课程及补充说明阅读。</small></li>
  <li><a href="https://www.edb.gov.hk/en/curriculum-development/kla/technology-edu/curriculum-doc/index.html" target="_blank" rel="noopener">EDB · Senior Secondary Curriculum and Assessment Guides</a><small>列明 2020 更新的 BAFS 指引适用于 2025 HKDSE 及以后；确认 2026 课程背景。</small></li>
  <li><a href="https://www.edb.gov.hk/attachment/en/curriculum-development/kla/technology-edu/resources/business-edu/Supplementary_notes_Accounting_Strand_for_2025_DSE_ENG%2820200509%29_clean.pdf" target="_blank" rel="noopener">EDB · Supplementary Notes · 2(b) Cost Accounting</a><small>文内页码 11，May 2020 版本。文件名含 2025，与“2025 及以后”适用背景一并阅读。</small></li>
  <li><a href="https://www.edb.gov.hk/en/curriculum-development/kla/technology-edu/resources/business-edu/resources.html" target="_blank" rel="noopener">EDB · BAFS Learning and Teaching Resources</a><small>成本分类、案例及 A06 成本法、A07 成本决策、A08 CVP 官方资源入口。</small></li></ol>
  <h2>使用说明</h2><div class="card"><p>直接打开 <code>index.html</code>。公式、字体、脚本均在本地，首次打开也无需联网；官网链接需联网。</p><p>主题及“已掌握”标记保存在本浏览器；禁用存储仍可学习。自测成绩仅保留在本次页面会话。打印导出全部章节笔记，交互面板不参与打印。</p><p>金额默认港元；利润模型为单期，不考虑税或折现，设备决策另述比较期间。实际答题优先采用题目假设、分类及分摊基准。</p></div>`
}
];
window.BA_QUESTIONS = [
 {id:"q1",type:"number",prompt:String.raw`\(C(q)=24q+9{,}600\)。\(q=400\) 时，平均单位成本是多少（$/件）？`,answer:48,tolerance:.005,explanation:String.raw`\(AC=24+9{,}600/400=48\)。$19,200 是总成本。`},
 {id:"q2",type:"choice",prompt:"专为产品 A 服务的固定月薪技术员，以 A 为成本对象，属于哪组？",options:["直接 + 固定","直接 + 变动","间接 + 固定"],answer:"直接 + 固定",explanation:"追溯与成本行为是两个独立维度。"},
 {id:"q3",type:"number",prompt:String.raw`\(p=75,\ v=45,\ F=10{,}000\)。整件销售，不亏损的最低销量是多少？`,answer:334,tolerance:0,explanation:String.raw`\(\lceil10{,}000/30\rceil=334\)。333 件仍亏 $10，不能四舍五入。`},
 {id:"q4",type:"number",prompt:"实际销量 500 件，理论盈亏平衡销量 400 件。MOS% 为多少？输入百分数，如 20。",answer:20,tolerance:.005,explanation:String.raw`\((500-400)/500\times100\%=20\%\)。分母不是盈亏平衡销量。`},
 {id:"q5",type:"number",prompt:"预算固定生产费用 $12,000，预算产量 1,000 件；实际产量 800 件，实际费用 $11,000。应增加 COGS 多少？",answer:1400,tolerance:.005,explanation:String.raw`\(h=12,\ H_{\rm absorbed}=9{,}600,\ U=11{,}000-9{,}600=1{,}400\)。不足吸收增加 COGS。`},
 {id:"q6",type:"number",prompt:"期初 100 件，每件 $36；本期生产 300 件，每件 $40；售出 250 件。加权平均法期末存货价值是多少（$）？",answer:5850,tolerance:.005,explanation:String.raw`\(\bar u=(100\times36+300\times40)/400=39\)，期末 150 件 → $5,850。`},
 {id:"q7",type:"number",prompt:"贡献 $15,000，可避免固定费用 $10,000，不可避免总部费用 $8,000。关闭相对保留的利润变化是多少（$，可为负）？",answer:-5000,tolerance:.005,explanation:String.raw`\(\Delta\pi=10{,}000-15{,}000=-5{,}000\)。总部费用相消。`},
 {id:"q8",type:"choice",prompt:"A 每件贡献 $30、用 2 小时；B 每件贡献 $50、用 5 小时。单一小时资源受限、需求未满足，应优先谁？",options:["A","B","贡献相同"],answer:"A",explanation:String.raw`A：\(30/2=\$15/\mathrm{h}\)；B：\(50/5=\$10/\mathrm{h}\)。`}
];
