/* Micro chapter 2: Elasticity of demand and supply. Source: [CS] Micro 2 Elasticity of Demand and Supply cheat sheet. */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"E1",t:`A. Measuring elasticity`,zh:`彈性的計算`,src:[S(1,"1")],h:T`
@@@E_d=\left|\dfrac{\%\Delta Q_d}{\%\Delta P}\right|\qquad E_s=\dfrac{\%\Delta Q_s}{\%\Delta P}@@@
<ol>
<li>Use <b>percentage</b> change, not absolute change, so the units of price and quantity do not matter.</li>
<li>Elasticity of demand ignores the negative sign (use the absolute value).</li>
<li>Calculate each percentage change using the <b>average (midpoint) value</b>; this is called <b>arc elasticity</b>.</li>
</ol>
<div class="box">@@@\%\Delta X=\dfrac{X_{\text{new}}-X_{\text{old}}}{(X_{\text{new}}+X_{\text{old}})/2}@@@</div>
<p>Margin notes on the scan: "responsiveness: big or small" beside the title, and "arc elasticity" beside the average-value rule.</p>`},
{id:"E2",t:`B. Which curve are you moving along?`,zh:`需求彈性與供應彈性`,src:[S(1,"1")],h:`
<ul>
<li>A <b>supply change</b> moves the equilibrium <b>along the demand curve</b>, so the percentage changes in price and quantity reflect the <b>elasticity of demand</b>.</li>
<li>A <b>demand change</b> moves the equilibrium <b>along the supply curve</b>, so they reflect the <b>elasticity of supply</b>.</li>
</ul>
<p>Before measuring, decide which curve shifted. The curve that did <i>not</i> shift is the one you are reading.</p>`},
{id:"E3",t:`C. The five types of elasticity`,zh:`彈性的種類`,src:[S(2,"2")],h:T`
<div class="tw"><table>
<tr><th>Type</th><th>Elasticity of demand</th><th>Elasticity of supply</th></tr>
<tr><td>Perfectly inelastic</td><td>@@E_d=0@@. Price rises, @@Q_d@@ does not change. <b>Vertical</b> curve.</td><td>@@E_s=0@@. Price rises, @@Q_s@@ does not change. <b>Vertical</b> curve.</td></tr>
<tr><td>Inelastic</td><td>@@0<E_d<1@@. Price up 10%, @@Q_d@@ down by less than 10%.</td><td>@@0<E_s<1@@. Price up 10%, @@Q_s@@ up by less than 10%. Straight line meeting the <b>quantity axis</b>.</td></tr>
<tr><td>Unitary elastic</td><td>@@E_d=1@@. Price up 10%, @@Q_d@@ down 10%. A <b>rectangular hyperbola</b>.</td><td>@@E_s=1@@. Price up 10%, @@Q_s@@ up 10%. Straight line through the <b>origin</b>.</td></tr>
<tr><td>Elastic</td><td>@@E_d>1@@. Price up 10%, @@Q_d@@ down by more than 10%.</td><td>@@E_s>1@@. Price up 10%, @@Q_s@@ up by more than 10%. Straight line meeting the <b>price axis</b>.</td></tr>
<tr><td>Perfectly elastic</td><td>@@E_d=\infty@@. Above @@P^*@@, @@Q_d=0@@; below it, @@Q_d@@ is unlimited. <b>Horizontal</b> curve.</td><td>@@E_s=\infty@@. Above @@P^*@@ supply is unlimited; below it, @@Q_s=0@@. <b>Horizontal</b> curve.</td></tr>
</table></div>
<p>A straight-line demand curve has a different elasticity at each point: elastic above the midpoint, inelastic below. Elasticity is not the same as slope.</p>`},
{id:"E4",t:`D. Elasticity and total revenue`,zh:`總收益的改變`,src:[S(2,"3")],h:T`
<div class="box">@@@TR=P\times Q@@@</div>
<p>Compare the percentage changes of price and quantity:</p>
<div class="tw"><table>
<tr><th>Movement</th><th>Range of the demand curve</th><th>Percentages</th><th>Total revenue</th></tr>
<tr><td rowspan="2">Along demand: price up, quantity down</td><td>Elastic (above the midpoint), @@E_d>1@@</td><td>@@\%\Delta P<\%\Delta Q@@</td><td><b>Falls</b></td></tr>
<tr><td>Inelastic (below the midpoint), @@E_d<1@@</td><td>@@\%\Delta P>\%\Delta Q@@</td><td><b>Rises</b></td></tr>
<tr><td rowspan="2">Along demand: price down, quantity up</td><td>Elastic, @@E_d>1@@</td><td>@@\%\Delta P<\%\Delta Q@@</td><td><b>Rises</b></td></tr>
<tr><td>Inelastic, @@E_d<1@@</td><td>@@\%\Delta P>\%\Delta Q@@</td><td><b>Falls</b></td></tr>
<tr><td>Along supply: price up, quantity up</td><td colspan="2">Both move the same way</td><td><b>Rises</b></td></tr>
<tr><td>Along supply: price down, quantity down</td><td colspan="2">Both move the same way</td><td><b>Falls</b></td></tr>
</table></div>
<p>In short: along a demand curve, a price change raises revenue when demand is inelastic and lowers it when demand is elastic. At unit elasticity revenue is unchanged.</p>`},
{id:"E5",t:`E. What makes demand elastic`,zh:`影響需求彈性的因素`,src:[S(3,"4")],h:`
<div class="tw"><table>
<tr><th>Factor</th><th>More elastic when</th></tr>
<tr><td>Number of substitutes</td><td>There are <b>more</b> substitutes: if price rises, buyers switch</td></tr>
<tr><td>Time</td><td>There is <b>more time</b> to search for substitutes</td></tr>
<tr><td>Luxury versus necessity</td><td>It is a <b>luxury</b>. A necessity is inelastic: you buy even if price rises</td></tr>
<tr><td>Habit-forming or addictive good</td><td>It is <b>not</b> addictive. Addictive goods are inelastic</td></tr>
<tr><td>Durability</td><td>It is <b>more durable</b>: buyers can keep using the old one (old good as a substitute for the new)</td></tr>
<tr><td>Proportion of income spent</td><td>It takes a <b>larger share</b> of income, so it is worth searching for substitutes</td></tr>
<tr><td>Number of uses</td><td>It has <b>more uses</b>: a price rise cuts quantity in many uses</td></tr>
</table></div>
<p>Margin notes: the number of substitutes is starred as the most important factor.</p>`},
{id:"E6",t:`What makes supply elastic`,zh:`影響供應彈性的因素`,src:[S(3,"4")],h:`
<div class="tw"><table>
<tr><th>Factor</th><th>More elastic when</th></tr>
<tr><td>Flexibility in production</td><td>Production is <b>more flexible</b></td></tr>
<tr><td>Time</td><td>There is <b>more time</b> to adjust output</td></tr>
<tr><td>Excess capacity</td><td>The firm has <b>spare capacity</b> (for example it can use overtime)</td></tr>
<tr><td>Agricultural versus manufactured</td><td>Manufactured goods: overtime can produce more quickly, so more elastic. Agricultural goods take a long time to grow, so inelastic</td></tr>
<tr><td>Labour-intensive versus capital-intensive</td><td>Labour-intensive: little time needed to hire, more elastic. Capital-intensive: more time to install machines, inelastic. (A margin note: case specific, for example doctors.)</td></tr>
<tr><td>Factor mobility</td><td>Factors are <b>highly mobile</b> and easily available</td></tr>
<tr><td>Skill requirement</td><td>Little specialised skill: long training makes supply inelastic</td></tr>
<tr><td>Entry barriers</td><td>Few barriers. More licences or capital required means more barriers, so inelastic</td></tr>
</table></div>`}
];

