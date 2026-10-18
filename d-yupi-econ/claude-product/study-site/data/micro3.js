/* Micro chapter 3: Market intervention I (price controls). Source: [CS] Micro 3 Market Intervention (I) cheat sheet. */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"P1",t:`A. Effective price ceilings and floors`,zh:`價格上限和下限`,src:[S(1,"1")],h:T`
<div class="tw"><table>
<tr><th></th><th>Effective price ceiling</th><th>Effective price floor</th></tr>
<tr><td>Market price</td><td>Falls (to the ceiling)</td><td>Rises (to the floor)</td></tr>
<tr><td>Quantity transacted</td><td>Falls</td><td>Falls</td></tr>
<tr><td>Total revenue</td><td><b>Falls</b> (price and quantity both fall)</td><td><b>Uncertain</b>, depends on @@E_d@@</td></tr>
<tr><td>Result</td><td><b>Shortage</b>: @@Q_d>Q_s@@</td><td><b>Surplus</b>: @@Q_s>Q_d@@</td></tr>
</table></div>
<p>A ceiling is effective only if it is set <b>below</b> the equilibrium price; a floor only if it is set <b>above</b>. Otherwise it has no effect. Margin notes on the scan: the price is the ceiling, "not Pe!!", and the shortage or surplus is the gap between @@Q_s@@ and @@Q_d@@.</p>
<p>Variations the exam uses: imposing or abolishing a control; raising or lowering one (both effective, or one ineffective); and what happens when demand or supply shifts (the control may stay effective or stop being effective).</p>`},
{id:"P2",t:`B. Shortage and non-price competition`,zh:`短缺與非價格競爭`,src:[S(2,"2")],h:`
<ul>
<li>A shortage implies <b>non-price competition among buyers</b>: even someone willing and able to pay has no guarantee of getting the good.</li>
<li>Examples: <b>queuing</b> (first come, first served), allocation by <b>ability</b> (university places), by <b>luck</b> (HOS flats by lottery), by <b>sellers' preference</b>, by <b>violence</b>.</li>
<li>The <b>opportunity cost</b> of non-price competition: the money price is only the cost of price competition. To get the good, you must also pay the cost of competing in the non-price way (time in the queue, effort).</li>
<li><b>Economic wastage:</b> rationing by a non-price criterion such as queuing must use costs, but the cost spent is <b>valueless to society</b>.</li>
<li><b>Black market may emerge:</b> buyers pay the controlled price <i>plus</i> illegal (or indirect) side payments; or <b>touts</b> buy at the official price and resell at a higher price.</li>
</ul>`},
{id:"P3",t:`C. Rent control`,zh:`租金管制`,src:[S(2,"3")],h:`
<p>Rent control is a price ceiling on rent. Its consequences, each with the reason:</p>
<div class="tw"><table>
<tr><th>Effect</th><th>Why</th></tr>
<tr><td>Non-price competition for flats</td><td>Landlords choose tenants with more desirable traits: stable income (so rent is paid on time), friends and relatives, people who are less likely to damage the flat.</td></tr>
<tr><td>Not necessarily easier for the poor</td><td>These forms of non-price competition do not favour the low-income group. A lower rent does not guarantee the poor can get a flat.</td></tr>
<tr><td>Black market</td><td>Tenants may offer side benefits (money or non-money, direct or indirect) to landlords to win a flat.</td></tr>
<tr><td>Fall in quantity supplied: reallocation of resources</td><td>With lower rental income, the opportunity cost of using a flat for something else falls, so more landlords use the flat as a warehouse or for personal use.</td></tr>
<tr><td>Weaker private property right</td><td>After the control, the rental income the landlord is entitled to receive falls, so the right to receive income from the flat is weakened.</td></tr>
<tr><td>Deterioration of quality</td><td>The return on improving the flat falls, so landlords have less incentive to maintain it and quality tends to fall.</td></tr>
</table></div>
<p>Margin marks: two stars (the weakened property right and the reallocation effect are the ones to remember).</p>`},
{id:"P4",t:`D. Minimum wage`,zh:`最低工資`,src:[S(3,"4")],h:`
<p>A minimum wage is a price floor in the labour market, so it creates a <b>surplus of labour</b> (unemployment).</p>
<ul>
<li>A surplus implies <b>non-price competition among sellers</b> (workers): even a worker willing to accept the market wage cannot be sure of selling his labour.</li>
<li>Among workers willing to accept the same wage, the <b>more productive</b> ones are hired.</li>
<li><b>Black market:</b> some workers (for example foreign domestic helpers) may privately agree with the employer to a wage far below the minimum, or to extra services or side benefits at the same wage.</li>
<li>The minimum wage raises the wage of those who keep their jobs but unemploys others, so its effect on income inequality is uncertain.</li>
</ul>`},
{id:"P5",t:`E. The functions of price`,zh:`價格的功能`,src:[S(3,"4")],h:`
<div class="tw"><table>
<tr><th>Function</th><th>What it determines</th><th>Meaning</th></tr>
<tr><td><b>Rationing</b></td><td>For whom to produce</td><td>With price competition, only buyers with the highest willingness to pay get the good.</td></tr>
<tr><td><b>Allocative</b></td><td>What to produce</td><td>Price directs resource use: resources go to the highest-valued uses.</td></tr>
<tr><td><b>Signalling</b></td><td>Information</td><td>Price changes transmit information about changes in demand or in supply.</td></tr>
</table></div>`},
{id:"P6",t:`F. Economic systems revisited`,zh:`經濟制度`,src:[S(3,"5")],h:`
<p>Every economy answers three questions: <b>what</b> to produce (types and quantities of output), <b>how</b> to produce (factor inputs, method), <b>for whom</b> to produce (competition, target audience).</p>
<div class="tw"><table>
<tr><th></th><th>Planned economy</th><th>Market economy</th></tr>
<tr><td>Ownership of resources</td><td>State-owned</td><td>Privately owned (private property rights)</td></tr>
<tr><td>What to produce</td><td>Government command</td><td>Price mechanism (allocative function of price)</td></tr>
<tr><td>How to produce</td><td>Decided by the government</td><td>Decided by private firms</td></tr>
<tr><td>For whom to produce</td><td>Non-price competition (government command)</td><td>Price competition (rationing function of price)</td></tr>
</table></div>
<p>In reality economies are mixed: there is no pure planned or pure market economy.</p>`}
];

