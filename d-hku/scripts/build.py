#!/usr/bin/env python3
"""Build offline data bundle and LLM-readable dossiers from retained research."""
import hashlib
import html
import json
import re
import subprocess
from pathlib import Path
import markdown

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
CHECKED = '2026-10-22 to 2026-10-23'
ORDER = '6298 6755 6767 6793 6810 6200 6224 6248 6729 6779 6999 6602'.split()
FIELDS = {'computing':'計算與數據', 'business':'商科與經濟','engineering':'工程與創新','law':'法律與公共事務'}

def read_json(path):
    return json.loads(path.read_text())

def md(text):
    return markdown.markdown(text, extensions=['tables','fenced_code','sane_lists']).replace('href="hku26.pdf','href="data/hku26.pdf')

def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')

records = []
for group in ['cds', 'engineering', 'business-law']:
    records += read_json(DATA/f'research-{group}.json')
by_code = {p['code']: p for p in records}
assert len(by_code) == 12
records = [by_code['JS'+c] for c in ORDER]

# A common-module discussion can inform several programmes, but is never a
# programme-wide student satisfaction survey.
econ_review = {
    'summary':'Dcard ECON1210 選課串，帶HKU標籤匿名留言對不同教師有不同評價，亦有人自述無DSE經濟背景仍獲高分。身份與分數未核實、授課安排可變；僅是共同科目的個人經驗，不能代表整個課程。',
    'url':'https://www.dcard.tw/f/hku/p/259398904', 'date':'2025-07-25 至 07-27', 'kind':'匿名共同科目體驗；學校標籤未獨立驗證'
}
for p in records:
    n=p['code']
    p['field'] = 'law' if n=='JS6810' else 'business' if n in ['JS6755','JS6767','JS6793'] else 'engineering' if n in ['JS6298','JS6602'] else 'computing'
    p['fieldLabel'] = FIELDS[p['field']]
    p['priority'] = n in ['JS6999','JS6779','JS6793','JS6767']
    p['targetEntry'] = '2027–28'
    p['checkedAt'] = CHECKED
    p['adviceEvidenceType'] = 'advisor_inference_from_curriculum_and_user_preferences'
    if n in ['JS6755','JS6767','JS6793']:
        p['reviews'].append(econ_review.copy())
    if n=='JS6298':
        p['secondAs']=p['secondAs'].replace('可另查正式Computer Science主修，兩者不等同。','2027 CS第二主修不能沿用舊屆規則；另查CS／AI&DS minor亦與本課程不同。')
    if n=='JS6779':
        p['secondWith']=p['secondWith'].replace('但完整 major 可能需超修','但完整 major 可能需超修及先修安排')
    assert all(k in p for k in ['name','englishName','quota','eligibility','secondAs','secondWith','curriculum','careers','postgraduate','salary','reviews','sources','advice','caveats'])

source_map = {}
def add_source(title,url,code=None,kind=None):
    local=url.startswith('data/') and (ROOT/url).is_file()
    if not local and not re.match(r'^https://', url):
        raise ValueError(url)
    sid='S'+hashlib.sha256(url.encode()).hexdigest()[:8].upper()
    if sid not in source_map:
        host='' if local else url.split('/')[2]
        category=kind or ('user_provided_hku_publication' if local else 'student_discussion' if any(x in host for x in ['reddit.com','dcard.tw','lihkg.com']) else 'official' if host.endswith('.hku.hk') or host in ['www.jupas.edu.hk','join.hkust.edu.hk','seng.hkust.edu.hk','cs.hku.hk','ug.hkubs.hku.hk'] else 'supplementary')
        source_map[sid]={'id':sid,'title':title,'url':url,'type':category,'checkedAt':CHECKED,'programmes':[], 'accessNote':'Public page / PDF or indexed excerpt. Exact limitations are retained in programme notes; no authenticated/private content collected.'}
    if code and code not in source_map[sid]['programmes']:
        source_map[sid]['programmes'].append(code)
    return sid

for p in records:
    p['sourceIds']=[add_source(s['title'],s['url'],p['code']) for s in p['sources']]
    for r in p['reviews']:
        r['sourceId']=add_source(r['kind'],r['url'],p['code'], 'student_discussion' if any(x in r['url'] for x in ['reddit.com','dcard.tw']) else 'official_selected_testimonial_or_gap')