const SEC={A:"Calculation",B:"Types and revenue",C:"Determinants"};
q("L1","A","Concept check",0,"",T`The price of a good rises from $8 to $12 and the quantity demanded falls from 120 to 80. Using the midpoint method, the elasticity of demand is …`,[`0.5`,`1.0`,`1.5`,`2.0`],"B",T`@@\%\Delta P=\dfrac{4}{10}=40\%@@ and @@\%\Delta Q=\dfrac{40}{100}=40\%@@, so @@E_d=1@@ (unitary elastic).`);
q("L2","A","Concept check",0,"",T`The price of a good rises from $20 to $30 and the quantity demanded falls from 60 to 50. Using the midpoint method, @@E_d@@ is about …`,[`0.45`,`0.83`,`1.2`,`2.2`],"A",T`@@\%\Delta P=\dfrac{10}{25}=40\%@@; @@\%\Delta Q=\dfrac{10}{55}\approx18.2\%@@. @@E_d=18.2/40\approx0.45@@: inelastic.`);
q("L3","A","Concept check",0,"",`A 10% rise in the price of a good raises the quantity supplied by 15%. The elasticity of supply is …`,[`0.67`,`1.0`,`1.5`,`25`],"C",T`@@E_s=\dfrac{15\%}{10\%}=1.5@@, which is elastic.`);
q("L4","A","Concept check",0,"",`A straight-line supply curve passes through the origin. Its elasticity of supply is …`,[`zero`,`between 0 and 1`,`exactly 1 at every point`,`infinite`],"C",`Any straight supply line through the origin has unit elasticity at every point, whatever its slope.`);
q("L5","A","Concept check",0,"",`The equilibrium moves because the <b>supply</b> curve shifts. The percentage changes in equilibrium price and quantity reflect the elasticity of …`,[`demand`,`supply`,`both equally`,`neither`],"A",`A supply shift moves the equilibrium along the (unshifted) demand curve, so the changes reveal the elasticity of demand.`);
q("L6","A","Concept check",0,"",`Which statement about a high price elasticity of demand is correct?`,[`Quantity demanded changes by a larger absolute amount than price`,`The percentage change in quantity demanded is larger than the percentage change in price`,`The demand curve is steep`,`Total revenue always rises when price rises`],"B",`Elasticity compares percentage changes, not absolute amounts (different units cannot be compared). Slope is not elasticity either.`);
q("L7","B","Concept check",0,"",`Price falls by 20% and quantity demanded rises by 10%. Total revenue will …`,[`rise, because demand is elastic`,`fall, because demand is inelastic`,`rise, because demand is inelastic`,`be unchanged`],"B",T`@@E_d=0.5<1@@: inelastic. A price cut on inelastic demand lowers total revenue.`);
q("L8","B","Concept check",0,"",`A 10% rise in the price of a good reduces quantity demanded by 25%. The seller's total revenue will …`,[`rise`,`fall`,`stay the same`,`rise only if costs fall`],"B",T`@@E_d=2.5>1@@: elastic. A price rise on elastic demand lowers total revenue.`);
q("L9","B","Concept check",0,"",`Demand is unit elastic. Price rises by 10%. Total revenue …`,[`rises by 10%`,`falls by 10%`,`is unchanged (approximately)`,`doubles`],"C",T`The percentage fall in quantity offsets the percentage rise in price, so @@TR=P\times Q@@ is unchanged (approximately, for small changes).`);
q("L10","B","Concept check",0,"",`A firm raises its price and its total revenue falls. Demand over that price range must be …`,[`elastic`,`inelastic`,`unit elastic`,`perfectly inelastic`],"A",`Revenue falls after a price rise only when quantity falls proportionally more: elastic demand.`);
q("L11","B","Concept check",0,"",`On a straight-line downward-sloping demand curve, elasticity of demand at a <b>higher price</b> is …`,[`lower than at a lower price`,`higher than at a lower price`,`the same at every point`,`always zero`],"B",`Above the midpoint demand is elastic, below it is inelastic: elasticity falls as you move down the line.`);
q("L12","B","Concept check",0,"",`A perfectly elastic demand curve is …`,[`vertical`,`horizontal`,`a rectangular hyperbola`,`downward sloping straight line`],"B",T`@@E_d=\infty@@: a horizontal line. At a price above it nothing is bought; below it, buyers want unlimited quantities.`);
q("L13","C","Concept check",0,"",`Which good probably has the <b>most inelastic</b> demand?`,[`a particular brand of soft drink`,`holidays abroad`,`cigarettes for a heavy smoker`,`restaurant meals`],"C",`Addictive, no good substitutes, habit-forming. The others have many substitutes or are luxuries.`);
q("L14","C","Concept check",0,"",`In the long run the demand for petrol becomes more elastic mainly because …`,[`petrol becomes a luxury`,`buyers have more time to find substitutes such as electric cars`,`petrol takes a smaller share of income`,`supply becomes inelastic`],"B",`Time is a determinant: more time to search for and switch to substitutes makes demand more elastic.`);
q("L15","C","Concept check",0,"",`The supply of strawberries is less elastic than the supply of T-shirts in the short run because …`,[`strawberries are a necessity`,`agricultural products take a long time to produce`,`T-shirts are durable`,`demand for T-shirts is elastic`],"B",`Agricultural output cannot be raised quickly (growing time), while a factory can use overtime and spare capacity.`);
q("L16","C","Concept check",0,"",`Supply is most likely to be <b>elastic</b> when …`,[`the firm has a lot of spare capacity`,`the production process needs rare specialised skills`,`there are high barriers to entry`,`there is very little time to adjust`],"A",`Spare capacity (for example overtime) lets output respond quickly. B, C and D all make supply inelastic.`);

