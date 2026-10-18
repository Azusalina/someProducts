/* Chapter: Externalities and equity.
   Sources: Woody externality cheat sheet (Macro chap 1./) and [CS] Micro 6 Efficiency sections E and F. */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const W=(p,pr)=>["ext",p,pr];
const M=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"X1",t:`1. Answering template for externality questions`,zh:`界外效應的長題框架`,src:[W(1,"1"),M(4,"6")],h:T`
<p>Terms: marginal private cost (MPC), marginal external cost (MEC), marginal social cost (MSC); marginal private benefit (MPB), marginal external benefit (MEB), marginal social benefit (MSB).</p>
<ol>
<li><b>How does XXX involve an externality?</b> Say whether it is positive or negative, who affects whom, and that there is no compensation. <i>Negative:</i> A negatively affects B, and A does not compensate B. <i>Positive:</i> A positively affects B, and B does not compensate A.</li>
<li><b>How does it lead to a divergence between private and social cost or benefit?</b>
@@@MSC=MPC+MEC\qquad\text{since }MEC>0,\;MSC>MPC@@@
@@@MSB=MPB+MEB\qquad\text{since }MEB>0,\;MSB>MPB@@@</li>
</ol>
<p>Margin note on the Micro 6 sheet: "What behaviour is it?" (name the activity that creates the externality).</p>`},
{id:"X2",t:`2. How an externality leads to inefficiency`,zh:`界外效應如何導致無效率`,src:[W(2,"2"),M(4,"6")],h:T`
<div class="tw"><table>
<tr><th></th><th>Negative externality</th><th>Positive externality</th></tr>
<tr><td>The individual acts until</td><td>@@MPC=MPB@@</td><td>@@MPC=MPB@@</td></tr>
<tr><td>At that level</td><td>@@MSC>MSB@@</td><td>@@MSB>MSC@@</td></tr>
<tr><td>Actual quantity</td><td><b>above</b> the efficient level (overproduction)</td><td><b>below</b> the efficient level (underproduction)</td></tr>
</table></div>
<p>To relieve the inefficiency: describe the method (government or market solution); its effect on the individual's MPC or MPB; its effect on the actual quantity (moves toward the efficient level); and its effect on the gap between MSB and MSC.</p>
<p>Note: the cheat sheet says the diagrams "need not be examined", but drawing them is the quickest way to see the deadweight loss.</p>`},
{id:"X3",t:`3. Solutions: government`,zh:`政府方案`,src:[W(3,"3"),M(5,"7")],h:T`
<div class="tw"><table>
<tr><th>Solution</th><th>How it works</th></tr>
<tr><td><b>Unit tax</b> (negative externality)</td><td>MPC rises, quantity falls toward the efficient level, the gap between MSB and MSC shrinks. If @@T=MEC@@: quantity falls exactly to the efficient level, @@DWL=0@@. If @@T>MEC@@: quantity falls <b>below</b> efficient, underproduction, DWL.</td></tr>
<tr><td><b>Unit subsidy</b> (positive externality)</td><td>MPC falls (or MPB rises), quantity rises toward the efficient level. If @@s=MEB@@: efficient, @@DWL=0@@. If @@s>MEB@@: quantity rises <b>above</b> efficient, overproduction, DWL.</td></tr>
<tr><td><b>Quota</b></td><td>Changes the quantity directly, narrowing the gap between MSB and MSC.</td></tr>
<tr><td><b>Government purchase</b></td><td>Buy the firm so that it produces at the efficient level.</td></tr>
<tr><td><b>Removal</b></td><td>Ask the firm to move away.</td></tr>
</table></div>
<div class="note">A complete ban may increase deadweight loss. Even if an activity has external cost, forcing the quantity to zero can push it far below the efficient level.</div>`},
{id:"X4",t:`3. Solutions: market, merging, doing nothing`,zh:`市場方案`,src:[W(3,"3"),M(5,"7"),W(4,"4")],h:`
<ul>
<li><b>Market exchange for a positive externality:</b> the person who benefits pays the provider and asks for more of the benefit. The provider's MPB rises, so quantity rises toward the efficient level.</li>
<li><b>Market exchange for a negative externality:</b> it depends who holds the <b>private property right</b>.
 <ul><li>If the <i>affected</i> person has the right, the affecting person pays compensation: their MPC rises, quantity falls.</li>
 <li>If the <i>affecting</i> person has the right, the affected person pays them to cut back. If they carry on, they give up that payment: their MPC rises, quantity falls.</li></ul></li>
<li><b>Integration (merger):</b> the newly combined firm takes the external benefits and costs into account, so they are <b>internalised</b>.</li>
<li><b>Doing nothing</b> is best when the cost of a solution (searching for information, policy making, law enforcement, negotiation) is greater than its benefit (the reduction in deadweight loss).</li>
</ul>`},
{id:"X5",t:`4. Why solutions can fail`,zh:`方案的限制`,src:[W(4,"4"),M(5,"7")],h:`
<p><b>Limits of government solutions:</b></p>
<ul>
<li><b>Lacks information</b> about marginal social benefit and cost; obtaining it may be very costly (for example, measuring the external effect to set the right tax).</li>
<li><b>Lacks a profit motive</b>, so it is less likely than a private firm to minimise cost.</li>
<li>Officials have their <b>own private interests</b> and may even accept bribes for policies that favour certain groups.</li>
<li>Costs of using the solution: administration and policy-making, law enforcement (police), and searching for information.</li>
</ul>
<p><b>Limits of market solutions.</b> Market exchange removes the divergence completely only if both hold:</p>
<ol><li>private property rights are well defined and enforced;</li><li>transaction costs (such as negotiation costs) are close to zero.</li></ol>`},
{id:"X6",t:`5. Cases with no divergence`,zh:`沒有分歧的特別情況`,src:[W(5,"5"),W(6,"6")],h:`
<p>Not every spill-over is an externality. If the effect is already paid for, or already considered by the decision-maker, there is no divergence:</p>
<ul>
<li><b>A farmer's sheep damage crops on his own land.</b> The same person owns both, so he already weighs the loss: no external cost.</li>
<li><b>A guard enjoys the music at a concert.</b> His wage is lower because of the better working conditions, so he has paid for the benefit.</li>
<li><b>A famous store draws customers to the mall and to lesser-known stores.</b> The mall charges those stores a higher rent, so they have paid for the benefit. The mall gains because the derived demand for space rises, but usually charges the famous store a lower rent.</li>
<li><b>Advanced: a person plays the piano and benefits a neighbour.</b> The marginal external benefit falls as more is played. If it falls to zero at the last unit played, there is no divergence.</li>
<li><b>Advanced: a new West Rail cuts a bus company's revenue.</b> This is the market at work (rail and bus are substitutes), not an external cost.</li>
<li><b>Advanced: a beekeeper's bees pollinate a nearby orchard, and the orchard gives nectar.</b> If the value of pollination equals the value of the nectar, no external benefit. If pollination is worth more, the orchard owner may pay rent to have more hives (raising the beekeeper's MPB); if less, the beekeeper may pay the orchard owner for nectar.</li>
</ul>`},
{id:"X7",t:`Equity: why incomes differ`,zh:`收入不均的原因`,src:[W(7,"7")],h:`
<ol>
<li>Workers with better education or training are more productive, so earn more.</li>
<li>Workers who are better looking are more productive in certain jobs (for example actors).</li>
<li>Women usually earn a lower wage rate than men because of <b>gender discrimination</b>.</li>
<li>Ethnic minorities earn a lower wage than the majority because of <b>racial discrimination</b>.</li>
<li>People in poorer working conditions (dangerous or overnight work) earn a higher wage as <b>compensation</b>.</li>
<li>People who own more assets (property, shares) earn more property or capital income.</li>
</ol>`},
{id:"X8",t:`How to improve equity`,zh:`如何改善公平性`,src:[W(7,"7"),W(8,"8")],h:`
<div class="tw"><table>
<tr><th>Aim</th><th>Concern</th><th>How to analyse</th><th>Examples</th></tr>
<tr><td><b>Equalising outcome</b> (income)</td><td>Narrowing the actual income gap</td><td>Say how a policy affects the poor <i>and</i> the rich</td><td>Higher standard tax rate: the rich pay more, the poor are unaffected. More transfer payments to the poor. A $5,000 consumption voucher to everyone: the same sum is a bigger share of a poor person's income.</td></tr>
<tr><td><b>Equalising opportunity</b></td><td>Fair competition: nobody disadvantaged by background</td><td>Say how a policy affects <b>productivity and future income</b></td><td>Free education, free medical services: the poor have higher productivity and future income and are less hindered by background.</td></tr>
</table></div>
<p><b>Trade-off between efficiency and equity.</b> Tax the rich and pay transfers to the poor: inequality falls, but the rich lose incentive to work, so some efficiency is sacrificed for equity.</p>`},
{id:"X9",t:`Measuring inequality and its limits`,zh:`量度收入不均`,src:[W(8,"8"),W(9,"9")],h:T`
<ul>
<li><b>By distribution:</b> check the change in the share of low-income and high-income households. If there are more of <i>both</i> low-income and high-income households, the income gap widens.</li>
<li><b>Income share by decile group:</b> compare the income of the rich with the poor (rich income divided by poor income). The greater the multiple, the bigger the gap.</li>
<li><b>Lorenz curve:</b> a point shows that the poorest @@x@@% of households earn @@y@@% of income. Closer to the 45-degree line means a more equal distribution.</li>
<li><b>Gini coefficient:</b> higher means more unequal: @@g=A/(A+B)@@.</li>
</ul>
<p><b>Limitations.</b> Statistics may miss unreported income, part-time wages, fringe benefits (housing, medical care) and investment income (rent, dividends, interest, capital gains). Data before tax and transfers <b>over-states</b> actual inequality. Household income can be equal while per-capita income is not (household sizes differ). One year's data cannot show lifetime inequality: even if everyone had the same lifetime income, income varies with age.</p>`}
];

