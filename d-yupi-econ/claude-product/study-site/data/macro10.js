/* Macro chapter 10: International finance. Source: [CS] Macro 10 cheat sheet (7 printed pages). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"I1",t:`A. Converting exchange rates`,zh:`匯率轉換`,src:[S(1,"1")],h:T`
<div class="box">@@@1\text{ USD}=7.8\text{ HKD}\qquad \text{USD}\to\text{HKD: }\times7.8\qquad \text{HKD}\to\text{USD: }\div7.8@@@</div>
<ul>
<li>1,000 USD to HKD: one USD is worth 7.8 HKD, so 1,000 USD is worth 1,000 times as much: @@1000\times7.8=7800@@ HKD.</li>
<li>1,000 HKD to USD: one USD costs 7.8 HKD, so 1,000 HKD buys @@1000\div7.8\approx128.3@@ USD.</li>
</ul>`},
{id:"I2",t:`B. Effect of an exchange rate change on export and import value`,zh:`匯率改變對出口總值和進口總值的影響`,src:[S(1,"1")],h:T`
<p>Starred on your copy. Answering steps:</p>
<ol>
<li>Identify the change in the exchange rate (X currency appreciates or depreciates against Y currency).</li>
<li>Identify the change in <b>price</b> from the <b>buyer's</b> perspective.</li>
<li>Work out the change in quantity demanded, and identify whether it is a change in <b>quantity demanded</b> or in <b>demand</b> (check the y-axis).</li>
</ol>
<div class="tw"><table>
<tr><th>If it is a movement along the demand curve</th><th>If it is a shift of the demand curve</th></tr>
<tr><td>The change in @@P\times Q@@ <b>depends on the elasticity of demand</b>: if demand is elastic or inelastic, then %Q is greater or less than %P, so @@P\times Q@@ rises or falls.</td><td>The change in @@P\times Q@@ is <b>certain</b>: demand increases or decreases; the quantity transacted rises or falls; so @@P\times Q@@ rises or falls.</td></tr>
</table></div>
<p>Use the tool at the bottom of this chapter to try numbers.</p>`},
{id:"I3",t:`C. The linked exchange rate system`,zh:`聯繫匯率制度`,src:[S(2,"2")],h:`
<ul>
<li>Structure: the <b>Exchange Fund under the HKMA</b> and the <b>note-issuing banks</b> trade at the <b>linked rate</b> (fixed, 7.8 HKD per USD); the note-issuing banks and the general public trade at the <b>market rate</b> (floating).</li>
<li>Hong Kong dollar banknotes (the monetary base in Hong Kong) are <b>fully backed up by US dollars</b>.</li>
<li>The market rate moves <b>close to the linked rate</b> because of the arbitrage of the note-issuing banks.</li>
<li>The HKMA has to hold a <b>considerable amount of USD</b> to maintain the system.</li>
<li><b>The HKD's rate follows the USD's:</b> when the USD appreciates or depreciates against certain currencies, the HKD does the same against them.</li>
<li><b>No independent monetary policy</b> in Hong Kong: when the US raises its money supply, so does Hong Kong's; when the US raises its interest rate, so does Hong Kong's.</li>
</ul>`},
{id:"I4",t:`D. The balance of payments`,zh:`國際收支平衡`,src:[S(2,"3")],h:T`
<div class="tw"><table>
<tr><th>Account</th><th>Component</th><th>Credit (+)</th><th>Debit (-)</th></tr>
<tr><td rowspan="4"><b>Current account (CA)</b></td><td>1. (Visible) trade balance (net export of goods)</td><td>Export of goods</td><td>Import of goods</td></tr>
<tr><td>2. Invisible trade balance (net export of services: tourism, insurance, education, transport)</td><td>Export of services</td><td>Import of services</td></tr>
<tr><td>3. Net factor income from abroad (primary income: wages, profit or dividend, interest, rent)</td><td>Factor income from abroad</td><td>Factor income to abroad</td></tr>
<tr><td>4. Net current transfer (unilateral transfer, secondary income: remittance, donation, gift)</td><td>Current transfer from abroad</td><td>Current transfer to abroad</td></tr>
<tr><td rowspan="2"><b>Capital and financial account (KFA)</b></td><td>5. Net capital inflow (real assets such as real estate and machinery; financial assets such as shares, bonds, deposits, loans; copyright, trademark and brand names)</td><td>Capital inflow</td><td>Capital outflow</td></tr>
<tr><td>6. Official reserve asset (ORA): foreign currencies held by the HKMA</td><td>Decrease in ORA</td><td>Increase in ORA</td></tr>
</table></div>
<div class="box">@@@\text{BOP balance}=(1)+(2)+(3)+(4)+(5)\qquad\qquad \text{accounting BOP}=(1)+\cdots+(6)=CA+KFA\equiv0@@@</div>
<ul>
<li><b>BOP surplus:</b> ORA increases by the same amount, entered as a <b>debit</b> item. <b>BOP deficit:</b> ORA decreases by the same amount, entered as a <b>credit</b> item.</li>
<li>Your margin notes: "HK to HK: x" and "OC to OC: x": a transaction between two Hong Kong residents, or between two overseas residents, is <b>not</b> a balance-of-payments item.</li>
</ul>`},
{id:"I5",t:`F. Interpreting trade data`,zh:`詮釋貿易數據`,src:[S(3,"5")],h:T`
<p>Your framework (handwritten): (1) state the definition @@NX=X-M@@; (2) state the conditions; (3) conclude.</p>
<ul>
<li><b>Q1.</b> Total export value rises. Does the trade balance necessarily improve? <b>No.</b> @@X\uparrow@@ with imports unchanged raises NX, but if imports rise by more (for example @@X\uparrow<M\uparrow@@), NX falls. Your note: "the three questions are the same".</li>
<li><b>Q2.</b> Exports up 10% and imports up 20%: does it mean the trade balance worsened? Not necessarily: compare <b>absolute</b> changes, not percentages (NX is a difference). Your example: @@TR=P\times Q@@ allows adding or subtracting percentages, but NX does not.</li>
</ul>`}
];

const SEC={A:"Exchange rates",B:"Linked system",C:"Balance of payments"};
q("I1","A","Concept check",0,"",T`1 USD = 7.8 HKD. A tourist exchanges 2,340 HKD. How many USD is that?`,[`300`,`18,252`,`7.8`,`2,332`],"A",T`@@2340\div7.8=300@@ USD.`);
q("I2","A","Concept check",0,"",T`Hong Kong exporters sell at a fixed HKD price. The HKD depreciates against the USD. The price US buyers pay in USD …`,[`rises`,`falls`,`is unchanged`,`doubles`],"B",`One HKD is worth fewer USD, so the same HKD price costs fewer USD.`);
q("I3","A","Concept check",0,"",`The HKD depreciates and the demand of foreign buyers is <b>elastic</b>. Total export value in HKD …`,[`rises`,`falls`,`is unchanged`,`cannot be determined`],"A",T`Price in USD falls; quantity demanded rises by a bigger percentage (elastic): @@P\times Q@@ rises.`);
q("I4","A","Concept check",0,"",`Hong Kong exporters face a <b>rise in the overseas demand</b> (the demand curve shifts right) after a depreciation. The change in total export value is …`,[`certain: it rises`,`certain: it falls`,`uncertain`,`zero`],"A",`A shift of the whole demand curve raises the quantity transacted (and the price), so the change in P×Q is certain.`);
q("I5","A","Concept check",0,"",`When asked about the effect of a depreciation on import value, you first identify …`,[`the quantity of exports`,`the change in price from the buyer's (importer's) perspective`,`government spending`,`the interest rate`],"B",`Step 2 of the framework: price from the buyer's perspective.`);
q("I6","B","Concept check",0,"",`In the linked exchange rate system, Hong Kong dollar banknotes are …`,[`fully backed up by US dollars`,`backed by gold`,`backed by the Hang Seng Index`,`not backed`],"A",`The note-issuing banks hand in USD to the Exchange Fund (at the linked rate) to get the certificates of indebtedness to issue HKD notes.`);
q("I7","B","Concept check",0,"",`The US raises its interest rate. Under the linked exchange rate, Hong Kong's interest rate will …`,[`rise as well`,`fall`,`stay the same`,`be set by the HKMA independently`],"A",`There is no independent monetary policy under the link: Hong Kong's rate follows the US.`);
q("I8","B","Concept check",0,"",`The USD appreciates against the euro. The HKD against the euro …`,[`depreciates`,`appreciates`,`is unchanged`,`is fixed`],"B",`The HKD's rate follows the USD's (the HKD is pegged to the USD but floats against other currencies).`);
q("I9","B","Concept check",0,"",`Which statement about the link is wrong?`,[`the HKMA holds a considerable amount of USD`,`the market rate stays close to the linked rate through arbitrage`,`the USD moves with the HKD`,`Hong Kong has no independent monetary policy`],"C",`The USD's rate does not follow the HKD's; the HKD follows the USD (a common mistake on the sheet).`);
q("I10","C","Concept check",0,"",`A Hong Kong insurer sells a policy to a foreign firm. In the balance of payments this is …`,[`a capital inflow`,`export of services (invisible trade)`,`export of goods`,`a current transfer`],"B",`Insurance is a service, so it belongs to invisible trade (the sheet warns against putting it in the capital account).`);
q("I11","C","Concept check",0,"",`A Hong Kong resident receives dividends from a foreign company. This is …`,[`a capital inflow`,`factor income from abroad`,`export of services`,`a current transfer`],"B",`Dividends are factor income (primary income), a credit item in the current account; the capital flow itself is different.`);
q("I12","C","Concept check",0,"",`A Hong Kong resident sends a gift of money to a relative abroad. This is …`,[`a debit in current transfers`,`a credit in current transfers`,`factor income`,`a capital outflow`],"A",`A unilateral transfer to abroad is a debit (secondary income).`);
q("I13","C","Concept check",0,"",`Hong Kong has a balance of payments surplus. The official reserve assets (ORA) …`,[`decrease, a credit item`,`increase, entered as a debit item`,`are unchanged`,`become negative`],"B",`A surplus means foreign currency flows in; the HKMA's reserves increase, entered as a debit so the accounting balance is zero.`);
q("I14","C","Concept check",0,"",T`Which equation always holds in the accounting balance of payments?`,[T`@@CA+KFA>0@@`,T`@@CA+KFA\equiv0@@ (including ORA)`,T`@@CA=KFA@@`,T`@@CA=0@@`],"B",`Including the official reserve item, the accounting balance of payments always sums to zero.`);
q("I15","C","Concept check",0,"",`Exports rise by 10% and imports rise by 20%. Net exports …`,[`certainly fall`,`certainly rise`,`may rise, fall or stay the same, depending on the original values`,`are unchanged`],"C",T`@@NX=X-M@@ is a difference of values: compare absolute changes. If exports were much larger than imports, @@+10\%\,X@@ can exceed @@+20\%\,M@@.`);

const EX=[
{id:"H1",k:"num",t:`Convert`,stem:T`How many HKD can you get for 500 USD at 1 USD = 7.8 HKD?`,a:3900,u:`HKD`,tol:0.5,src:[S(1,"1")],w:T`@@500\times7.8=3900@@ HKD.`},
{id:"H2",k:"num",t:`Net exports with percentages`,stem:T`Exports are $200 billion and imports $100 billion. Exports rise 10% and imports rise 20%. Find the change in net exports ($ billion).`,a:0,u:`$ billion`,tol:0.01,src:[S(3,"5")],w:T`Exports: @@+20@@. Imports: @@+20@@. @@\Delta NX=20-20=0@@. NX stays at 100: the larger percentage on the smaller base gives the same amount. Always compare absolute changes.`},
{id:"H3",k:"open",t:`Is it a BOP item?`,stem:`A Hong Kong resident buys a flat from another Hong Kong resident. Which balance-of-payments item is this?`,src:[S(2,"3")],w:`<p>None. Both parties are Hong Kong residents (your margin note: "HK to HK: x"), so there is no international transaction. (If a foreign resident bought the flat it would be a capital inflow.)</p>`}
];

const LONG=[
{id:"S1",src:`Practice (framework from the notes)`,q:`Explain why Hong Kong has no independent monetary policy under the linked exchange rate system.`,m:`<p>The HKD is fixed to the USD (7.8) and the HKMA must keep the market rate close to it. If Hong Kong's interest rate or money supply moved away from the US's, arbitrage and capital flows would put pressure on the link. So when the US raises its money supply or interest rate, Hong Kong's follows. The HKMA cannot set its own interest rate or money supply to stabilise the economy.</p>`},
{id:"S2",src:`Practice (framework from the notes)`,q:`Explain, with the balance of payments, how a rise in Hong Kong's exports of services can lead to an increase in official reserve assets.`,m:T`<p>Export of services is a credit in invisible trade, so it raises the current account and, other things equal, creates a <b>BOP surplus</b>. Foreign currency flows in, so the HKMA's official reserve assets increase by the same amount, entered as a debit item so that @@CA+KFA\equiv0@@ in the accounting balance.</p>`}
];

const CS=[
{t:`Common mistakes in international finance`,zh:`常犯錯誤`,src:[S(4,"6"),S(4,"7")],h:`
<div class="tw"><table>
<tr><th>Topic</th><th>Typical mistakes</th></tr>
<tr><td>Currency exchange</td><td>Never sure how to convert (multiply or divide)</td></tr>
<tr><td>Effect of an exchange rate change on export or import value</td><td>Not distinguishing a movement along the demand curve from a shift of the whole curve · these questions need several variables analysed at once, so students without practice get lost</td></tr>
<tr><td>Competitiveness of exports</td><td>Not knowing that one country's exports can be substitutes for another's, so they compete</td></tr>
<tr><td>Linked exchange rate system</td><td>Thinking Hong Kong's money supply is entirely backed by USD · thinking that when the HKD appreciates or depreciates against another currency the USD follows it (the HKD follows the USD) · not knowing Hong Kong has no independent monetary policy</td></tr>
<tr><td>Components of the balance of payments</td><td>Hard to tell visible from invisible trade · thinking insurance is a capital-account item (it is a service) · counting items with no international payment (purely local transactions) · not knowing copyright transactions belong to the capital account · unclear definition of unilateral transfer · mixing up capital flow and factor income · forgetting the definition of a resident (it decides whether spending is local consumption or tourist spending, and whether income is factor income paid abroad) · not knowing that Hong Kong's invisible trade is usually in surplus, and that this surplus pays for imports, offsetting the visible trade deficit</td></tr>
<tr><td>The official reserve assets account</td><td>Not seeing why a balance of payments <b>surplus</b> raises official reserves, or why a rise in reserves is entered as a <b>negative</b> (debit) · not knowing the difference between the "accounting" balance of payments and the balance of payments (the first always equals zero) · not knowing CA + KFA = 0 or how to use it</td></tr>
<tr><td>Interpreting trade data</td><td>Not writing the definition of trade balance first (and losing marks) · comparing percentage changes of exports and imports to find the change in net exports · reading a year-on-year change as a seasonal change</td></tr>
<tr><td>Data response and essay questions</td><td>Not making the most of the time to write as many arguments as possible</td></tr>
</table></div>`}
];

Yupi.register({
 id:"macro10",title:"International finance",
 sub:`Exchange-rate conversion, what a currency change does to export and import values, the linked exchange rate system, the balance of payments and trade data. From the Macro 10 cheat sheet.`,
 files:{cs:{name:"[CS] Macro 10 International Finance.pdf",dir:"雞精notes/Macro/",pre:"ma10r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet.`,
 csLead:`The error table from the cheat sheet, summarised in English.`,
 verify:[["Page 3 and 4 are the same table",`The balance of payments table on page 3 (English) is repeated in Chinese on page 4; only the English version is used. The page is rotated in the original scan, and your handwritten margin brackets ("BOP account", "HK to HK x", "OC to OC x") are written up in card D.`,["cs",2,"3"]]],
 widgets:[{tab:"learn",title:"Exchange rates and the balance of payments",init:(el,Y)=>Y.widgets.fx(el,Y)}]
});
})();