const EX=[
{id:"V1",k:"num",t:`Arc elasticity`,stem:T`Price rises from $20 to $30; the quantity demanded falls from 60 to 50. Find @@E_d@@ by the midpoint method (two decimal places).`,a:0.45,u:`elasticity`,tol:0.011,src:[S(1,"1")],w:T`@@@\%\Delta P=\dfrac{30-20}{25}=40\%,\qquad \%\Delta Q=\dfrac{50-60}{55}\approx-18.2\%@@@@@@E_d=\left|\dfrac{-18.2\%}{40\%}\right|\approx0.45@@@<p>Inelastic (below 1), so the price rise raises total revenue: @@20\times60=1200@@ becomes @@30\times50=1500@@.</p>`},
{id:"V2",k:"num",t:`Total revenue change`,stem:T`Using the same data, by how much does total revenue change (a rise is positive)?`,a:300,u:`dollars`,tol:0.5,src:[S(2,"3")],w:T`@@TR_1=20\times60=1200@@ and @@TR_2=30\times50=1500@@, so TR rises by @@\$300@@, as expected for inelastic demand and a price rise.`},
{id:"V3",k:"open",t:`Advise a pricing decision`,stem:`A cinema finds that the demand for its tickets is elastic. It wants to increase its revenue. Should it raise or cut its ticket price? Explain with elasticity.`,w:`<p><b>Cut the price.</b> Demand is elastic (@@E_d>1@@), so the percentage rise in quantity demanded is <b>larger</b> than the percentage fall in price. Total revenue (@@P\\times Q@@) therefore rises.</p><p>Raising price would do the opposite: quantity would fall by a larger percentage than price rises, and revenue would fall.</p>`.replace(/@@/g,"@@")}
];

