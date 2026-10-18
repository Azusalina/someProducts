/* Macro chapter 9: International trade. Source: [CS] Macro 9 cheat sheet (cover, 6 printed pages, a handwritten redraw of page 5). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"V1",t:`A. Absolute and comparative advantage`,zh:`絕對優勢與比較優勢`,src:[S(2,"1")],h:T`
<div class="tw"><table>
<tr><th>Absolute advantage</th><th>Comparative advantage</th></tr>
<tr><td>More productive than another country: a higher output-input ratio; same input, more output; same output, less input.</td><td>Lower <b>opportunity cost</b> of producing X than another country: forgo fewer units of Y to produce X; 1 unit of X can be exchanged for fewer units of Y. If a country has a CA in X, the other has a CA in Y (comparative disadvantage).</td></tr>
<tr><td><b>How to identify:</b> input table: which country needs fewer inputs for the same output? Output table: which produces more with the same input? "All resources": check that the two countries own the same resources; if not told, you cannot decide. If told "A's resources are double B's", convert the table to "if A used the same resources as B". "And": check that resource allocation is the same; if not, convert to "output if all resources are used on X or on Y".</td><td><b>How to calculate opportunity cost:</b> input table: calculate it as if you were buying things. Output table: divide by the coefficient. If either X or Y is made (10X or 20Y) then @@10X=20Y@@. If resources are evenly allocated (10X and 10Y... as 10X and 20Y) then @@10X=20Y@@; if unevenly allocated, convert the table to "output if all resources are used on X or on Y".</td></tr>
</table></div>
<div class="note">Comparative advantage compares <b>countries</b>, not goods. And "OC of 1Y is lower than the OC of 1X" does not mean a CA in Y (different units: the OC of Y is in X, the OC of X is in Y). Compare the OC of <b>the same good</b> across the two countries.</div>`},
{id:"V2",t:`B. Gains from trade`,zh:`貿易的賺獲`,src:[S(3,"2")],h:T`
<p>Example from the sheet: country A's OC of X is @@0.25Y@@, country B's OC of X is @@1Y@@; the terms of trade (TOT) are set at @@1X=0.6Y@@.</p>
<ul>
<li><b>Range of terms of trade:</b> @@0.25Y<1X<1Y@@ (between the two opportunity costs, in units of Y per X).</li>
<li><b>Total potential gain</b> for both countries @@=@@ the difference in OC @@=1Y-0.25Y=0.75Y@@ per unit of X.</li>
<li>Per unit gain of the exporter @@=0.6Y-0.25Y=0.35Y@@. Per unit gain of the importer @@=1Y-0.6Y=0.4Y@@ (these add to 0.75Y).</li>
</ul>
<p><b>Three steps</b> to calculate the gain: (1) convert the TOT so it is per unit of the good in question (@@1X=???Y@@); (2) calculate the per-unit gain (draw a number line); (3) multiply by the units exported or imported to get the total gain. Express the gain in other units either by finding the gain from trading other goods or by converting with OC.</p>
<p>One country has a CA in X, so its OC of X is lower, so the OC difference @@>0@@, total potential gain @@>0@@, so trade is possible: <b>comparative advantage is the basis of trade</b>.</p>`},
{id:"V3",t:`C. Gains from trade with transport costs`,zh:`有運費的貿易`,src:[S(3,"2")],h:T`
<p>Suppose a transport cost of @@0.1Y@@ per unit of X to each country. The importer pays it, so the terms of trade must be narrower:</p>
<ul>
<li>Range of terms of trade: @@0.25Y+0.1Y<1X<1Y-0.1Y@@, that is @@0.35Y<1X<0.9Y@@.</li>
<li>Total potential gain @@=@@ OC difference @@-@@ transport cost @@=1Y-0.25Y-0.2Y=0.55Y@@ (the 0.2Y counts a 0.1Y cost on each side).</li>
<li>If the OC difference is <b>less than</b> the transport cost, there is no potential gain after the cost, so <b>trade is not possible</b>.</li>
</ul>
<p>Common error: the importer bears the cost, which lowers the <b>upper</b> limit of the mutually beneficial terms of trade; it is because the price the importer is willing to pay has fallen.</p>`},
{id:"V4",t:`D. Production and consumption before and after trade`,zh:`貿易前後的生產和消費`,src:[S(3,"3")],h:`
<p><b>Principle of comparative advantage:</b> if each economy <b>specialises</b> in producing the good in which it has a comparative advantage, then the total output of all economies would increase. (The principle is not the same as "comparative advantage".)</p>
<ol>
<li>Without trade an economy is self-sufficient, so <b>production = consumption</b>.</li>
<li>With specialisation, production changes, so you can calculate the opportunity cost from it.</li>
<li>With trade, production differs from consumption. The difference reflects export and import volumes (and the terms of trade).</li>
<li>With trade, consumption is usually <b>higher</b> than before trade: this is the gain from trade.</li>
</ol>`},
{id:"V5",t:`E. Tariff in a small open economy`,zh:`小型開放經濟的關稅`,src:[S(4,"4")],h:T`
<p>Apples in Hong Kong: the world price @@P_w@@ is fixed (a small economy cannot change it). Imports are @@Q_m=Q_d-Q_s@@.</p>
<ul>
<li>A tariff @@t@@ lifts the domestic price from @@P_1=P_w@@ to @@P_2=P_w+t@@. Local supply rises from @@Q^{P}_1@@ to @@Q^{P}_2@@; consumption falls from @@Q^{C}_1@@ to @@Q^{C}_2@@; imports fall from @@Q^{M}_1@@ to @@Q^{M}_2@@.</li>
<li><b>Tariff revenue</b> @@=t\times Q^{M}_2@@ (the shaded rectangle).</li>
</ul>`},
{id:"V6",t:`F. Quota in a small open economy`,zh:`小型開放經濟的配額`,src:[S(4,"4")],h:T`
<ul>
<li>A quota @@\bar Q@@ limits imports directly: the supply curve becomes @@S_d@@ plus the quota. The domestic price rises to @@P_2@@ where @@Q_d-Q_s=\bar Q@@.</li>
<li><b>Quota rent</b> @@=(P_2-P_w)\times\bar Q@@ (the shaded rectangle). It goes to whoever holds the import licences, unless the government sells the quotas.</li>
<li>Your note: an increase in the quota lowers the domestic price toward @@P_w@@ and shrinks the quota rent.</li>
</ul>`},
{id:"V7",t:`G. Tariff versus quota`,zh:`關稅 vs 配額`,src:[S(4,"4")],h:`
<div class="tw"><table>
<tr><th></th><th>Tariff</th><th>Quota</th></tr>
<tr><td>Is the fall in import volume certain?</td><td>No: a tariff reduces imports <b>indirectly</b> by raising the price; the actual fall depends on elasticities</td><td>Yes: import volume is directly fixed</td></tr>
<tr><td>Government revenue?</td><td>Yes: tariff revenue</td><td>Not necessarily (unless the government sells the quota and takes the quota rent)</td></tr>
<tr><td>Is import volume stable?</td><td>No: Qm can fluctuate as D, S or Pw change</td><td>Yes: Qm is fixed by the quota</td></tr>
</table></div>`},
{id:"V8",t:`H. Trade barriers: selected diagrams`,zh:`貿易壁壘(其中一些圖)`,src:[S(5,"5"),S(6,"")],h:`
<p>The sheet has a 2 by 4 grid to be drawn (tariff and quota against: increase in demand, decrease in supply, decrease in world price, decrease in tariff or quota). Page 5 of your copy has your hand-drawn answers for the first column (demand rises) with the question numbers 15, 16, 21 and 19, 22.</p>
<p>Key results (use the widget below to check each):</p>
<ul>
<li><b>Demand rises</b> (D shifts right): with a tariff, the domestic price stays at @@P_w+t@@, domestic output is unchanged, imports rise and tariff revenue rises. With a quota the domestic price rises (the fixed import quantity meets a larger demand) and quota rent rises.</li>
<li><b>World price falls:</b> with a tariff the domestic price falls by the same amount; with a quota the domestic price falls by less (quota rent per unit rises or falls with the gap).</li>
<li><b>Tariff or quota reduced:</b> price falls, imports rise, and revenue or rent changes depend on the size of the cut.</li>
</ul>`}
];

const SEC={A:"Advantage",B:"Gains from trade",C:"Tariffs and quotas"};
q("V1","A","Concept check",0,"",`Country A produces 10 units of X per worker per day and country B produces 6 units. A has …`,[`a comparative advantage in X`,`an absolute advantage in X`,`a comparative disadvantage in X`,`no advantage`],"B",`Higher output per unit of input: absolute advantage. Whether it also has a comparative advantage depends on opportunity cost, which needs the Y data too.`);
q("V2","A","Concept check",0,"",T`In country A, 1 hour makes 4 shirts or 2 phones. Its opportunity cost of one phone is …`,[`0.5 shirt`,`2 shirts`,`4 shirts`,`8 shirts`],"B",T`@@4\text{ shirts}=2\text{ phones}@@, so @@1\text{ phone}=2\text{ shirts}@@. Opportunity cost of Y in X is output of X divided by output of Y.`);
q("V3","A","Concept check",0,"",T`Country A: OC of 1X is 0.5Y. Country B: OC of 1X is 2Y. Which statement is correct?`,[`A has a comparative advantage in X`,`B has a comparative advantage in X`,`A has a comparative advantage in Y`,`neither can gain from trade`],"A",`A's opportunity cost of X is lower (0.5Y against 2Y): A has the comparative advantage in X, and B in Y. Trade is possible because the OCs differ.`);
q("V4","A","Concept check",0,"",`A student says "the OC of Y is lower than the OC of X, so we have a comparative advantage in Y". The mistake is …`,[`OC of Y and OC of X are in different units, so they cannot be compared; compare the same good across countries`,`there is no mistake`,`comparative advantage is about absolute amounts`,`OC should be measured in dollars`],"A",`Comparative advantage compares two <b>countries</b> on the same good.`);
q("V5","A","Concept check",0,"",`If two countries have exactly the same opportunity costs, …`,[`there is a big gain from trade`,`there is no potential gain from trade`,`one must have an absolute advantage in everything`,`transport costs are zero`],"B",`No difference in OC means no total potential gain: comparative advantage is the basis of trade.`);
q("V6","B","Concept check",0,"",T`Country A's OC of 1X is 0.25Y; B's is 1Y. The range of terms of trade is …`,[`0.25Y &lt; 1X &lt; 1Y`,`1Y &lt; 1X &lt; 4Y`,`0 &lt; 1X &lt; 0.25Y`,`1X = 0.25Y exactly`],"A",`Between the two opportunity costs, in units of Y per X.`);
q("V7","B","Concept check",0,"",T`With terms of trade 1X = 0.6Y (A's OC 0.25Y, B's OC 1Y), the exporter's (A's) gain per unit of X is …`,[`0.25Y`,`0.35Y`,`0.4Y`,`0.75Y`],"B",T`@@0.6Y-0.25Y=0.35Y@@ (the exporter receives 0.6Y for something that costs it 0.25Y). The importer gains @@1Y-0.6Y=0.4Y@@.`);
q("V8","B","Concept check",0,"",T`The total potential gain per unit of X is 0.75Y. A transport cost of 0.1Y per unit is borne by <b>each</b> country (0.2Y total). The total potential gain after transport costs is …`,[`0.75Y`,`0.65Y`,`0.55Y`,`0.35Y`],"C",T`@@0.75Y-0.2Y=0.55Y@@ (the sheet's example).`);
q("V9","B","Concept check",0,"",`The OC difference between two countries is less than the transport cost. Then …`,[`trade is still beneficial`,`there is no potential gain after the cost, so trade will not happen`,`the exporter gains all`,`the importer gains all`],"B",`If OC difference &lt; transport cost, there is no total potential gain left.`);
q("V10","B","Concept check",0,"",`After specialisation and trade, a country's consumption is usually …`,[`lower than before trade`,`the same as production`,`higher than before trade`,`zero`],"C",`With trade, production differs from consumption, and consumption is usually higher: the gain from trade. Without trade, production equals consumption.`);
q("V11","C","Concept check",0,"",`A tariff is imposed in a small open economy. Compared with free trade …`,[`domestic price falls, imports rise`,`domestic price rises, imports fall, and there is tariff revenue`,`domestic price is unchanged`,`world price rises`],"B",`The domestic price rises by the tariff; local supply rises, consumption falls, imports fall; revenue is the tariff times the remaining imports.`);
q("V12","C","Concept check",0,"",T`World price $40, tariff $10, and at the new price domestic demand is 50 and supply is 30. Tariff revenue is …`,[`$200`,`$300`,`$400`,`$500`],"A",T`Imports @@=50-30=20@@. Revenue @@=10\times20=200@@.`);
q("V13","C","Concept check",0,"",`Which is <b>certain</b> about a quota but not about a tariff?`,[`the fall in import volume`,`government revenue`,`a lower domestic price`,`consumer surplus rises`],"A",`A quota fixes the import volume directly. A tariff reduces imports indirectly through the price, so the fall depends on elasticities.`);
q("V14","C","Concept check",0,"",`Quota rent is …`,[`always collected by the government`,`the difference between the domestic price and the world price times the quota quantity`,`equal to tariff revenue in every case`,`paid by foreign producers`],"B",T`@@\text{quota rent}=(P_2-P_w)\times\bar Q@@. It goes to the licence holders unless the government sells the quotas.`);
q("V15","C","Concept check",0,"",`A small open economy's demand for apples rises, with a tariff in place. The domestic price …`,[`rises further`,`stays at Pw + t`,`falls`,`becomes the world price`],"B",`Foreign supply is perfectly elastic at Pw + t, so the extra demand is met by more imports and the price is unchanged; tariff revenue rises.`);

const EX=[
{id:"W1",k:"num",t:`Opportunity cost from an output table`,stem:T`In country A, one day of labour makes 12 tonnes of rice or 6 tonnes of tea. What is the opportunity cost of 1 tonne of tea (tonnes of rice)?`,a:2,u:`tonnes of rice`,tol:0.001,src:[S(2,"1")],w:T`@@12\text{ rice}=6\text{ tea}@@, so @@1\text{ tea}=2\text{ rice}@@; and @@1\text{ rice}=0.5\text{ tea}@@. Divide the output of the good you give up by the output of the good you make.`},
{id:"W2",k:"num",t:`Total gain from trade`,stem:T`A's OC of 1X is 0.25Y and B's is 1Y. They trade at 1X = 0.6Y and A exports 40 X. Find A's total gain (units of Y).`,a:14,u:`units of Y`,tol:0.001,src:[S(3,"2")],w:T`Step 1: TOT is already per unit of X. Step 2: per-unit gain @@=0.6Y-0.25Y=0.35Y@@. Step 3: total @@=0.35\times40=14Y@@. The importer B gains @@0.4\times40=16Y@@; together @@0.75\times40=30Y@@.`},
{id:"W3",k:"open",t:`Tariff or quota?`,stem:`A government wants a guaranteed cut in imports and wants revenue. Which should it use?`,src:[S(4,"4")],w:`<p>A <b>quota</b> guarantees the cut because import volume is directly fixed; a <b>tariff</b> only reduces imports indirectly through the higher price (the size depends on elasticities). But a tariff generates government revenue, while a quota does not unless the government sells the licences and takes the quota rent. So the aims conflict: choose a quota for certainty of the volume (and sell the licences), or a tariff for revenue.</p>`}
];

const LONG=[
{id:"U1",src:`Practice (framework from the notes)`,q:`Explain why trade can benefit both countries even if one has an absolute advantage in both goods.`,m:T`<p>Gains come from <b>comparative</b> advantage, not absolute advantage. Even if country A is better at making both goods, its opportunity costs of the two goods differ from B's. So each country has a lower opportunity cost in one good. If each specialises in that good and trades at terms of trade between the two opportunity costs, each can consume more than before trade. The total potential gain equals the difference in opportunity costs.</p>`},
{id:"U2",src:`Practice (framework from the notes)`,q:`In a small open economy, explain with a diagram the effects of an import tariff on consumers and domestic producers.`,m:T`<p>The world price @@P_w@@ is given, so the domestic price rises to @@P_w+t@@. <b>Consumers</b> lose: the price is higher and consumption falls from @@Q^C_1@@ to @@Q^C_2@@. <b>Domestic producers</b> gain: output rises from @@Q^P_1@@ to @@Q^P_2@@ at the higher price. The government earns tariff revenue @@t\times Q^M_2@@. Imports fall from @@Q^M_1@@ to @@Q^M_2@@.</p><p>Use a small-economy diagram; do not use it for a large country, which can change the world price.</p>`}
];

const CS=[
{t:`Common mistakes in international trade`,zh:`常犯錯誤`,src:[S(6,"6")],h:`
<div class="tw"><table>
<tr><th>Topic</th><th>Typical mistakes</th></tr>
<tr><td>Consolidation questions</td><td>Not knowing how to identify absolute advantage (when productivity can and cannot be compared) · confusing input tables with output tables when computing opportunity cost</td></tr>
<tr><td>Range of terms of trade</td><td>Not noticing which good the terms of trade are quoted in (units): read the question carefully</td></tr>
<tr><td>Gain from trade</td><td>Forgetting the "convert the TOT" step · leaving out units · giving the per-unit gain when the total gain is asked</td></tr>
<tr><td>Transport costs</td><td>Not knowing why an importer paying the cost lowers the upper limit of the mutually beneficial terms of trade (the price the importer is willing to pay has fallen)</td></tr>
<tr><td>Direction of trade</td><td>If the OCs cannot be compared directly, compare a country's OC against the terms of trade to find the direction of trade and the comparative advantage</td></tr>
<tr><td>Comparative and absolute advantage</td><td>Thinking they compare good with good (they compare country with country) · wrongly equating "OC of 1Y is lower than the OC of 1X" with "a CA in Y" (the units differ) · not knowing that comparative advantage decides whether trade takes place and in which direction</td></tr>
<tr><td>Specialisation and the principle of comparative advantage</td><td>Not knowing the full definition of the principle; mistaking "the principle" for "comparative advantage"</td></tr>
<tr><td>Production and consumption before and after trade</td><td>Not knowing how to get useful information from a table</td></tr>
<tr><td>Trade barriers in a small open economy</td><td>Not understanding the shape of supply curves under free trade, tariffs and quotas · using the small-economy diagram for a large country · missing differences between tariff and quota · struggling with complex changes (demand shift, local supply shift, world price shift) · not knowing total consumer expenditure, quota rent, or total import value excluding tariff</td></tr>
</table></div>`}
];

Yupi.register({
 id:"macro9",title:"International trade",
 sub:`Absolute and comparative advantage, terms of trade and gains, transport costs, and tariffs and quotas in a small open economy. From the Macro 9 cheat sheet.`,
 files:{cs:{name:"[CS] Macro 9 International trade.pdf",dir:"雞精notes/Macro/",pre:"ma9r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet, with the arithmetic worked after each answer.`,
 csLead:`The error table from the cheat sheet, summarised in English.`,
 verify:[
  ["Table on page 5 and your homework note",`The cover page has a handwritten note "HW: Trade all Q" (do all the trade questions). Page 5's grid of eight diagrams is a blank template; your hand-drawn answers cover the demand-rise column and are in the last scan page. The tool in card H reproduces each case so you can check your drawing.`,["cs",4,"5"]],
  ["Questions pages not in the PDF",`The cover lists Questions on pages 19 and 105 of the original booklet, which are not part of your scan.`,["cs",1,""]]
 ],
 widgets:[{tab:"learn",title:"Tariff and quota in a small open economy",init:(el,Y)=>Y.widgets.trade(el,Y)}]
});
})();