const SEC={A:"Externalities",B:"Solutions",C:"Equity"};
q("Y1","A","Concept check",0,"",`A factory pollutes a river and nearby fishermen suffer, without being compensated. This is …`,[`a positive externality, since the factory gains`,`a negative externality, since the factory affects fishermen without compensating them`,`not an externality, since fishermen can move`,`a private cost`],"B",`A negatively affects B and does not compensate B: a negative externality.`);
q("Y2","A","Concept check",0,"",T`With a negative externality, the market output is determined where …`,[T`@@MSC=MSB@@`,T`@@MPC=MPB@@`,T`@@MEC=MEB@@`,T`@@MSC=MPC@@`],"B",T`The individual ignores the external cost, so trades until @@MPC=MPB@@. At that level @@MSC>MSB@@: overproduction.`);
q("Y3","A","Concept check",0,"",`In a market with a <b>positive</b> externality, the actual quantity is …`,[`above the efficient level`,`equal to the efficient level`,`below the efficient level`,`zero`],"C",T`Private decisions ignore the external benefit, so @@MSB>MSC@@ at the market quantity: underproduction.`);
q("Y4","A","Concept check",0,"",T`The marginal private cost of a good is @@\$30@@ and the marginal external cost is @@\$12@@. The marginal social cost is …`,[`$12`,`$18`,`$30`,`$42`],"D",T`@@MSC=MPC+MEC=30+12=42@@.`);
q("Y5","A","Concept check",0,"",`A farmer who owns both the farmland and the sheep that damage his own crops creates …`,[`a negative externality`,`a positive externality`,`no external cost: he already considers the loss`,`a deadweight loss`],"C",`The same person bears both the benefit and the loss, so the cost is already counted in his decision.`);
q("Y6","B","Concept check",0,"",T`A negative externality has @@MEC=\$20@@ per unit. The tax that achieves efficiency is …`,[`$10`,`$20`,`$40`,`no tax`],"B",T`The efficient tax is @@T=MEC@@: it raises MPC by exactly the external cost.`);
q("Y7","B","Concept check",0,"",T`A tax is set <b>above</b> the marginal external cost. The result is …`,[`quantity below the efficient level and a deadweight loss`,`quantity at the efficient level`,`quantity above the efficient level`,`no deadweight loss`],"A",T`If @@T>MEC@@, quantity falls below the efficient level: underproduction, with a deadweight loss.`);
q("Y8","B","Concept check",0,"",T`A subsidy exceeds the marginal external benefit. The result is …`,[`underproduction`,`the efficient quantity`,`overproduction and a deadweight loss`,`no change`],"C",T`@@s>MEB@@ pushes quantity above the efficient level: overproduction.`);
q("Y9","B","Concept check",0,"",`Which is a limit of government solutions?`,[`the government always has a profit motive`,`the government may lack information about marginal social benefits and costs`,`transaction costs are zero`,`property rights are always clear`],"B",`Governments lack information (costly to obtain), lack a profit motive and may have officials with private interests.`);
q("Y10","B","Concept check",0,"",`Market exchange can fully remove the divergence only if …`,[`the government taxes the polluter`,`property rights are well-defined and enforced, and transaction costs are close to zero`,`there is a quota`,`the polluter is a monopoly`],"B",`Both conditions are needed: clear property rights and negligible negotiation costs.`);
q("Y11","B","Concept check",0,"",`The cost of using a government solution is larger than its benefit. The best course is …`,[`do nothing`,`impose a bigger tax`,`ban the activity`,`merge the firms`],"A",`If the cost of the method exceeds the benefit (the reduction in deadweight loss), doing nothing is best.`);
q("Y12","C","Concept check",0,"",`Which policy mainly <b>equalises opportunity</b> rather than outcome?`,[`raising the standard tax rate`,`paying more transfers to the poor`,`free education`,`a $5,000 voucher to all`],"C",`Free education raises the productivity and future income of the poor, reducing the effect of background.`);
q("Y13","C","Concept check",0,"",`A Lorenz curve that moves further away from the 45-degree line means …`,[`more equal income distribution`,`more unequal income distribution`,`no change`,`a lower Gini coefficient`],"B",`The further from the line of equality, the larger area A and the higher the Gini coefficient.`);
q("Y14","C","Concept check",0,"",`Income data before tax and transfers will …`,[`understate actual income inequality`,`overstate actual income inequality`,`be exactly accurate`,`ignore only the rich`],"B",`Taxes and transfers reduce inequality, so pre-tax pre-transfer data over-states it.`);
q("Y15","C","Concept check",0,"",`Which does <b>not</b> help explain income inequality?`,[`discrimination`,`differences in education`,`ownership of assets`,`everyone having the same productivity`],"D",`Differences in productivity, education, discrimination, compensation and asset ownership explain inequality; identical productivity would not.`);

