/* Micro chapter 8: Production and factors of production. Source: [CS] Micro 8 cheat sheet (12 printed pages). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"G1",t:`A. Consumer goods and producer goods`,zh:`消費者物品和生產者物品`,src:[S(1,"1")],h:`
<ul>
<li><b>Consumption:</b> activities that directly satisfy human wants. <b>Consumer good:</b> a good that directly satisfies wants.</li>
<li><b>Production:</b> the process of turning inputs into output. <b>Producer good (capital good):</b> a good used for <u>further</u> production.</li>
<li>Production may or may not involve exchange: self-sufficiency involves production but no exchange.</li>
<li>The <b>same good</b> can be a consumer good or a producer good, depending on what it is used for or who buys it.</li>
</ul>`},
{id:"G2",t:`B. Stages of production`,zh:`生產的階段`,src:[S(1,"1")],h:`
<div class="tw"><table>
<tr><th>Stage</th><th>Activity</th><th>Output</th></tr>
<tr><td><b>Primary</b></td><td>Extract or use <b>natural resources</b></td><td>Raw materials</td></tr>
<tr><td><b>Secondary</b></td><td>Turn raw materials into finished or semi-finished goods</td><td>Producer goods</td></tr>
<tr><td><b>Tertiary</b></td><td>Provide <b>services</b></td><td>Services</td></tr>
</table></div>
<p>The three stages are interdependent. Margin note: do not define primary production as "production of raw materials"; the key phrase is <i>natural resources</i>.</p>`},
{id:"G3",t:`C. Private goods and public goods`,zh:`私用品和共用品`,src:[S(2,"2")],h:T`
<ul>
<li>A <b>public good</b> is <b>non-rivalrous</b> and <b>non-excludable</b> in consumption. A <b>private good</b> is rivalrous and excludable in consumption.</li>
<li><b>Non-rivalrous:</b> one person's consumption does not reduce the quantity or quality available to others; concurrent consumption is possible; the marginal cost of serving an additional customer is <b>zero</b>.</li>
<li><b>Non-excludable:</b> it is impossible or too costly to identify and stop non-payers (free-riders). So private firms find it hard to charge.</li>
<li>Both properties are matters of <b>degree</b>: some goods become rivalrous when use is intense; some are "semi-excludable".</li>
</ul>
<div class="note">Margin note: do not confuse "marginal cost of serving an additional customer" (zero for a public good) with "marginal cost of producing an extra unit of the public good" (which is above zero).</div>`},
{id:"G4",t:`D. Division of labour: types and advantages`,zh:`分工合作`,src:[S(2,"3")],h:`
<p><b>Types:</b> <i>simple</i> (different people specialise in different goods or services), <i>complex</i> (different people specialise in different production stages of the <u>same</u> good), <i>regional</i> (different regions specialise in different goods).</p>
<p><b>Advantages</b></p>
<ul>
<li><b>Raising labour productivity:</b> the right person in the right job; practice makes perfect; saving training time; saving time in job rotation; stimulus to mechanisation (work divided into small tasks is easier to design machines for).</li>
<li><b>Reducing the need for capital goods:</b> three chefs working separately need three kitchens and three sets of tools; with division of labour they share one kitchen with different tools, so idle tools are used more fully.</li>
</ul>`},
{id:"G5",t:`Division of labour: disadvantages and limits`,zh:`分工合作的壞處與限制`,src:[S(3,"4"),S(3,"5")],h:`
<p><b>Disadvantages:</b></p>
<ul>
<li><b>Work becomes dull and monotonous:</b> lower job satisfaction, workers may perform worse.</li>
<li><b>Higher risk of unemployment:</b> skills are specific, so occupational mobility is lower.</li>
<li><b>Greater interdependence:</b> a break in one stage disrupts the others and slows the whole process.</li>
<li><b>Decline in craftsmanship:</b> workers produce only parts, so fewer people can complete the whole product.</li>
</ul>
<p><b>Limits:</b></p>
<ul>
<li><b>Nature of the product:</b> some work needs individual creativity (painting) and cannot be split.</li>
<li><b>Size of the market:</b> a small market does not need many people specialised in different stages.</li>
<li><b>Possibility of exchange:</b> exchange is a pre-requisite of specialisation. If exchange becomes costly (trade barriers such as quotas and tariffs), division of labour becomes less practical.</li>
</ul>`},
{id:"G6",t:`E. The four factors of production`,zh:`生產要素`,src:[S(4,"6")],h:`
<div class="tw"><table>
<tr><th>Factor</th><th>Definition</th><th>Factor return</th></tr>
<tr><td>Labour</td><td>Human effort (mental and physical) used in production, measured in man-hours</td><td>Wage</td></tr>
<tr><td>Entrepreneurship</td><td>Human effort that <b>bears business risk</b></td><td>Profit</td></tr>
<tr><td>Capital</td><td>Man-made resources used in production (producer or capital goods)</td><td>Interest</td></tr>
<tr><td>Land</td><td>Natural resources used in production</td><td>Rent</td></tr>
</table></div>
<ul>
<li>The return to entrepreneurship (profit) <b>can be negative</b>: costs are paid before the product is sold and revenue is unknown. The return to labour (wage) is always positive.</li>
<li><b>Land:</b> there is no cost of producing land (not man-made); its supply is <b>perfectly inelastic</b>; it can change over time by natural forces (tree growth, oil forming); it has the <b>lowest geographical mobility</b> of all factors.</li>
</ul>`},
{id:"G7",t:`Capital: types and formation`,zh:`資本的種類與形成`,src:[S(4,"7")],h:T`
<ul>
<li><b>Semi-finished goods / intermediate goods / raw materials:</b> used up or incorporated into the final product.</li>
<li><b>Fixed capital:</b> used repeatedly in production (may wear out). <b>Human capital:</b> knowledge and skill. Fixed and human capital usually raise the productivity of other factors.</li>
</ul>
<div class="box">@@@\text{change in capital stock}=\text{capital formation}-\text{depreciation (capital consumption)}@@@</div>
<ul>
<li><b>Capital formation</b> is the production of capital goods. <b>Depreciation</b> is the fall in capital stock from wear, tear and obsolescence. An increase in capital stock is <b>capital accumulation</b>.</li>
<li>Capital formation is an <b>investment</b>: it sacrifices scarce resources that could have produced consumer goods today. Its opportunity cost is the consumer goods forgone.</li>
</ul>`},
{id:"G8",t:`F. Wage payment methods`,zh:`付酬方式`,src:[S(5,"8")],h:`
<p>The sheet gives the feature of each method as a blank table. Filled in below from the features (a tick means the method has that advantage, a cross means it does not or has the disadvantage):</p>
<div class="tw"><table>
<tr><th>Advantage or disadvantage</th><th>Time rate</th><th>Piece rate</th><th>Commission</th><th>Profit-sharing</th></tr>
<tr><td>Higher working incentive and productivity (higher output yields higher income)</td><td>No</td><td>Yes</td><td>Yes</td><td>Weak</td></tr>
<tr><td>Lower cost of monitoring workers' effort</td><td>No</td><td>Yes</td><td>Yes</td><td>Weak</td></tr>
<tr><td>Higher cost of monitoring quality (work in haste)</td><td>No</td><td>Yes</td><td>Possible</td><td>No</td></tr>
<tr><td>Lower cost of measuring output and calculating the wage</td><td>Yes</td><td>No</td><td>No</td><td>No</td></tr>
<tr><td>Maintains a stable team of staff (stable income)</td><td>Yes</td><td>No</td><td>No</td><td>No</td></tr>
<tr><td>Shares business risk with employees (lower wage when business is poor)</td><td>No</td><td>No</td><td>Yes</td><td>Yes</td></tr>
<tr><td>Induces employees to economise on the firm's resources (saving cost yields higher wage)</td><td>No</td><td>No</td><td>No</td><td>Yes</td></tr>
<tr><td>Possible higher income</td><td>No</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
<tr><td>More stable income</td><td>Yes</td><td>No</td><td>No</td><td>No</td></tr>
<tr><td>Employees must share the business risk (disadvantage)</td><td>No</td><td>No</td><td>Yes</td><td>Yes</td></tr>
<tr><td>Employees bear the firm's production cost (disadvantage)</td><td>No</td><td>No</td><td>No</td><td>Yes</td></tr>
</table></div>
<p><b>Commission versus profit-sharing:</b> commission pays a share of <i>total revenue</i>; profit-sharing pays a share of <i>total profit</i>, so total cost also affects the wage.</p>`},
{id:"G9",t:`G. Labour supply and labour productivity`,zh:`勞力供應和勞工生產力`,src:[S(5,"9")],h:T`
<ul>
<li><b>Labour (supply)</b> = total number of working hours (= hours per worker @@\times@@ number of workers).</li>
<li><b>Labour force</b> = number of "workers": people willing and able to work, including the employed and the unemployed.</li>
</ul>
<div class="box">@@@\text{labour productivity}=\dfrac{\text{total output}}{\text{labour (supply)}}@@@</div>
<p><b>Labour supply increases if:</b> population increases; working-age population increases; workers work longer hours; workers have a higher working incentive.</p>
<p><b>Labour productivity increases if:</b> more capital goods are used; technology improves; more or better education is provided; workers have better health; workers have better working conditions; division of labour is practised to a greater extent; piece rate replaces time rate.</p>`},
{id:"G10",t:`H. Mobility of labour`,zh:`勞力流動性`,src:[S(6,"10")],h:`
<ul>
<li><b>Occupational mobility:</b> the ease of moving from one occupation to another. <b>Geographical mobility:</b> the ease of moving from one location to another.</li>
<li><b>Geographical mobility rises if:</b> the transport network improves; transport cost falls; workers are more willing or able to work in other regions.</li>
<li><b>Occupational mobility rises if:</b> there is more information about vacancies; workers acquire more skills; specialisation decreases; the cost of quitting a job decreases.</li>
</ul>`}
];

const SEC={A:"Goods and production",B:"Division of labour",C:"Factors and labour"};
q("F1","A","Concept check",0,"",`A bakery buys flour to make bread for sale. For the bakery, the flour is …`,[`a consumer good`,`a producer good`,`a public good`,`a free good`],"B",`Goods used for further production are producer (capital) goods. The same flour bought by a household would be a consumer good.`);
q("F2","A","Concept check",0,"",`Which statement defines <b>primary production</b> correctly?`,[`the production of raw materials`,`the extraction or use of natural resources`,`turning raw materials into goods`,`providing services`],"B",`Primary production extracts or uses natural resources (its output is raw materials). The notes warn against defining it only as "production of raw materials".`);
q("F3","A","Concept check",0,"",`A hairdresser cutting hair belongs to which stage of production?`,[`primary`,`secondary`,`tertiary`,`none of them`],"C",`Providing services is tertiary production.`);
q("F4","A","Concept check",0,"",`Which of the following is a <b>public good</b>?`,[`a hamburger`,`street lighting`,`a ticket for a concert`,`a private car`],"B",`Street lighting is non-rivalrous (one person's use does not reduce another's) and non-excludable (non-payers cannot be stopped).`);
q("F5","A","Concept check",0,"",`The marginal cost of serving one more customer of a public good is …`,[`positive and rising`,`zero`,`negative`,`equal to the price`],"B",`Non-rivalry means an extra user takes nothing away from others: zero marginal cost of serving that customer.`);
q("F6","B","Concept check",0,"",`In a restaurant, one worker takes orders, another cooks and another washes dishes. This is …`,[`simple division of labour`,`complex division of labour`,`regional division of labour`,`no division of labour`],"B",`Different people specialise in different production stages of the <b>same</b> service: complex division of labour.`);
q("F7","B","Concept check",0,"",`Hong Kong specialises in finance and Dongguan in manufacturing. This is …`,[`simple division of labour`,`complex division of labour`,`regional division of labour`,`craftsmanship`],"C",`Different regions specialise in different goods and services.`);
q("F8","B","Concept check",0,"",`Which is a <b>disadvantage</b> of division of labour?`,[`workers practise one task so become more skilled`,`workers' skills are specific so occupational mobility is lower`,`idle tools are used more fully`,`machines are easier to design`],"B",`Specific skills are hard to transfer to other jobs, raising the risk of unemployment. The others are advantages.`);
q("F9","B","Concept check",0,"",`Which limits the extent of division of labour?`,[`a large market`,`low transaction costs`,`a small market`,`free trade`],"C",`In a small market there is no need to employ many specialised workers for a large output.`);
q("F10","B","Concept check",0,"",`A common error is to say division of labour raises productivity because "fewer capital goods are needed". In fact, that is …`,[`the main reason for higher productivity`,`another advantage of division of labour, unrelated to productivity`,`a disadvantage`,`a limit`],"B",`Using capital more fully is an advantage of division of labour, but it is separate from the productivity gain.`);
q("F11","C","Concept check",0,"",`The factor return to <b>capital</b> is …`,[`wage`,`profit`,`interest`,`rent`],"C",`Labour: wage. Entrepreneurship: profit. Capital: interest. Land: rent. Do not call interest "profit".`);
q("F12","C","Concept check",0,"",`Which factor of production's return can be <b>negative</b>?`,[`labour`,`capital`,`land`,`entrepreneurship`],"D",`Entrepreneurs pay costs before revenue is known, so profit can be negative.`);
q("F13","C","Concept check",0,"",`Which statement about land is correct?`,[`its supply is perfectly elastic`,`it has high geographical mobility`,`its supply is perfectly inelastic`,`it is produced by labour`],"C",`Land is not man-made, so more cannot be produced when its price rises: perfectly inelastic supply. It has the lowest geographical mobility.`);
q("F14","C","Concept check",0,"",T`Capital formation is @@\$80@@ million and depreciation is @@\$30@@ million. The change in capital stock is …`,[`-$50 million`,`$30 million`,`$50 million`,`$110 million`],"C",T`@@\text{change in capital stock}=80-30=50@@. A positive change is capital accumulation.`);
q("F15","C","Concept check",0,"",T`Total output is 600 units and total working hours are 200. Labour productivity is …`,[`3 units per hour`,`120 units`,`0.33 units per hour`,`800 units`],"A",T`@@\dfrac{600}{200}=3@@ units per working hour. The labour supply (the hours) is already the denominator.`);
q("F16","C","Concept check",0,"",`A rise in the wage rate leads to a rise in the labour supplied. This is shown as …`,[`a rightward shift of the labour supply curve`,`a movement along the same labour supply curve`,`a leftward shift`,`no change`],"B",`A change in the wage is a change in <b>quantity</b> supplied: a movement along the curve. Population, hours worked and incentive shift the curve.`);
q("F17","C","Concept check",0,"",`Which increases <b>geographical</b> mobility of labour?`,[`workers acquire more skills`,`a better transport network`,`more information about vacancies`,`less specialisation`],"B",`A better transport network and lower transport cost raise geographical mobility. The others raise occupational mobility.`);

const EX=[
{id:"H1",k:"num",t:`Labour productivity`,stem:T`A factory employs 50 workers, each working 8 hours a day, and produces 2,400 units a day. Find labour productivity (units per working hour).`,a:6,u:`units per hour`,tol:0.01,src:[S(5,"9")],w:T`<p>Labour supply = total working hours = @@8\times50=400@@ hours. @@\dfrac{2400}{400}=6@@ units per hour.</p><p>Do not multiply again by the number of workers if the question already gives total hours.</p>`},
{id:"H2",k:"open",t:`Pay method from the employer's view`,stem:`A firm wants to reduce the cost of monitoring its workers' effort. Which wage payment method should it use? What problem might appear?`,src:[S(5,"8")],w:`<p>A <b>piece rate</b> (or commission). Workers' income depends on output, so they have a high incentive and little monitoring of effort is needed ("more work, more pay").</p><p>Problem: workers may <b>work in haste and sacrifice quality</b>, so the cost of monitoring the quality of output is higher; the firm also needs to measure output to calculate the wage.</p>`},
{id:"H3",k:"open",t:`Imported workers and productivity`,stem:`Hong Kong imports workers. Explain why average labour productivity does not necessarily fall.`,src:[S(7,"12")],w:`<p>The error is to see only the larger denominator (more labour) and conclude productivity falls. Compare the <b>average labour productivity of the existing workers</b> with that of the <b>newly added workers</b>. If the new workers are at least as productive as the average, productivity does not fall; if they are more productive, it rises.</p>`}
];

const LONG=[
{id:"K1",src:`Practice (framework from the notes)`,q:`Explain why division of labour raises labour productivity, and give two limits to its use.`,m:`<p><b>Why productivity rises:</b> (1) the right person is chosen for the right job; (2) practice makes perfect; (3) time is saved in training and in changing jobs; (4) work divided into small tasks makes it easier to design machines (mechanisation).</p><p><b>Limits:</b> (1) <b>size of the market</b>: a small market does not need many specialised workers; (2) <b>possibility of exchange</b>: specialisation requires exchange, so trade barriers or costly exchange reduce it; (3) <b>nature of the product</b>: work needing individual creativity cannot be split.</p>`},
{id:"K2",src:`Practice (framework from the notes)`,q:`An employer pays workers a commission instead of a time rate. Discuss from the viewpoint of employees.`,m:`<p><b>Advantages:</b> a higher income is possible because wages depend on sales or revenue ("more work, more pay").</p><p><b>Disadvantages:</b> income becomes less stable; employees must share the business risk (lower wage when business is poor).</p><p>Read the question for the viewpoint asked: <i>employers</i> or <i>employees</i>. From the employer's viewpoint, the lower cost of monitoring effort would be the main point instead.</p>`}
];

const CS=[
{t:`Common mistakes with production and factors`,zh:`常犯錯誤`,src:[S(6,"11"),S(7,"12")],h:`
<div class="tw"><table>
<tr><th>Topic</th><th>Typical mistakes</th></tr>
<tr><td>Consumer and producer goods</td><td>Thinking production must involve exchange (self-sufficiency is production without exchange) · overlooking "from the society's point of view" or "from the producer's point of view" when classifying</td></tr>
<tr><td>Stages of production</td><td>Defining primary production only as "raw materials" without "natural resources" · jumping from percentage changes to absolute changes · not checking whether data is about employment or GDP · drawing unrelated macro conclusions from the data</td></tr>
<tr><td>Public and private goods</td><td>Confusing the good itself with its carrier (knowledge versus books; TV broadcast versus television set) · confusing the marginal cost of producing one more unit with the marginal cost of serving one more customer · leaving out "in consumption" or "one person's use will not reduce what is available to others"</td></tr>
<tr><td>Division of labour</td><td>Forgetting the types (simple, complex, regional) · using "fewer capital goods required" to explain higher productivity · not knowing the link with occupational mobility · forgetting the limits</td></tr>
<tr><td>Factors of production</td><td>Mixing "what types of production" with "what types of factors" · missing risk-bearing as the key feature of entrepreneurship · forgetting "used in production" in the definitions of land and capital · calling interest on capital "profit"</td></tr>
<tr><td>Wage payment methods</td><td>Not noticing whether the question asks from the employer's or the employees' viewpoint · writing only "monitoring cost" (there are several: effort, performance, quality) · not seeing that commission uses total revenue while profit-sharing uses total profit, so cost matters</td></tr>
<tr><td>Labour supply and productivity</td><td>Treating labour as the labour force or the number of workers; confusing hours, heads and marks · multiplying total hours by the number of workers · forgetting working incentive, investment in human capital and competitive supply as factors · treating a wage rise as a shift (it is a movement) · assuming importing workers lowers productivity without comparing the existing workers' average with the newcomers' average</td></tr>
<tr><td>Mobility of labour</td><td>Not saying whether it is occupational or geographical · missing the effect of monetary and non-monetary reward on the cost of quitting</td></tr>
</table></div>`}
];

Yupi.register({
 id:"micro8",title:"Production and factors of production",
 sub:`Consumer and producer goods, stages of production, public goods, division of labour, the four factors, wage methods, labour supply and mobility. From the Micro 8 cheat sheet.`,
 files:{cs:{name:"[CS] Micro 8 Production and Factors of production.pdf",dir:"雞精notes/Micro/",pre:"mi8r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet.`,
 csLead:`The error table from the cheat sheet, summarised in English.`,
 verify:[["Wage method table was blank",`Page 8 of the sheet leaves the four method columns empty. The filled-in table on the Learn tab is my own reading of each feature, please check it against your teacher's version before relying on the "weak" and "possible" cells.`,["cs",5,"8"]]]
});
})();
