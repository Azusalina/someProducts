/* Micro chapter 5: Production in the short run and long run. Source: [CS] Micro 5 cheat sheet (13 printed pages). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"S1",t:`A. Definitions: short run and long run`,zh:`定義`,src:[S(1,"1")],h:`
<div class="tw"><table>
<tr><th></th><th>Fixed</th><th>Variable</th></tr>
<tr><td><b>Factor</b></td><td>Quantity does <b>not</b> vary with output</td><td>Quantity varies with output</td></tr>
<tr><td><b>Cost</b></td><td>Fixed cost: does not vary with output (cost of employing fixed factors)</td><td>Variable cost: varies with output (cost of employing variable factors)</td></tr>
</table></div>
<ul>
<li><b>Short run:</b> the production period with both fixed and variable factors.</li>
<li><b>Long run:</b> the production period with <b>only variable</b> factors (all factors can change).</li>
</ul>`},
{id:"S2",t:`B. Law of diminishing marginal returns`,zh:`邊際報酬遞減定律`,src:[S(1,"1")],h:T`
<div class="box">In the <b>short run</b>, when more <b>variable</b> factors are added <i>continuously</i> to a given amount of <b>fixed</b> factors, the marginal product of the variable factor will <i>eventually</i> decrease, <b>holding technology constant</b>.</div>
<ul>
<li><b>Marginal product (MP):</b> the change in total product when the variable factor increases by one unit.</li>
<li><b>Average product (AP):</b> total product per unit of the variable factor, which is the <b>productivity</b> of that factor.</li>
</ul>
<p>The italic words (continuously, eventually, technology constant) are the ones students forget.</p>`},
{id:"S3",t:`Economies and diseconomies of scale`,zh:`規模經濟及規模負經濟`,src:[S(1,"1")],h:T`
<ul>
<li><b>Marginal cost:</b> the change in total cost from producing one more unit. <b>Average cost:</b> @@AC=\dfrac{\text{total cost}}{\text{output}}@@.</li>
<li>The long-run AC curve is U-shaped: falling over the range of <b>economies of scale</b>, rising over <b>diseconomies of scale</b>, with the lowest point at the <b>optimal scale</b>.</li>
<li>Economies of scale means that when <b>all</b> inputs are increased so that output more than doubles for a doubling of inputs, average cost falls. All factors vary, so it is a <b>long-run</b> concept. In the short run the idea does not apply.</li>
</ul>`},
{id:"S4",t:`C. Why: internal and external scale effects`,zh:`規模經濟及規模負經濟的原因`,src:[S(2,"2")],h:`
<div class="tw"><table>
<tr><th></th><th>Economies of scale</th><th>Diseconomies of scale</th></tr>
<tr><td rowspan="2"><b>Internal</b> (the firm itself)</td><td>Bulk-purchase discounts; spread advertising over more output; lower interest rate with more collateral; wider specialisation and management experts; fuller use of machines; spread R&amp;D cost; diversify products and markets to spread risk</td><td>Must buy raw materials from dearer sources once cheap supplies are used up; extra advertising has limited effect in a saturated market; large outstanding loans raise the interest rate; internal structure too complicated, communication and co-ordination problems</td></tr>
<tr></tr>
<tr><td rowspan="2"><b>External</b> (the whole industry or region)</td><td>A region famous for a good attracts buyers and cuts marketing cost; suppliers deliver to several firms at once (lower delivery cost); government improves infrastructure; supporting firms and workers are attracted to the region; government offers training courses (higher industry labour productivity)</td><td>Industry output saturates the market so advertising is less effective; concentration causes traffic congestion (higher transport cost); industry expansion raises the derived demand for factors and so input prices (wage, rent, raw materials)</td></tr>
<tr></tr>
</table></div>`},
{id:"S5",t:`D. Profit maximisation`,zh:`利潤極大化`,src:[S(3,"4"),S(3,"5")],h:T`
<ul>
<li><b>TR-TC approach:</b> find TR and TC at each output and pick the output with the biggest gap @@TR-TC@@.</li>
<li><b>MR-MC approach:</b> if @@MR>MC@@ producing more adds to profit, so the firm increases output; if @@MC>MR@@ the last unit loses money, so it reduces output.</li>
</ul>
<div class="box">@@@\text{profit-maximising output: } MR=MC\qquad(\text{price-taker: } P=MC)@@@</div>
<p><b>Producer surplus and profit.</b></p>
@@@PS=\sum(P-MC)=TR-TVC\qquad\qquad \text{Profit}=TR-TVC-TFC@@@
<ul>
<li><b>If profit is negative, must the firm produce zero?</b> Not necessarily. If it can earn some producer surplus by producing, it still earns a <b>higher profit</b> (a smaller loss) than producing nothing.</li>
<li><b>Fixed cost is irrelevant to the production decision:</b> it is paid however much is produced, so it does not affect marginal cost or the profit-maximising output.</li>
</ul>
<p>How the exam asks: (1) give a cost table and a price, find output, profit and PS; (2) change MC, TFC or P and say what happens (margin note on the scan).</p>`},
{id:"S6",t:`What changes the profit-maximising output?`,zh:`邊際成本、固定成本、市價改變`,src:[S(4,"6")],h:T`
<div class="tw"><table>
<tr><th>Change</th><th>Output</th><th>Producer surplus</th><th>Profit</th></tr>
<tr><td><b>Marginal cost rises</b> (MC curve shifts up)</td><td>Falls</td><td>Falls</td><td>Falls (profit @@=PS-TFC@@)</td></tr>
<tr><td><b>Fixed cost rises</b></td><td>Unchanged (no effect on MC)</td><td>Unchanged</td><td>Falls</td></tr>
<tr><td><b>Market price rises</b></td><td>Rises</td><td>Rises</td><td>Rises</td></tr>
</table></div>
<p><b>Why can the MC schedule be read as the supply schedule?</b> Given the MC schedule and a price, the firm produces until @@P=MC@@ to maximise profit, so the quantity supplied is determined.</p>
<p>Margin examples on the sheet: MC falls by $4, price rises by $1, TFC falls by $200 (so output and PS are unchanged by TFC).</p>`},
{id:"S7",t:`E. Other objectives of firms`,zh:`廠商的其他目標`,src:[S(5,"7")],h:`
<ul>
<li><b>Maximise market share</b> (in unit sales or in sales revenue). Advantages, similar to horizontal expansion: fewer competitors; more market power and influence on price; economies of scale and lower average cost.</li>
<li><b>Corporate social responsibility or non-profit services</b> (charity, environmental protection, gender equality): improves the firm's public image, which may raise long-term profit.</li>
</ul>`},
{id:"S8",t:`F. Market structures`,zh:`市場結構`,src:[S(5,"8")],h:`
<p>A market is any arrangement in which transactions take place, even without a physical location or money.</p>
<div class="tw"><table>
<tr><th></th><th>Perfect competition</th><th>Monopolistic competition</th><th>Oligopoly</th><th>Monopoly</th></tr>
<tr><td>Number of sellers</td><td>Many</td><td>Many</td><td>A few dominant sellers (whatever the number of small ones)</td><td>One</td></tr>
<tr><td>Product</td><td>Homogeneous</td><td>Heterogeneous</td><td>Can be heterogeneous</td><td>No close substitutes</td></tr>
<tr><td>Competition</td><td>Price only</td><td>Price and non-price</td><td>Price and non-price</td><td>Price and non-price</td></tr>
<tr><td>Market information</td><td>Perfect</td><td>Imperfect</td><td>Imperfect</td><td>Imperfect</td></tr>
<tr><td>Price behaviour</td><td>Price-taker</td><td>Price-searcher</td><td>Price-searcher</td><td>Price-searcher</td></tr>
<tr><td>Entry and exit</td><td>Free</td><td>Free</td><td>Entry barriers</td><td>Entry barriers</td></tr>
</table></div>
<ul>
<li>Oligopoly: the pricing and marketing strategies of the dominant firms are <b>interdependent</b>.</li>
<li><b>Sources of monopoly power:</b> government regulation, exclusive ownership of a resource, natural monopoly.</li>
<li>Why a monopolist still faces competition: substitutes, similar factors of production, competition for the monopoly right.</li>
</ul>`},
{id:"S9",t:`G. Why prices differ between sellers: sample answers`,zh:`範本答案`,src:[S(5,"9")],h:`
<p><b>Why XXX market is not perfectly competitive</b> (fill in the case):</p>
<ol>
<li><b>Heterogeneous product:</b> the quality of the product is different.</li>
<li><b>Non-price competition among sellers:</b> for example advertisements, or competing by selling higher quality.</li>
<li><b>Market information is imperfect:</b> customers do not know the quality of the product.</li>
<li>Sellers are <b>price searchers</b> rather than price takers: different sellers charge different prices.</li>
</ol>
<p><b>Why there is a price difference between sellers:</b></p>
<ol>
<li><b>Heterogeneous products:</b> shops with better after-sale service may charge more.</li>
<li><b>Different costs:</b> shops in a more convenient location pay higher rent so charge more; some wholesalers give bulk discounts to retailers, so a lower cost brings a lower price.</li>
<li><b>Imperfect market information:</b> customers do not know which shops charge less, so those charging more still have customers.</li>
</ol>`},
{id:"S10",t:`H. Features of market structures (for multiple choice)`,zh:`市場結構的特徵`,src:[S(6,"10"),S(6,"11")],h:`
<p><b>Perfectly competitive market (price-taker):</b></p>
<ul>
<li>Firms can only take the price as given. The market price is set by demand and supply (this does <b>not</b> mean the price is stable). There is only one price in the market.</li>
<li>A firm charging more than the market price loses all customers: <b>price competition exists</b>.</li>
<li>@@MC@@ schedule = supply schedule; @@MR=P@@; firms produce where @@P=MC@@.</li>
<li>The demand curve faced by an <b>individual firm is horizontal</b>; the demand for the whole market and for an individual consumer are downward sloping.</li>
</ul>
<p><b>Monopoly:</b> no close substitutes; still faces competition (from producers of substitutes and for the franchise); power may come from government restriction or economies of scale (natural monopoly); can sell more than one product.</p>`}
];

const SEC={A:"Short and long run",B:"Costs and scale",C:"Profit maximisation",D:"Market structure"};
q("P1","A","Concept check",0,"",`In the <b>long run</b> …`,[`all factors are variable`,`at least one factor is fixed`,`fixed cost is the only cost`,`the law of diminishing returns applies`],"A",`The long run is the period with only variable factors.`);
q("P2","A","Concept check",0,"",`Which statement about the law of diminishing marginal returns is correct?`,[`it applies in the long run when all factors are increased`,`it applies in the short run when a variable factor is added to a fixed factor, technology constant`,`it says total product eventually falls`,`it says average cost always rises`],"B",`It needs a fixed factor (so short run) and unchanged technology. It concerns marginal product, not total product or average cost directly.`);
q("P3","A","Concept check",0,"",T`A farm adds 1, 2, 3 and 4 workers to a fixed plot and total output is 10, 24, 36, 44 tonnes. The marginal product of the 4th worker is …`,[`8 tonnes`,`11 tonnes`,`36 tonnes`,`44 tonnes`],"A",T`@@MP=44-36=8@@. MP was 10, 14, 12, 8: it started to fall after the 2nd worker.`);
q("P4","A","Concept check",0,"",T`In the previous question, the average product with 4 workers is …`,[`8 tonnes`,`11 tonnes`,`12 tonnes`,`44 tonnes`],"B",T`@@AP=\dfrac{44}{4}=11@@ tonnes per worker (the productivity of labour).`);
q("P5","B","Concept check",0,"",`Which is an <b>internal</b> economy of scale?`,[`government improves roads near the industry`,`suppliers deliver to many firms at once`,`bulk-purchase discounts on raw materials`,`more trained workers become available in the district`],"C",`Bulk-purchase discounts come from the firm's own size. The others come from the industry or region (external).`);
q("P6","B","Concept check",0,"",`Which is an <b>external diseconomy</b> of scale?`,[`communication problems in a large firm`,`traffic congestion from many firms in one district`,`bigger loans carry a higher interest rate`,`advertising has little effect for one firm`],"B",`Concentration of firms in a district raises transport costs for everyone in it: an external diseconomy. A, C and D are internal.`);
q("P7","B","Concept check",0,"",`Economies of scale is a concept that applies to …`,[`the short run only`,`the long run, when all factors can vary`,`the law of diminishing returns`,`fixed cost only`],"B",`Doubling all inputs is only possible when every factor is variable: the long run.`);
q("P8","C","Concept check",0,"",T`A price-taker faces a price of @@\$20@@. Marginal costs of successive units are $6, $10, $14, $18, $22. It maximises profit at …`,[`3 units`,`4 units`,`5 units`,`2 units`],"B",T`Produce while @@MR=P=20\ge MC@@: the 4th unit has @@MC=18<20@@ (add), the 5th has @@MC=22>20@@ (do not add). So 4 units.`);
q("P9","C","Concept check",0,"",T`Same firm, price @@\$20@@, MC as above. Its producer surplus is …`,[`$20`,`$32`,`$52`,`$80`],"C",T`@@PS=\sum(P-MC)=(20-6)+(20-10)+(20-14)+(20-18)=14+10+6+2=32@@. (Producer surplus is revenue minus <i>variable</i> cost: @@80-48=32@@.)`);
q("P10","C","Concept check",0,"",T`In the previous question the total fixed cost is $50. The firm's profit is …`,[`$32`,`-$18`,`$82`,`$30`],"B",T`@@\text{profit}=PS-TFC=32-50=-18@@: a loss of $18. But PS &gt; 0 so producing still beats shutting down (loss of $50).`);
q("P11","C","Concept check",0,"",`The total fixed cost of a price-taking firm rises. The profit-maximising output …`,[`rises`,`falls`,`stays the same`,`falls to zero`],"C",`Fixed cost does not change marginal cost, so output and producer surplus are unchanged. Only profit falls.`);
q("P12","C","Concept check",0,"",`The market price rises. For a price-taking firm: …`,[`output, producer surplus and profit all rise`,`output rises but profit is unchanged`,`output is unchanged`,`only producer surplus rises`],"A",`A higher MR=P line means @@P=MC@@ is at a bigger quantity; the producer surplus area grows and so does profit.`);
q("P13","D","Concept check",0,"",`Which is a feature of a <b>perfectly competitive</b> market?`,[`firms are price-searchers`,`there are entry barriers`,`products are homogeneous and firms are price-takers`,`firms compete by advertising`],"C",`Perfect competition: many sellers, homogeneous product, price competition only, perfect information, price-takers, free entry and exit.`);
q("P14","D","Concept check",0,"",`The demand curve faced by an <b>individual firm</b> in perfect competition is …`,[`horizontal`,`vertical`,`downward sloping`,`upward sloping`],"A",`The firm takes the market price as given: any quantity can be sold at that price, so its demand is horizontal.`);
q("P15","D","Concept check",0,"",`Which is <b>not</b> a source of monopoly power?`,[`government regulation`,`exclusive ownership of a resource`,`natural monopoly from economies of scale`,`many close substitutes`],"D",`Monopoly means no close substitutes. Government restriction, exclusive resources and natural monopoly are the sources.`);
q("P16","D","Concept check",0,"",`In a perfectly competitive market there is only one price. A student concludes that the price must be stable. This is …`,[`correct`,`wrong: the price is set by demand and supply and changes when they shift`,`correct because firms are price-takers`,`correct because there is no competition`],"B",`"Only one price" does not mean "stable price". Price still moves when demand or supply changes.`);

const EX=[
{id:"V1",k:"num",t:`Profit from a cost table`,stem:T`A price-taker sells at @@\$30@@. Marginal cost of each unit: 8, 14, 20, 26, 32. Total fixed cost is $40. Find its profit ($).`,a:12,u:`dollars`,tol:0.01,src:[S(3,"4")],w:T`<p>Produce while @@MC\le30@@: 4 units (the 5th has MC 32 &gt; 30). @@TR=30\times4=120@@ and @@TVC=8+14+20+26=68@@.</p>@@@PS=TR-TVC=52,\qquad \text{profit}=PS-TFC=52-40=12@@@`},
{id:"V2",k:"open",t:`Short run versus long run`,stem:`A student says "a firm's rent is a fixed factor, so in the long run it cannot change it". Comment.`,src:[S(7,"12")],w:`<p>Two mix-ups. Rent is a fixed <b>cost</b>, not a fixed <b>factor</b> (the factor is the premises). And in the <b>long run all factors are variable</b>, so the firm can change its premises; fixed factors exist only in the short run.</p>`},
{id:"V3",k:"open",t:`Price difference between shops`,stem:`Two shops in the same mall sell the same-looking phone case for $60 and $90. Explain why the price can differ and the dearer shop still has customers.`,src:[S(5,"9")],w:`<p>Using the framework: (1) <b>heterogeneous products or services</b>: the dearer shop may offer better after-sale service or quality; (2) <b>different costs</b>: a more convenient location means higher rent; (3) <b>imperfect market information</b>: customers do not know which shop charges less, so the dearer one still has customers. Sellers are price-searchers, not price-takers.</p>`}
];

const LONG=[
{id:"J1",src:`Practice (framework from the notes)`,q:`A price-taking firm's rent falls while the market price rises. Explain the effect on output, producer surplus and profit.`,m:T`<p><b>Rent falls</b> (a fixed cost): no change in marginal cost, so no change in output or producer surplus; profit rises because @@\text{profit}=PS-TFC@@.</p><p><b>Price rises</b>: the MR=P line shifts up; @@P=MC@@ at a larger quantity; output rises; producer surplus rises; profit rises further.</p>`},
{id:"J2",src:`Practice (framework from the notes)`,q:`Explain two reasons for external economies of scale in a manufacturing district.`,m:`<p>(1) <b>Supporting firms and workers are attracted</b> to the region, reducing the average cost of hiring these factors. (2) <b>Suppliers deliver raw materials to many firms at once</b>, lowering the average delivery cost; or the government improves infrastructure and offers training courses (raising industry labour productivity). Link each to a <b>fall in average cost</b>.</p>`}
];

const CS=[
{t:`Common mistakes in production theory`,zh:`常犯錯誤`,src:[S(7,"12"),S(7,"13")],h:`
<div class="tw"><table>
<tr><th>Topic</th><th>Typical mistakes</th></tr>
<tr><td>Short run versus long run</td><td>Treating a fixed "cost" as a fixed "factor" · not realising all factors are variable in the long run · treating consumers as a factor of production</td></tr>
<tr><td>Illustrating diminishing returns with data</td><td>Not noticing the question is set in the long run (so the law does not apply) · not handling cases where workers fall sick · leaving out the key words "continuously", "eventually" and "assuming technology constant"</td></tr>
<tr><td>Calculations</td><td>Not knowing how to get the range of X · small wording differences ("must be smaller than 30" versus "can be smaller than 30")</td></tr>
<tr><td>Conceptual questions</td><td>Not knowing that the sign of marginal product shows the direction of change of total product · average product is the productivity of the variable factor · confusing "labour" (total hours) with "workers" (number of people)</td></tr>
<tr><td>Economies of scale: definition</td><td>Missing that "increase all inputs so output more than doubles" means all factors are variable (long run) · thinking the idea applies in the short run · not seeing that when output is zero any cost still paid is fixed cost</td></tr>
<tr><td>Reasons for economies and diseconomies</td><td>Not saying which cost falls · not linking points to lower average cost · mixing external and internal · misreading "why does average cost fall" as "why does it rise"</td></tr>
<tr><td>Profit maximisation of a price-taker</td><td>Not understanding the assumptions of perfect competition (horizontal demand for the firm) · forgetting the TR-TC approach · confusing profit with producer surplus · thinking a loss means stop · not knowing fixed cost does not change marginal cost or output · not seeing why the MC schedule is a supply schedule</td></tr>
<tr><td>Features of a perfectly competitive market</td><td>Thinking there is no price competition because there is only one price · thinking one price means a stable price</td></tr>
<tr><td>Why not perfectly competitive</td><td>Not tying the explanation to the case · listing a point without explaining it (for example writing "heterogeneous product" but not "different sellers sell goods of different quality")</td></tr>
<tr><td>Identifying market structures</td><td>Calling real markets "perfect competition" (it rarely exists) · writing terms wrongly ("competitive monopoly" instead of "monopolistic competition") · not reading a pie chart</td></tr>
<tr><td>Features of monopoly</td><td>Missing the sources of monopoly power (government is one source but not the only one; natural monopoly)</td></tr>
<tr><td>Why prices differ</td><td>Lack of everyday common sense · no framework prepared</td></tr>
</table></div>`}
];

Yupi.register({
 id:"micro5",title:"Production in the short and long run",
 sub:`Diminishing returns, economies of scale, how a firm picks its output, other firm goals and market structures. From the Micro 5 cheat sheet.`,
 files:{cs:{name:"[CS] Micro 5 Production in Short run and Long run.pdf",dir:"雞精notes/Micro/",pre:"mi5r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet, with the arithmetic worked after each answer.`,
 csLead:`The error table from the cheat sheet, summarised in English.`,
 verify:[["Handwritten margin notes",`Page 4 of the sheet has your handwritten exam framework (given a cost table and price find Q, profit, PS; changes in MC, TFC, P) and page 7 a hand-drawn example. They are folded into the Learn cards; open the badges to see the originals.`,["cs",3,"4"]]],
 widgets:[{tab:"learn",title:"A firm choosing its output",init:(el,Y)=>Y.widgets.firm(el,Y)}]
});
})();