const EX=[
{id:"Z1",k:"num",t:`Unit tax with a negative externality`,stem:T`@@MPB:\;P=100-Q@@, @@MPC:\;P=20+Q@@, and @@MEC=20@@, so @@MSC=40+Q@@. Find the <b>efficient</b> quantity.`,a:30,u:`units`,tol:0.01,w:T`@@@MPB=MSC\Rightarrow 100-Q=40+Q\Rightarrow Q^*=30@@@<p>The market (ignoring the external cost) gives @@100-Q=20+Q@@, @@Q_m=40@@. So overproduction is 10 units. The deadweight loss is @@\tfrac12\times20\times10=100@@.</p>`,src:[W(2,"2")]},
{id:"Z2",k:"num",t:`Right tax, wrong tax`,stem:T`With the same market, a tax of $30 per unit is imposed (above the MEC of 20). What quantity results?`,a:25,u:`units`,tol:0.01,w:T`<p>The tax lifts MPC to @@20+30+Q=50+Q@@; @@100-Q=50+Q@@ gives @@Q=25@@, <b>below</b> the efficient 30. Underproduction: the deadweight loss is @@(20-30)^2/4=25@@.</p>`,src:[W(3,"3")]},
{id:"Z3",k:"open",t:`Does a ban solve it?`,stem:`A government bans an activity that has an external cost. Explain why this could still reduce efficiency.`,w:`<p>Even when an activity has external cost, the efficient quantity is usually <b>above zero</b> (the activity also gives private benefits). A complete ban forces quantity to zero, which may be well <b>below</b> the efficient level. Then marginal social benefit exceeds marginal social cost over the lost units, so the deadweight loss can be larger than before.</p>`,src:[W(3,"3")]}
];

