# HKU 2027 選科工作台

## 範圍及個人設定

2026-10-22開始研究，2026-10-23續作。目標2027–28入學，HKU優先、HKUST第二；保留數學／編程／商科彈性，沒有假定已選定職業。目前保留6298、6755、6767、6793、6810、6200、6224、6248、6729、6779、6999、6602，共12個代碼；按用戶指示縮減清單。

預測按箭頭後：中文4、英文5、核心數學5**、M1 5**、BAFS會計5*、ICT5*、經濟4。5*+不是正式等級，基準以5*計，HTML可調到5**。公民科按用戶指示假設Attained，預設達標；假設本地JUPAS、單次應考，未處理重考、替代中文、非本地或特殊招生。

原始 `data/sum.md` 保留。該稿的航空興趣假設、未附原帖的「常見主題」、商學院薪酬代理、共享學額和2026代碼等，沒有直接提升為已查證事實。

## 研究方法與資料層次

- 官方JUPAS及院校頁確認課程、入學資格、學額；官方課綱確認學分和組合限制。年份、subject to approval、共享名額都保留。
- 公開Reddit／Dcard等記錄個人經驗；在讀自述、二手傳聞、申請人、官方精選見證及研究缺口分開標示。匿名身份未獨立驗證，沒有代表性保證。
- 目前70個不重複外部URL及1份用戶提供的本地招生PDF，24條逐課程經驗／討論／缺口記錄，包含跨課程引用同一帖子；不代表24個獨立學生。
- 全校、逐課程、前身major、跨院校僱主和市場職位薪酬分開。數值不是2031–32起薪預測，不以最高薪代表預期。
- 公開搜尋無法證明涵蓋整個互聯網。登入、私人群組、刪文及動態頁面有缺口，詳見 [search-log.md](data/search-log.md)。
- 原始PDF下載2份，另有用戶提供的data/hku26.pdf（2026實際取錄分布）；來源索引其他URL不代表已離線存檔。PDF與SHA256見 [downloads.json](data/sources/downloads.json)。

## 會影響選科的核查結論

1. 2027 AppliedAI併入JS6999；JS6224只留歷史研究。JS6999新方案仍有University approval條件。
2. JS6200／6999共用128，JS6755／6767／6781共用226；不可相加或寫成各課程獨立學額。
3. 目前清單12項；舊localStorage或JSON匯入的已刪除課程會從志願／比較移除，其餘筆記保留。
4. 2027 CS第二主修不能沿用舊cohort；BStat DA／RM／ST及CS／AI minor等有禁止組合，需讀逐屆規例。
5. 最新分數依data/hku26.pdf的2026實際LQ／Median／UQ與公式；不再用Expected Score當主要參考。LQ非最低取錄分，也非2027分數線，網頁不輸出錄取概率。

每項官方來源均在課程詳情、dossier和sources.json，不把這份維護說明當官方招生文件。

## 介面與本地資料

以低裝飾、可讀的淺色編輯式列表呈現；暖白／灰綠單一主題，響應式布局。核心任務包括搜尋／篩選、課程詳情modal、最多四項比較、成績情境、科目資格提示、志願排序、逐課程筆記、整體筆記、JSON匯出／匯入及完整Markdown資料下載。

不使用外部字體、CDN、分析追蹤或執行期API。打開頁面時不會自動向來源網址發送請求；用戶點來源連結才會離開本地頁。筆記在localStorage，key為 `hku2027-workbench-v1`。HTTP origin和file://的儲存可能不同；瀏覽器限制儲存時顯示匯出提醒。

匯入接受version1及version2，輸出version2；v1草稿遷移時公民科設為Attained，既有有效筆記保留。v2仍可保存用戶另外選擇的公民科情境。清理未知代碼、重複項、無效等級、過量比較及歷史JS6224志願；筆記以文字轉義顯示。匯入會取代草稿，沒有雲端備份。匯出資料是個人草稿，不會提交JUPAS。

## 檔案與維護

