/* Macro chapter 2: Nominal and real variables, price level. Source: [CS] Macro 2 cheat sheet (11 printed pages). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"N1",t:`A. Reading a price index versus an inflation rate`,zh:`物價指數與通脹率`,src:[S(1,"1")],h:T`
<ul>
<li><b>Price index (P):</b> the base year is set at 100. If the current price level is above the base year's, @@P>100@@; equal, @@P=100@@; below, @@P<100@@.</li>
<li><b>Inflation rate (%P):</b> the percentage change of the price level. Its <b>sign</b> shows the <i>direction</i> (positive: rising, zero: unchanged, negative: falling); its <b>size</b> shows the <i>speed</i> of change.</li>
</ul>
<div class="note">A falling inflation rate is not a falling price level. In the sheet's graph the inflation rate falls from +2% to +1% to 0%, yet the price index is still above 100 until year 3: prices were still rising, just more slowly.</div>`},
{id:"N2",t:`B. Inflation, disinflation, deflation`,zh:`定義`,src:[S(2,"2")],h:`
<ul>
<li><b>Inflation:</b> a <b>continuous or persistent</b> increase in the <b>general</b> price level.</li>
<li><b>Disinflation:</b> the general price level keeps rising, but at a slower rate (the inflation rate is positive and falling).</li>
<li><b>Deflation:</b> a continuous decrease in the general price level.</li>
<li>A rise in the price of a <i>single</i> good does not imply inflation. A <b>once-and-for-all or temporary</b> increase (typhoon, sales tax, cash hand-out) is not inflation.</li>
<li>If the general price level rises, the <b>purchasing power of money falls</b> (the same money buys fewer goods) and the <b>cost of living rises</b>.</li>
</ul>`},
{id:"N3",t:`C. GDP deflator versus CPI`,zh:`GDP平減指數與消費物價指數`,src:[S(2,"3")],h:T`
<div class="tw"><table>
<tr><th></th><th>GDP deflator</th><th>CPI</th></tr>
<tr><td>How to derive</td><td>1. Nominal GDP = current @@P\times@@ current @@Q@@. 2. Real GDP = base @@P\times@@ current @@Q@@. 3. @@\dfrac{\text{nominal GDP}}{\text{real GDP}}\times100@@</td><td>1. Decide what is in the consumption basket. 2. Cost of the basket at current prices. 3. Cost at base-year prices. 4. @@\dfrac{TE\text{ in current period}}{TE\text{ in base period}}\times100@@</td></tr>
<tr><td>Measures the prices of</td><td>goods and services included in the calculation of <b>GDP</b></td><td>a basket of <b>consumer goods</b> consumed by a typical household</td></tr>
<tr><td>Goods covered</td><td>consumer goods <b>and producer goods</b></td><td>only consumer goods</td></tr>
<tr><td>Imported goods</td><td>not included</td><td>included</td></tr>
<tr><td>Exported goods</td><td>included</td><td>not included</td></tr>
<tr><td>Goods not currently produced</td><td>only goods <b>currently produced</b></td><td>includes goods not currently produced</td></tr>
<tr><td>Basket</td><td><b>variable</b> baskets and weights, changed every year</td><td>a <b>fixed</b> basket and fixed weighting</td></tr>
<tr><td>Better for measuring</td><td>changes in the <b>general price level</b></td><td>the <b>cost of living</b></td></tr>
</table></div>
<p>Your margin note on the scan labels the two columns "CPI" and "GDP deflator" next to the two descriptions, to fix which is which: the one with a consumer basket and imports is the <b>CPI</b>; the one covering what is produced in the economy is the <b>GDP deflator</b>. (On the printed sheet the column order for the lower rows is the reverse of the top, so read each row against its heading carefully.)</p>`},
{id:"N4",t:`D. Shortcomings of the CPI`,zh:`消費物價指數的缺點`,src:[S(3,"4")],h:`
<ul>
<li><b>Quality adjustment bias:</b> a rise in price may reflect better quality, so the cost of buying the same amount of goods of the <i>same quality</i> may not be higher.</li>
<li><b>Substitution bias:</b> the weights in the basket are fixed (revised every 5 years), assuming consumption patterns do not change. In reality people substitute away from goods whose prices rise faster, so the CPI overstates the rise in the cost of living.</li>
</ul>`},
{id:"N5",t:`E. Real values and the wealth redistribution effect`,zh:`財富再分配效應`,src:[S(3,"5")],h:T`
<div class="box">@@@\text{real value}=\dfrac{\text{nominal value}}{\text{price index}}\times100\qquad\qquad \%\text{nominal}-\%\text{price index}\approx\%\text{real}@@@</div>
<p><b>Gain or loss, step by step:</b></p>
<ol>
<li>Identify the change in the <b>nominal value</b> of the amount of money (salary, pension, insurance compensation, loan repayment).</li>
<li>Identify the change in the <b>general price level</b>.</li>
<li>From 1 and 2 work out the change in <b>real value</b>; compare percentage changes if needed.</li>
<li>Is the person <b>paying</b> the money or <b>receiving</b> it? (A fall in real value is a loss for the receiver, a gain for the payer.)</li>
</ol>`},
{id:"N6",t:`F. When inflation is expected`,zh:`預期通脹`,src:[S(3,"5")],h:`
<ol>
<li>Workers bargain for a higher <b>nominal</b> wage rate (inflation means each dollar buys less).</li>
<li>Creditors charge a higher <b>nominal</b> interest rate.</li>
<li>People hold more <b>real assets</b> instead of monetary assets.</li>
</ol>
<p>Your handwritten summary at the bottom of page 5: there are <b>two ways</b> to find a gain or loss. (1) Compare the change in real value (wage) with the change in nominal value (use when little information is given). (2) The Fisher equation (use when there are numbers).</p>`},
{id:"N7",t:`G. The Fisher equation`,zh:`費沙方程式`,src:[S(4,"6")],h:T`
<div class="box">@@@n=r+\pi^e\qquad(\text{nominal rate}=\text{real rate}+\text{expected inflation})@@@</div>
<ul>
<li>If inflation is expected, creditors ask for a higher nominal rate: @@n=r+\pi^e@@. If <b>deflation</b> is expected, debtors ask for a lower rate: @@n=r-\text{expected deflation}@@.</li>
<li><b>Gain or loss:</b> compare the <b>expected</b> real rate @@r^e=n-\pi^e@@ with the <b>actual</b> real rate @@r^a=n-\pi^a@@ (the actual real interest rate is the "rate of return"). Lenders gain if @@r^a>r^e@@ (inflation lower than expected) and lose if @@r^a<r^e@@; borrowers the reverse.</li>
</ul>
<p>The nominal rate is fixed <b>in advance</b> in a contract, so it does not equal "actual real rate plus actual inflation".</p>`},
{id:"N8",t:`Rates of return on different assets`,zh:`不同資產的回報率`,src:[S(4,"7")],h:T`
<div class="tw"><table>
<tr><th></th><th>Nominal rate of return</th><th>Real rate of return (nominal minus inflation rate)</th></tr>
<tr><td>Cash (monetary asset)</td><td>0%</td><td>@@0-\pi@@</td></tr>
<tr><td>Interest-bearing assets</td><td>nominal interest rate</td><td>nominal interest rate @@-\pi@@</td></tr>
</table></div>
<ul>
<li>Cash earns a nominal return of zero because its nominal value does not rise over time.</li>
<li>The <b>opportunity cost of holding money</b> equals the nominal interest rate: you give up the interest from a deposit or from bonds. (Starred on the scan.)</li>
</ul>`},
{id:"N9",t:`H. Limits of GDP statistics`,zh:`國民收入數據的限制`,src:[S(5,"8")],h:`
<ol>
<li>Changes in the general price level: nominal GDP is not applicable for comparing real output.</li>
<li>Changes in population size: not applicable for per-capita comparisons.</li>
<li>Composition of GDP: not applicable for consumption expenditure.</li>
<li>Income distribution.</li><li>Undesirable effects of production.</li><li>Leisure time (your note: "shortest" to write).</li><li>Unreported production activities.</li>
</ol>
<p>The sheet says to practise writing these long-question answers using past papers.</p>`},
{id:"N10",t:`I. Nominal, real and per-capita GDP`,zh:`名義、實質與人均 GDP`,src:[S(5,"8")],h:T`
<p>The triangle links three quantities. Divide by population to get per-capita values.</p>
<div class="box">@@@N=\dfrac{R\times P}{100}\qquad R=\dfrac{N}{P}\times100\qquad P=\dfrac{N}{R}\times100@@@</div>
<ul>
<li><b>Two sources of nominal GDP growth:</b> more real output, or a higher price level.</li>
<li>If @@N>R@@ then @@P>100@@; if @@N=R@@ then @@P=100@@; if @@N<R@@ then @@P<100@@.</li>
<li>For growth rates: if @@\%N>\%R@@ then inflation @@>0@@; @@\%N=\%R@@ then @@0@@; @@\%N<\%R@@ then @@<0@@.</li>
<li>Approximation: @@\%N\approx\%R+\%P@@. Exact: @@\%\text{growth}=\dfrac{\text{new}-\text{old}}{\text{old}}@@; do not use the approximation when an exact answer is asked.</li>
</ul>`}
];

const SEC={A:"Price index and inflation",B:"Real values and Fisher",C:"GDP variables"};
q("N1","A","Concept check",0,"",`The price index was 120 last year and 126 this year. The inflation rate is …`,[`6%`,`5%`,`26%`,`4.8%`],"B",T`@@\dfrac{126-120}{120}=5\%@@. Divide by the <b>old</b> index, not the new one.`);
q("N2","A","Concept check",0,"",`The inflation rate falls from 4% to 2%. Which is correct?`,[`the price level is falling`,`there is deflation`,`there is disinflation`,`the price level is unchanged`],"C",`Prices still rise (inflation is positive) but more slowly: disinflation.`);
q("N3","A","Concept check",0,"",`Which is <b>not</b> inflation?`,[`a continuous rise in the general price level`,`a one-off rise in prices after the introduction of a sales tax`,`a persistent rise in the cost of living`,`prices rising year after year`],"B",`A once-and-for-all or temporary rise is not inflation.`);
q("N4","A","Concept check",0,"",`The price index in the base year is …`,[`0`,`1`,`100`,`the same as inflation`],"C",`The base year's price index is set at 100.`);
q("N5","A","Concept check",0,"",`Which price index includes imported goods and is based on a fixed basket?`,[`GDP deflator`,`CPI`,`both`,`neither`],"B",`The CPI covers a fixed basket of consumer goods including imports. The GDP deflator covers goods currently produced domestically (exports included, imports not) and changes its weights every year.`);
q("N6","A","Concept check",0,"",`The CPI tends to overstate the rise in the cost of living because of …`,[`substitution bias`,`perfect information`,`lower quality`,`changing the base year`],"A",`With a fixed basket, the CPI ignores that people switch away from goods whose prices rise faster. (Quality adjustment bias works similarly.)`);
q("N7","B","Concept check",0,"",T`Nominal wage is @@\$20{,}000@@ and the price index is 125. The real wage (base year dollars) is …`,[`$16,000`,`$20,000`,`$25,000`,`$15,000`],"A",T`@@\dfrac{20000}{125}\times100=16000@@.`);
q("N8","B","Concept check",0,"",`Nominal wages rise 4% and the price level rises 7%. The real wage …`,[`rises by about 3%`,`falls by about 3%`,`rises by about 11%`,`is unchanged`],"B",T`@@4\%-7\%\approx-3\%@@: the real value falls, so the <b>receiver</b> (worker) loses and the payer (employer) gains.`);
q("N9","B","Concept check",0,"",`A loan is repaid in nominal dollars. Unexpected high inflation occurs. Who gains?`,[`the lender`,`the borrower`,`neither`,`both`],"B",`The real value of the repayment falls: the borrower repays with less valuable dollars, so gains; the lender loses.`);
q("N10","B","Concept check",0,"",T`A loan has a nominal interest rate of 8%. Expected inflation was 3%. Actual inflation turns out to be 5%. The actual real rate is …`,[`3%`,`5%`,`8%`,`13%`],"A",T`@@r^a=n-\pi^a=8-5=3\%@@, below the expected real rate @@r^e=8-3=5\%@@: the lender loses and the borrower gains.`);
q("N11","B","Concept check",0,"",`The real interest rate with expected inflation is the nominal rate minus …`,[`actual inflation`,`expected inflation`,`the price level`,`zero`],"B",T`Fisher: @@n=r+\pi^e@@, so the (expected) real rate is @@n-\pi^e@@. "Real interest rate" with no further word means the <i>expected</i> real rate.`);
q("N12","B","Concept check",0,"",`Which is <b>not</b> a response to expected inflation?`,[`workers bargain for higher nominal wages`,`creditors ask for higher nominal interest rates`,`people hold more real assets`,`people hold more cash`],"D",`Expected inflation makes cash less attractive; people hold more real assets instead.`);
q("N13","C","Concept check",0,"",T`Real GDP is 800 and nominal GDP is 1,000 (base-year prices). The GDP deflator is …`,[`80`,`125`,`200`,`1.25`],"B",T`@@\dfrac{1000}{800}\times100=125@@; @@N>R@@ so @@P>100@@.`);
q("N14","C","Concept check",0,"",`Nominal GDP grows 9% and the GDP deflator rises 4%. Real GDP grows by about …`,[`13%`,`5%`,`4%`,`9%`],"B",T`@@\%R\approx\%N-\%P=9-4=5\%@@.`);
q("N15","C","Concept check",0,"",`Which does <b>not</b> make per-capita real GDP a perfect measure of living standards?`,[`leisure time`,`income distribution`,`unreported activities`,`it already adjusts for price changes and population`],"D",`Per-capita real GDP already corrects for prices and population. Leisure, distribution, unreported activity and undesirable by-products of production are still limits.`);
q("N16","C","Concept check",0,"",`When asked for the <b>exact</b> growth rate of nominal GDP from 500 to 560, the answer is …`,[`60`,`12%`,`11.2%`,`10%`],"B",T`@@\dfrac{560-500}{500}=12\%@@. Divide by the old value. (The approximation is for adding and subtracting percentages.)`);

const EX=[
{id:"G1",k:"num",t:`Real GDP from nominal GDP and the price index`,stem:T`Nominal GDP is $1,350 billion and the price index is 150. Find real GDP ($ billion).`,a:900,u:`$ billion`,tol:0.5,src:[S(5,"8")],w:T`@@R=\dfrac{N}{P}\times100=\dfrac{1350}{150}\times100=900@@. Since @@N>R@@, @@P>100@@, consistent.`},
{id:"G2",k:"num",t:`Gain or loss with Fisher`,stem:T`A bank lends at a nominal rate of 9% when inflation is expected to be 4%. Actual inflation is 7%. By how many percentage points is the actual real rate below the expected real rate?`,a:3,u:`percentage points`,tol:0.01,src:[S(4,"6")],w:T`@@r^e=9-4=5\%@@ and @@r^a=9-7=2\%@@. Gap @@=5-2=3@@ points: the lender loses, the borrower gains.`},
{id:"G3",k:"open",t:`GDP deflator or CPI?`,stem:`Which price index would you use to find out whether a typical household's cost of living has risen, and why might it still overstate the rise?`,src:[S(3,"4")],w:`<p>The <b>CPI</b>: it measures the cost of a basket of consumer goods bought by a typical household (including imports). It may overstate the rise because of <b>substitution bias</b> (the fixed basket ignores switching to cheaper goods) and <b>quality adjustment bias</b> (part of a price rise reflects better quality).</p>`}
];

const LONG=[
{id:"P1",src:`Practice (framework from the notes)`,q:`Explain two differences between the GDP deflator and the CPI.`,m:`<p>Compare, do not just describe one:</p><ol><li><b>Coverage:</b> the GDP deflator covers all goods and services currently <b>produced</b> in the economy (consumer and producer goods, including exports); the CPI covers a basket of <b>consumer</b> goods bought by a typical household, including imports.</li><li><b>Basket:</b> the CPI uses a <b>fixed</b> basket and fixed weights; the GDP deflator's weights vary year by year.</li></ol><p>Consequence: the CPI measures the cost of living better; the GDP deflator measures the general price level of the economy better.</p>`},
{id:"P2",src:`Practice (framework from the notes)`,q:`Pensioners receive a fixed nominal pension. Explain the effect of inflation on them and on the government that pays it.`,m:`<p>The nominal pension is unchanged but the price level rises, so the <b>real value falls</b>: the pensioners (receivers) lose purchasing power. The government (payer) gains because it pays out less in real terms. State the percentages if numbers are given: %real &asymp; %nominal &minus; %price.</p>`}
];

const CS=[
{t:`Common mistakes with nominal and real variables`,zh:`常犯錯誤`,src:[S(5,"9"),S(6,"10"),S(6,"11")],h:`
<div class="tw"><table>
<tr><th>Question type</th><th>Typical mistakes</th></tr>
<tr><td>GDP deflator versus CPI</td><td>Listing the features of one index without a clear comparison · dividing the change in the index by the new instead of the old index · not seeing the basic difference: output of local resident producing units versus a consumer basket · missing finer points (exports, current production, fixed versus variable weights)</td></tr>
<tr><td>Implications of a change in the price index</td><td>Thinking an index above 100 means prices are rising (it means the year's prices are above the base year) · not knowing Hong Kong has CPI (A), (B), (C) for different income groups</td></tr>
<tr><td>Definition of inflation</td><td>Equating a high price level with inflation; inflation is a <b>continuous</b>, not once-and-for-all, rise</td></tr>
<tr><td>Direction of change in the price level</td><td>Reading a falling inflation rate as a falling price level · confusing disinflation with deflation</td></tr>
<tr><td>Deriving the deflator and the CPI</td><td>Not seeing that dividing nominal by real GDP gives the deflator · not knowing how to build the CPI from the data</td></tr>
<tr><td>Limits of the CPI for the cost of living</td><td>Not understanding substitution bias or the link to fixed weights</td></tr>
<tr><td>Change in real value over time</td><td>Not converting nominal to real wages · leaving out "pay" versus "receive" · not comparing the percentage changes · missing premises such as "wage indexation" · mixing up the lender and the borrower · not knowing that the bond issuer is the borrower · not knowing time deposits pay a fixed rate</td></tr>
<tr><td>Inflation is expected</td><td>Not knowing the three behavioural changes · confusing monetary and real assets · thinking expected inflation removes the redistribution effect (adjusting contracts has costs)</td></tr>
<tr><td>Fisher: gain and loss</td><td>Not comparing the <b>expected</b> real rate with the <b>actual</b> real rate · confusing lender and borrower · confusing "real" with "actual" (expected versus actual: ex-ante and ex-post)</td></tr>
<tr><td>Cost and return of holding assets</td><td>Not noticing conventions: without more words, "real interest rate" means the expected real rate; "inflation rate" means the actual rate; "real rate of return" means the actual real rate · taking deflation as inflation · sign errors with negatives (5 &minus; (&minus;8) is 13) · not using reverse reasoning</td></tr>
<tr><td>Inflation-linked bonds</td><td>Normally nominal return equals the inflation rate; if inflation is below the minimum return, nominal return equals the minimum</td></tr>
<tr><td>Logical reasoning</td><td>Thinking the nominal rate equals actual real rate plus actual inflation (it is set in advance) · confusing a rise in inflation with the sign of inflation</td></tr>
<tr><td>Limits of measuring living standards</td><td>Not seeing that real GDP already adjusts for prices, per-capita GDP for population, consumption expenditure for composition · not writing comparatives (more, less) · mixing overestimate and underestimate</td></tr>
<tr><td>Calculations and growth rates</td><td>Finding formulas hard to memorise · not applying the three formulas flexibly · treating a fall in the growth rate as a fall in the number · using the approximation when an exact rate is asked (use new minus old, divided by old)</td></tr>
</table></div>`}
];

Yupi.register({
 id:"macro2",title:"Nominal and real variables, price level",
 sub:`Price indices, inflation, GDP deflator versus CPI, real values, who gains from inflation, the Fisher equation and the nominal-real-price triangle. From the Macro 2 cheat sheet.`,
 files:{cs:{name:"[CS] Macro 2 Nominal variable, real variable and price level.pdf",dir:"雞精notes/Macro/",pre:"ma2r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet, with the arithmetic worked after each answer.`,
 csLead:`The error table from the cheat sheet, summarised in English.`,
 verify:[["GDP deflator versus CPI table",`Page 3 of the sheet carries a handwritten label (CPI / GDP deflator) in the middle of the table because the rows below the "how to derive" block read in the opposite column order to the headings. The English card above uses the standard definitions. Please check the row "Imported goods" and "Exported goods" against your class notes.`,["cs",2,"3"]],["Handwritten triangle examples",`The numeric triangle examples written on page 8 (15%, 13%, 5%, 10%, -3%) are too faint to read reliably, so I did not use them. The triangle formulas themselves are on the card.`,["cs",5,"8"]]],
 widgets:[{tab:"learn",title:"Nominal, real and price index",init:(el,Y)=>Y.widgets.triangle(el,Y)}]
});
})();
