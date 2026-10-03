import { writeFile, mkdir } from 'node:fs/promises';
import { lessons } from '../js/lessons.js';
const source = s => s.split('\n').map((line,i,a)=>line+(i<a.length-1?'\n':''));
const md=s=>({cell_type:'markdown',metadata:{},source:source(s)});
const code=s=>({cell_type:'code',execution_count:null,metadata:{},outputs:[],source:source(s)});
const cells=[md('# Little Algebra / 每天，多懂一點\n\nA bilingual companion to the local HTML course, for a Core + M1 foundation.\n\nStart with one lesson a day. Run each code cell, change one value, and predict what will happen.\n\n每天一課：執行程式、改一個數值，再預測結果。\n\nInstall dependencies in your Python environment: `python -m pip install numpy scipy matplotlib pandas jupyter`.\n\nThe examples use fixed data. Random seeds are reproducible within each language; JavaScript, Python and R generate different random sequences.\n\n範例使用固定數據。亂數種子能在各自語言中重現結果，但 JavaScript、Python、R 的亂數序列不同。')];
for (const [i,l] of lessons.entries()) {
  cells.push(md(`## ${String(i+1).padStart(2,'0')}. ${l.title} / ${l.zh}\n\n${l.idea.en}\n\n${l.idea.zh}\n\n$$${l.formula}$$\n\n**Try / 試試：** ${l.steps[0].en} ${l.steps[0].zh}\n\n**Watch / 留意：** ${l.trap.en} ${l.trap.zh}\n\nReading / 閱讀：${l.ref}`));
  cells.push(code(l.py));
  cells.push(md(`**Check / 檢查：** ${l.quiz.q.en} ${l.quiz.q.zh}\n\nChoices / 選項：${l.quiz.options.join(' · ')}\n\n<details><summary>Answer / 答案</summary>\n\n${l.quiz.options[l.quiz.answer]} — ${l.quiz.why.en} ${l.quiz.why.zh}\n\n</details>`));
}
cells.push(md('## A first pandas table / 第一個 pandas 表格\n\nA DataFrame is a table whose columns can hold different kinds of values. Select a column by name, then calculate a summary. / DataFrame 是資料表，各直列可以儲存不同類型的數值；按名稱選取直列，再計算統計摘要。'));
cells.push(code('import pandas as pd\ndata = pd.DataFrame({"hours": [1, 2, 3, 4], "marks": [40, 52, 61, 75]})\nprint(data)\nprint(data["marks"].mean())\nprint(data.describe())'));
cells.forEach((cell,i)=>{cell.id=`little-algebra-${String(i).padStart(2,'0')}`;});
await mkdir('examples',{recursive:true});
await writeFile('examples/linear_algebra_statistics.ipynb',JSON.stringify({cells,metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'},language_info:{name:'python'}},nbformat:4,nbformat_minor:5},null,2)+'\n');
console.log(`Generated notebook with ${cells.length} cells.`);
