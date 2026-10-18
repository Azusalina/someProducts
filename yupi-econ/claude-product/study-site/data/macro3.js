/* Macro chapter 3: Unemployment and the business cycle. Source: [CS] Macro 3 cheat sheet (3 printed pages). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"U1",t:`A. Who is in the labour force?`,zh:`勞動人口與失業`,src:[S(1,"1")],h:T`
<ol>
<li>Start with the <b>total population</b>. Anyone aged <b>15 or above</b>, <b>willing</b> to work and <b>able</b> to work is in the <b>labour force</b>.</li>
<li><b>Not in the labour force:</b> aged below 15; students, retired persons, housemakers; people without working ability; people with no job who are not seeking one.</li>
<li>Within the labour force: those who have a job are <b>employed</b>; those without are <b>unemployed</b>.</li>
<li>Among the employed, people who <b>involuntarily</b> work less than <b>35 hours per week</b> are <b>underemployed</b>. The underemployed are still counted in the employed population.</li>
</ol>
<div class="box">@@@\text{unemployment rate}=\dfrac{\text{unemployed}}{\text{labour force}}\times100\%@@@</div>`},
{id:"U2",t:`Explaining a change in the unemployment rate`,zh:`失業率的改變(長題框架)`,src:[S(1,"1")],h:`
<ol>
<li>State the formula clearly (remember the <b>"100%"</b>).</li>
<li>Say what happens to the <b>labour force</b>.</li>
<li>Say what happens to the <b>unemployed population</b>.</li>
<li>Conclude.</li>
</ol>`},
{id:"U3",t:`Loss from unemployment`,zh:`失業的損失`,src:[S(1,"1")],h:`
<div class="tw"><table>
<tr><th>To the unemployed (individual)</th><th>To society</th></tr>
<tr><td>Lower living standard, loss of income</td><td>Productive resources are left idle: loss of actual output</td></tr>
<tr><td>Skills would be lost or become outdated (long spells)</td><td>Skills (human capital) would be lost or outdated</td></tr>
<tr><td>Psychological problems, mental disorder, family problems, suicide</td><td>Political and social unrest, higher crime rate</td></tr>
</table></div>`},
{id:"U4",t:`B. The business cycle`,zh:`經濟週期`,src:[S(2,"2")],h:T`
<p>The cycle is the pattern of real GDP growth over time: peak (P), recession, trough (T), recovery.</p>
<div class="tw"><table>
<tr><th></th><th>Peak (prosperity)</th><th>Recession</th><th>Trough (depression)</th><th>Recovery</th></tr>
<tr><td>Unemployment rate</td><td>Low</td><td>Rising</td><td>High</td><td>Falling</td></tr>
<tr><td>Labour employment level</td><td>High</td><td>Falling</td><td>Low</td><td>Rising</td></tr>
<tr><td>Real GDP growth rate</td><td>High</td><td>Falling</td><td>Low</td><td>Rising</td></tr>
<tr><td>Inflation rate</td><td>High</td><td>Falling</td><td>Low</td><td>Rising</td></tr>
<tr><td>Consumption and investment</td><td>High</td><td>Falling</td><td>Low</td><td>Rising</td></tr>
<tr><td>Business confidence</td><td>High</td><td>Falling</td><td>Low</td><td>Rising</td></tr>
</table></div>
<p>Your margin marks: smiley faces (happy) at the peak and in recovery, frowns in recession and at the trough, with "highest / falls / lowest / rises" for the growth-rate path. Only the <b>unemployment rate</b> moves opposite to the rest.</p>`}
];

const SEC={A:"Unemployment",B:"Business cycle"};
q("W1","A","Concept check",0,"",`Which person is part of the <b>labour force</b>?`,[`a 14-year-old student`,`a retired person who does not want a job`,`a 30-year-old who is willing and able to work but has no job and is looking for one`,`a housemaker not seeking work`],"C",`Labour force: aged 15 or above, willing and able to work (employed or unemployed). A seeker without a job is unemployed and in the labour force.`);
q("W2","A","Concept check",0,"",`A person works involuntarily for 20 hours a week and wants more hours. He is …`,[`unemployed`,`underemployed`,`not in the labour force`,`fully employed`],"B",`Involuntarily working fewer than 35 hours per week: underemployed. He is still counted as employed.`);
q("W3","A","Concept check",0,"",T`The labour force is 4 million, of whom 3.8 million are employed (including 0.2 million underemployed). The unemployment rate is …`,[`5%`,`10%`,`4.7%`,`0.2%`],"A",T`Unemployed @@=4-3.8=0.2@@ million. @@\dfrac{0.2}{4}\times100\%=5\%@@. The underemployed are already in the employed number.`);
q("W4","A","Concept check",0,"",`The number of jobs is unchanged but more people start searching for work. The unemployment rate …`,[`falls`,`rises`,`stays the same`,`falls because the labour force rises`],"B",`The new job seekers join the labour force and are unemployed, because job positions have not changed. Employment is constant.`);
q("W5","A","Concept check",0,"",`Which is a loss to <b>society</b> (not only the individual) from unemployment?`,[`lower living standard of the jobless`,`family problems of the jobless`,`loss of actual output from idle resources`,`psychological stress`],"C",`Society loses the output that the idle workers could have produced.`);
q("W6","A","Concept check",0,"",`Higher unemployment benefits are paid. Is this a loss to society?`,[`Yes, because spending rises`,`No, it is a transfer within society; the payments are offset by the benefits received`,`Yes, because potential GDP falls`,`Yes, because output rises`],"B",`The sheet warns that a larger benefit payment is a transfer, not a loss of resources to society as a whole. Also, unemployment does not itself lower potential GDP.`);
q("W7","B","Concept check",0,"",`In a <b>recession</b>, the unemployment rate is …`,[`falling`,`rising`,`low`,`at its lowest`],"B",`Recession: unemployment rising; trough: high; recovery: falling; peak: low.`);
q("W8","B","Concept check",0,"",`At the <b>peak</b> of the cycle, which is low?`,[`inflation rate`,`business confidence`,`unemployment rate`,`consumption`],"C",`The peak has a low unemployment rate; the other variables are high.`);
q("W9","B","Concept check",0,"",`During <b>recovery</b>, real GDP growth is …`,[`falling`,`rising`,`high and falling`,`at its lowest`],"B",`Recovery: growth rises, employment rises, business confidence rises, unemployment falls.`);
q("W10","B","Concept check",0,"",`A student writes "labour supply rises as the economy recovers". The correct statement is that …`,[`labour supply rises`,`labour employment level rises`,`the labour force falls`,`there is no change`],"B",`It is the labour <b>employment level</b> that rises in a recovery, not labour supply (a measure of potential hours).`);

const EX=[
{id:"C1",k:"num",t:`Compute the unemployment rate`,stem:T`Labour force 3,500,000; employed 3,290,000 (including underemployed). Find the unemployment rate (%).`,a:6,u:`percent`,tol:0.01,src:[S(1,"1")],w:T`Unemployed @@=3{,}500{,}000-3{,}290{,}000=210{,}000@@. @@\dfrac{210000}{3500000}\times100\%=6\%@@.`},
{id:"C2",k:"open",t:`Explain a change`,stem:`The unemployment rate rises from 3% to 4% while the number of people with jobs stays the same. Explain using the framework.`,src:[S(1,"1")],w:T`<p>@@\text{unemployment rate}=\dfrac{\text{unemployed}}{\text{labour force}}\times100\%@@. Because job positions are unchanged, employment is constant. More people joined the labour force (for example, new graduates looking for work), so the number of unemployed rose while employment did not: the rate rose.</p>`}
];

const LONG=[
{id:"V1",src:`Practice (framework from the notes)`,q:`Explain two costs of long-term unemployment, one to the individual and one to society.`,m:`<p><b>Individual:</b> skills become outdated or are lost, so the unemployed find it harder to be re-employed, and income is lost, lowering the living standard.</p><p><b>Society:</b> productive resources are left idle, so actual output is lost; social unrest and crime may also rise.</p>`}
];

const CS=[
{t:`Common mistakes on unemployment and the cycle`,zh:`常犯錯誤`,src:[S(2,"3")],h:`
<div class="tw"><table>
<tr><th>Question type</th><th>Typical mistakes</th></tr>
<tr><td>Calculating the unemployment rate</td><td>Not knowing the underemployed are already included in the employed population</td></tr>
<tr><td>Change in the unemployment rate</td><td>Not writing the formula or forgetting "100%" · confusing labour supply (total hours) with labour force (people aged 15 or above willing and able to work) · assuming a job seeker will find a job · not seeing that "job positions unchanged" means employment is constant · not knowing a second approach: the unemployment rate among newcomers versus the rate in the existing economy</td></tr>
<tr><td>Loss of unemployment</td><td>Counting higher welfare spending (unemployment benefit) as a loss to society: welfare is a transfer within society and is offset by the benefit received · thinking unemployment lowers potential GDP</td></tr>
<tr><td>Business cycle</td><td>Missing "apart from" in the question and so writing irrelevant answers · thinking labour supply rises in a recovery (it is the employment level)</td></tr>
</table></div>`}
];

Yupi.register({
 id:"macro3",title:"Unemployment and the business cycle",
 sub:`Who counts as unemployed, how to explain a change in the rate, the cost of unemployment and the four phases of the cycle. From the Macro 3 cheat sheet.`,
 files:{cs:{name:"[CS] Macro 3 Unemployment and Business Cycle.pdf",dir:"雞精notes/Macro/",pre:"ma3r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet.`,
 csLead:`The error table from the cheat sheet, summarised in English.`,
 verify:[]
});
})();
