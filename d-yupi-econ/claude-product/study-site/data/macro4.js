/* Macro chapter 4: The AS-AD model. Source: [CS] Macro 4 ASAD model cheat sheet (13 printed pages). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"A1",t:`The whole model on one page`,zh:`總供需模型總覽`,src:[S(1,"1"),S(2,"2")],h:`
<p>The overview chart links the determinants to the curves and the curves to the outcomes:</p>
<ul>
<li><b>AD</b> is made of <b>C</b> (taxes, transfers and disposable income; desire to save; wealth; interest rate), <b>I</b> (interest rate; profits tax rate; business prospects), <b>G</b> and <b>NX</b> (tourism; tariff, quota, embargo; national income of trading partners; foreign price level; appreciation or depreciation of the currency).</li>
<li><b>SRAS</b> depends on the cost of production (sales tax, production subsidy, minimum wage, inflationary expectation, oil prices) and temporary supply shocks (labour strikes, natural disasters).</li>
<li><b>LRAS</b> depends on resources available (labour supply, capital stock, land) and productivity (technology, quality of human capital).</li>
<li>The equilibrium gives the <b>price level</b> (cost of living, purchasing power of money) and <b>aggregate output Y</b>, which affects <b>employment</b>, <b>tax revenue</b> (fiscal balance) and <b>imports</b> (trade balance). Comparing Y with the full-employment output @@Y_f@@ gives the <b>output gap</b>, which drives the market adjustment from short run to long run.</li>
</ul>
<p>Margin notes: "fiscal balance" beside tax revenue and "trade balance" beside imports.</p>`},
{id:"A2",t:`A. Why does the AD curve slope downward?`,zh:`總需求曲線向右下斜`,src:[S(2,"3")],h:`
<div class="tw"><table>
<tr><th>Effect</th><th>Chain when the price level rises</th></tr>
<tr><td><b>Wealth effect</b></td><td>Real wealth decreases, so consumption falls, so aggregate output demanded falls</td></tr>
<tr><td><b>Interest rate effect</b></td><td>People borrow more to finance their transactions, so the interest rate rises, so consumption and investment fall, so output demanded falls</td></tr>
<tr><td><b>Net export (exchange rate) effect</b></td><td>Domestic goods become relatively dearer than foreign goods, so exports fall and imports rise, so net exports fall, so output demanded falls</td></tr>
</table></div>`},
{id:"A3",t:`B. Why does SRAS slope upward? C. Why is LRAS vertical?`,zh:`總供應曲線`,src:[S(3,"4")],h:`
<p><b>SRAS (short run): incomplete adjustment of input prices.</b></p>
<ul>
<li>Many input prices are fixed by long-term contracts. When the general price level rises, input prices rise <b>more slowly</b> than output prices.</li>
<li>It is more profitable to increase output, so quantity supplied rises: the curve slopes up.</li>
</ul>
<p><b>LRAS (long run): complete adjustment.</b></p>
<ul>
<li>Input prices are no longer fixed; they rise at the <b>same rate</b> as output prices, so the real cost of production is constant. It is no longer more profitable to raise output.</li>
<li><b>Capacity constraint:</b> the full-employment output depends on production capacity (resources and productivity). A higher price level does not raise capacity, so it does not raise output supplied. The curve is vertical.</li>
</ul>`},
{id:"A4",t:`D. Factors that shift AD`,zh:`影響總需求的因素`,src:[S(4,"5")],h:T`
<p>A change in the price level moves you <b>along</b> AD; the factors below <b>shift</b> it (margin note: "shift").</p>
<div class="tw"><table>
<tr><th>Component</th><th>Factor and chain</th></tr>
<tr><td><b>C</b></td><td>Income taxes up: @@Y_d@@ down, C down, AD down. Transfers up: @@Y_d@@ up, C up, AD up. Desire to save up: C down (since @@Y_d=C+S@@), AD down. Wealth up (property boom): C up, AD up. Interest rate up: cost of current consumption up, C down, AD down.</td></tr>
<tr><td><b>I</b></td><td>Interest rate up: cost of borrowing up, I down, AD down. Profits tax up: after-tax profits down, incentive to invest down, I down, AD down. Business prospects more optimistic: I up, AD up.</td></tr>
<tr><td><b>G</b></td><td>Government spending on public services (education, medical, civil servants' wages): more G, AD up.</td></tr>
<tr><td><b>NX</b></td><td>More tourists: exports of services up, NX up, AD up. Trading partners' income up: their C up, their imports up, our X up, AD up. Foreign tariff, quota or embargo on our exports: our X down, AD down; we impose one on their exports: our M down, AD up. Foreign price level up: their goods dearer, our M down and our goods cheaper so X up, AD up. Our currency appreciates: our goods dearer abroad, X down, their goods cheaper for us, M up, AD down.</td></tr>
</table></div>`},
{id:"A5",t:`E. Factors that shift SRAS`,zh:`影響短期總供應的因素`,src:[S(4,"7")],h:`
<div class="tw"><table>
<tr><th>Factor</th><th>Chain</th></tr>
<tr><td>General sales tax</td><td>Cost of production up, SRAS down (shifts left)</td></tr>
<tr><td>Production subsidy</td><td>Cost down, SRAS up</td></tr>
<tr><td>Minimum wage</td><td>Wage rate up, cost up, SRAS down</td></tr>
<tr><td>Inflationary expectation up</td><td>Workers bargain for higher wages, wage up, cost up, SRAS down (your ticks on the scan mark the wage and cost steps)</td></tr>
<tr><td>Oil price up</td><td>Cost up, SRAS down</td></tr>
<tr><td>Labour strikes</td><td>Labour temporarily unavailable, SRAS down</td></tr>
<tr><td>Typhoon or earthquake</td><td>SRAS down</td></tr>
</table></div>`},
{id:"A6",t:`F. Factors that shift LRAS (and SRAS)`,zh:`影響長期總供應的因素`,src:[S(5,"8")],h:`
<p>Definitions: <b>labour force</b> = number of people aged 15 or above willing and able to work; <b>labour supply</b> = total working hours; <b>labour productivity</b> = output / labour supply.</p>
<ul>
<li><b>Labour supply:</b> higher birth rate raises population and, when the babies grow up, the labour force (SRAS and LRAS rise in the future); importing labour or more immigrants raises them now; a higher salaries tax rate or unemployment benefit weakens the incentive to work (minor); a longer university period means fewer young people working now, so SRAS and LRAS fall now.</li>
<li><b>Labour productivity:</b> more education raises the quality of human capital; research and development and investment in technology raise productivity after the research succeeds (SRAS and LRAS rise in the future).</li>
<li><b>Capital goods:</b> the government builds infrastructure, so capital available rises after construction; higher investment expenditure raises capital formation and accumulation.</li>
<li><b>Natural resources and land:</b> discovering more (oil, ores) raises SRAS and LRAS.</li>
</ul>`},
{id:"A7",t:`G. From the short run to the long run: output gaps`,zh:`市場調節機制`,src:[S(5,"9")],h:`
<ul>
<li>For the short run, find the change in the SR equilibrium point (<b>SRAS and AD</b>). For the long run, find the LR equilibrium (<b>LRAS and AD</b>).</li>
</ul>
<div class="tw"><table>
<tr><th>Deflationary gap (unemployment)</th><th>Inflationary gap (overheated economy)</th></tr>
<tr><td>SR equilibrium output &lt; LR equilibrium output</td><td>SR equilibrium output &gt; LR equilibrium output</td></tr>
<tr><td>1. Deflationary (output) gap<br>2. Excess <b>supply</b> of factor input<br>3. Downward pressure on factor prices<br>4. Factor price and cost of production decrease<br>5. SRAS <b>increases</b><br>6. Actual output increases until the gap closes</td><td>1. Inflationary (output) gap<br>2. Excess <b>demand</b> for factor input<br>3. Factor price and cost of production increase<br>4. Upward pressure on factor price<br>5. SRAS <b>decreases</b><br>6. Actual output decreases until the gap closes</td></tr>
</table></div>
<p>It is SRAS, not AD, that moves in the adjustment.</p>`},
{id:"A8",t:`H. Induced effects of real income`,zh:`實質收入的引申影響`,src:[S(6,"10")],h:`
<ol>
<li>Y rises: <b>tax revenue (T)</b> rises because people pay more income tax (salaries tax, profits tax), so the <b>fiscal balance improves</b>.</li>
<li>Y rises: <b>imports (M)</b> rise because people consume more goods, including imported goods, so the <b>trade balance worsens</b>.</li>
</ol>
<p><b>Reminders (marked important on the scan):</b></p>
<ul>
<li>Disposable income up by $100: consumption rises by <b>less</b> than $100.</li>
<li>Real income up by $100: imports rise by less than $100; tax revenue rises by less than $100.</li>
<li>An <b>increase in the income tax rate</b>: tax revenue change is <b>uncertain</b>. It rises immediately, but incentives to earn income fall so income may decrease afterwards. It depends on which effect is bigger. (Starred twice.)</li>
</ul>
<p>Your handwritten example (page 11): income tax up leads to (1) AD: @@Y_d@@ down, C down, AD down, Y down, so employment falls and the unemployed population rises; (2) AS: a disincentive effect on labour supply, so SRAS and LRAS fall, so Y falls (actual and potential).</p>`},
{id:"A9",t:`I. Economic variables for open-ended questions`,zh:`經濟變量(開放題專用)`,src:[S(6,"11")],h:`
<p>List of variables to measure an effect in a policy question (your margin brackets group the first three as AS-AD, and 7 and 8 as Y):</p>
<ol>
<li>General price level</li><li>Aggregate output in the short run</li><li>Employment level, unemployment level (or rate)</li>
<li>Fiscal balance (tax revenue minus government expenditure)</li><li>Trade balance (value of exports minus value of imports)</li><li>Balance of payments</li>
<li>Labour supply</li><li>Full-employment output level</li><li>Equity (equalising income or opportunities)</li>
</ol>`}
];

const SEC={A:"AD",B:"AS",C:"Equilibrium and gaps"};
q("A1","A","Concept check",0,"",`The AD curve slopes downward partly because a higher price level …`,[`raises real wealth`,`lowers the interest rate`,`makes domestic goods relatively dearer, reducing net exports`,`raises consumption`],"C",`Net export (exchange rate) effect. A higher price level lowers real wealth, raises the interest rate and lowers consumption.`);
q("A2","A","Concept check",0,"",`Which causes a <b>shift</b> of the AD curve to the right?`,[`a fall in the price level`,`a rise in consumers' wealth from a property boom`,`a rise in the interest rate`,`a rise in income tax`],"B",`Higher wealth raises C at every price level: AD shifts right. A fall in the price level is a movement along AD.`);
q("A3","A","Concept check",0,"",`The government raises the profits tax rate. Which is correct?`,[`I rises and AD rises`,`I falls and AD falls`,`C rises and AD rises`,`SRAS rises`],"B",`After-tax profits fall, so the incentive to invest falls: I down, AD down.`);
q("A4","A","Concept check",0,"",`The number of mainland tourists rises. Which is the likely effect?`,[`AD shifts left`,`exports of services and NX rise, AD shifts right`,`SRAS shifts right`,`LRAS shifts right`],"B",`Tourist spending is an export of services: NX up, AD up.`);
q("A5","A","Concept check",0,"",`The domestic currency appreciates. The effect on AD is …`,[`rightward shift: exports rise`,`leftward shift: exports fall and imports rise`,`no effect`,`rightward shift: imports fall`],"B",`Our goods are dearer in foreign currency (X down) and foreign goods cheaper for us (M up): NX down, AD down.`);
q("A6","B","Concept check",0,"",`SRAS slopes upward because, in the short run, …`,[`output prices rise more slowly than input prices`,`input prices rise more slowly than output prices when the price level rises`,`all factors are variable`,`there is a capacity constraint`],"B",`Many input prices are fixed by long-term contracts: incomplete adjustment, so it becomes more profitable to raise output.`);
q("A7","B","Concept check",0,"",`LRAS is vertical because …`,[`output prices rise but input prices do not`,`full-employment output is determined by production capacity, not by the price level`,`AD never shifts`,`firms cannot hire workers`],"B",`Capacity (resources and productivity) fixes long-run output; a higher price level does not raise it.`);
q("A8","B","Concept check",0,"",`The minimum wage rises. SRAS …`,[`shifts right`,`shifts left`,`does not shift`,`becomes vertical`],"B",`Wage up raises the cost of production: SRAS down (left).`);
q("A9","B","Concept check",0,"",`A typhoon hits Hong Kong. Which is correct?`,[`SRAS shifts right`,`SRAS shifts left`,`AD shifts right`,`LRAS shifts right`],"B",`Extreme weather is a temporary supply shock: SRAS shifts left.`);
q("A10","B","Concept check",0,"",`Which shifts <b>both</b> SRAS and LRAS (in the future)?`,[`a rise in the sales tax`,`more spending on education to raise human capital`,`a temporary labour strike`,`a rise in the oil price`],"B",`Better human capital raises productivity: SRAS and LRAS both rise in the future. Sales tax, strikes and oil price are short-run supply factors.`);
q("A11","C","Concept check",0,"",`In the market adjustment mechanism, what moves when there is a deflationary gap?`,[`AD shifts right`,`SRAS shifts right`,`LRAS shifts left`,`AD shifts left`],"B",`Excess supply of factor input pushes factor prices and cost down, so SRAS increases until the gap closes.`);
q("A12","C","Concept check",0,"",`A deflationary gap exists when …`,[`SR equilibrium output is above the full-employment output`,`SR equilibrium output is below the full-employment output`,`the price level falls`,`inflation is zero`],"B",`SR equilibrium output less than LR (full-employment) output: unemployment.`);
q("A13","C","Concept check",0,"",`Real income (Y) rises by $100. Which is correct?`,[`tax revenue rises by exactly $100`,`imports rise by more than $100`,`tax revenue rises by less than $100 and the fiscal balance improves`,`consumption falls`],"C",`T and M rise by less than the rise in Y. Tax revenue rising improves the fiscal balance; imports rising worsens the trade balance.`);
q("A14","C","Concept check",0,"",`The government raises the income tax rate. The effect on tax revenue is …`,[`certainly higher`,`certainly lower`,`uncertain`,`zero`],"C",`Revenue rises at once, but the incentive to earn income falls, so income may fall. It depends on which effect is bigger.`);
q("A15","C","Concept check",0,"",`On an AS-AD diagram, the vertical axis should be labelled …`,[`$`,`price level (price index, no dollar sign)`,`quantity Q`,`consumption`],"B",`The vertical axis is the price index, which is not in dollars. The horizontal axis is real output Y, not Q.`);

const EX=[
{id:"D1",k:"num",t:`Find the output gap`,stem:T`AD: @@P=100-Y@@; SRAS: @@P=20+Y@@; full-employment output @@Y_f=50@@. By how much does short-run equilibrium output differ from @@Y_f@@ (output gap, a deflationary gap is negative)?`,a:-10,u:`units`,tol:0.01,src:[S(5,"9")],w:T`<p>@@100-Y=20+Y@@ so @@Y=40@@ (price 60). Gap @@=40-50=-10@@: a <b>deflationary gap</b>. Excess supply of factor input pushes costs down, SRAS shifts right until output reaches 50.</p>`},
{id:"D2",k:"open",t:`Multiple shifts`,stem:`The government subsidises firms' production costs and, at the same time, raises the profits tax. Describe the effects on AD and SRAS and say what is certain about the price level and output.`,src:[S(4,"5"),S(4,"7")],w:`<p><b>Subsidy:</b> cost of production falls, so SRAS shifts <b>right</b>. <b>Profits tax up:</b> after-tax profits fall, so investment falls: AD shifts <b>left</b>.</p><p>SRAS right and AD left both push the <b>price level down</b>; the effect on output is <b>uncertain</b> (SRAS right raises it, AD left lowers it). State which shift you judge larger if the question asks.</p>`},
{id:"D3",k:"open",t:`Explain the effect of an income tax rise (framework)`,stem:`Using the AS-AD model, explain the effect of a rise in the salaries tax rate on output and employment.`,src:[S(6,"11")],w:`<p><b>AD side:</b> disposable income falls, so consumption falls, so AD shifts left, so output Y falls and employment falls (the unemployed population rises).</p><p><b>AS side:</b> a disincentive effect on labour supply, so SRAS and LRAS shift left, so output (actual and potential) falls. Tax revenue may rise or fall.</p>`}
];

const LONG=[
{id:"B1",src:`Practice (framework from the notes)`,q:`Explain why the AD curve slopes downward.`,m:`<p>Use the three effects, each with its chain: <b>wealth effect</b> (price level up, real wealth down, C down, output demanded down); <b>interest rate effect</b> (price level up, people borrow more, interest rate up, C and I down); <b>net export effect</b> (domestic goods relatively dearer, X down and M up, NX down). Name the components affected and say that aggregate output demanded falls.</p>`},
{id:"B2",src:`Practice (framework from the notes)`,q:`The economy has a deflationary gap. Explain how it is closed without government action.`,m:`<p>SR equilibrium output is below the full-employment output, so there is excess supply of factor input (unemployment). This puts downward pressure on factor prices, so the cost of production falls and <b>SRAS increases</b>. Actual output rises (and the price level falls) until the gap is closed at the LR equilibrium on LRAS.</p><p>It is SRAS that shifts, not AD.</p>`}
];

const CS=[
{t:`Common mistakes with the AS-AD model`,zh:`常犯錯誤`,src:[S(7,"12"),S(7,"13")],h:`
<div class="tw"><table>
<tr><th>Topic</th><th>Typical mistakes</th></tr>
<tr><td>Assumptions of the model</td><td>Not linking the price level to aggregate output demanded or supplied</td></tr>
<tr><td>Shifts of AD and SRAS</td><td>Options that describe a movement along the same curve, not a shift · confusing "increase in the GDP deflator" with "increase in the general price level" · not knowing oil is a key input to production, so oil price changes affect costs · weak on net-export factors</td></tr>
<tr><td>Multiple shifts</td><td>Little knowledge of real fiscal policies (waiving the business registration fee, raising the tax allowance on education)</td></tr>
<tr><td>Change in equilibrium</td><td>Not writing step by step (steps missed) · not saying which component of AD changed, or which SRAS or LRAS factor · doing the market adjustment mechanism when the question does not ask for it · forgetting the basics of demand and supply (change can be uncertain) · adding "$" to the y-axis or using Q on the x-axis (it is the price index and Y) · not knowing Y is real GDP, real output, real national income or aggregate output · forgetting that output, expenditure and income are the same thing · not knowing that output is positively related to the employment level</td></tr>
<tr><td>Market adjustment mechanism</td><td>Not defining inflationary and deflationary gaps exactly · not seeing unemployment, overheating and excess demand or supply in the factor market all reflect an output gap · thinking AD shifts in the adjustment (it is SRAS) · forgetting the two sources of nominal output change: price level and real output</td></tr>
<tr><td>Induced effects, tax rate changes, disposable income and consumption</td><td>Often skipped because school notes and textbooks do not teach them explicitly, so most students do not know them</td></tr>
<tr><td>Data response and essay questions</td><td>Writing a few sentences and stopping instead of using all the time to build arguments · no comparison, no answer to the variable the question asks about, and no prepared simple list of economic variables</td></tr>
</table></div>`}
];

Yupi.register({
 id:"macro4",title:"The AS-AD model",
 sub:`Why AD slopes down, why SRAS slopes up and LRAS is vertical, what shifts each curve, output gaps and the induced effects of income. From the Macro 4 cheat sheet.`,
 files:{cs:{name:"[CS] Macro 4 ASAD model.pdf",dir:"雞精notes/Macro/",pre:"ma4r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet.`,
 csLead:`The error table from the cheat sheet, summarised in English.`,
 verify:[["Handwriting",`Pages 10 and 11 carry your margin stars and a handwritten income-tax example. They are written up on the Learn cards; open the badges to see the originals.`,["cs",6,"10"]]],
 widgets:[{tab:"learn",title:"AS-AD: shift the curves",init:(el,Y)=>Y.widgets.asad(el,Y)}]
});
})();
