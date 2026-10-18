/* Micro chapter 0: Demand and supply.
   Written for this site: the supplied scans contain no demand and supply chapter (the file named "Micro 1 Demand & Supply" is really Basic Concepts). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;

const LEARN=[
{id:"D1",t:`What a market does`,zh:`市場的作用`,h:`
<ul>
<li>A <b>market</b> is any arrangement that brings buyers and sellers together. It does not need a place: online shops, stock exchanges and street stalls are all markets.</li>
<li>Buyers and sellers act on <b>price signals</b>. A high price tells buyers to economise and sellers to produce more. A low price does the opposite.</li>
<li>The quantity bought and sold, and the price, are settled where the plans of buyers and sellers match. That point is the <b>equilibrium</b>.</li>
<li>Every statement about demand and supply assumes <b>ceteris paribus</b>: only the factor under discussion changes, everything else is held constant.</li>
</ul>`},
{id:"D2",t:`Demand and the law of demand`,zh:`需求與需求定律`,h:T`
<ul>
<li><b>Demand</b> is the relationship between the price of a good and the <b>quantity demanded</b>: the amount buyers are willing and able to buy at each price, in a given period.</li>
<li><b>Law of demand:</b> a higher price lowers the quantity demanded, ceteris paribus. The demand curve slopes <b>downward</b>.</li>
<li>Why: at a higher price people switch to substitutes (substitution effect), and the same income buys less (income effect). Each extra unit also gives less satisfaction, so people will only buy more at a lower price.</li>
<li>A straight-line demand curve can be written @@P=a-bQ@@, or in quantity form @@Q_d=c-dP@@.</li>
</ul>
<div class="box">Demand curve: price on the vertical axis, quantity on the horizontal axis. Read it as the <i>highest price</i> buyers will pay for each unit.</div>`},
{id:"D3",t:`What shifts demand`,zh:`影響需求的因素`,h:`
<p>A change in the good's own price causes a <b>movement along</b> the demand curve (a change in quantity demanded). Anything else moves the whole curve, a <b>shift</b> (a change in demand).</p>
<div class="tw"><table>
<tr><th>Factor</th><th>Effect on demand</th></tr>
<tr><td>Income</td><td>Rises for a <b>normal good</b> when income rises; falls for an <b>inferior good</b></td></tr>
<tr><td>Price of a substitute</td><td>Substitute becomes dearer: demand for this good rises</td></tr>
<tr><td>Price of a complement</td><td>Complement becomes dearer: demand for this good falls</td></tr>
<tr><td>Tastes and fashion</td><td>Becoming more popular shifts demand right</td></tr>
<tr><td>Number of buyers (population)</td><td>More buyers shift demand right</td></tr>
<tr><td>Expected future price or income</td><td>Expecting a higher price later raises demand now</td></tr>
</table></div>`},
{id:"D4",t:`Supply and the law of supply`,zh:`供應與供應定律`,h:T`
<ul>
<li><b>Supply</b> is the relationship between the price of a good and the <b>quantity supplied</b>: the amount sellers are willing and able to sell at each price.</li>
<li><b>Law of supply:</b> a higher price raises the quantity supplied, ceteris paribus. The supply curve slopes <b>upward</b>.</li>
<li>Why: producing more usually costs more per unit (rising marginal cost), so sellers need a higher price to supply more. A higher price also attracts new sellers.</li>
<li>A straight-line supply curve can be written @@P=c+dQ@@. Read it as the <i>lowest price</i> sellers will accept for each unit.</li>
</ul>`},
{id:"D5",t:`What shifts supply`,zh:`影響供應的因素`,h:`
<div class="tw"><table>
<tr><th>Factor</th><th>Effect on supply</th></tr>
<tr><td>Price of factors of production (wages, rent, materials)</td><td>Dearer inputs raise cost: supply shifts <b>left</b></td></tr>
<tr><td>Technology</td><td>Better technology lowers cost: supply shifts <b>right</b></td></tr>
<tr><td>Number of sellers</td><td>More sellers shift supply right</td></tr>
<tr><td>Taxes and subsidies</td><td>A per-unit tax shifts supply left; a subsidy shifts it right</td></tr>
<tr><td>Prices of other goods the firm could make</td><td>If another good becomes more profitable, supply of this good falls</td></tr>
<tr><td>Expected future price</td><td>Expecting a higher price later reduces supply now</td></tr>
</table></div>
<p>As with demand, a change in the good's <b>own price</b> is a movement along the curve, not a shift.</p>`},
{id:"D6",t:`Equilibrium, shortage and surplus`,zh:`均衡、短缺與過剩`,h:T`
<ul>
<li><b>Equilibrium</b> is the price at which quantity demanded equals quantity supplied: @@Q_d=Q_s@@. At that price nobody who is willing and able to trade is left out.</li>
<li><b>Price above equilibrium:</b> quantity supplied exceeds quantity demanded, a <b>surplus</b>. Unsold stock pushes price down.</li>
<li><b>Price below equilibrium:</b> quantity demanded exceeds quantity supplied, a <b>shortage</b>. Competing buyers bid price up.</li>
<li>With demand @@P=100-Q@@ and supply @@P=20+Q@@, set them equal: @@100-Q=20+Q@@, so @@Q^*=40@@ and @@P^*=60@@.</li>
</ul>`},
{id:"D7",t:`What happens when a curve shifts`,zh:`曲線移動的結果`,h:`
<div class="tw"><table>
<tr><th>Change</th><th>Equilibrium price</th><th>Equilibrium quantity</th></tr>
<tr><td>Demand increases</td><td>Rises</td><td>Rises</td></tr>
<tr><td>Demand decreases</td><td>Falls</td><td>Falls</td></tr>
<tr><td>Supply increases</td><td>Falls</td><td>Rises</td></tr>
<tr><td>Supply decreases</td><td>Rises</td><td>Falls</td></tr>
<tr><td>Demand and supply both increase</td><td>Unclear</td><td>Rises</td></tr>
<tr><td>Demand rises, supply falls</td><td>Rises</td><td>Unclear</td></tr>
</table></div>
<p>When both curves shift, one variable is certain and the other depends on which shift is larger. Use the diagram below: move both sliders and watch.</p>`}
];

const SEC={A:"Demand",B:"Supply",C:"Equilibrium"};
q("M1","A","Concept check",0,"",`Which of the following causes a <b>movement along</b> the demand curve for apples?`,[`a fall in the price of apples`,`a rise in consumers' income`,`a fall in the price of oranges, a substitute`,`a change in consumers' tastes in favour of apples`],"A",`Only a change in the good's <b>own price</b> moves you along its demand curve. B, C and D shift the whole curve.`);
q("M2","A","Concept check",0,"",`Consumers' incomes rise and the demand for good X <b>falls</b>. Good X is …`,[`a normal good`,`an inferior good`,`a complement`,`a substitute`],"B",`Demand for an inferior good falls as income rises (people switch to better goods).`);
q("M3","A","Concept check",0,"",`The price of coffee rises. What happens to the demand for tea, a substitute?`,[`It increases`,`It decreases`,`It is unchanged`,`The quantity demanded of tea decreases`],"A",`Coffee becomes dearer, so some buyers switch to tea. The demand curve for tea shifts right.`);
q("M4","A","Concept check",0,"",`The price of printers rises. What happens to the demand for ink cartridges, a complement?`,[`It increases`,`It decreases`,`It is unchanged`,`The supply of cartridges decreases`],"B",`Fewer printers are bought, so fewer cartridges are needed: demand for cartridges shifts left.`);
q("M5","A","Concept check",0,"",`Which of the following is <b>NOT</b> a determinant of the demand for a good?`,[`consumers' income`,`the price of a substitute`,`the cost of producing the good`,`consumers' expectations of future prices`],"C",`Cost of production affects <b>supply</b>, not demand.`);
q("M6","B","Concept check",0,"",`Which of the following shifts the supply curve of cars to the <b>left</b>?`,[`an increase in the wages of car workers`,`an improvement in production technology`,`a rise in the price of cars`,`more car manufacturers entering the market`],"A",`Higher wages raise cost, so sellers supply less at each price. B and D shift supply right; C is a movement along the curve.`);
q("M7","B","Concept check",0,"",`The government gives a per-unit subsidy to producers of electric bicycles. The supply curve of electric bicycles …`,[`shifts left`,`shifts right`,`does not move; there is a movement along it`,`becomes steeper`],"B",`A subsidy lowers the cost of each unit, so sellers supply more at every price: a right shift.`);
q("M8","C","Concept check",0,"",`At a price <b>above</b> the equilibrium price …`,[`there is a shortage and price tends to rise`,`there is a surplus and price tends to fall`,`quantity demanded equals quantity supplied`,`demand will shift left`],"B",`Sellers want to sell more than buyers want to buy, so unsold stock builds up and price falls. Price movements are along the curves; neither curve shifts.`);
q("M9","C","Concept check",0,"",`A new technology lowers the cost of producing smartphones. In the smartphone market the equilibrium price and quantity will …`,[`price falls, quantity rises`,`price rises, quantity rises`,`price falls, quantity falls`,`price rises, quantity falls`],"A",`Supply increases (shifts right): price falls and quantity rises.`);
q("M10","C","Concept check",0,"",`Both the demand and the supply of a good increase. The equilibrium quantity will certainly …`,[`rise, and price will rise`,`rise, but the effect on price is unclear`,`fall, and price will fall`,`stay the same`],"B",`Both shifts push quantity up. Price rises with the demand shift and falls with the supply shift, so the net effect depends on which is bigger.`);
q("M11","C","Concept check",0,"",T`Demand is @@P=100-Q@@ and supply is @@P=20+Q@@. The equilibrium quantity is …`,[`30`,`40`,`50`,`60`],"B",T`Set @@100-Q=20+Q@@, so @@2Q=80@@ and @@Q^*=40@@ (and @@P^*=60@@).`);
q("M12","C","Concept check",0,"",T`Demand rises so that it becomes @@P=110-Q@@ (supply unchanged, @@P=20+Q@@). The new equilibrium price is …`,[`60`,`62.5`,`65`,`70`],"C",T`@@110-Q=20+Q@@ gives @@Q^*=45@@, so @@P^*=20+45=65@@.`);

const EX=[
{id:"E1",k:"num",t:`Find the equilibrium price`,stem:T`In a market the quantity demanded is @@Q_d=120-2P@@ and the quantity supplied is @@Q_s=-30+3P@@. Find the equilibrium price.`,a:30,u:`price`,tol:0.01,w:T`<p>Set @@Q_d=Q_s@@:</p>@@@120-2P=-30+3P \;\Rightarrow\; 150=5P \;\Rightarrow\; P^*=30@@@<p>Then @@Q^*=120-2(30)=60@@. Check with supply: @@-30+3(30)=60@@.</p>`},
{id:"E2",k:"num",t:`Shift the demand curve`,stem:T`Now demand increases by 20 units at every price, so @@Q_d=140-2P@@ (supply unchanged). Find the new equilibrium price.`,a:34,u:`price`,tol:0.01,w:T`<p>@@140-2P=-30+3P@@ gives @@170=5P@@, so @@P^*=34@@ and @@Q^*=140-68=72@@.</p><p>Both price (30 to 34) and quantity (60 to 72) rise, as the table in the notes predicts for a demand increase.</p>`},
{id:"E3",k:"open",t:`Explain a price change`,stem:`The price of beef rises sharply after a disease outbreak kills many cattle. Using a demand and supply diagram, explain why. Then say what happens to the demand for chicken.`,w:`<p>The outbreak raises costs and cuts the number of cattle: the <b>supply of beef decreases</b> (shifts left). At the old price there is now a shortage, so the price rises until quantity demanded again equals quantity supplied: equilibrium price rises, equilibrium quantity falls.</p><p>Chicken is a substitute. Beef is dearer, so buyers switch: the <b>demand for chicken increases</b> (shifts right), which raises the price and quantity of chicken.</p>`}
];

const CS=[
{t:`Common mistakes`,zh:`常犯錯誤`,h:`
<div class="tw"><table>
<tr><th>Mistake</th><th>Fix</th></tr>
<tr><td>Calling a price-driven change a "change in demand"</td><td>A change in the good's own price is a change in <b>quantity demanded</b> (movement along). Only other factors change <b>demand</b> (shift).</td></tr>
<tr><td>Shifting the curve when only the price changed</td><td>Price is on the axis. It moves you along the curve; it never shifts that same curve.</td></tr>
<tr><td>Mixing demand and supply factors</td><td>Cost of inputs, technology, number of sellers, taxes: supply. Income, tastes, related goods, number of buyers: demand.</td></tr>
<tr><td>Saying "price rises because demand rises" without the mechanism</td><td>Say: at the old price a shortage appears, buyers compete, price rises until quantity demanded equals quantity supplied.</td></tr>
<tr><td>Both curves shift but the answer names one definite change</td><td>Only one of price or quantity is certain; the other depends on the relative size of the shifts.</td></tr>
<tr><td>Forgetting ceteris paribus</td><td>State that other factors are held constant when you shift one curve.</td></tr>
</table></div>`}
];

Yupi.register({
 id:"micro0",title:"Demand and supply",
 sub:`How a market sets price and quantity, and what moves the curves. Written for this site (your files contain no demand and supply chapter), with a diagram you can drag.`,
 files:{},qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:[],cs:CS,
 qLead:`Concept-check questions written for this site. Answers are explained after each choice.`,
 csLead:`The usual traps in demand and supply questions.`,
 verify:[["Where this chapter comes from",`The notes, questions and diagram are written for this site from standard HKDSE content. No page of your scans is quoted, so there are no source badges here. The later chapters (Elasticity, Market intervention, Efficiency) reuse the same diagram.`]],
 widgets:[{tab:"learn",title:"Move the curves",init:(el,Y)=>Y.widgets.sd(el,Y,{modes:["none"]})}]
});
})();
