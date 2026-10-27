# 公開資料檢索範圍與缺口

- 研究日期：2026-10-22 至 2026-10-23，Asia/Taipei。
- 目標：2027–28 HKU，12個保留JS代碼；HKUST只補充相近方向。
- 起點：原始 `sum.md`；原文保留，沒有把沒有原帖的「常見主題」當已存在的學生意見。
- 交叉查詢：課名中英文、JS code、課程縮寫（BStat／Delta+等）、student review／curriculum／syllabus／second major／salary／在讀／評價，加Reddit、LIHKG、Dcard等站點限制。
- 官方範圍：JUPAS、HKU Admissions、Business School、CDS／CSAI／SAAS、Arts、Engineering／DASE／EEE、Law／PPA／PLE、I-School、Academic Advising、CEDARS、Graduate School；HKUST Admissions／Engineering官方文件。
- 補充範圍：Reddit在讀／校友／申請人討論、Dcard共同科目及大學文化串、官方選錄具名學生見證、HK01新課程報道、HKBU參與的僱主薪酬報告、招聘機構職位薪酬指南。

## 留下的證據類型

1. 官方課程／課綱：用於學額、指定科目、學分、分流及第二主修限制；若標subject to approval保留此條件。
2. 官方學生分享：保留姓名或頁面已有身份，但注明校方精選和宣傳偏差。
3. 匿名在讀自述：保留年份、cohort及只可證明個人經驗的限制；不聲稱已驗身份。
4. 申請人疑問／面試：只有選科或申請流程價值，明確不算教學評價。
5. 二手評論：不能當本人課堂體驗。
6. 找不到：逐課程記錄研究缺口，不填造「普遍認為」。

## 本輪額外中文檢索

查詢例：`site:lihkg.com 港大 stat rm 課程`、`site:lihkg.com 港大 fintech 評價`、`site:dcard.tw 港大 business analytics 評價`、`site:dcard.tw 港大 econ finance 在讀`。

這批結果含大量中大、城大、英國碩士及舊科大討論，不把它們冒充HKU本科學生評價。保留相關的Dcard ECON1210共同科目串與2022大學文化串（後者只作過時的校園文化個人經驗）。沒有找到足以支持特定新課程教學結論的LIHKG第一手材料。

## 排除及存取限制

- 不把單純等offer／問收分當課程滿意度，不把其他大學或碩士當目標本科。
- 小紅書、Instagram、RichKU、私人群組及部分Dcard／LIHKG內容受登入、索引或動態載入限制；本次沒有登入私人帳號、下載私人內容、聯絡學生，亦沒有聲稱搜盡全部帖子。
- Law討論 `https://www.reddit.com/r/HKUniversity/comments/1r47sid/` 先前研究曾找到線索，但續作時公開頁讀取cache miss，未把無法重核的細節加進最終課程評價。
- EEE大PDF的部分薪酬只曾核讀官方索引摘要；工程補充明示限制，不提升成已完整核讀證據。
- PDF已下載的原始檔及hash見 `sources/downloads.json`。其他URL為引用，沒有假稱全部來源均已離線存檔。

## 可重核的優先次序

1. HKU 2027完整計分與Expected Score；當屆最終課綱、共用學額。
2. CS第二主修cohort限制、BStat與外系major／minor的禁止組合。
3. Delta+上海1.5年、Co-op分配／待遇／保險、MSc條件及學費。
4. 向同一入學cohort學生詢問具體課程、排課、時間及實習經驗，保留不同看法。
5. 用最新就業報告核對逐課程樣本／中位數；不要把最高薪或招聘市場中段薪金視為自己的expected salary。

## 2026實際取錄分布更新

用戶新增本地 `hku26.pdf`（2026 JUPAS Admissions Scores）；已核對第1、2、4、5頁的保留課程，及第1／5頁換算與權重腳注。PDF原欄序UQ／Median／LQ，JSON用具名欄位、UI顯示LQ／Median／UQ，保留頁碼與SHA256。公民科按用戶指示假設Attained。當前清單12項，原始來源種子與完整PDF仍屬歷史資料。
