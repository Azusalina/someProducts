import test from 'node:test';
import assert from 'node:assert/strict';
import {markdownModule} from '../src/modules/markdown/index.js';
import {documentStyle} from '../src/core/files.js';
const render = source => markdownModule.render(source, {filename:'/tmp/math.md'});

test('LaTeX renders inline, display, bracket, table and math-fence expressions', async () => {
 const {html,warnings}=await render(String.raw`# Formula

Inline $E=mc^2$ and \(\sqrt{x}\).

$$\frac{1}{2}$$

\[\sum_{i=1}^n i\]

| Formula | Value |
|---|---|
| $x_1$ | $\alpha$ |

~~~math
\begin{pmatrix}1&2\\3&4\end{pmatrix}
~~~
`);
 assert.equal((html.match(/class="katex"/g)||[]).length,7);
 assert.equal((html.match(/class="katex-display"/g)||[]).length,3);
 assert.match(html,/<math\b/);assert.match(html,/<annotation encoding="application\/x-tex">/);
 assert.doesNotMatch(html,/toolkit-math-/);assert.deepEqual(warnings,[]);
});

test('literal code, escaped currency and ordinary prices remain literal',async()=>{
 const {html}=await render(String.raw`Prices $5 and $10.

Escaped \$x$.

Inline code: \`$x^2$\`.

~~~latex
$y^2$
~~~
` .replaceAll('\\`','`'));
 assert.doesNotMatch(html,/class="katex"/);assert.match(html,/Prices \$5 and \$10/);
 assert.match(html,/<code>\$x\^2\$<\/code>/);assert.match(html.replace(/<[^>]*>/g,''),/\$y\^2\$/);
});

test('invalid or expansive formulas fall back to source without breaking the document',async()=>{
 const {html,warnings}=await render(String.raw`Before $\notARealCommand{x}$ after.

$$\def\loop{\loop}\loop$$

Final text.`);
 assert.equal(warnings.length,2);assert.match(html,/math-error/);assert.match(html,/Final text/);
 assert.doesNotMatch(html,/toolkit-math-/);
});

test('untrusted math cannot load resources or bypass the source HTML sanitizer',async()=>{
 const {html}=await render(String.raw`$\href{javascript:alert(1)}{click}$

$\includegraphics{https://example.com/track.png}$

$\htmlStyle{background:url(https://example.com)}{x}$

<math><mi>FORGEDMATH</mi></math><svg><text>FORGEDSVG</text></svg>
<script>window.HACKED=true</script>
`);
 assert.doesNotMatch(html,/<a\b|<img[^>]+src="(?:https?:|file:)|<script\b|FORGEDMATH|FORGEDSVG|HACKED|style="[^"]*url\(/);
});

test('math styles embed local WOFF2 fonts for offline preview and PDF export',async()=>{
 const css=await documentStyle();
 assert.match(css,/data:font\/woff2;base64,/);assert.match(css,/\.katex/);
 assert.doesNotMatch(css,/url\((?:fonts\/|https?:|file:)/);
});
