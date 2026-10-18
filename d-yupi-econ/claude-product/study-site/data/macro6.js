/* Macro chapter 6: Money and banking. Source: [CS] Macro 6 cheat sheet (6 printed pages). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"M1",t:`A. Functions of money and the barter problems`,zh:`貨幣的功能`,src:[S(1,"1")],h:`
<div class="tw"><table>
<tr><th>Function</th><th>Meaning</th><th>Problem in a barter economy</th></tr>
<tr><td><b>Medium of exchange</b></td><td>Money is generally accepted as a medium for buying and selling goods and services</td><td>Exchange needs a <b>double coincidence of wants</b>; buying and selling cannot be separated</td></tr>
<tr><td><b>Store of value</b></td><td>People can store purchasing power for future use</td><td>Goods are perishable, so it is not easy to maintain their value</td></tr>
<tr><td><b>Unit of account</b></td><td>The value of goods and services can be expressed in terms of money</td><td>No common measure of value: values are relative prices (4 items need 3+2+1 exchange ratios; 5 items need 4+3+2+1; 6 items need 5+4+3+2+1 ...)</td></tr>
<tr><td><b>Standard of deferred payment</b></td><td>The value of a future payment can be expressed in terms of money</td><td>(no matching barter problem listed)</td></tr>
</table></div>
<p>Your margin note: the functions differ in <b>strength</b> ("有強弱之分"), and you must write the <b>definition</b> in answers. Unit of account is about the value of goods and services; standard of deferred payment is about the value of a payment to be made later (a contract is made now, payment comes later: wages, water bills, rent, loan interest).</p>`},
{id:"M2",t:`B. Properties of good money`,zh:`良幣的特質`,src:[S(1,"1")],h:`
<div class="tw"><table>
<tr><th>Property</th><th>Meaning</th></tr>
<tr><td>Generally acceptable</td><td>Society accepts it as a medium of exchange for goods and services</td></tr>
<tr><td>Durable</td><td>Does not wear out easily, since it changes hands many times</td></tr>
<tr><td>Homogeneous</td><td>Uniform in physical characteristics, quality and value, so the value is easily recognised (the basis of the unit of account)</td></tr>
<tr><td>Divisible</td><td>Can be divided into smaller units for small transactions <b>without losing value</b></td></tr>
<tr><td>Portable</td><td>Easy to carry, for settling <b>large</b> transactions</td></tr>
<tr><td>Relatively scarce</td><td>Its purchasing power is stable</td></tr>
</table></div>`},
{id:"M3",t:`C. Forms of money`,zh:`貨幣的形式`,src:[S(2,"2")],h:`
<div class="tw"><table>
<tr><th>Form</th><th>Features</th></tr>
<tr><td>Commodity money</td><td>Has intrinsic value (not just a medium of exchange)</td></tr>
<tr><td>Convertible paper money</td><td>Can be converted into gold or silver on demand</td></tr>
<tr><td>Fiat money / legal tender</td><td>Supported by the government, backed by law</td></tr>
<tr><td>Demand deposits</td><td>No interest; payable by cheque or EPS</td></tr>
<tr><td>Savings deposits</td><td>Interest-bearing</td></tr>
<tr><td>Time deposits</td><td>Interest-bearing (higher than savings); cannot withdraw before maturity</td></tr>
<tr><td>Negotiable certificate of deposit (NCD)</td><td>Interest-bearing; can be sold to someone else before maturity</td></tr>
<tr><td>Electronic money</td><td>Digital cash stored in the banking system (a credit card is <b>not</b> money). With wider use, the public holds less cash and deposits more into banks</td></tr>
</table></div>`},
{id:"M4",t:`D. The three-tier banking system`,zh:`三級銀行發牌制度`,src:[S(2,"2")],h:`
<div class="tw"><table>
<tr><th></th><th>Licensed bank</th><th>Restricted licence bank</th><th>Deposit-taking company</th></tr>
<tr><td>Deposits taken</td><td>Demand, savings, time deposits and NCDs</td><td>Time deposits and NCDs</td><td>Time deposits and NCDs</td></tr>
<tr><td>Minimum deposit</td><td>None</td><td>$500,000</td><td>$100,000</td></tr>
<tr><td>Minimum period</td><td>None</td><td>None</td><td>3 months</td></tr>
</table></div>`},
{id:"M5",t:`E. Measuring the money supply`,zh:`貨幣供應的量度`,src:[S(2,"3")],h:`
<p>The three measures are nested: <b>M1 is inside M2, which is inside M3</b>. LB = licensed banks; RLB = restricted licence banks; DTC = deposit-taking companies.</p>
<div class="tw"><table>
<tr><th>Measure</th><th>Includes</th><th>Role</th></tr>
<tr><td><b>M1</b></td><td>(1) Legal tender held by the non-bank public (cash in circulation, including safe-deposit boxes); (2) demand deposits (LB)</td><td>Money used as a <b>medium of exchange</b></td></tr>
<tr><td><b>M2</b></td><td>M1 + (3) savings deposits (LB), (4) time deposits (LB), (5) NCDs held by the non-bank public (issued by LB)</td><td>M1 plus money used as a <b>store of value</b> in licensed banks</td></tr>
<tr><td><b>M3</b></td><td>M2 + (6) time deposits (RLB and DTC), (7) NCDs held by the non-bank public (issued by RLB and DTC)</td><td>M2 plus store of value in RLB and DTC</td></tr>
</table></div>
<ul>
<li><b>Monetary base (M0)</b> = total issue of legal tender (held by banks + held by the non-bank public). Bank <b>reserves</b> (legal tender held by banks) are part of M0, not of the money supply. Your note: "reserves ... CIC".</li>
<li>Only items held by the <b>non-bank public</b> count in M1 to M3 (your note: NCDs "not held by banks"). Counting NCDs held by banks would be <b>double counting</b>.</li>
</ul>`},
{id:"M6",t:`F. Functions of the central bank (the HKMA)`,zh:`中央銀行的功能`,src:[S(3,"4")],h:`
<ol>
<li>Implement <b>monetary policy</b> (not fiscal policy). Your note: change in MS, so a change in the interest rate, so a change in AD (I).</li>
<li>Issue currency. The HKMA issues the $10 note and coins. Other banknotes are issued by three note-issuing banks: HSBC, Bank of China (Hong Kong), Standard Chartered.</li>
<li>Act as lender of last resort.</li>
<li>Manage foreign exchange reserves. The HKMA manages the Exchange Fund to maintain the stability of the linked exchange rate system.</li>
<li>Keep the cash reserves of private banks: <b>not done in Hong Kong</b> (starred on your copy).</li>
<li>Supervise private banks.</li>
<li>Administer the clearing house: the Hong Kong Interbank Clearing Limited acts as the clearing house, jointly owned by the HKMA and the Hong Kong Association of Banks. The HKMA is <b>not</b> responsible for the day-to-day operation of the clearing house.</li>
<li>Act as banker for the government (HSBC in Hong Kong).</li>
<li>Act as adviser for the government.</li>
</ol>`}
];

const SEC={A:"Money",B:"Banking",C:"Money supply and HKMA"};
q("K1","A","Concept check",0,"",`Money can be used to express the value of a payment to be made next month. This is the function of …`,[`medium of exchange`,`store of value`,`unit of account`,`standard of deferred payment`],"D",`Expressing the value of a future payment in money: standard of deferred payment. Unit of account expresses the value of goods and services today.`);
q("K2","A","Concept check",0,"",`In a barter economy, which problem arises because goods are perishable?`,[`double coincidence of wants`,`difficulty in maintaining value`,`lack of a common measure of value`,`too many exchange ratios`],"B",`Perishable goods lose value, so it is not easy to store purchasing power: the store-of-value problem.`);
q("K3","A","Concept check",0,"",`There are 6 goods in a barter economy. The number of exchange ratios is …`,[`6`,`10`,`15`,`30`],"C",T`@@5+4+3+2+1=15@@. With money, each good has just one price (6 prices).`);
q("K4","A","Concept check",0,"",`A good that can be divided into smaller units without losing value is …`,[`homogeneous`,`divisible`,`portable`,`durable`],"B",`Divisible: allows small transactions without losing value. (Being merely "cut into smaller pieces" is not enough.)`);
q("K5","A","Concept check",0,"",`Gold is a common form of ______ money.`,[`fiat`,`commodity`,`electronic`,`convertible paper`],"B",`Commodity money has intrinsic value beyond serving as a medium of exchange.`);
q("K6","A","Concept check",0,"",`Which of the following is <b>not</b> money?`,[`a demand deposit`,`cash held by the public`,`a credit card`,`an e-wallet balance in a bank account`],"C",`A credit card is a way of borrowing, not money. Electronic money is digital cash stored in the banking system.`);
q("K7","B","Concept check",0,"",`A restricted licence bank can take …`,[`demand deposits`,`savings deposits`,`time deposits of at least $500,000`,`time deposits of at least $100,000 for 3 months`],"C",`RLB: time deposits and NCDs, minimum $500,000, no minimum period. The $100,000, 3-month rule is for deposit-taking companies.`);
q("K8","B","Concept check",0,"",`Only licensed banks may take …`,[`time deposits`,`demand deposits`,`NCDs`,`deposits above $1 million`],"B",`Demand and savings deposits are taken only by licensed banks.`);
q("K9","B","Concept check",0,"",`Which statement about the central bank in Hong Kong is correct?`,[`the HKMA keeps the cash reserves of private banks`,`the HKMA implements fiscal policy`,`the HKMA manages the Exchange Fund to keep the linked exchange rate stable`,`the HKMA runs the clearing house day to day`],"C",`The HKMA manages the Exchange Fund. It does not keep banks' cash reserves, set fiscal policy, or run the clearing house (Hong Kong Interbank Clearing Limited does).`);
q("K10","B","Concept check",0,"",`Who issues the $10 note in Hong Kong?`,[`HSBC`,`the HKMA`,`Standard Chartered`,`Bank of China (Hong Kong)`],"B",`The HKMA issues the $10 note and coins; the other banknotes come from the three note-issuing banks.`);
q("K11","C","Concept check",0,"",`Which is included in M1?`,[`savings deposits`,`time deposits`,`demand deposits held by the non-bank public`,`NCDs`],"C",`M1: legal tender held by the non-bank public and demand deposits.`);
q("K12","C","Concept check",0,"",`Which statement is correct?`,[`M2 is part of M1`,`M3 includes M2`,`M1 includes savings deposits`,`bank reserves are part of M1`],"B",`The measures are nested: M1 within M2 within M3. Reserves belong to the monetary base, not to the money supply.`);
q("K13","C","Concept check",0,"",`A person transfers $10,000 from a demand deposit to a time deposit at the same licensed bank. M1 …`,[`rises, M2 unchanged`,`falls, M2 unchanged`,`unchanged, M2 falls`,`unchanged, M2 unchanged`],"B",`Demand deposits (M1) fall by $10,000; time deposits (in M2) rise by the same amount, so M2 is unchanged.`);
q("K14","C","Concept check",0,"",`A licensed bank holds an NCD issued by another licensed bank. For the money supply, this NCD …`,[`is counted in M2`,`is counted in M3 only`,`is not counted: only NCDs held by the non-bank public are included`,`is counted in M1`],"C",`Counting items held by banks would double count. Only holdings of the non-bank public enter M1 to M3.`);
q("K15","C","Concept check",0,"",`The monetary base M0 is …`,[`the total issue of legal tender`,`M1 plus time deposits`,`demand deposits only`,`bank loans`],"A",`M0 = legal tender held by banks plus legal tender held by the non-bank public.`);

const EX=[
{id:"J1",k:"num",t:`Count the exchange ratios`,stem:`How many exchange ratios are needed among 8 goods in a barter economy?`,a:28,u:`ratios`,tol:0.01,src:[S(1,"1")],w:T`@@7+6+5+4+3+2+1=28@@, which is @@n(n-1)/2@@ with @@n=8@@. With money you need only 8 prices.`},
{id:"J2",k:"open",t:`Which function is it?`,stem:`A landlord and tenant agree that rent of $12,000 will be paid at the end of each month. Which function of money does this show? Why is it different from unit of account?`,src:[S(7,"")].slice(0,0).concat([S(1,"1")]),w:`<p><b>Standard of deferred payment.</b> The contract is made now but the payment happens later. The value of the future payment is expressed in money. <b>Unit of account</b> concerns the value of goods and services now (prices), not a payment to be made later.</p>`},
{id:"J3",k:"open",t:`Is it fiscal or monetary?`,stem:`The HKMA wants to raise the interest rate. Explain which type of policy this is and trace the effect on aggregate demand.`,src:[S(3,"4")],w:`<p>This is <b>monetary policy</b> (the central bank changes the money supply or interest rate; fiscal policy changes taxes and government spending). Margin chain: change in money supply, so change in the interest rate, so change in AD through investment (and consumption): a higher interest rate lowers I and C, so AD falls.</p>`}
];

const LONG=[
{id:"I1",src:`Practice (framework from the notes)`,q:`Explain two properties of good money and why a barter economy lacks them.`,m:`<p><b>Divisible:</b> money can be divided into smaller units for small transactions without losing value. Barter goods (a cow) cannot be split without losing value. <b>Portable:</b> money is easy to carry for large transactions; bulky goods are not. (Also durable, homogeneous, generally acceptable and relatively scarce.) Write the definition, and why it matters.</p>`},
{id:"I2",src:`Practice (framework from the notes)`,q:`Distinguish M1 from M2 and explain what double counting is in measuring the money supply.`,m:`<p><b>M1</b> is money used as a medium of exchange: legal tender held by the non-bank public plus demand deposits. <b>M2</b> equals M1 plus savings deposits, time deposits and NCDs (held by the non-bank public) of licensed banks, i.e. money used as a store of value.</p><p><b>Double counting:</b> an NCD issued by one bank and held by another bank would be counted twice (as the issuing bank's liability and as an asset of the holding bank). Only items held by the non-bank public count.</p>`}
];

const CS=[
{t:`Common mistakes with money and banking`,zh:`常犯錯誤`,src:[S(3,"5"),S(4,"6")],h:`
<div class="tw"><table>
<tr><th>Topic</th><th>Typical mistakes</th></tr>
<tr><td>Functions of money</td><td>Not memorising the definitions of all four functions and leaving out key words · confusing unit of account with standard of deferred payment (both express value in money; the first is the value of goods and services, the second is the value of a payment to be made later) · not knowing examples of deferred payment (wages, water, rent, loan interest)</td></tr>
<tr><td>Strength of the functions of money</td><td>Not knowing the store-of-value function is affected by purchasing power, which depends on the price level · not realising "generally accepted" is a matter of degree (more shops accept it, the more general)</td></tr>
<tr><td>Properties of good money</td><td>Not noticing some points do not apply · thinking "can be cut into smaller units" is divisible (it must be "without losing total value") · forgetting divisible is for small transactions and portable for large ones · thinking "not scarce" means it is not good money (money is generally an economic good) · forgetting homogeneity makes value easy to recognise and is the basis of the unit of account</td></tr>
<tr><td>Barter economy</td><td>Not seeing why inflation cannot exist in a barter economy</td></tr>
<tr><td>Bank deposits and electronic money</td><td>Missing the differences between deposits: interest return, payment method (cheque, EPS)</td></tr>
<tr><td>Three-tier banking system</td><td>Hard to memorise each bank's deposit requirement</td></tr>
<tr><td>Measuring the money supply</td><td>Thinking legal tender held by licensed banks (bank reserves) counts in the money supply, when it counts in the monetary base · forgetting M1 is in M2, M2 in M3 · in cases where several people's deposits change, forgetting that the economy's M1, M2, M3 must include <b>everyone's</b> deposits</td></tr>
<tr><td>Double counting</td><td>Not seeing some money-supply data include overlapping items · not knowing an NCD can be held by an authorised institution or by the non-bank public, and only the latter counts</td></tr>
<tr><td>Central bank functions</td><td>Thinking fiscal policy is a central-bank function (fiscal: taxes and spending, normally the Financial Secretary; monetary: money supply, normally the central bank) · not knowing the HKMA does not keep banks' cash reserves · not knowing cheque clearing is done by Hong Kong Interbank Clearing Limited</td></tr>
<tr><td>Hong Kong as an international financial centre</td><td>Thinking it will not be examined, so not preparing</td></tr>
</table></div>`}
];

Yupi.register({
 id:"macro6",title:"Money and banking",
 sub:`The four functions of money, the properties of good money, forms of money, the three-tier banking system, M1 to M3 and what the HKMA does. From the Macro 6 cheat sheet.`,
 files:{cs:{name:"[CS] Macro 6 Money and Banking.pdf",dir:"雞精notes/Macro/",pre:"ma6r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet.`,
 csLead:`The error table from the cheat sheet, summarised in English.`,
 verify:[["Handwritten notes",`Your margin notes on pages 1, 3 and 4 (definitions, "reserves", "CIC", the interest-rate chain, the star on keeping banks' reserves) are folded into the Learn cards. The two notes on page 3 that I could only partly read ("唔會負數" near the list of time deposits) are not used.`,["cs",2,"3"]]]
});
})();
