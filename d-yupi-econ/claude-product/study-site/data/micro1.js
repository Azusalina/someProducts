/* Micro chapter 1: Basic concepts.
   Source: [CS] Micro 7 Basic Concepts cheat sheet (the file named "Micro 1 Demand & Supply" is the same material). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"B1",t:`A. Opportunity cost`,zh:`機會成本`,src:[S(1,"1")],h:T`
<div class="box">@@@\text{opportunity cost}=\text{value of the highest-valued option forgone (HVOF)}@@@</div>
<p>Ask which option's value changed, and whether it was the one that decides the opportunity cost (OC).</p>
<div class="tw"><table>
<tr><th>What changes</th><th>Effect on OC</th></tr>
<tr><td>Value of the <b>chosen</b> option</td><td>No effect. OC depends on what you gave up, not on what you chose.</td></tr>
<tr><td>Value of the <b>HVOF</b> rises or falls</td><td>OC rises or falls with it.</td></tr>
<tr><td>A <b>non-highest</b> forgone option falls</td><td>No change. The HVOF is still the same.</td></tr>
<tr><td>A non-highest forgone option rises but <b>stays below</b> the HVOF</td><td>No change.</td></tr>
<tr><td>A non-highest forgone option rises <b>above</b> the old HVOF</td><td>OC rises: it has become the new HVOF.</td></tr>
</table></div>
<p>Margin notes on the scan: "order of preference" (rank the forgone options first) and a star beside the last case, because it is the one students forget.</p>`},
{id:"B2",t:`Full cost`,zh:`完全成本`,src:[S(2,"2")],h:T`
<ul>
<li>As long as there is a choice there is a cost. Different choices involve different kinds of sacrifice.</li>
<li><b>Money cost</b> of an action = value of the highest-valued alternative use of the money (the payment itself).</li>
<li><b>Time cost</b> = value of the highest-valued alternative use of the time (or the income forgone).</li>
<li><b>Cost of using a good you own</b> = the return from renting it out or reselling it.</li>
<li><b>Cost of quitting a job</b> = value of the existing job (money return plus non-money return).</li>
<li><b>Sunk (historical) cost:</b> past expenditure that is <i>irrecoverable</i> and <i>irrelevant to the present decision</i>.</li>
</ul>
<div class="box">@@@\text{full cost}=\text{monetary cost}+\text{non-monetary cost}@@@</div>`},
{id:"B3",t:`Full cost: seven reminders`,zh:`完全成本注意事項`,src:[S(2,"3")],h:`
<ol>
<li>Different people have different alternative uses of time, so the same time spent can cost different amounts.</li>
<li>A higher money cost does not always mean a higher full cost: if the non-monetary cost saved is larger than the extra money, the full cost is lower.</li>
<li>The cost of <b>using</b> a property is what you could earn by renting or reselling it. What you paid to acquire it in the past is a sunk cost and is irrelevant.</li>
<li>Cost can include <b>risk</b>: a probability of sacrificing something (health, legal trouble).</li>
<li>When asking whether full cost changes, check: money cost of the chosen option, time cost of the chosen option, value of other forgone options, risk of the chosen option.</li>
<li>When price is below equilibrium there is a shortage and non-price competition arises: there is an extra cost, other than the market price, in obtaining the good.</li>
<li>The law of demand can explain behaviour in general: put the full cost of an action on the vertical axis and the frequency of the behaviour on the horizontal axis.</li>
</ol>`},
{id:"B4",t:`B. Goods, bads and scarcity`,zh:`物品與稀少性`,src:[S(3,"4")],h:`
<div class="tw"><table>
<tr><th>Type</th><th>Test</th></tr>
<tr><td><b>Good</b></td><td>Some is preferred to none.</td></tr>
<tr><td><b>Bad</b></td><td>Less is preferred to more.</td></tr>
<tr><td><b>Economic good</b></td><td>More is preferred to less. People will pay (sacrifice) to get more. Its quantity is <b>insufficient</b> to satisfy human wants.</td></tr>
<tr><td><b>Free good</b></td><td>More is <b>not</b> preferred. People will not pay for more. Its quantity is sufficient to satisfy human wants.</td></tr>
</table></div>
<ul>
<li>Both kinds can satisfy wants; the economic good just does not exist in sufficient quantity. It does not necessarily give more satisfaction than a free good.</li>
<li>An economic good implies scarcity, so economic goods are also called "scarce goods". But <b>scarcity applies only to economic goods</b>: free goods can still exist.</li>
<li>Scarcity is <b>relative</b>: resources are limited relative to wants. A good scarce in supply can still be free if it already satisfies wants; a good abundant in supply can still be an economic good if it does not.</li>
<li>Scarcity does <b>not</b> require unlimited wants. Wants can be limited; scarcity appears whenever resources fall short of them.</li>
<li>Scarcity is universal: rich and poor both face it.</li>
</ul>`},
{id:"B5",t:`C. Competition and discrimination`,zh:`競爭與歧視`,src:[S(3,"5")],h:`
<p>The chain of reasoning in the flow chart:</p>
<p><b>Wants greater than resources available</b> → economic good exists → <b>scarcity</b> → (a) <b>choice</b>, which brings <b>opportunity cost</b>; (b) in a society of more than one person, <b>competition</b>, which brings <b>discrimination</b>.</p>
<ul>
<li><b>Price competition:</b> market price above zero; you pay the market price to obtain the good.</li>
<li><b>Non-price competition:</b> shortage; you pay costs other than the market price. The two can occur together or separately.</li>
<li>An <b>economic good</b> involves price or non-price competition, so its market price can be positive or zero.</li>
<li>A <b>free good</b> involves no competition at all, so its market price must be zero.</li>
</ul>`},
{id:"B6",t:`D. Economic good and free good on a supply and demand diagram`,zh:`以供需圖分析`,src:[S(4,"6")],h:T`
<p>On the diagram the demand curve is also the marginal benefit curve (@@D=MB@@), and supply is a vertical line at the quantity available.</p>
<div class="tw"><table>
<tr><th></th><th>Economic good</th><th>Free good</th></tr>
<tr><td>At zero price</td><td>Quantity demanded &gt; quantity supplied</td><td>Quantity supplied &gt; quantity demanded</td></tr>
<tr><td>Wants vs resources</td><td>Wants &gt; resources available</td><td>Wants &lt; resources available</td></tr>
<tr><td>Marginal benefit of the last unit</td><td>@@MB>0@@ (more is preferred)</td><td>@@MB=0@@ (more is not preferred)</td></tr>
<tr><td>Total benefit</td><td>&gt; 0 (can satisfy wants)</td><td>&gt; 0 (can satisfy wants)</td></tr>
<tr><td>Competition</td><td>Yes. Without price competition there must be shortage and non-price competition.</td><td>Neither price nor non-price competition.</td></tr>
</table></div>`},
{id:"B7",t:`E. Scarcity versus shortage`,zh:`缺乏與短缺`,src:[S(4,"7")],h:`
<div class="tw"><table>
<tr><th></th><th>Scarcity</th><th>Shortage</th></tr>
<tr><td>Definition</td><td>Wants (quantity demanded at zero price) exceed resources available</td><td>Quantity demanded exceeds quantity supplied <b>at a certain price</b></td></tr>
<tr><td>Can price adjustment solve it?</td><td>No</td><td>Yes</td></tr>
<tr><td>In a one-person economy?</td><td>Can exist</td><td>Cannot exist: there is no exchange, so no market and no shortage</td></tr>
</table></div>`},
{id:"B8",t:`F. Interest`,zh:`利息`,src:[S(5,"8")],h:`
<ul>
<li><b>Positive time preference:</b> most people are impatient to consume, so earlier availability is itself an economic good.</li>
<li>To the <b>borrower</b>, interest is the cost of earlier availability of goods and services. To the <b>lender</b>, it is the compensation (premium) for deferring present consumption.</li>
<li>Interest can be paid in goods, so it can exist in a barter economy.</li>
<li>Higher positive time preference means more impatient, so people tend to borrow. Lower means less impatient, so people do not mind lending.</li>
<li>When the interest rate rises, the cost of earlier availability rises: more future consumption, less present consumption.</li>
<li><b>Investment</b> = sacrificing present consumption for more future consumption. As long as an investment opportunity (an inter-temporal choice) exists, interest exists, even without lending or borrowing.</li>
</ul>`},
{id:"B9",t:`G. Positive, normative and tautological statements`,zh:`實證性陳述`,src:[S(5,"9")],h:`
<div class="tw"><table>
<tr><th>Type</th><th>Meaning</th><th>Clues</th></tr>
<tr><td><b>Positive</b></td><td>Can be refuted by facts and tested against objective evidence. It can be wrong.</td><td>"If A happens, B will increase or decrease"</td></tr>
<tr><td><b>Normative</b></td><td>Involves a value judgement; facts cannot refute it.</td><td>should, fair, equitable, good, best, more important, necessary</td></tr>
<tr><td><b>Tautological</b></td><td>True by definition; facts cannot refute it.</td><td>"A mother is a female", "opportunity cost is the highest-valued option forgone"</td></tr>
</table></div>
<p>Common mistake: a false statement is still positive. "Positive" means testable, not true.</p>`},
{id:"B10",t:`H. Three applications of the law of demand`,zh:`需求定律的三種應用`,src:[S(5,"9")],h:T`
<ol>
<li>If the <b>nominal price</b> of good X rises, the quantity demanded of X falls (and vice versa), ceteris paribus.</li>
<li>If the <b>relative price</b> of X (in terms of good Y) rises, the quantity demanded of X falls relative to Y.</li>
<li>If the <b>opportunity cost</b> of an action rises, the quantity demanded of that action falls.</li>
</ol>`},
{id:"B11",t:`I. Relative price and the law of demand`,zh:`相對價格`,src:[S(6,"10")],h:T`
<ul>
<li><b>Nominal price</b> = exchange ratio between money and goods. <b>Relative price</b> = exchange ratio between goods.</li>
</ul>
<div class="box">@@@\text{RP of HQ in terms of LQ}=\dfrac{P_{HQ}}{P_{LQ}}@@@</div>
<p>High-quality (HQ) oranges cost $10 and low-quality (LQ) cost $5, so the RP of HQ is @@10/5=2@@. Now add a charge to both:</p>
<div class="tw"><table>
<tr><th></th><th>Fixed fee: +$2 on each</th><th>Ad valorem tax: x 110% on each</th></tr>
<tr><td>New prices</td><td>HQ $12, LQ $7</td><td>HQ $11, LQ $5.50</td></tr>
<tr><td>RP of HQ</td><td>@@12/7\approx1.71@@, falls</td><td>@@11/5.5=2@@, unchanged</td></tr>
<tr><td>Relative quantities</td><td>Buy relatively <b>more</b> HQ</td><td>No change</td></tr>
<tr><td>Market share and average quality</td><td>HQ share rises, average quality rises</td><td>No change</td></tr>
<tr><td>Quantity demanded of HQ</td><td>May rise, fall or stay the same, but its percentage fall is smaller than for LQ</td><td>Falls, by the same percentage as LQ</td></tr>
<tr><td>Overall and LQ</td><td colspan="2">Overall quantity demanded falls; LQ falls</td></tr>
</table></div>
<p>Exam trap: after a per-unit tax people buy relatively more HQ, but the absolute quantity of HQ need not rise.</p>`}
];

const SEC={A:"Opportunity cost",B:"Scarcity",C:"Statements and prices"};
q("C1","A","Concept check",0,"",`Amy has a free afternoon. She can work for $120, watch a film she values at $90, or sleep (valued at $50). If she watches the film, her opportunity cost is …`,[`$120`,`$90`,`$50`,`$170`],"A",`Opportunity cost is the value of the <b>highest-valued</b> option forgone: the $120 job. It is not the sum of what is forgone, and not the value of the film itself.`);
q("C2","A","Concept check",0,"",`In the previous question, the value Amy puts on sleeping rises from $50 to $80. Her opportunity cost of watching the film …`,[`rises to $200`,`rises to $80`,`stays at $120`,`falls to $80`],"C",`Sleeping rises but is still below the $120 job, so the highest-valued option forgone is unchanged.`);
q("C3","A","Concept check",0,"",`Instead, the value of sleeping rises to $140. Her opportunity cost of watching the film …`,[`stays at $120`,`rises to $140`,`rises to $260`,`falls to $90`],"B",`Sleeping now beats the job, so it becomes the highest-valued option forgone. Opportunity cost rises to $140.`);
q("C4","A","Concept check",0,"",`Tom paid $400 for a non-refundable concert ticket. On the night he is ill and could instead earn $150 by working. Which is <b>irrelevant</b> to whether he should go?`,[`the $150 he could earn`,`his enjoyment of the concert`,`the $400 already paid`,`the discomfort of going while ill`],"C",`The $400 is a <b>sunk cost</b>: past, irrecoverable and irrelevant to the present decision.`);
q("C5","A","Concept check",0,"",`Ann can use her flat herself or rent it out for $5,000 a month. She bought it for $3 million years ago. The monthly cost of her using the flat is …`,[`$5,000`,`$3 million`,`$3,005,000`,`zero, because she owns it`],"A",`The cost of using a good you own is the return you could earn by renting or reselling it. The purchase price is a sunk cost.`);
q("C6","B","Concept check",0,"",`Which statement about scarcity is correct?`,[`Scarcity applies to every good`,`Scarcity exists only if human wants are unlimited`,`Scarcity applies to every economic good but not necessarily to every good`,`A rich person does not face scarcity`],"C",`Free goods can exist, so not every good is scarce. Scarcity needs only that resources fall short of wants, limited or not. Rich and poor both face it.`);
q("C7","B","Concept check",0,"",`For a <b>free good</b> …`,[`the marginal benefit of the last unit is zero`,`quantity demanded at zero price is less than quantity supplied`,`people compete for it`,`both A and B`],"D",`At zero price quantity supplied exceeds quantity demanded, so the last unit has zero marginal benefit and nobody competes for it. A and B are both true.`);
q("C8","B","Concept check",0,"",`Which of the following is true of a <b>shortage</b> but <b>not</b> of scarcity?`,[`It can be removed by letting price adjust`,`It can exist in a one-person economy`,`It means wants exceed resources available`,`It applies to all economic goods`],"A",`A shortage is quantity demanded exceeding quantity supplied at a given price, so the price can fix it. Scarcity cannot be solved by price and can exist for a lone person.`);
q("C9","B","Concept check",0,"",`The market price of an economic good …`,[`must be positive`,`must be zero`,`can be positive or zero`,`must be negative`],"C",`An economic good involves price or non-price competition. If there is a shortage and non-price competition, the market price can even be zero.`);
q("C10","C","Concept check",0,"",`Which of the following is a <b>positive</b> statement?`,[`The government should raise the minimum wage.`,`A higher minimum wage will reduce employment.`,`A fair society needs a high minimum wage.`,`Opportunity cost is the value of the best forgone option.`],"B",`B can be tested against facts (and might be wrong). A and C are value judgements; D is true by definition.`);
q("C11","C","Concept check",0,"",`"A triangle has three angles" is …`,[`a positive statement`,`a normative statement`,`a tautological statement`,`a false statement`],"C",`It is true by definition, so facts cannot refute it: a tautology.`);
q("C12","C","Concept check",0,"",`Which statement about interest is correct?`,[`Interest can only exist if there is borrowing and lending`,`Interest cannot exist in a barter economy`,`To a borrower, interest is the cost of earlier availability of goods`,`Interest is the reward for working`],"C",`Interest can exist through investment even with no lending, and it can be paid in goods, so a barter economy can have it.`);
q("C13","C","Concept check",0,"",T`High-quality (HQ) apples cost $10 and low-quality (LQ) apples $5. A <b>fixed fee of $2</b> is added to each apple. The relative price of HQ apples in terms of LQ apples …`,[`rises`,`falls`,`is unchanged`,`cannot be determined`],"B",T`Before: @@10/5=2@@. After: @@12/7\approx1.71@@. The relative price of HQ falls, so people buy relatively more HQ.`);
q("C14","C","Concept check",0,"",`Instead, the government imposes a <b>10% ad valorem tax</b> on both kinds of apple. The relative quantities of HQ and LQ demanded …`,[`shift towards HQ`,`shift towards LQ`,`do not change`,`both rise`],"C",T`Both prices rise by the same percentage, so @@P_{HQ}/P_{LQ}@@ is unchanged and the relative quantities do not change (both quantities fall by the same percentage).`);
q("C15","C","Concept check",0,"",`The opportunity cost of attending a concert rises. According to the law of demand, the quantity of concerts demanded …`,[`rises`,`falls`,`is unchanged`,`rises only for low-income people`],"B",`Application 3 of the law of demand: when the opportunity cost of an action rises, the quantity demanded of that action falls.`);

const EX=[
{id:"X1",k:"num",t:`Relative price after a fixed fee`,stem:T`HQ oranges cost $10 and LQ oranges $5. A fixed fee of $2 is added to each. Find the new relative price of HQ in terms of LQ (two decimal places).`,a:1.71,u:`ratio`,tol:0.011,w:T`@@@\dfrac{P_{HQ}}{P_{LQ}}=\dfrac{10+2}{5+2}=\dfrac{12}{7}\approx 1.71@@@<p>It was 2 before, so the relative price of HQ falls and buyers shift towards HQ. Compare with a 10% tax: @@\dfrac{11}{5.5}=2@@, unchanged.</p>`,src:[S(6,"10")]},
{id:"X2",k:"open",t:`Does the full cost change?`,stem:`A concert runs over its scheduled time. Another concert-goer arrives late because of a traffic jam but is there for the same total viewing time. Explain whose time cost changes, and why.`,w:`<p>Time cost is the value of the <b>highest-valued alternative use of time</b> (or the income forgone).</p><ul><li>For the person watching the concert overrun, the <b>total time spent</b> rises, so the time cost rises.</li><li>For the person delayed by traffic, the time spent <b>watching</b> is unchanged and the time lost in the jam is spent whether or not they attend. The time cost of attending is not changed by it.</li></ul>`,src:[S(6,"11")]},
{id:"X3",k:"open",t:`Quitting a job: what is the cost?`,stem:`Lily earns $20,000 a month as a teacher, enjoys it, and has been offered $26,000 a month in a job she expects to dislike. What is the full cost to her of switching jobs?`,w:`<p>The cost of quitting is the <b>value of the existing job</b>: the money return ($20,000 a month) <b>plus</b> the non-money return (enjoyment, security, and so on). Full cost = monetary cost + non-monetary cost.</p><p>She also faces a risk (the new job may not last), which is part of the cost. The $6,000 difference is a benefit of switching, not a cost.</p>`,src:[S(2,"2")]}
];

const LONG=[
{id:"L1",src:`Practice (framework from the notes)`,q:`When would the opportunity cost of studying for an exam tonight change? Consider both the chosen option and the options forgone.`,m:`<p>Opportunity cost is the value of the <b>highest-valued option forgone</b> (HVOF). Work from the first principle, in this order:</p><ol><li><b>Chosen option changes in value</b> (for example, studying becomes more valuable): the HVOF is unaffected, so the opportunity cost is <b>unchanged</b>.</li><li><b>The HVOF changes in value</b> (for example, a part-time job tonight pays more): the opportunity cost changes in the <b>same direction</b>.</li><li><b>A lower-ranked option changes</b>: unchanged if it stays below the HVOF; if it rises <b>above</b> the old HVOF it becomes the new HVOF and the opportunity cost rises.</li></ol><p>State the assumption that the order of preference of the other options is unchanged.</p>`},
{id:"L2",src:`Practice (framework from the notes)`,q:`A student says "free goods are not scarce, so they cannot be economic goods, and economic goods can never be free". Comment.`,m:`<p>Half is right. By definition an <b>economic good</b> is one where more is preferred to less and its quantity is insufficient to satisfy wants, so it is scarce. A <b>free good</b> is one where more is not preferred and its quantity is sufficient, so it is not scarce.</p><p>But the second claim is wrong: an economic good can have a <b>market price of zero</b>. If there is a shortage at a zero price, non-price competition (queuing, favouritism, lottery) appears and people bear costs other than a money price. Scarcity is relative to wants, so a good can be abundant in supply and still be economic if wants are larger.</p>`}
];

const CS=[
{t:`Common mistakes in basic concepts`,zh:`常犯錯誤`,src:[S(6,"11"),S(7,"12")],h:`
<div class="tw"><table>
<tr><th>Topic</th><th>Typical mistakes</th></tr>
<tr><td>Chosen option versus option forgone</td><td>Writing "opportunity cost is option X" instead of "the <b>value of</b> option X" · thinking the 2nd-choice option's opportunity cost is the 3rd's value (it is the 1st's) · missing the assumption that the order of preference is unchanged · not knowing terms such as dividend (return on shares) and capital gain · not realising economics assumes people choose the best option</td></tr>
<tr><td>Time cost</td><td>Not saying what the time cost <i>is</i> (value of the highest-valued alternative use of time, or income forgone) · not knowing quitting a job costs the whole existing job, money plus non-money return · forgetting to write the full cost formula before comparing two options</td></tr>
<tr><td>Sunk cost</td><td>Not knowing it is past, irrecoverable and irrelevant to the present decision</td></tr>
<tr><td>Risk</td><td>Thinking risk only affects the value of an option; it is also part of cost</td></tr>
<tr><td>Social cost</td><td>Assuming a cost must be borne by the decision-maker; a third party can bear it (external cost)</td></tr>
<tr><td>Shortage and opportunity cost</td><td>Not seeing that a shortage means non-price competition, which carries extra cost</td></tr>
<tr><td>Economic, free goods and bads</td><td>Not knowing "some is preferred to less" defines a good · thinking economic goods cannot satisfy wants, or give more satisfaction than free goods · not knowing "willing to sacrifice for more" is the same as "more is preferred" · thinking scarcity needs unlimited wants · thinking free economic goods escape competition (without price competition there must be non-price competition) · not knowing MB &gt; 0 for economic goods and MB = 0 for free goods · mixing up scarcity and shortage · thinking an economic good must have a production cost (natural resources do not)</td></tr>
<tr><td>Interest</td><td>Not memorising the definition · mixing up lend and borrow · not seeing earlier consumption is an economic good · not knowing the definition of investment · thinking interest needs lending and borrowing</td></tr>
<tr><td>Positive statements</td><td>Not memorising positive versus normative · thinking a false statement is not positive</td></tr>
<tr><td>Relative price</td><td>Thinking that after a per-unit tax people buy more HQ in absolute terms (only relatively more) · not having an answer framework · thinking HQ becomes cheaper than LQ (only its <i>relative</i> price falls; HQ is still dearer)</td></tr>
</table></div>`}
];

Yupi.register({
 id:"micro1",title:"Basic concepts",
 sub:`Opportunity cost, full cost, scarcity, relative price and the law of demand in use. Built from the Micro 7 cheat sheet; the Micro 1 file is a duplicate of it.`,
 files:{cs:{name:"[CS] Micro 7 Basic Concepts.pdf",dir:"雞精notes/Micro/",pre:"mi7r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet. Each one is explained after you answer.`,
 csLead:`The error table from the cheat sheet, summarised in English.`,
 verify:[["About the source files",`The cheat sheet is headed "Micro 6: Basic Concepts" on every page, whatever its file name says. Micro 1 and Micro 7 are the same sheet, so this chapter uses Micro 7 (cleaner scan).`,["cs",1,"1"]]]
});
})();