| 檔案 | 用途 |
| --- | --- |
| index.html / style.css / app.js | Buildless介面、樣式與交互 |
| model.js | 分數情境、已列科目資格、匯入清理；供瀏覽器與Node共用 |
| data/sum.md | 原始參考，保留不改 |
| data/research-cds.json | 六個CDS代碼研究來源資料 |
| data/research-engineering.json / .md | 兩個人文AI／創新代碼 |
| data/research-business-law.json | 四個商科／法律代碼來源資料 |
| data/engineering-notes.md | 保留課程的額外課綱核查細節 |
| data/admissions-2026.json / hku26.pdf / hku26.md | 實際取錄分布、原PDF與版面文字提取，含頁碼及hash |
| data/guide.md | 個人指南、薪酬解讀、升學與HKUST對照 |
| data/search-log.md | 檢索範圍、排除及證據缺口 |
| scripts/business-data.py | 保留商科／法律研究轉錄；需更新該群資料時才重跑 |
| scripts/build.py | 整合研究、生成Markdown／JSON／離線JS bundle |
| data/dossier-2027.md | 單檔完整原始Markdown，供LLM和人工閱讀 |
| data/programmes.json / sources.json | 課程與穩定hash來源ID索引 |
| data/site-data.js | 預生成瀏覽器bundle，無需fetch，可file://開啟 |
| data/formulas-2026.json | 由model.js匯出的2026計分公式 |
| data/sources/ | 2份官方原PDF、下載hash清單 |
| tests/model.test.cjs / browser.mjs | 關鍵模型、資料完整性及瀏覽器工作流程測試 |

開啟網站不用build或安裝依賴。維護需Python3、Python-Markdown及Node；本機已有相依套件。修改研究來源JSON／guide後執行：

```bash
python3 scripts/build.py
node tests/model.test.cjs
node --check app.js
node --check model.js
node --check data/site-data.js
```

`scripts/build.py`生成三組研究MD，額外人文AI／創新細節存於engineering-notes.md。建置會檢查hku26.pdf的SHA256，再用pdftotext逐課程核對原表UQ／Median／LQ的數字，拒絕欄序或文件不符。請修改來源JSON或guide，再build；不要只改site-data.js等生成物。未修改商科來源時不必跑business-data.py，以免覆蓋對該JSON的手動修訂。數據更新後要同步確認model.js的資格與分數年份。

瀏覽器檢查需Playwright與Chromium。可在本資料夾啟動loopback伺服器，用已安裝的Playwright模組執行：

```bash
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser.mjs
```

可選 `HKU_BASE_URL`、`CHROMIUM_PATH`、`HKU_TEST_OUTPUT`。測試預設127.0.0.1:8787，截圖及匯出測試檔寫至/tmp/hku-browser。這些是維護環境設定，不是網站執行要求。

## 驗證

2026-10-23本次更新：6項Node模型／資料測試通過，覆蓋12個代碼分數、PDF分位數與hash、逐科計算不重複、英文／M1／ICT門檻、公民科假設與情境、歷史／刪除代碼、bonus、v1／v2匯入清理及來源完整性。2026基準最佳五科36.5、最佳六科40.5、商科44.30、SDS40.75、精算41.00。

本次更新Chromium驗證通過：12個課程詳情與PDF頁碼／分位數／公式／當前折算分、v1草稿移除刪除代碼及預設Attained、關鍵字／代碼與方向篩選、資格與英文門檻變化、四項比較上限、歷史代碼不能加入2027志願、排序、持久保存、筆記轉義、JSON匯出／匯入及損壞JSON復原，並檢查320／390／768px的五個視圖與modal。直接file://離線開啟亦通過。測試記錄零pageerror、零失敗HTTP回應、零執行期外部請求；來源連結未逐一做全網存活檢查。

截圖在/tmp/hku-browser（開發QA暫存，非產品依賴）。原始官方PDF已用Poppler渲染檢視相關公式／表格欄位和腳注。內置iab預覽不可用，另用本機Chromium做開發測試；未做所有瀏覽器及所有輔助技術的全面認證。

## 後續重核

2027最終招生表、課綱、第二主修名單與跨地域／升學費用應持續重核；資料更新需要人工研究，網站沒有自動追蹤來源變動。實際放榜後再用正式成績、當屆規則及真實意願排JUPAS。沒有提交、commit、push或公開部署。

## 2026實際取錄分數的資料契約

數據來源是用戶提供的data/hku26.pdf（檔案metadata建立於2026-10-14），不從檔名推定年份，已目視核讀表題、保留課程及權重頁。原表欄序UQ／Median／LQ，JSON欄位具名、UI按LQ／Median／UQ展示；保留第1／2／4／5頁定位。2026的JS6224分布只作歷史參考。

每個programmes.json記錄的admission2026包含lq、median、uq、formulaOriginal、formula、currentScoreAchieved、calculation、differenceFromMedian、source、sourceSha256、page及2027解讀限制。靜態MD／JSON的分數是本次預測基準；網頁根據用戶修改的等級動態重算，PDF分位數維持不變。公民科只作資格假設，不加入加權分數。