guide=(DATA/'guide.md').read_text()
for title,url in re.findall(r'\[([^\]]+)\]\((https://[^\s)]+)\)',guide):
    add_source(title,url)

model_data=json.loads(subprocess.check_output(['node','-e',"const m=require('./model.js');process.stdout.write(JSON.stringify({recipes:m.recipes,scores:Object.fromEntries(Object.keys(m.recipes).map(c=>[c,m.score(c,m.defaults)]))}))"],cwd=ROOT,text=True))
recipes=model_data['recipes']
admissions=read_json(DATA/'admissions-2026.json')
assert hashlib.sha256((ROOT/admissions['source']).read_bytes()).hexdigest()==admissions['sourceSha256'], 'Admissions PDF changed; re-check all rows before rebuilding'
pdf_text=subprocess.check_output(['pdftotext','-layout',str(ROOT/admissions['source']),'-'],text=True)
for code,row in admissions['programmes'].items():
    block=re.search(r'(?ms)^\s*'+code[2:]+r'\s{2,}.*?(?=^\s*\d{4}\s{2,}|\Z)',pdf_text)
    assert block, f'No PDF row for {code}'
    values=re.search(r'(?m)\b(\d+(?:\.\d+)?)\s{2,}(\d+(?:\.\d+)?)\s{2,}(\d+(?:\.\d+)?)\s*$',block.group())
    assert values and tuple(map(float,values.groups()))==(row['uq'],row['median'],row['lq']), f'PDF quartile mismatch for {code}'
formula_sid=add_source(admissions['title'],admissions['source'])
for p in records:
    c=p['code'];baseline=model_data['scores'][c]
    assert recipes[c]['type']==admissions['programmes'][c]['formulaType']
    p['admission2026']={**admissions['programmes'][c],'formula':recipes[c]['formula'],'source':admissions['source'],'sourceSha256':admissions['sourceSha256'],'sourceId':formula_sid,'benchmarkKind':admissions['benchmarkKind'],'currentScoreAchieved':baseline['value'],'scoreBasis':'supplied_predicted_grades_CSD_attained','calculation':baseline['terms'],'differenceFromMedian':round(baseline['value']-admissions['programmes'][c]['median'],2),'targetEntryCaveat':'2026 historical observations; not 2027 cut-offs or individual admission probabilities'}
    p['sourceIds'].append(formula_sid)
    add_source(admissions['title'],admissions['source'],c)

def md_url(url):
    return url[5:] if url.startswith('data/') else url

def ul(items):
    return '\n'.join('- '+str(i) for i in items)

def programme_md(p):
    refs='、'.join(f"[{sid}]({md_url(source_map[sid]['url'])})" for sid in p['sourceIds'])
    reviews='\n\n'.join(f"- **{r['kind']}｜{r['date']}**：{r['summary']} [{r['sourceId']}]({r['url']})" for r in p['reviews'])
    sources='\n'.join(f"- [{sid}]({md_url(source_map[sid]['url'])}) {source_map[sid]['title']}" for sid in p['sourceIds'])
    score=p['admission2026']
    calculation=' + '.join(f"{t['label']} {t['grade']}（{t['points']}×{t['weight']}={t['value']:g}）" for t in score['calculation'])
    return f'''## {p['code']} — {p['name']}

`official_name`: {p['englishName']}  
`target_entry`: {p['targetEntry']}  
`duration_years`: {p['years']}  
`checked_at`: {CHECKED}  
`advice_type`: advisor inference, not admissions probability

### 學額與官方入學資料

{p['quota']}

{p['eligibility']}

本課程官方資料組：{refs}

### 教學內容與學分

{ul(p['curriculum'])}

### 第二主修：作別人的第二主修

{p['secondAs']}

### 第二主修：入讀本課程後再加主修

{p['secondWith']}

### 工作前景（根據課綱推理的方向）

{ul(p['careers'])}

### 薪酬：統計對象、年份與限制

{p['salary']}

### 升學方向與先修準備（非保證取錄）

{ul(p['postgraduate'])}

### 找到的學生經驗、評論與研究缺口

{reviews}

### 2026實際取錄分布、公式與當前預測折算分

| LQ（下四分位） | Median（中位） | UQ（上四分位） | 目前預測折算分 |
| --- | --- | --- | --- |
| {score['lq']} | {score['median']} | {score['uq']} | {score['currentScoreAchieved']:.2f} |

- 中文公式：{score['formula']}
- PDF原文公式：`{score['formulaOriginal']}`
- 你的計分：{calculation} = **{score['currentScoreAchieved']:.2f}**。
- 與2026 Median差額：{score['differenceFromMedian']:+.2f}；公民科按用戶指示假設Attained，不加分。
- 來源：[hku26.pdf 第{score['page']}頁](hku26.pdf#page={score['page']})；特殊權重及腳注另見PDF第1、5頁。
- 這是2026已取錄群體分布，LQ不是最低取錄分；並非2027門檻或個人錄取概率。JS6224只作2026歷史代碼參考。

### 給你的建議（顧問分析）

{p['advice']}

### 限制、假設與待確認

{ul(p['caveats'])}

### 官方與補充來源

{sources}

---
'''