const LONG=[
{id:"N1",src:`Practice (template from the cheat sheet)`,q:`Smoking in public places affects non-smokers. (a) Explain how this involves an externality. (b) Explain why it leads to inefficiency. (c) Suggest one government solution and one limitation.`,m:T`<p><b>(a)</b> It is a <b>negative externality</b>: smokers affect the health and comfort of non-smokers, and do not compensate them.</p><p><b>(b)</b> Smokers act until @@MPC=MPB@@. Since @@MEC>0@@, @@MSC=MPC+MEC>MPC@@, so at that level @@MSC>MSB@@: the actual quantity is above the efficient level (overproduction), and there is a deadweight loss.</p><p><b>(c)</b> A <b>tax on cigarettes</b> raises smokers' MPC, so quantity falls toward the efficient level and the gap between MSC and MSB shrinks. <i>Limit:</i> the government lacks information about the exact marginal external cost, so it may set the tax too high or too low (a tax above MEC leaves the quantity below efficient).</p>`},
{id:"N2",src:`Practice (framework from the cheat sheet)`,q:`The government raises the tax on the rich and gives more transfers to the poor. Evaluate in terms of equity and efficiency.`,m:`<p><b>Equity.</b> Outcome is equalised: the rich pay more tax while the poor receive more, so the income gap narrows.</p><p><b>Efficiency.</b> The rich lose the incentive to work, and may work less, so output may fall: efficiency is sacrificed for equity.</p><p>Conclusion: there is a <b>trade-off</b>; whether the policy is worth it depends on how much weight is given to equity.</p>`}
];

