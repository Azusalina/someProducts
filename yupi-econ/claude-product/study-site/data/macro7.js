/* Macro chapter 7: Deposit creation. Source: [CS] Macro 7 cheat sheet (5 printed pages and a handwritten checklist). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"R1",t:`A. Definitions`,zh:`定義`,src:[S(1,"1")],h:T`
<div class="tw"><table>
<tr><th>Term</th><th>Meaning</th></tr>
<tr><td>Bank</td><td>A financial intermediary that channels people's savings into investments</td></tr>
<tr><td>Money supply</td><td>@@MS=C_p+D@@: cash in public circulation plus deposits in banks</td></tr>
<tr><td>Monetary base (M0)</td><td>@@M_0=C_p+R@@: cash in public circulation plus reserves in banks, which is the <b>total legal tender issued</b></td></tr>
<tr><td>Maximum banking multiplier</td><td>@@\dfrac{1}{\text{required reserve ratio}}@@</td></tr>
<tr><td>Actual banking multiplier</td><td>@@\dfrac{1}{\text{actual reserve ratio}}@@ (if there is no cash leakage)</td></tr>
</table></div>`},
{id:"R2",t:`B. Required reserves and excess reserves`,zh:`法定儲備與超額儲備`,src:[S(1,"1")],h:T`
<p>A bank's balance sheet after a $100 deposit, with a 20% required reserve ratio:</p>
<div class="tw"><table><tr><th>Assets</th><th></th><th>Liabilities</th><th></th></tr><tr><td>Reserves</td><td class="n">100 (required 20 + excess 80)</td><td>Deposits</td><td class="n">100</td></tr><tr><td>Loans</td><td class="n">0</td><td></td><td></td></tr></table></div>
<div class="box">@@@\text{excess reserves}=\text{reserves}-\text{required reserves}@@@</div>
<p>Common error: a $100 deposit does <b>not</b> raise excess reserves by $100. Part of it must be held as required reserves, so excess reserves rise by less than $100 (here $80).</p>`},
{id:"R3",t:`C. Deposit creation and contraction`,zh:`存款創造與收縮`,src:[S(1,"1")],h:`
<div class="tw"><table>
<tr><th>Creation (excess reserves &gt; 0)</th><th>Contraction (reserve shortage, ER &lt; 0)</th></tr>
<tr><td>1. Banks lend out excess reserves.<br>2. The public redeposits the loans into the banking system.<br>3. The process goes on and on (until ER = 0 if it reaches the maximum).</td><td>1. Banks call in loans (and so further...).<br>2. The public withdraws money from the banking system to repay.<br>3. The process goes on until the reserve shortage is eliminated.</td></tr>
</table></div>
<p>Your handwritten checklist (page 5) for any deposit-creation question: <b>(1)</b> work out the required reserve ratio; <b>(2)</b> new reserves; <b>(3)</b> new deposits, then find the new deposit @@\Delta D@@, new money supply @@\Delta MS@@ and new loans @@\Delta L@@, remembering the change in cash held by the public @@\Delta C_p@@. And the story: the public deposits cash, @@D@@ rises, reserves rise so banks can lend, loans rise, redeposit, @@D@@ rises again by several times. Since MS includes D, MS rises too (legal tender enters the banking system).</p>`},
{id:"R4",t:`D. Maximum possible deposits and loans`,zh:`計算最大可能存款及貸款值`,src:[S(2,"2")],h:T`
<p>Start from a balance sheet with reserves 100, loans 0 (and excess reserves 0 after the process). The increase in loans equals the increase in deposits and is the <b>sum of a geometric series</b>:</p>
<div class="box">@@@\Delta L=\Delta D=\text{first increase in loans}\times\dfrac{1}{RRR}@@@@@@\text{maximum deposits}=\text{reserves}\times\dfrac{1}{RRR}@@@</div>
<p>Your worked example: reserves 100, RRR 20%, so maximum deposits @@=100\times5=500@@, and the new loans are @@500-100=400@@. (The scan shows actual deposits of 200 for illustration, against a maximum of 500.)</p>
<p>The tool below shows the series round by round.</p>`},
{id:"R5",t:`E. Three assumptions and the actual multiplier`,zh:`三大假設`,src:[S(2,"2")],h:T`
<p>Deposits are always a multiple of reserves. Under a <b>fractional reserve system</b>, banks have excess reserves to lend, and deposits are created when the public redeposits the loans.</p>
<p><b>Conditions for maximum deposits:</b></p>
<ol>
<li>Banks decide to loan out <b>all</b> excess reserves.</li>
<li>There is <b>sufficient demand for loans</b>.</li>
<li><b>No cash leakage</b> (the public redeposits all of the money; electronic payments help).</li>
</ol>
<p>If these hold the <b>actual</b> multiplier equals the maximum. If not, @@\text{actual deposits}<\text{maximum}@@.</p>
<ul>
<li>From the formula @@\text{max } D=R\times\dfrac{1}{RRR}@@: a rise in @@R@@ raises max @@D@@; a fall in RRR raises max @@D@@.</li>
<li>Satisfying more of the three conditions raises the actual multiplier.</li>
<li>Your note: two kinds of factor: factors that change the <b>actual</b> multiplier (the three assumptions, ARR) and factors that change the <b>maximum</b> multiplier (the RRR, set by the central bank).</li>
</ul>`},
{id:"R6",t:`F. Monetary policies`,zh:`貨幣政策`,src:[S(3,"3")],h:`
<div class="tw"><table>
<tr><th>Policy</th><th>Chain</th></tr>
<tr><td><b>Lower the required reserve ratio</b></td><td>Required reserves fall and excess reserves rise; banks lend out more; more loans are redeposited; deposits and money supply rise (the banking multiplier rises). The <b>amount</b> of reserves is unchanged; only the split between required and excess changes.</td></tr>
<tr><td><b>Open market purchase of bonds from banks</b> (printing money)</td><td>Reserves rise; banks lend out more excess reserves; more loans are redeposited; D and MS rise (monetary base rises)</td></tr>
<tr><td><b>Open market purchase of bonds from the non-bank public</b></td><td>Cash held by the public rises, so MS rises directly (monetary base rises). If the public deposits the money into a bank, the effect is the same as buying from banks</td></tr>
<tr><td><b>Lower the discount rate</b></td><td>Banks borrow more from the central bank (discount window); reserves rise; they lend out more excess reserves; more loans redeposited; D and MS rise (monetary base rises)</td></tr>
</table></div>
<ul>
<li><b>Discount rate</b>: interest charged on commercial banks for short-term loans borrowed from the <b>central bank</b> via the discount window. <b>Interbank rate</b>: interest charged for short-term loans borrowed from <b>another commercial bank</b>.</li>
<li>Buying from the public has a weaker effect on money supply than buying from banks (the public may keep the cash rather than deposit it).</li>
</ul>`}
];

const SEC={A:"Definitions and reserves",B:"Deposit creation",C:"Policies"};
q("R1","A","Concept check",0,"",T`Cash held by the public is 300 and reserves held by banks are 200. The monetary base M0 is …`,[`100`,`200`,`300`,`500`],"D",T`@@M_0=C_p+R=300+200=500@@, the total legal tender issued.`);
q("R2","A","Concept check",0,"",T`Cash held by the public is 300 and deposits in banks are 1,000. The money supply is …`,[`300`,`700`,`1,000`,`1,300`],"D",T`@@MS=C_p+D=300+1000=1300@@.`);
q("R3","A","Concept check",0,"",T`The required reserve ratio is 10%. The maximum banking multiplier is …`,[`0.1`,`5`,`10`,`100`],"C",T`@@\dfrac{1}{0.10}=10@@.`);
q("R4","A","Concept check",0,"",T`A bank has a $100 deposit and a 20% required reserve ratio, and holds no loans. Its excess reserves are …`,[`$20`,`$80`,`$100`,`$120`],"B",T`Required reserves @@=20@@, excess reserves @@=100-20=80@@.`);
q("R5","A","Concept check",0,"",T`A customer deposits $100 of cash in a bank with a 20% required reserve ratio. Immediately after, total excess reserves of the bank …`,[`rise by $100`,`rise by $80`,`rise by $20`,`do not change`],"B",`Only the part not needed as required reserves is excess: $100 less $20.`);
q("R6","B","Concept check",0,"",T`Reserves are $200 million, the required reserve ratio is 20% and the banks lend out all excess reserves with no cash leakage. Maximum total deposits are …`,[`$400 million`,`$800 million`,`$1,000 million`,`$1,200 million`],"C",T`@@200\times\dfrac{1}{0.2}=1000@@ million.`);
q("R7","B","Concept check",0,"",T`A new deposit of $1,000 enters a banking system with a 25% required reserve ratio and no leakage. The total <b>increase in deposits</b> (including the first deposit) is …`,[`$2,500`,`$3,000`,`$4,000`,`$5,000`],"C",T`@@1000\times\dfrac{1}{0.25}=4000@@. The new <b>loans</b> created are @@4000-1000=3000@@.`);
q("R8","B","Concept check",0,"",`Which condition is <b>not</b> needed for the maximum deposit creation?`,[`banks lend out all excess reserves`,`there is sufficient demand for loans`,`there is no cash leakage`,`banks must hold excess reserves`],"D",`At the maximum, excess reserves end at zero because banks lend them all.`);
q("R9","B","Concept check",0,"",`The public starts to keep more cash instead of depositing it. The actual banking multiplier …`,[`rises`,`falls`,`is unchanged`,`equals the maximum multiplier`],"B",`More cash leakage lowers the actual multiplier below the maximum.`);
q("R10","B","Concept check",0,"",`Banks face a reserve shortage. Which describes the process?`,[`banks lend out more, deposits rise`,`banks call in loans, the public withdraws money, deposits fall`,`the central bank prints money`,`nothing happens`],"B",`Contraction: call in loans, the public withdraws money from the banking system to repay, until the shortage is gone.`);
q("R11","C","Concept check",0,"",`The central bank lowers the required reserve ratio. Compared with before, the <b>amount</b> of reserves held by banks …`,[`rises`,`falls`,`is unchanged`,`becomes zero`],"C",`Only the split between required and excess changes; excess reserves rise, so banks lend more and the money supply rises.`);
q("R12","C","Concept check",0,"",`The central bank buys government bonds from <b>commercial banks</b>. Immediately, …`,[`banks' reserves rise`,`cash held by the public rises`,`the discount rate falls`,`required reserves fall`],"A",`Banks receive money for their bonds, so reserves rise. (If the bonds were bought from the public, the cash would go to the public instead.)`);
q("R13","C","Concept check",0,"",`Which open market operation affects the money supply <b>more strongly</b>?`,[`buying bonds from the non-bank public`,`buying bonds from banks`,`they are always the same`,`neither changes the money supply`],"B",`Bank reserves rise and multiply through lending; the public may keep the cash it receives, which does not multiply.`);
q("R14","C","Concept check",0,"",`The central bank lowers the discount rate. Banks …`,[`borrow less from the central bank`,`borrow more from the central bank, raising reserves and loans`,`call in loans`,`raise the required reserve ratio`],"B",`Cheaper borrowing from the central bank raises reserves, so banks lend more and deposits rise.`);
q("R15","C","Concept check",0,"",`The interest rate charged by one commercial bank to another for short-term loans is the …`,[`discount rate`,`interbank rate`,`required reserve ratio`,`deposit rate`],"B",`Interbank rate: borrowing from another commercial bank. The discount rate is for borrowing from the central bank.`);

const EX=[
{id:"P1",k:"num",t:`Maximum deposits`,stem:T`Banks hold reserves of $500 million. The required reserve ratio is 12.5%. There is no leakage and all excess reserves are lent. Find the maximum deposits ($ million).`,a:4000,u:`$ million`,tol:0.5,src:[S(2,"2")],w:T`@@\text{max } D=500\times\dfrac{1}{0.125}=500\times8=4000@@ million. Remember the units (million) and the dollar sign in your answer.`},
{id:"P2",k:"num",t:`New loans created`,stem:T`A new deposit of $2,000 is made into a bank. The required reserve ratio is 20%. With the maximum process and no leakage, how much new <b>loans</b> are created in total ($)?`,a:8000,u:`dollars`,tol:0.5,src:[S(1,"1")],w:T`Total deposits @@=2000\times5=10000@@; the new loans @@=10000-2000=8000@@. (The first $2,000 deposit is not a loan.)`},
{id:"P3",k:"open",t:`Explain a deposit-creation question`,stem:`The public deposits $100 of cash they had been holding. Explain what happens to deposits and the money supply (RRR is 20%).`,src:[S(4,"")],w:T`<p>@@D@@ rises by 100 and the public's cash falls by 100, so the money supply @@MS=C_p+D@@ is <b>unchanged at first</b> (the monetary base is also unchanged). Banks hold 20 as required reserves and lend out 80, which is redeposited... until total deposits @@=100\times5=500@@, so @@\Delta D=500@@ and @@\Delta L=400@@, and since cash fell by 100, @@\Delta MS=500-100=400@@.</p>`}
];

const LONG=[
{id:"Q1",src:`Practice (framework from the notes)`,q:`Explain how a fall in the required reserve ratio can lead to an increase in the money supply.`,m:`<p>Required reserves fall and excess reserves rise. Banks lend out the extra excess reserves; the public redeposits the loans; the process repeats. Deposits rise, and since MS includes deposits, MS rises. Maximum banking multiplier @@1/RRR@@ rises. The total reserves do not change; only the split between required and excess does.</p>`},
{id:"Q2",src:`Practice (framework from the notes)`,q:`Explain why the actual banking multiplier may be less than the maximum one.`,m:`<p>The maximum requires three conditions. (1) Banks may decide <b>not</b> to lend out all their excess reserves (so they keep some). (2) There may be <b>insufficient demand for loans</b>. (3) There may be <b>cash leakage</b>: some of the loans are held as cash instead of redeposited. When any of these fails, less is redeposited at each round, so the actual multiplier is smaller.</p>`}
];

const CS=[
{t:`Common mistakes with deposit creation`,zh:`常犯錯誤`,src:[S(4,"4"),S(4,"5")],h:`
<div class="tw"><table>
<tr><th>Topic</th><th>Typical mistakes</th></tr>
<tr><td>Immediate effects</td><td>Thinking a $100 deposit raises excess reserves by $100 (some must be held as required reserves) · forgetting excess reserves = reserves minus required reserves, so the change in ER is the rise in reserves less the rise in required reserves · after the process, not seeing why excess reserves equal zero and required reserves equal total reserves · misreading: asked for the change in loans but calculating deposits; asked for money supply but calculating deposits · forgetting the unit (million) and the dollar sign · using one formula straight to the answer and making a slip (show steps)</td></tr>
<tr><td>Deposit creation and contraction</td><td>Thinking deposit creation lowers reserves (reserves are lent out, but redeposits restore them)</td></tr>
<tr><td>Initial deposit or withdrawal</td><td>Forgetting an initial deposit or withdrawal changes the <b>proportion</b> of reserves and circulating cash within the monetary base (deposit: reserves up, cash down by the same amount, monetary base unchanged)</td></tr>
<tr><td>Currency in circulation</td><td>Forgetting the change in cash held by the public when finding the money supply change</td></tr>
<tr><td>Directly calculating the change</td><td>Few know how to use the geometric series for deposits and loans</td></tr>
<tr><td>Adjusting the required reserve ratio</td><td>Thinking a higher RRR makes reserves rise (the amount of reserves does not change; only the ratio of excess to required)</td></tr>
<tr><td>Injecting newly printed money</td><td>Not knowing the monetary base equals the total issue of legal tender, so printing money raises the base directly</td></tr>
<tr><td>Open market operations</td><td>Not knowing the central bank can buy bonds from the public or banks, and that buying from the public has a weaker effect on money supply</td></tr>
<tr><td>Monetary base, multiplier and creation ability</td><td>Not explaining deposit creation (multiplier greater than one) as the reason money supply is a multiple of the monetary base · not knowing the fractional reserve system is a necessary condition · thinking excess reserves must be held because loan demand is low, or because banks choose to (either may be the reason) · not seeing that the actual multiplier depends on the three assumptions · not knowing more electronic payment means the public deposits more, reserves rise and cash leakage falls</td></tr>
<tr><td>Calculations (advanced)</td><td>Mistaking what the question gives (the final change in deposits) and working out the maximum instead · not knowing where to start if deposits have not reached the maximum</td></tr>
</table></div>`}
];

Yupi.register({
 id:"macro7",title:"Deposit creation",
 sub:`Reserves, the money multiplier, deposit creation and contraction, the three assumptions, and how monetary policy works through banks. From the Macro 7 cheat sheet.`,
 files:{cs:{name:"[CS] Macro 7 Deposit Creation.pdf",dir:"雞精notes/Macro/",pre:"ma7r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet, with the arithmetic worked after each answer.`,
 csLead:`The error table from the cheat sheet, summarised in English.`,
 verify:[["Handwritten worked example",`The numbers beside the diagram on page 2 (100, 200, 500, 5, "actual < max") are dense and partly cut off, so the example in card D is rebuilt from the formula rather than copied. The handwritten checklist on page 5 is written up in card C; open the badge to see it.`,["cs",3,"4"]]],
 widgets:[{tab:"learn",title:"Deposit creation, round by round",init:(el,Y)=>Y.widgets.deposit(el,Y)}]
});
})();
