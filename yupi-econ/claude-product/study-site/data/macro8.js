/* Macro chapter 8: The money market. Source: [CS] Macro 8 cheat sheet (10 printed pages and a handwritten page). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"Y1",t:`The whole money market on one page`,zh:`貨幣市場總覽`,src:[S(1,"1")],h:T`
<ul>
<li><b>Money supply</b> @@M_s@@ is set by the monetary base (printing money, open market operations, discount rate) and the banking multiplier (RRR or ARR, demand for loans, cash leakage). This is <b>Macro 7</b> (your margin note).</li>
<li><b>Money demand</b> @@M_d@@ has two parts: <b>transactions demand</b> @@M_t@@ (synchronisation of payments and receipts, electronic payment; @@M_t=kPY@@) and <b>asset demand</b> @@M_a@@ (wealth, expected return of interest-bearing assets IBA, risk of IBA, liquidity of IBA, expected bond price).</li>
<li>The two curves meet at the <b>nominal interest rate</b> @@n@@. Your note: the intersection point decides @@n@@.</li>
<li>@@n@@ affects consumption and investment (borrowing cost), so <b>AD</b>; investment adds to the capital stock, which affects the <b>future LRAS</b>. Output and the price level then feed back into nominal GDP @@PY@@ and so into @@M_t@@.</li>
</ul>`},
{id:"Y2",t:`A. Cash versus other assets`,zh:`現金 vs 其他資產`,src:[S(3,"4")],h:`
<ul>
<li><b>Lowest expected return:</b> cash earns 0% nominal; other non-monetary assets usually bear interest (bond interest, share dividends, rent, capital gains).</li>
<li><b>Less risky:</b> the real value of money is usually more stable than asset prices; the nominal return on cash is always 0% while that of other assets fluctuates.</li>
<li><b>Highest liquidity:</b> cash is already a generally accepted medium of exchange, so it can be exchanged for goods and services <b>at short notice without loss</b>. Converting other assets into cash may incur a loss, or not be possible at short notice.</li>
</ul>
<p><b>Why money is not 100% risk-free:</b> <i>inflation risk</i> (purchasing power falls when the general price level rises); <i>bank run (default) risk</i> (depositors may not get their deposit back); <i>exchange rate risk</i> (purchasing power in foreign currencies falls if the domestic currency depreciates).</p>`},
{id:"Y3",t:`Ranking assets by liquidity`,zh:`資產流動性排序`,src:[S(3,"5")],h:`
<div class="tw"><table>
<tr><th>Rank (highest first)</th><th>Asset</th><th>Why</th></tr>
<tr><td>1</td><td>Cash</td><td>Already a generally accepted medium of exchange</td></tr>
<tr><td>2</td><td>Demand deposits</td><td>Write cheques to buy goods and services</td></tr>
<tr><td>3</td><td>Savings deposits</td><td>Use EPS or other electronic payment to spend them</td></tr>
<tr><td>4</td><td>Negotiable certificates of deposit</td><td>Like time deposits, but can be sold to others before maturity, so more liquid</td></tr>
<tr><td>5</td><td>Time deposits</td><td>Withdrawing before maturity loses interest and may cost a fee: the <b>least liquid deposits</b></td></tr>
<tr><td>6</td><td>Shares and bonds</td><td>If there are too few buyers, you cannot sell immediately or must cut the price (capital loss)</td></tr>
<tr><td>7</td><td>Real estate (lowest)</td><td>Fewer buyers than for shares or bonds</td></tr>
</table></div>`},
{id:"Y4",t:`B. Factors affecting money demand`,zh:`影響貨幣需求的因素`,src:[S(4,"6")],h:T`
<p><b>Movement along the @@M_a@@ curve</b> (your note: "related to the interest rate"). Nominal interest rate up, so the quantity of money demanded for asset purposes falls. Also: a rise in the (expected) real interest rate, or in the expected inflation rate, raises the nominal rate, so @@Q_d@@ of money falls; a fall in bond price equals a rise in the nominal interest rate.</p>
<p><b>Shift of the @@M_a@@ curve</b>:</p>
<ul>
<li>Wealth up: both IBA and @@M_a@@ rise.</li>
<li>Risk of IBA up (people more risk-averse): less IBA, more @@M_a@@.</li>
<li>Liquidity of IBA up (or people prefer less liquidity): more IBA, less @@M_a@@; people prefer more liquidity: hold more @@M_a@@.</li>
<li>Bond price expected to rise (= interest rate expected to fall): people expect a capital gain, so more IBA and less @@M_a@@.</li>
</ul>
<p><b>Shift of the @@M_t@@ curve</b>:</p>
<ul>
<li>Perfect synchronisation of income payments and receipts: no need to hold @@M_t@@; better synchronisation (monthly wage to weekly wage): hold less @@M_t@@.</li>
<li>Nominal income @@PY@@ up: value of transactions up, @@M_t@@ up (@@M_t=kPY@@). A rise in @@P@@ (if @@Y@@ constant), in @@Y@@ (if @@P@@ constant), or in AD (@@P@@ and @@Y@@ rise in the short run) raises @@PY@@.</li>
<li>More widespread use of electronic money: less cash, @@M_t@@ down. Vertical integration of firms: more market transactions replaced by internal ones, @@M_t@@ down.</li>
<li>Your note: @@Y_d@@ up leads to @@M_t@@ up (2016 Q.19).</li>
</ul>`},
{id:"Y5",t:`C. Money market equilibrium and AD`,zh:`貨幣市場均衡`,src:[S(5,"8")],h:`
<div class="tw"><table>
<tr><th>Change</th><th>Nominal interest rate</th><th>C and I</th><th>AD</th></tr>
<tr><td>Money demand rises</td><td>Rises</td><td>Fall</td><td>Falls</td></tr>
<tr><td>Money supply rises</td><td>Falls</td><td>Rise</td><td>Rises</td></tr>
<tr><td>Both rise</td><td>Uncertain</td><td>Uncertain</td><td>Uncertain</td></tr>
</table></div>
<p>The money supply curve is <b>vertical</b>, so the equilibrium quantity of money is fixed by the supply; a rise in money demand changes only the interest rate.</p>`},
{id:"Y6",t:`D. The quantity theory of money`,zh:`貨幣數量論`,src:[S(5,"8")],h:T`
<div class="box">@@@MV\equiv PY@@@</div>
<p>@@M@@ = money supply; @@V@@ = velocity of circulation; @@P@@ = price level; @@Y@@ = real output; @@PY@@ = nominal output. The <b>equation of exchange</b> is a definitional identity: always true, not refutable by facts, with no predictive power.</p>
<div class="box">@@@M\bar{V}=PY\qquad(\text{assuming } V \text{ constant, and } Y \text{ at } Y_f \text{ in the long run})@@@</div>
<ul>
<li>An increase in @@M@@ leads to an increase in @@PY@@ by the same proportion.</li>
<li><b>Short run:</b> an increase in @@M@@ raises @@P@@ only if @@\%M>\%Y@@.</li>
<li><b>Long run (classical):</b> since @@Y@@ is constant, an increase in @@M@@ raises @@P@@ by the same percentage: <b>money is neutral</b> (it does not affect @@Y@@).</li>
</ul>`}
];

const SEC={A:"Assets and money demand",B:"Equilibrium",C:"Quantity theory"};
q("Y1","A","Concept check",0,"",`Which asset has the <b>highest</b> liquidity?`,[`demand deposits`,`savings deposits`,`cash`,`shares`],"C",`Cash is already a generally accepted medium of exchange and can be exchanged at short notice without loss.`);
q("Y2","A","Concept check",0,"",`Which of the following is the <b>least</b> liquid?`,[`negotiable certificate of deposit`,`time deposit`,`savings deposit`,`demand deposit`],"B",`A time deposit withdrawn before maturity loses interest and may cost a fee: the least liquid deposit. (Real estate and shares are less liquid than any deposit.)`);
q("Y3","A","Concept check",0,"",`Which is <b>not</b> a reason why money is not 100% risk-free?`,[`inflation risk`,`bank run risk`,`exchange rate risk`,`money pays a higher return than bonds`],"D",`Money's nominal return is 0%, the lowest. The three risks are inflation, bank run (default) and exchange rate.`);
q("Y4","A","Concept check",0,"",`The nominal interest rate rises. The quantity of money demanded for asset purposes …`,[`rises, a movement along Ma`,`falls, a movement along Ma`,`rises, a shift of Ma`,`is unchanged`],"B",`Holding money costs the interest forgone: a higher n lowers the quantity demanded, a movement along the Ma curve.`);
q("Y5","A","Concept check",0,"",`The expected inflation rate rises. Which statement is correct?`,[`Ma shifts right`,`the nominal interest rate rises, so the quantity of money for asset purposes falls`,`Mt shifts left`,`the money supply rises`],"B",T`Expected inflation raises the nominal rate (Fisher: @@n=r+\pi^e@@): a movement along Ma, not a shift.`);
q("Y6","A","Concept check",0,"",`People become more risk-averse. The demand for money for asset purposes …`,[`falls`,`rises`,`is unchanged`,`becomes zero`],"B",`Interest-bearing assets are riskier than money, so people hold fewer of them and more money: Ma shifts right.`);
q("Y7","A","Concept check",0,"",`The price level rises (real output constant). Transactions demand for money …`,[`falls`,`rises`,`is unchanged`,`is zero`],"B",T`@@PY@@ rises, so the value of transactions rises: @@M_t=kPY@@ rises.`);
q("Y8","A","Concept check",0,"",`Employers switch from paying monthly wages to paying weekly wages. Transactions demand for money …`,[`rises`,`falls`,`is unchanged`,`doubles`],"B",`Payments and receipts are better synchronised, so people hold less money for transactions.`);
q("Y9","A","Concept check",0,"",`More widespread use of electronic payment will …`,[`raise Mt`,`lower Mt`,`raise Ma`,`have no effect`],"B",`People use less cash, so the transactions demand falls.`);
q("Y10","B","Concept check",0,"",`The central bank buys bonds from banks and the money supply rises. In the money market, the nominal interest rate …`,[`rises, AD falls`,`falls, AD rises`,`is unchanged`,`rises, AD rises`],"B",`Ms shifts right: n falls, so C and I rise, so AD rises.`);
q("Y11","B","Concept check",0,"",`Money demand rises (the Md curve shifts right). Because the money supply curve is vertical, …`,[`the equilibrium quantity of money rises`,`the equilibrium interest rate rises, and the quantity of money is unchanged`,`the equilibrium interest rate falls`,`both rise`],"B",`With a vertical Ms the equilibrium quantity is fixed by the supply: only the interest rate changes.`);
q("Y12","B","Concept check",0,"",`Both money demand and money supply rise. The effect on the interest rate is …`,[`a rise`,`a fall`,`uncertain`,`none`],"C",`Md up raises n, Ms up lowers it: uncertain, so AD is uncertain too.`);
q("Y13","C","Concept check",0,"",T`In the equation of exchange @@MV\equiv PY@@, @@PY@@ is …`,[`real GDP`,`nominal GDP`,`velocity`,`the money supply`],"B",`P is the price level and Y real output: PY is nominal output.`);
q("Y14","C","Concept check",0,"",`In the long run (classical), a 5% rise in the money supply with constant V and Y leads to …`,[`a 5% rise in real output`,`a 5% rise in the price level`,`no change in the price level`,`a 5% fall in V`],"B",T`@@M\bar V=PY@@ with @@V@@ and @@Y@@ constant, so @@P@@ rises by the same percentage: money is neutral.`);
q("Y15","C","Concept check",0,"",`The equation of exchange is …`,[`a positive statement that can be refuted`,`a definitional identity that cannot be refuted by facts`,`a normative statement`,`only true in the long run`],"B",`It is true by definition (a tautology), so it has no predictive power on its own; the quantity theory adds assumptions.`);
q("Y16","C","Concept check",0,"",`In the short run, an increase in M will raise the price level only if …`,[`%M &gt; %Y`,`%M &lt; %Y`,`V falls`,`Y is constant at all times`],"A",T`From @@M\bar V=PY@@, @@\%P\approx\%M-\%Y@@; P rises only if the money supply grows faster than output.`);

const EX=[
{id:"K1",k:"num",t:`Quantity theory in numbers`,stem:T`The money supply is $400 billion, velocity is 3, and real output is 1,200 units. Find the price level @@P@@.`,a:1,u:`price level`,tol:0.001,src:[S(5,"8")],w:T`@@MV=PY@@: @@400\times3=1200=P\times1200@@, so @@P=1@@. If M doubled to 800 with V and Y unchanged, P would double to 2: money is neutral in the long run.`},
{id:"K2",k:"open",t:`Interest rate and AD`,stem:`The central bank sells bonds to the public. Use the money market and AD to trace the effect.`,src:[S(5,"8")],w:`<p>The public pays for bonds with money, so the money supply falls (Ms shifts left). With Md unchanged, the nominal interest rate rises. Higher borrowing costs lower consumption and investment, so AD falls. (Investment falls, so the capital stock grows less, which affects future LRAS, your margin note.)</p>`},
{id:"K3",k:"open",t:`Which demand curve moves?`,stem:`Income rises. A student says money demand for asset purposes rises. Comment.`,src:[S(5,"9")],w:`<p>A rise in income should raise the transactions demand (Mt), not the asset demand. Ma moves with wealth, risk, liquidity and bond-price expectations. (Rising income does increase a person's wealth over time, but in this chapter income is linked to Mt.)</p>`}
];

const LONG=[
{id:"X1",src:`Practice (framework from the notes)`,q:`Explain how an increase in the money supply affects aggregate demand.`,m:`<p>Money supply rises (Ms shifts right). With money demand unchanged, the nominal interest rate falls. The lower borrowing cost raises consumption and investment. So AD rises. (If asked for the effect on output, the AS-AD model is needed; you do not need to explain how the money supply increases, since that earns no marks: just state it.)</p>`},
{id:"X2",src:`Practice (framework from the notes)`,q:`Explain why money is neutral in the long run according to the quantity theory.`,m:T`<p>@@M\bar V=PY@@. With velocity constant and output fixed at @@Y_f@@ (the long-run vertical LRAS), an increase in @@M@@ can only raise the price level, by the same percentage. Output is unaffected, so money is neutral.</p>`}
];

const CS=[
{t:`Common mistakes in the money market`,zh:`常犯錯誤`,src:[S(5,"9"),S(6,"10")],h:`
<div class="tw"><table>
<tr><th>Topic</th><th>Typical mistakes</th></tr>
<tr><td>Portfolio allocation</td><td>Not defining liquidity exactly: leaving out "at short notice" and "without loss"</td></tr>
<tr><td>Factors affecting money demand</td><td>Not noticing some factors cause a movement along the same curve (expected inflation, real interest rate) · thinking a rise in income raises Ma (it raises Mt; a rise in wealth raises Ma)</td></tr>
<tr><td>Bond price and interest rate</td><td>Not knowing bond price and interest rate move in opposite directions · not knowing how an expected rise in bond price affects the asset demand for money</td></tr>
<tr><td>Money market equilibrium</td><td>Thinking higher money demand raises the equilibrium quantity of money (the supply curve is vertical, so only the interest rate changes) · skipping key steps (nominal interest rate, consumption and investment)</td></tr>
<tr><td>Money market with the AS-AD model</td><td>Spending several lines explaining how the policy changes deposit creation and so the money supply: if the question focuses on the effect on aggregate output you need not explain how money supply is affected, just state it</td></tr>
<tr><td>Stabilising the economy</td><td>Not seeing the link between the money market and the goods market: the money market sets the interest rate, which affects C, I and AD; the goods market sets output, which sets nominal output, which sets transactions demand and so the interest rate. In the DSE only the <b>first round</b> of effects is considered</td></tr>
<tr><td>Fiscal versus monetary policy</td><td>No common basis for comparison: compare the two policies' effects on the <b>same</b> economic variable · not knowing monetary policy is limited when the three deposit-creation assumptions fail</td></tr>
</table></div>`}
];

Yupi.register({
 id:"macro8",title:"The money market",
 sub:`Money demand and supply, liquidity, how the interest rate is set, what it does to AD, and the quantity theory of money. From the Macro 8 cheat sheet.`,
 files:{cs:{name:"[CS] Macro 8 The Money Market.pdf",dir:"雞精notes/Macro/",pre:"ma8r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet.`,
 csLead:`The error table from the cheat sheet, summarised in English.`,
 verify:[["Last page of the scan",`The final scan page has a handwritten note about a central bank buying bonds (the effects on M0, MS, ER and L) and a rotated note on budget and trade balances. They repeat Macro 7 and Macro 4 and were not transcribed separately.`,["cs",7,""]]],
 widgets:[{tab:"learn",title:"The money market",init:(el,Y)=>Y.widgets.moneymkt(el,Y)}]
});
})();