const SEC={A:"Price controls",B:"Non-price competition",C:"Functions and systems"};
q("I1","A","Concept check",0,"",`An <b>effective</b> price ceiling is imposed on a good. Which is certain?`,[`Market price rises and a surplus appears`,`Quantity transacted falls and a shortage appears`,`Total revenue rises`,`Quantity transacted rises`],"B",`A binding ceiling lowers price, the quantity supplied falls (and is what is traded), and quantity demanded exceeds it: a shortage. Total revenue falls because both price and quantity fall.`);
q("I2","A","Concept check",0,"",`An effective price floor is imposed. The change in the sellers' total revenue is …`,[`certain to rise`,`certain to fall`,`uncertain, depending on the elasticity of demand`,`unchanged`],"C",`Price rises and quantity falls, so the revenue change depends on whether demand is elastic or inelastic.`);
q("I3","A","Concept check",0,"",`The equilibrium price of rice is $10. The government sets a maximum price of $12. This control …`,[`causes a shortage`,`causes a surplus`,`has no effect, it is ineffective`,`lowers quantity transacted`],"C",`A ceiling above the equilibrium price does not bind, so nothing changes.`);
q("I4","A","Concept check",0,"",`A price ceiling is effective. Later demand falls so far that the equilibrium price drops below the ceiling. The ceiling is now …`,[`still effective`,`no longer effective`,`a price floor`,`causing a larger shortage`],"B",`Once the new equilibrium price is below the ceiling, the ceiling no longer binds.`);
q("I5","A","Concept check",0,"",`Which pair is correct?`,[`ceiling: surplus; floor: shortage`,`ceiling: shortage; floor: surplus`,`both create a shortage`,`both create a surplus`],"B",`A ceiling keeps price below equilibrium (shortage). A floor keeps it above (surplus).`);
q("I6","B","Concept check",0,"",`Which is an example of <b>non-price competition</b> among buyers?`,[`bidding at an auction`,`queuing for tickets`,`a rise in the market price`,`a fall in demand`],"B",`Queuing allocates by waiting time, not by price.`);
q("I7","B","Concept check",0,"",`After a rent control, a landlord rents his flat to a tenant who offers an extra payment under the table. This is …`,[`price competition`,`a black market side payment`,`an increase in supply`,`a tax`],"B",`Illegal or indirect side payments in addition to the controlled price are a black market.`);
q("I8","B","Concept check",0,"",`Which is <b>not</b> a likely effect of rent control?`,[`landlords pick tenants with stable incomes`,`less maintenance of flats`,`more flats are supplied to the rental market`,`some landlords use flats as warehouses`],"C",`Lower rental income reduces the quantity supplied: fewer flats, not more.`);
q("I9","B","Concept check",0,"",`A minimum wage above the equilibrium wage will produce …`,[`a shortage of labour`,`a surplus of labour (unemployment)`,`no change`,`a rise in the demand for labour`],"B",`A wage floor is a price floor: quantity of labour supplied exceeds quantity demanded.`);
q("I10","B","Concept check",0,"",`With a minimum wage, which workers among those willing to work at that wage are most likely to be hired?`,[`the least productive`,`the most productive`,`chosen by lottery only`,`all of them`],"B",`Employers rationing a surplus of workers by non-price criteria pick the more productive ones.`);
q("I11","C","Concept check",0,"",`The function of price that decides <b>for whom</b> goods are produced is the …`,[`allocative function`,`rationing function`,`signalling function`,`distribution function`],"B",`Rationing: only buyers with the highest willingness to pay obtain the good.`);
q("I12","C","Concept check",0,"",`A rise in the price of oil tells producers that oil is now scarcer and users to cut back. This is the price's …`,[`rationing function`,`allocative function`,`signalling function`,`planning function`],"C",`Price changes transmit information about demand or supply.`);
q("I13","C","Concept check",0,"",`In a market economy the question of <b>what to produce</b> is decided by …`,[`government command`,`the price mechanism`,`non-price competition`,`state ownership`],"B",`The allocative function of price directs resources to the highest-valued uses.`);