const LONG=[
{id:"G1",src:`Practice (framework from the notes)`,q:`Explain why the demand for a particular brand of milk tea is more elastic than the demand for tea drinks in general. Use two determinants of elasticity.`,m:`<ol><li><b>Number of substitutes.</b> A single brand has many close substitutes (other brands). If its price rises, buyers switch to another brand, so quantity demanded falls by a large percentage. Tea drinks in general have fewer close substitutes.</li><li><b>Proportion of income / necessity.</b> Neither is a necessity, but the brand can be replaced without changing the habit of drinking tea, so switching costs are small.</li></ol><p>Conclude: the percentage fall in quantity demanded exceeds the percentage rise in price, so demand for the brand is elastic.</p>`},
{id:"G2",src:`Practice (framework from the notes)`,q:`The price of fresh vegetables doubles after a typhoon. Explain with elasticity why the effect on quantity is small in the short run but larger a few months later.`,m:`<p><b>Short run.</b> Demand is inelastic: vegetables are a necessity and there is little time to find substitutes. Supply is also inelastic: crops take a long time to grow back (agricultural product, long production time). With both inelastic, a supply shock raises price a lot and changes quantity by a small percentage.</p><p><b>Later.</b> More time means (a) buyers find substitutes such as frozen or imported vegetables, so demand becomes more elastic, and (b) farmers replant and importers adjust, so supply becomes more elastic. Quantity responds more, and price falls back.</p>`}
];

const CS=[
{t:`Common mistakes with elasticity`,zh:`常犯錯誤`,src:[S(3,"5")],h:`
<div class="tw"><table>
<tr><th>Question type</th><th>Typical mistakes</th></tr>
<tr><td>Calculation and meaning of elasticity of demand</td><td>Using "new minus old, divided by old" instead of the midpoint formula · thinking "high elasticity" means quantity changes by more than price in <i>absolute</i> terms (they have different units; only <b>percentages</b> can be compared)</td></tr>
<tr><td>Change in total revenue along a demand curve</td><td>Thinking elasticity is set by the <b>slope</b> (one straight line has different elasticity at different prices: elastic above the midpoint, inelastic below) · not defining elastic and inelastic precisely: the <u>percentage</u> change in price is larger or smaller than the <u>percentage</u> change in quantity · thinking demand must be inelastic when price and quantity rise together (ignoring the direction of the trade) · drawing a supply curve when price is an exogenous variable · not marking the gain and loss areas on the diagram</td></tr>
<tr><td>Identifying types of elasticity of demand</td><td>Confusing <b>unitary elastic</b> demand (price and quantity change by the same percentage in opposite directions, so total revenue is unchanged) with <b>perfectly inelastic</b> demand (quantity does not change when price changes)</td></tr>
<tr><td>Elasticity of demand versus elasticity of supply</td><td>Not knowing when the changes in price and quantity reflect demand or supply elasticity: look at <b>which curve</b> the equilibrium moved along</td></tr>
<tr><td>Factors affecting elasticity</td><td>Often under-revised because it is tested less; weak at explaining a situation using the determinants</td></tr>
<tr><td>Equilibrium in extreme cases</td><td>Usually fine if you use logical reasoning</td></tr>
</table></div>`}
];

Yupi.register({
 id:"micro2",title:"Elasticity of demand and supply",
 sub:`Measuring responsiveness, the five types, what happens to total revenue, and what drives elasticity. From the Micro 2 cheat sheet.`,
 files:{cs:{name:"[CS] Micro 2 Elasticity of Demand and Supply.pdf",dir:"雞精notes/Micro/",pre:"mi2r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet, with the midpoint arithmetic worked after each answer.`,
 csLead:`The error table from the cheat sheet, summarised in English.`,
 verify:[],
 widgets:[{tab:"learn",title:"Elasticity and total revenue",init:(el,Y)=>Y.widgets.elast(el,Y)}]
});
})();