intro='''# HKU 2027 JUPAS Programme Dossier

`schema_version: 2.0`  
`language: zh-Hant`  
`target_entry: 2027–28`  
`checked_at: 2026-10-22 to 2026-10-23, Asia/Taipei`  
`source_seed: ./sum.md`  
`institutions: HKU primary; HKUST supplementary`  
`profile: Chinese4, English5, Math5**, M1 5**, BAFS(Accounting)5*, ICT5*, Economics4; CSD attained (user assumption)`  
`5*+ interpretation: 5* baseline; 5** upside scenario; no invented official grade`  
`preference: undecided; preserve mathematics/programming/business options`

## 來源及使用界線

本檔整理12個保留代碼的官方規章、課程資訊、可公開讀取的學生／申請人／校友討論、就業調查與顧問分析。事實、個人經驗和分析不是同一證據層次。所有來源均保留URL及適用年份；未公開／未查得／待批准者直接標示。不能保證搜盡互聯網所有內容，尤其登入、私人群組、刪文、動態頁面與未被索引內容。

2027完整課綱及公式未全部確認；舊課綱／舊畢業生／舊代碼不自動適用新屆。新錄取制度沒有成熟畢業結果。數值不能推算個人錄取機率，也不能預言2031–32薪酬。

`sum.md`保留原樣作來源種子，內含缺乏原帖的「常見主題」、未註明共享學額、舊薪酬及2026獨立JS6224等問題；本檔優先採用已重新核對的資料。原稿的航空興趣是假設，不作本次個人排序依據。

## 12個代碼速查

| Code | 名稱 | 年期 | 現行學額／狀態 |
| --- | --- | --- | --- |
'''
intro+='\n'.join(f"| {p['code']} | {p['name']} | {p['years']} | {p['quota']} |" for p in records)+'\n\n'
intro+='## 2026分位數與當前預測折算速查\n\n來源：[hku26.pdf](hku26.pdf)。LQ／Median／UQ是2026實際取錄分布；當前分數依你的預測及同一2026公式，公民科假設Attained、不加分。\n\n| Code | LQ | Median | UQ | 當前預測折算 | 計分公式 |\n| --- | --- | --- | --- | --- | --- |\n'
intro+='\n'.join(f"| {p['code']} | {p['admission2026']['lq']} | {p['admission2026']['median']} | {p['admission2026']['uq']} | {p['admission2026']['currentScoreAchieved']:.2f} | {p['admission2026']['formula']} |" for p in records)+'\n\nLQ不是最低取錄分，這些數字不是2027門檻或錄取概率；JS6224只保留歷史參考。逐科計算及PDF頁碼見各課程章節。\n\n'
intro+='## 2027的關鍵修正\n\n'+ul([
    'AppliedAI方向改由JS6999 common admission；JS6224只保留歷史研究，不再當獨立2027志願。',
    'JS6200和6999共用128，JS6755／6767／6781共用226；共享學額不可相加。',
    '2027 CS第二主修不可沿用舊cohort；SDS內部與跨課程亦有禁止組合。',
    'CSD按用戶指示假設Attained。BAFS／ICT的5*+均保守處理為5*；新增hku26.pdf的2026實際LQ／Median／UQ及當前折算分。'
])+'\n\n---\n\n'