const EX=[
{id:"R1",k:"num",t:`Size of a shortage`,stem:T`Demand is @@P=100-Q@@ and supply is @@P=20+Q@@. The government imposes a price ceiling of $40. Find the size of the shortage (units).`,a:40,u:`units`,tol:0.01,w:T`<p>At @@P=40@@: @@Q_d=100-40=60@@ and @@Q_s=40-20=20@@.</p>@@@\text{shortage}=Q_d-Q_s=60-20=40@@@<p>Equilibrium was @@P^*=60,\;Q^*=40@@, so the ceiling (below 60) is effective, and quantity transacted falls from 40 to 20.</p>`},
{id:"R2",k:"num",t:`Size of a surplus`,stem:T`Same market. A price floor of $80 is imposed. Find the surplus (units).`,a:40,u:`units`,tol:0.01,w:T`<p>At @@P=80@@: @@Q_d=20@@ and @@Q_s=60@@, so @@\text{surplus}=60-20=40@@. The floor (above 60) is effective, and the quantity traded is @@Q_d=20@@.</p>`},
{id:"R3",k:"open",t:`2012 exam point (from the margin of the scan)`,stem:`"A price ceiling ensures all lower-income buyers can buy the good." Comment.`,src:[S(5,"")],w:`<p><b>No.</b> An effective ceiling creates a <b>shortage</b>, so there is <b>non-price competition</b> (for example queuing, or sellers choosing buyers by preference). These are not necessarily favourable to the low-income group, so the ceiling cannot ensure that <u>all</u> low-income buyers can buy. Cite an example.</p>`}
];

const LONG=[
{id:"H1",src:`Practice (framework from the notes)`,q:`The government sets a maximum rent. (a) Explain why a shortage of flats appears. (b) Explain two further consequences of the control.`,m:`<p><b>(a)</b> A maximum rent below the equilibrium rent is effective. At that rent the quantity of flats demanded exceeds the quantity supplied: a shortage.</p><p><b>(b)</b> Any two: <b>non-price competition</b> (landlords choose tenants with stable income, friends or relatives; this does not necessarily help the poor); <b>black market</b> (tenants pay side payments); <b>weaker property right</b> and <b>lower maintenance</b> because the return on keeping up the flat falls; <b>reallocation of flats</b> to other uses such as storage.</p>`},
{id:"H2",src:`Practice (framework from the notes)`,q:`Explain why a minimum wage may not reduce income inequality.`,m:`<p>A minimum wage is a price floor in the labour market. Workers who keep their jobs earn a higher wage. But the quantity of labour demanded falls and the quantity supplied rises, so there is a <b>surplus of labour</b>: some low-income workers lose their jobs or cannot find one.</p><p>The effect on income inequality is therefore <b>uncertain</b>: the gain for employed workers must be weighed against the loss of those who become unemployed. State the original wage and the minimum wage.</p>`}
];

