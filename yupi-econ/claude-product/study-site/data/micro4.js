/* Micro chapter 4: Market intervention II (quota, tax, subsidy). Source: [CS] Micro 4 Market Intervention (II) cheat sheet (both copies are identical). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"Q1",t:`A. Quota, per-unit tax, per-unit subsidy: the basic operations`,zh:`配額、從量稅、從量津貼`,src:[S(1,"1")],h:T`
<div class="tw"><table>
<tr><th></th><th>Quota</th><th>Per-unit tax</th><th>Per-unit subsidy</th></tr>
<tr><td>Supply</td><td>Decreases (effective if quota @@<Q_e@@)</td><td>Supply curve shifts <b>upward</b> (supply drops, left)</td><td>Supply curve shifts <b>downward</b> (supply rises, right)</td></tr>
<tr><td>Price and quantity</td><td>@@P\uparrow\;Q\downarrow@@</td><td>@@P\uparrow\;Q\downarrow@@; price rises by <b>less than</b> the tax (extreme cases excepted)</td><td>@@P\downarrow\;Q\uparrow@@; price falls by <b>less than</b> the subsidy (extreme cases excepted)</td></tr>
<tr><td>Total revenue</td><td>Depends on @@E_d@@</td><td>Depends on @@E_d@@</td><td>Depends on @@E_d@@</td></tr>
</table></div>
<p><b>Quota and quality.</b> Impose a quota: quality tends to improve. Increase or reduce a quota: quality may improve or worsen (it depends on the case).</p>`},
{id:"Q2",t:`Tax and subsidy: what sellers really receive`,zh:`實收價`,src:[S(1,"1")],h:T`
<div class="box">@@@\text{TR net of tax}=(P-t)\times Q\qquad\qquad \text{TR inclusive of subsidy}=(P+s)\times Q@@@</div>
<ul>
<li>@@P-t@@ is the <b>net-of-tax price</b>, the price the seller actually receives.</li>
<li>@@P+s@@ is the <b>price inclusive of subsidy</b>, again what the seller actually receives.</li>
<li>Use the <b>new</b> quantity (after the tax or subsidy), not the old one.</li>
</ul>`},
{id:"Q3",t:`Who bears the tax? Who gets the subsidy?`,zh:`消費者與生產者負擔`,src:[S(1,"1")],h:T`
<ul>
<li><b>Tax.</b> Consumer burden (CB) per unit = the rise in the price buyers pay. Producer burden (PB) per unit = the fall in the price sellers actually receive.</li>
<li><b>Subsidy.</b> Consumer benefit (CB) per unit = the fall in the price buyers pay. Producer benefit (PB) per unit = the rise in the price sellers actually receive.</li>
</ul>
<div class="box">@@@CB>PB\;\Leftrightarrow\;E_d<E_s\qquad\qquad CB<PB\;\Leftrightarrow\;E_d>E_s@@@</div>
<p>The less elastic side bears more of a tax and gets more of a subsidy. For both tax and subsidy the rule is the same. Memory aid from the margin of the cheat sheet: the side with low elasticity is "unhappy" about a tax (it cannot escape it) and "happy" about a subsidy.</p>
<div class="note">The sheet also says: do not memorise this as a sign-flipping rule; know why. If demand is inelastic buyers cannot cut back, so they absorb more of a tax. If supply is inelastic sellers cannot cut output, so they absorb more of a tax.</div>`},
{id:"Q4",t:`B. Extreme cases`,zh:`極端情況`,src:[S(2,"2")],h:T`
<p>The cheat sheet gives eight blank diagrams to draw yourself. Use the widget below to check each case. The results:</p>
<div class="tw"><table>
<tr><th>Case</th><th>Per-unit tax</th><th>Per-unit subsidy</th></tr>
<tr><td>Perfectly elastic demand (@@E_d=\infty@@)</td><td>Price buyers pay does not change; <b>producers bear the whole tax</b>. Quantity falls.</td><td>Price buyers pay does not change; <b>producers get the whole subsidy</b>. Quantity rises.</td></tr>
<tr><td>Perfectly elastic supply (@@E_s=\infty@@)</td><td>Price buyers pay rises by the whole tax; <b>consumers bear it all</b>.</td><td>Price falls by the whole subsidy; <b>consumers get it all</b>.</td></tr>
<tr><td>Perfectly inelastic demand (@@E_d=0@@)</td><td>Quantity unchanged; price rises by the tax; <b>consumers bear it all</b>.</td><td>Quantity unchanged; price falls by the subsidy; <b>consumers get it all</b>.</td></tr>
<tr><td>Perfectly inelastic supply (@@E_s=0@@)</td><td>Quantity unchanged; price buyers pay unchanged; <b>producers bear it all</b>.</td><td>Quantity unchanged; price buyers pay unchanged; <b>producers get it all</b>.</td></tr>
</table></div>
<p>In the extreme cases the price change <i>equals</i> the tax or subsidy (or is zero); in all other cases it is strictly less.</p>`}
];

const SEC={A:"Quota",B:"Tax",C:"Subsidy and extremes"};
q("T1","A","Concept check",0,"",T`Demand is @@P=100-Q@@ and supply is @@P=20+Q@@ (equilibrium @@P=60,Q=40@@). A quota of 20 units is imposed. The price buyers pay becomes …`,[`60`,`70`,`80`,`100`],"C",T`Quantity is held at 20, so buyers' price is read from demand: @@P=100-20=80@@.`);
q("T2","A","Concept check",0,"",`In the same market, a quota of 50 units is imposed. The quota …`,[`raises price to 80`,`lowers quantity to 50`,`has no effect, it is not effective`,`creates a surplus`],"C",`The quota (50) is above the equilibrium quantity (40), so it does not bind.`);
q("T3","A","Concept check",0,"",`An effective quota on a good shifts which curve, and which way?`,[`demand, to the right`,`demand, to the left`,`supply, to the left (supply decreases)`,`supply, to the right`],"C",`A quota limits the quantity sellers can sell: supply decreases.`);
q("T4","A","Concept check",0,"",`Which statement about an effective quota is correct?`,[`price rises and quantity falls`,`price falls and quantity rises`,`price and quantity both rise`,`price and quantity both fall`],"A",`Supply decreases: @@P\\uparrow@@, @@Q\\downarrow@@.`.replace(/@@/g,"@@"));
q("T5","B","Concept check",0,"",T`Demand @@P=100-Q@@, supply @@P=20+Q@@. A per-unit tax of $20 is imposed on sellers. The new equilibrium quantity is …`,[`20`,`30`,`40`,`50`],"B",T`The tax shifts supply up by 20: @@P=40+Q@@. Set @@100-Q=40+Q@@, so @@Q=30@@. The buyers' price is 70.`);
q("T6","B","Concept check",0,"",T`In the previous question, what price do sellers actually receive per unit (net of tax)?`,[`40`,`50`,`60`,`70`],"B",T`Buyers pay 70, the tax is 20, so sellers receive @@70-20=50@@. Buyers' price rose by 10 and sellers' receipt fell by 10: the burden is shared equally, because @@E_d=E_s@@ here.`);
q("T7","B","Concept check",0,"",`A per-unit tax is imposed. The rise in the price buyers pay is normally …`,[`more than the tax`,`equal to the tax`,`less than the tax`,`zero`],"C",`The tax is shared between buyers (higher price) and sellers (lower receipt), so the rise in the buyers' price is less than the tax (extreme cases excepted).`);
q("T8","B","Concept check",0,"",`Demand for a good is much less elastic than its supply. A tax is imposed. Who bears the larger share?`,[`consumers`,`producers`,`equal shares`,`the government`],"A",T`@@E_d<E_s\Rightarrow CB>PB@@: the less elastic side cannot easily avoid the tax.`);
q("T9","B","Concept check",0,"",`A government wants a tax to be borne mostly by <b>producers</b>. It should tax a good whose …`,[`demand is inelastic and supply is elastic`,`demand is elastic and supply is inelastic`,`both are perfectly elastic`,`demand is perfectly inelastic`],"B",T`@@E_d>E_s\Rightarrow CB<PB@@: producers bear more.`);
q("T10","C","Concept check",0,"",T`Demand @@P=100-Q@@, supply @@P=20+Q@@. A per-unit subsidy of $20 is given to sellers. The new equilibrium quantity is …`,[`40`,`50`,`60`,`70`],"B",T`The subsidy shifts supply down by 20: @@P=Q@@. Set @@100-Q=Q@@, so @@Q=50@@, and buyers pay 50.`);
q("T11","C","Concept check",0,"",`In the previous question, what price do sellers effectively receive (including the subsidy)?`,[`50`,`60`,`70`,`80`],"C",T`Buyers pay 50 and the sellers get the subsidy on top: @@50+20=70@@.`);
q("T12","C","Concept check",0,"",`Demand is perfectly inelastic. A per-unit tax is imposed. The price buyers pay rises by …`,[`nothing`,`half the tax`,`the whole tax`,`more than the tax`],"C",`Buyers cannot cut back at all, so they pay the whole tax, and quantity does not change.`);
q("T13","C","Concept check",0,"",`Supply is perfectly inelastic (a vertical curve). A per-unit tax is imposed. Quantity traded …`,[`falls`,`rises`,`is unchanged and producers bear the tax`,`is unchanged and consumers bear the tax`],"C",`Sellers will supply the same fixed quantity whatever they receive, so buyers' price is unchanged and producers bear the whole tax.`);
q("T14","C","Concept check",0,"",`When analysing a <b>perfectly elastic supply</b> curve with a tax, a common error is to …`,[`say supply shifts left (it should shift up)`,`say demand shifts`,`forget the tax`,`ignore quantity`],"A",`A horizontal supply curve moved by a tax moves <b>up</b>; it does not move "left" in any visible way. The cheat sheet warns about confusing "shift left" with "shift up".`);

const EX=[
{id:"U1",k:"num",t:`Tax revenue`,stem:T`Demand @@P=100-Q@@, supply @@P=20+Q@@. A $20 per-unit tax. Government tax revenue?`,a:600,u:`dollars`,tol:0.5,w:T`<p>New @@Q=30@@ (buyers pay 70). Revenue @@=t\times Q=20\times30=600@@.</p><p>Burden: buyers 10 per unit (60 to 70), sellers 10 per unit (60 to 50). The deadweight loss is @@\tfrac12\times20\times(40-30)=100@@.</p>`,src:[S(1,"1")]},
{id:"U2",k:"num",t:`Sellers' revenue after tax`,stem:T`Same tax. What is the total revenue of sellers, net of tax, <b>after</b> the tax?`,a:1500,u:`dollars`,tol:0.5,w:T`@@(P-t)\times Q=(70-20)\times30=1500@@. Before the tax it was @@60\times40=2400@@, so sellers' net revenue falls by 900.`,src:[S(1,"1")]},
{id:"U3",k:"num",t:`Subsidy cost`,stem:T`Demand @@P=100-Q@@, supply @@P=20+Q@@. A $20 per-unit subsidy. How much does the government pay in total?`,a:1000,u:`dollars`,tol:0.5,w:T`New @@Q=50@@. Cost @@=s\times Q=20\times50=1000@@. Buyers pay 50 (down 10 from 60) and sellers effectively get 70 (up 10): benefits are shared equally.`,src:[S(1,"1")]},
{id:"U4",k:"open",t:`Draw it yourself`,stem:`Use the widget on the Learn tab. (a) Show a $20 tax with equal slopes and note CB and PB. (b) Make demand steeper by thinking of it: which party bears more tax? Then explain in words.`,w:`<p>With demand steeper (less elastic) than supply, buyers absorb more: CB &gt; PB. In the diagram the rise in buyers' price is larger than the fall in sellers' net price. The rule: @@E_d<E_s\\Rightarrow CB>PB@@.</p>`,src:[S(2,"2")]}
];

const LONG=[
{id:"Z1",src:`Practice (framework from the notes)`,q:`The government imposes a per-unit tax on cigarettes. (a) Use a diagram to show the effect on price and quantity. (b) Explain why consumers bear most of the tax.`,m:`<p><b>(a)</b> The tax shifts the supply curve <b>upward</b> by the amount of the tax (supply decreases). The equilibrium price rises (from @@P_0@@ to @@P_1@@) and the quantity falls (from @@Q_0@@ to @@Q_1@@). Mark the price buyers pay (@@P_1@@), the price sellers receive net of tax (@@P_1-t@@) and the tax revenue @@t\\times Q_1@@ using the <b>new</b> quantity. The rise in the buyers' price is less than @@t@@.</p><p><b>(b)</b> Demand for cigarettes is inelastic (addictive, few substitutes), so it is less elastic than supply: @@E_d<E_s@@, hence consumer burden @@>@@ producer burden.</p>`},
{id:"Z2",src:`Practice (framework from the notes)`,q:`Explain, with a diagram, why a quota on imports raises the price in the importing country.`,m:`<p>The quota is an upper limit on the quantity that can be sold, so (if it is below the equilibrium quantity) it is effective: the supply curve <b>decreases</b> and a vertical segment at the quota quantity appears. Buyers pay the price read off the demand curve at the quota quantity, which is above the original price. Quantity falls.</p><p>Mark: quota quantity below @@Q_e@@, higher price, and say the supply is fixed at the quota (draw it vertical).</p>`}
];

const CS=[
{t:`Common mistakes with quotas, taxes and subsidies`,zh:`常犯錯誤`,src:[S(3,"3"),S(3,"4")],h:`
<p>The original table is written in colloquial Cantonese. English summary:</p>
<div class="tw"><table>
<tr><th>Question type</th><th>Typical mistakes</th></tr>
<tr><td>Effects of a quota</td><td>Not knowing how to read price and quantity off the diagram (and not drawing it at all, so answers are made up) · in long questions, forgetting to say supply changes · confusing an <b>increase</b> in quota (right) with a <b>decrease</b> (left) · not knowing the link between quota and quality (usually memorised blindly)</td></tr>
<tr><td>Change in demand or supply under a quota</td><td>Thinking a demand increase must raise both price and quantity; under a quota the price and quantity are set by where the <i>quota supply</i> meets demand</td></tr>
<tr><td>Export and import markets</td><td>Not knowing who the buyers and sellers are in each market; mixing up demand and supply</td></tr>
<tr><td>Quota market</td><td>Not reading the question; not knowing that quota supply is fixed (vertical); not knowing which factors affect the demand and supply of the quota itself</td></tr>
<tr><td>Effects of a per-unit tax</td><td>Analysing the table slowly (never drawing diagrams) · using the old quantity to mark tax revenue (use the <b>new</b> quantity) · not distinguishing "shift left" from "shift up" · memorising the positions of CB and PB instead of understanding them · confusing the condition for the change in total revenue (high or low @@E_d@@) with the condition for the size of the tax burden (@@E_d@@ versus @@E_s@@); not knowing both elasticities together decide the burden · not knowing why consumers bear a burden (the market price is higher) and why producers bear a burden (the net price they receive is lower) · not working out the elasticity of demand from the change in total revenue</td></tr>
<tr><td>Increase or decrease in a per-unit tax</td><td>Using the original (no-tax) supply curve as the reference instead of the existing one · not having practised the diagram at all</td></tr>
<tr><td>Tariff versus quota</td><td>No idea of the differences between them</td></tr>
<tr><td>Changes in demand or supply under a per-unit tax</td><td>Seeing the diagram as complicated and not practising it</td></tr>
<tr><td>Sharing of the tax burden</td><td>Not knowing how to draw the condition: draw a dozen diagrams until it sticks · not understanding the sign-flipping principle; memorise the Ed, Es, CB, PB relationship by reasoning (low elasticity means unhappy with a tax) · not knowing how to draw the exact tax shares the question asks for, e.g. high and low elasticity supply (cut the y-axis or the origin) and high and low elasticity demand (price range above or below the midpoint)</td></tr>
<tr><td>Extreme cases for tax and for subsidy</td><td>Not reading the question properly · confusing "shifts left" with "shifts up" when the supply curve is horizontal (for a subsidy, "right" versus "down")</td></tr>
<tr><td>Effects of a per-unit subsidy</td><td>The same as the tax list: slow tables, old quantity, "right" versus "down", memorising CB and PB, confusing the revenue condition with the benefit-sharing condition, not knowing why consumers (price is lower) and producers (net receipt is higher) benefit</td></tr>
</table></div>`}
];

Yupi.register({
 id:"micro4",title:"Market intervention II: quotas, taxes, subsidies",
 sub:`How a quota, a per-unit tax or a subsidy moves price and quantity, who bears the tax, and the extreme elasticity cases. From the Micro 4 cheat sheet.`,
 files:{cs:{name:"[CS] Micro 4 Market Intervention (II).pdf",dir:"雞精notes/Micro/",pre:"mi4r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet, using the same linear market throughout (demand P = 100 - Q, supply P = 20 + Q).`,
 csLead:`The error table from the cheat sheet. The original is in Cantonese; this is an English summary.`,
 verify:[["Blank diagrams in the cheat sheet",`Pages 1 and 2 of the sheet contain empty axes for you to draw on. They are not transcribed. The widget on the Learn tab draws every case for you.`,["cs",2,"2"]],["Two copies of this sheet",`Micro 4 (II) and Micro 4 (II)(1) are the same document; only the first is used.`]],
 widgets:[{tab:"learn",title:"Try a tax, a subsidy or a quota",init:(el,Y)=>Y.widgets.sd(el,Y,{modes:["none","tax","subsidy","quota"],mode:"tax"})}]
});
})();