chapters={p['code']:programme_md(p) for p in records}
for group in ['cds','business-law','engineering']:
    group_records=[p for p in records if p['field']=='computing'] if group=='cds' else [p for p in records if p['field']=='engineering'] if group=='engineering' else [p for p in records if p['field'] in ['business','law']]
    (DATA/f'research-{group}.md').write_text((f'# HKU 2027 {group} 研究\n\n'+'\n'.join(chapters[p['code']] for p in group_records)).replace('  \n','\n\n'))

extra=(DATA/'engineering-notes.md').read_text()
dossier=intro+'\n'.join(chapters[p['code']] for p in records)+'\n# 個人選科與跨課程指南\n\n'+guide
if extra:
    dossier+='\n\n# 人文AI與創新課程核查補充\n\n'+extra
sources=sorted(source_map.values(),key=lambda s:s['url'])
dossier+='\n\n# 全部來源索引\n\n'+ '\n'.join(f"- `{s['id']}` [{s['title']}]({md_url(s['url'])}) · type={s['type']} · checked={s['checkedAt']} · courses={','.join(s['programmes']) or 'general'}" for s in sources)+'\n'
(DATA/'dossier-2027.md').write_text(dossier.replace('  \n','\n\n'))
write_json(DATA/'programmes.json',{'schemaVersion':2,'targetEntry':'2027–28','checkedAt':CHECKED,'admissionsSource':admissions['source'],'admissionsSourceSha256':admissions['sourceSha256'],'profile':{'chinese':'4','english':'5','math':'5**','m1':'5**','bafs':'5*','ict':'5*','econ':'4','csd':'attained'},'programmes':records})
write_json(DATA/'sources.json',sources)
write_json(DATA/'formulas-2026.json',recipes)
manifest=[]
for path in sorted((DATA/'sources').glob('*.pdf')):
    manifest.append({'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'downloadedAt':'2026-10-22' if path.name.startswith('hku-') else '2026-10-23'})
write_json(DATA/'sources/downloads.json',manifest)

evidence='<h2>研究方法與覆蓋</h2><p>官方資料優先確認制度和數值；Reddit／Dcard及其他公開社群補充個人經驗。學生、申請人、二手評論和官方精選見證均保留類型與限制。可搜尋的公開網頁不是完整互聯網。</p>'
evidence+=f'<p>本版保留 {len(records)} 個指定代碼、{sum(len(p["reviews"]) for p in records)} 條逐課程經驗／討論／缺口記錄、{len(sources)} 個不重複來源URL；記錄會跨課程引用，不代表相同數量的獨立學生。</p>'
evidence+='<p><a href="data/search-log.md">檢索範圍與排除記錄</a> · <a href="data/sources/downloads.json">離線PDF與SHA256</a> · <a href="description.md">維護及驗證說明</a></p>'
for p in records:
    evidence+=f'<details><summary>{p["code"]} · {html.escape(p["name"])}</summary>{md(chapters[p["code"]])}</details>'
evidence+='<h2>來源總索引</h2><ul>'+''.join(f'<li><code>{s["id"]}</code> <a href="{html.escape(s["url"],quote=True)}" target="_blank" rel="noopener noreferrer">{html.escape(s["title"])}</a> <small>({s["type"]})</small></li>' for s in sources)+'</ul>'
payload={'programmes':records,'sources':sources,'admissions':admissions,'guideHtml':md(guide),'evidenceHtml':evidence}
(DATA/'site-data.js').write_text('/* Generated by scripts/build.py. See data/programmes.json and dossier-2027.md. */\nwindow.HKU_DATA = '+json.dumps(payload,ensure_ascii=False).replace('</','<\\/')+';\n')
print(json.dumps({'programmes':len(records),'sources':len(sources),'reviewRecords':sum(len(p['reviews']) for p in records),'dossierCharacters':len(dossier),'downloadedPDFs':len(manifest)},ensure_ascii=False))