const CS=[
{t:`Common mistakes with price controls`,zh:`常犯錯誤`,src:[S(4,"6"),S(4,"7")],h:`
<div class="tw"><table>
<tr><th>Question type</th><th>Typical mistakes</th></tr>
<tr><td>General effects of price control</td><td>Not checking whether the ceiling or floor is <u>effective</u> · mixing up the effect on total revenue: an effective <b>ceiling</b> lowers price and quantity together so revenue certainly falls; an effective <b>floor</b> moves them in opposite directions along the demand curve, so the revenue change is uncertain and depends on elasticity</td></tr>
<tr><td>Basic concepts of shortage</td><td>Not knowing the exact definitions: <b>shortage</b> = price below equilibrium, quantity demanded greater than quantity supplied; <b>surplus</b> = price above equilibrium, quantity demanded smaller than quantity supplied; <b>equilibrium</b> = quantity demanded equals quantity supplied, market clears · not knowing a shortage means non-price competition · thinking non-price competition always helps the poor · knowing almost nothing about what happens after rent control</td></tr>
<tr><td>Functions of price</td><td>Mixing up the rationing function (for whom) with the allocative function (what to produce) · not linking the functions to economic systems</td></tr>
<tr><td>Tickets and touts; tunnel and traffic congestion</td><td>Forgetting that the supply of tickets is fixed, so draw a <b>vertical supply curve</b> · thinking price control is the only source of shortage: buyers may deliberately trade below equilibrium prices too</td></tr>
<tr><td>Minimum wage</td><td>Not seeing that a surplus also means non-price competition (among sellers) · thinking a minimum wage raises low-paid workers' income and so reduces inequality (it also unemploys some, so the effect is uncertain) · not understanding "average wage earnings"</td></tr>
<tr><td>Disequilibrium analysis</td><td>Not realising that when there is a shortage or surplus the price is not set by demand and supply, so it does not move when they shift · forgetting when to draw a vertical supply curve</td></tr>
<tr><td>Labour market</td><td>Confusing the demand for labour (firms hiring workers) with the supply of labour (workers themselves) · not knowing derived demand and competitive supply · misreading words: "shortage of helpers" is a shortage; "vacancies remain" means demand exceeds supply (a shortage, not a surplus); "unemployment" means labour supply exceeds demand (a surplus)</td></tr>
<tr><td>Stock market</td><td>Not knowing why people buy shares (the source of the demand for shares)</td></tr>
</table></div>
<div class="box"><b>Your own summary at the end of the sheet:</b> first decide if the question has an <b>extreme</b> supply or demand curve (is supply fixed?), then draw the diagram with the controlled price; ask "what is the price when it is the market that sets it?" and state the <b>original price</b> (above or below equilibrium). When demand or supply shifts, the controlled price stays fixed, so only the quantity and total revenue change.</div>`}
];

Yupi.register({
 id:"micro3",title:"Market intervention I: price controls",
 sub:`Price ceilings and floors, non-price competition, rent control, the minimum wage and the functions of price. From the Micro 3 cheat sheet.`,
 files:{cs:{name:"[CS] Micro 3 Market Intervention (I).pdf",dir:"雞精notes/Micro/",pre:"mi3r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet. Each is explained after you answer.`,
 csLead:`The error table from the cheat sheet, plus the handwritten summary on its last pages.`,
 verify:[["Handwritten pages",`The last two scan pages carry your own handwriting (a framework for disequilibrium questions and a 2012 exam point). They are summarised in English here; open the badge to see the original.`,["cs",5,""]]],
 widgets:[{tab:"learn",title:"Try a price ceiling or floor",init:(el,Y)=>Y.widgets.sd(el,Y,{modes:["none","ceiling","floor"],mode:"ceiling"})}]
});
})();
