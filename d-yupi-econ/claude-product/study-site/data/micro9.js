/* Micro chapter 9: Ownership and expansion of firms. Source: [CS] Micro 9 cheat sheet (8 printed pages). */
(function(){
const T=String.raw;
const B=Yupi.builder(),q=B.q;
const S=(p,pr)=>["cs",p,pr];

const LEARN=[
{id:"O1",t:`Types of ownership compared`,zh:`廠商擁有權`,src:[S(1,"1"),S(2,"2")],h:`
<div class="tw"><table>
<tr><th></th><th>Sole proprietorship</th><th>Partnership</th><th>Private limited company</th><th>Public limited company</th></tr>
<tr><td>Source of capital</td><td>The owner; bank loans; retained profit</td><td>The partners; bank loans; retained profit</td><td>Issuing shares; bank loans; retained profit; issuing bonds</td><td>Issuing shares <u>in the stock market</u>; bank loans; retained profit; bonds</td></tr>
<tr><td>Limited liability</td><td colspan="2">No: <b>unlimited</b> liability</td><td colspan="2">Yes</td></tr>
<tr><td>Separate legal entity</td><td colspan="2">No</td><td colspan="2">Yes</td></tr>
<tr><td>Lasting continuity</td><td colspan="2">No</td><td colspan="2">Yes</td></tr>
<tr><td>Ownership separate from management</td><td colspan="2">No</td><td colspan="2">Yes</td></tr>
<tr><td>Profits tax rate</td><td colspan="2">Lower</td><td colspan="2">Higher</td></tr>
<tr><td>Setting-up</td><td colspan="2">Less complicated</td><td colspan="2">More complicated (public: even more)</td></tr>
<tr><td>Transfer of ownership</td><td>Freely transferable</td><td colspan="2">Needs the consent of other owners</td><td>Freely transferable</td></tr>
<tr><td>Disclose accounting information to the public</td><td colspan="3">No</td><td>Yes</td></tr>
<tr><td>Risk of being taken over</td><td colspan="3">No</td><td>Yes</td></tr>
<tr><td>Upper limit on owners</td><td colspan="2">None</td><td>50</td><td>None</td></tr>
</table></div>`},
{id:"O2",t:`A. Advantages and disadvantages of each type`,zh:`不同擁有權的優劣`,src:[S(2,"3")],h:`
<p><b>Partnership over sole proprietorship</b></p>
<ul>
<li>Advantages: wider <i>source</i> of capital (do not write "more capital"); risk and cost can be <b>shared</b> (not "lower risk"); different abilities, so a wider scope of specialisation and better division of labour.</li>
<li>Disadvantages: decision making is less flexible (partners may disagree); transfer of ownership needs the others' agreement; each partner's decision is legally binding on all the others.</li>
</ul>
<p><b>Private limited company over unlimited company</b></p>
<ul>
<li>Advantages: wider source of capital (shares, but not on the stock market, and bonds); <b>limited liability</b> (when bankrupt, owners lose only their initial investment); <b>separate legal entity</b> (it can sign contracts, own assets, sue, be sued, pay profits tax); <b>lasting continuity</b> (a shareholder's withdrawal, bankruptcy or death does not end the business).</li>
<li>Disadvantages: higher profits tax rate; more complicated set-up.</li>
</ul>
<p><b>Public limited company over private limited company</b></p>
<ul>
<li>Advantages: wider source of capital by issuing shares <u>to the public or in the stock market</u>; shares are freely transferable without the consent of other shareholders.</li>
<li>Disadvantages: higher risk of being taken over if shares trade freely in the stock market; must disclose its <b>accounting or financial</b> information to the public (not "business" information); even more complicated set-up.</li>
</ul>`},
{id:"O3",t:`B. Shares and bonds`,zh:`股票和債券`,src:[S(3,"5")],h:`
<div class="tw"><table>
<tr><th>Viewpoint</th><th>Shares</th><th>Bonds</th></tr>
<tr><td><b>Investor</b></td><td>Variable dividend: greater return if the firm profits more; may have <b>voting rights</b> at the Annual General Meeting</td><td>Fixed interest whether or not the firm profits; the firm must <b>redeem</b> on a fixed date; bondholders are paid <b>before</b> shareholders if the company is liquidated</td></tr>
<tr><td><b>Company issuing</b></td><td>No interest burden when there is no profit (no obligation to pay dividends); no obligation to buy back (no fixed date); does not add to liabilities, so it will not hinder new bank loans</td><td>Bondholders are only creditors, not owners, so <b>no risk of being taken over</b>; no voting rights, so issuing bonds does not dilute existing shareholders' control</td></tr>
</table></div>
<p>Check the viewpoint in the question (investor or company), and if it says "existing shareholders", also weigh the company's interests.</p>`},
{id:"O4",t:`C. Public enterprises`,zh:`公營企業`,src:[S(4,"6")],h:`
<ul>
<li><b>Government departments:</b> Education Bureau, Department of Health, Hongkong Post.</li>
<li><b>Public corporations:</b> HK Examinations and Assessment Authority, Hospital Authority, HK Airport Authority.</li>
</ul>
<p><b>Advantages over private enterprises:</b> stable service at a lower price serves the needs of the poor; easier to get information about the general public from the government; easier to get loans with the government's backing.</p>
<p><b>Disadvantages:</b> no profit motive, so management is less efficient and less sensitive to market signals and consumers' demand; service quality may be lower.</p>`},
{id:"O5",t:`D. Expansion of firms`,zh:`廠商的擴張`,src:[S(4,"7")],h:`
<div class="tw"><table>
<tr><th>Type</th><th>Definition</th><th>Specific motives</th></tr>
<tr><td><b>Horizontal</b></td><td>Expand in the <u>same industry</u> to produce the <u>same type</u> of product</td><td>Raise market share, market power and influence on price; reduce competition (<b>only</b> if by horizontal <i>integration</i>); eliminate duplication of resources</td></tr>
<tr><td><b>Vertical backward</b></td><td>Expand to a <u>previous stage</u> of production</td><td>Ensure a steady supply of factor input</td></tr>
<tr><td><b>Vertical forward</b></td><td>Expand to a <u>later stage</u> of production</td><td>Ensure market outlets for its products; obtain market information more easily</td></tr>
<tr><td><b>Lateral</b></td><td>Expand to a <u>related but not directly competitive</u> product</td><td>Spread risk through product or market diversification (<b>spread</b>, not "reduce")</td></tr>
<tr><td><b>Conglomerate</b></td><td>Expand to an <u>unrelated</u> product</td><td>Spread risk through diversification</td></tr>
</table></div>
<p><b>General motives:</b> enjoy economies of scale; use a brand name to sell another product or promote goodwill.</p>`}
];

const SEC={A:"Ownership",B:"Shares and bonds",C:"Public enterprises",D:"Expansion"};
q("O1","A","Concept check",0,"",`Which feature belongs to a <b>partnership</b> but <b>not</b> to a private limited company?`,[`limited liability`,`unlimited liability`,`separate legal entity`,`lasting continuity`],"B",`Partnerships (and sole proprietors) have unlimited liability. The other three belong to limited companies.`);
q("O2","A","Concept check",0,"",`A key advantage of a partnership over a sole proprietorship is …`,[`unlimited liability`,`a wider source of capital`,`freely transferable ownership`,`lower profits tax`],"B",`More owners give a wider <i>source</i> of capital. Write "wider source", not "more capital".`);
q("O3","A","Concept check",0,"",`The maximum number of owners of a <b>private limited company</b> is …`,[`2`,`20`,`50`,`no limit`],"C",`Private limited companies are capped at 50 owners; unlimited companies and public limited companies have no upper limit.`);
q("O4","A","Concept check",0,"",`A public limited company must …`,[`disclose accounting information to the public`,`have unlimited liability`,`keep all its shares private`,`pay lower profits tax than a partnership`],"A",`Every public limited company discloses accounting information, whether or not it is listed. Not only listed firms need to disclose.`);
q("O5","A","Concept check",0,"",`Which is a disadvantage of a public limited company compared with a private one?`,[`narrower source of capital`,`shares cannot be transferred`,`higher risk of being taken over`,`unlimited liability`],"C",`Shares traded freely in the stock market make a takeover easier.`);
q("O6","A","Concept check",0,"",`When a company with <b>limited liability</b> goes bankrupt, its owners …`,[`lose everything they own`,`lose only the amount of their initial investment`,`lose nothing`,`must repay all debts from personal assets`],"B",`Limited liability caps the owners' loss at their investment.`);
q("O7","B","Concept check",0,"",`From the <b>investor's</b> viewpoint, an advantage of <b>bonds</b> over shares is …`,[`a variable dividend`,`voting rights`,`a fixed rate of interest whether or not the firm makes a profit`,`no repayment date`],"C",`Bondholders receive fixed interest and are paid before shareholders in liquidation.`);
q("O8","B","Concept check",0,"",`From the <b>company's</b> viewpoint, an advantage of issuing <b>shares</b> over bonds is …`,[`no interest burden if the firm makes no profit`,`no risk of takeover`,`fixed redemption date`,`control is never diluted`],"A",`No obligation to pay dividends when there is no profit. Bonds are better for avoiding takeover and keeping control.`);
q("O9","B","Concept check",0,"",`A company issues bonds rather than shares. Which is true?`,[`control of existing shareholders is diluted`,`bondholders become owners with voting rights`,`there is no risk of being taken over and control is not diluted`,`the company need not repay`],"C",`Bondholders are creditors with no vote, so the issue neither adds owners nor dilutes control.`);
q("O10","C","Concept check",0,"",`Which of the following is a <b>public corporation</b> (not a government department)?`,[`Education Bureau`,`Hongkong Post`,`Hospital Authority`,`Department of Health`],"C",`Hospital Authority is a public corporation. The other three are government departments.`);
q("O11","C","Concept check",0,"",`Compared with private enterprises, public enterprises …`,[`have a stronger profit motive`,`may be less efficient as the government lacks a profit motive`,`always have higher quality`,`cannot get loans`],"B",`No profit motive means management is less efficient and less sensitive to market signals.`);
q("O12","D","Concept check",0,"",`A bakery chain opens a flour mill. This is …`,[`horizontal expansion`,`vertical backward expansion`,`vertical forward expansion`,`conglomerate expansion`],"B",`The mill is a <b>previous</b> stage of production (a supply of factor input).`);
q("O13","D","Concept check",0,"",`A clothing manufacturer opens its own retail shops. This is …`,[`vertical backward expansion`,`vertical forward expansion`,`horizontal expansion`,`lateral expansion`],"B",`Retail is a <b>later</b> stage: vertical forward. The motive: secure outlets and market information.`);
q("O14","D","Concept check",0,"",`A bank buys another bank. The most likely motive is …`,[`ensure steady supply of inputs`,`increase market share and market power`,`spread risk through diversification`,`reduce risk to zero`],"B",`Same industry, same product: horizontal expansion, to raise market share and influence on price.`);
q("O15","D","Concept check",0,"",`A food company starts a fashion business. This is …`,[`horizontal expansion`,`vertical expansion`,`conglomerate expansion`,`lateral expansion`],"C",`An <b>unrelated</b> product: conglomerate. The motive is to <b>spread</b> (not reduce) risk. First check horizontal and vertical before calling it conglomerate.`);
q("O16","D","Concept check",0,"",`Which statement about horizontal expansion is correct?`,[`any horizontal expansion reduces the number of competitors`,`only horizontal integration (taking over a rival) reduces the number of competitors`,`it spreads risk`,`it is the same as vertical expansion`],"B",`Opening a new outlet in the same industry adds to market share but does not remove competitors. Only a takeover or merger does.`);

const EX=[
{id:"M1",k:"open",t:`Name the expansion`,stem:`A hotel group buys a travel agency. Explain what type of expansion this is and one motive.`,src:[S(4,"7"),S(5,"8")],w:`<p>The hotel provides a <b>factor input</b> (accommodation) to the tour packages a travel agency sells, so the agency uses the hotel's service. If the agency is the later stage and sells the hotel's rooms, this is <b>vertical forward</b> expansion: the motive is to ensure <b>market outlets</b> for its rooms and obtain market information more easily. (Always give the <b>definition</b> and apply it to the case, as the sheet warns.)</p>`},
{id:"M2",k:"open",t:`Shares or bonds?`,stem:`A company wants to raise funds but does not want to lose control. Which should it issue, and why? Name one drawback.`,src:[S(3,"5")],w:`<p><b>Bonds.</b> Bondholders are creditors without voting rights, so issuing bonds does not dilute the existing shareholders' control and carries no risk of takeover.</p><p>Drawback: fixed interest must be paid whether or not the firm makes a profit, and the bonds must be redeemed on a fixed date; issuing them adds to the firm's liabilities.</p>`},
{id:"M3",k:"open",t:`Public limited, but not listed?`,stem:`A student writes: "A public limited company must have its shares traded on the stock market." Comment.`,src:[S(5,"8")],w:`<p>Wrong. A public limited company <i>can</i> sell shares to the public in the stock market, but it can also be <b>non-listed</b>. And any public limited company, listed or not, must disclose its accounting information to the public.</p>`}
];

const LONG=[
{id:"R1",src:`Practice (framework from the notes)`,q:`Explain two advantages and one disadvantage of turning a sole proprietorship into a private limited company.`,m:`<p><b>Advantages:</b> (1) <b>Limited liability</b>: if the business fails the owner loses only the amount invested. (2) <b>Wider source of capital</b>: it can raise money by issuing shares and bonds. (Also separate legal entity and lasting continuity.)</p><p><b>Disadvantage:</b> a <b>higher profits tax rate</b> and a more complicated set-up procedure.</p>`},
{id:"R2",src:`Practice (framework from the notes)`,q:`Explain why a firm may expand laterally rather than horizontally.`,m:`<p>Lateral expansion adds a <b>related but not directly competitive</b> product. The motive is to <b>spread risk</b> through product and market diversification: if one product's demand falls, the others may hold up. Horizontal expansion adds more of the <i>same</i> product, so it increases dependence on one market. Write "spread", not "reduce", risk.</p>`}
];

const CS=[
{t:`Common mistakes with ownership and expansion`,zh:`常犯錯誤`,src:[S(5,"8")],h:`
<div class="tw"><table>
<tr><th>Topic</th><th>Typical mistakes</th></tr>
<tr><td>Ownership of firms</td><td>Writing "more capital" for "wider source of capital" · writing "reduce risk" for "spread risk" · thinking public limited company shares must trade on the stock market (they can be non-listed) · thinking only listed companies disclose financial information (every public limited company must) · forgetting the definition of limited liability</td></tr>
<tr><td>Shares versus bonds</td><td>Not noticing whether the question asks from the investor's or the company's viewpoint · if the question asks "from the viewpoint of existing shareholders", forgetting that the company's interests count too</td></tr>
<tr><td>Public enterprises</td><td>Not knowing the main difference from private enterprises · it is a rarely tested topic, so students forget it; also confusing "government department" with "public corporation"</td></tr>
<tr><td>Expansion of firms</td><td>Forgetting to give the definition when asked to explain the type of expansion · classifying straight to conglomerate without first checking horizontal and vertical · thinking any expansion raises market share (only horizontal does) · not linking market share with market power and influence on price (market structure) · saying lateral or conglomerate expansion "reduces" business risk (it spreads it) · thinking any horizontal expansion reduces competition (only horizontal integration does) · not knowing the hotel and travel agency relationship: a hotel provides the factor input for the tour</td></tr>
</table></div>`}
];

Yupi.register({
 id:"micro9",title:"Ownership and expansion of firms",
 sub:`Sole traders to public companies, shares versus bonds, public enterprises and the five ways a firm can grow. From the Micro 9 cheat sheet.`,
 files:{cs:{name:"[CS] Micro 9 Ownership & Expansion of firms.pdf",dir:"雞精notes/Micro/",pre:"mi9r-",short:"Cheat sheet",printedLabel:"sheet P."}},
 qfile:"none",sec:SEC,keys:{},
 learn:LEARN,ex:EX,q:B.Q,long:LONG,cs:CS,
 qLead:`Concept-check questions written for this site from the cheat sheet.`,
 csLead:`The error table from the cheat sheet, summarised in English.`,
 verify:[["Example M1",`The hotel and travel agency example depends on which is the earlier and later stage in the case. The sheet only says the hotel provides the factor input to the tour. Read the actual question carefully.`,["cs",5,"8"]]]
});
})();