const CS=[
{t:`Common mistakes with externalities`,zh:`常犯錯誤`,src:[M(5,"8")],h:`
<ul>
<li>Not knowing how to compute consumer surplus, producer surplus and deadweight loss from a table.</li>
<li>Misreading which activity involves the externality and who the holders are: losing many marks.</li>
<li>Confusing <b>efficiency</b> (compares social cost and benefit) with <b>divergence</b> (between social and private).</li>
<li>Saying a ban always removes the problem.</li>
<li>Not noticing when there is <b>no divergence</b> because the effect is already paid for.</li>
</ul>`}
];

Yupi.register({
 id:"ext",title:"Externalities and equity",
 sub:`Private versus social cost and benefit, how to fix an externality, why fixes can fail, and income inequality. From the Woody cheat sheet and Micro 6.`,
 files:{
  ext:{name:"Woody externality cheat sheet.pdf",dir:"Macro chap 1./",pre:"ext-",short:"Woody sheet",printedLabel:"sheet P."},
  cs:{name:"[CS] Micro 6 Efficiency.pdf",dir:"雞精notes/Micro/",pre:"mi6r-",short:"Micro 6 sheet",printedLabel:"sheet P."}
 },
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheets.`,
 csLead:`Typical errors with externality questions (from the Micro 6 sheet).`,
 verify:[["Sources",`The Woody sheet (2025/26 edition) is a commercial cheat sheet by Defining Education; use it for your own study. The Lorenz and Gini topics are repeated in Macro 5.`,["ext",1,"1"]]],
 widgets:[
  {tab:"learn",title:"An externality, a tax and a subsidy",init:(el,Y)=>Y.widgets.extern(el,Y)},
  {tab:"learn",title:"Lorenz curve and Gini coefficient",init:(el,Y)=>Y.widgets.lorenz(el,Y)}
 ]
});
})();
