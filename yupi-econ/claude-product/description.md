# yupi econ study site: description

## Contents of this folder

| Path | What it is |
|---|---|
| `README.md` | What the product is and how to use it |
| `description.md` | This file |
| `yupi-structure.md` | The first deliverable: a page-by-page inventory of every PDF in `yupi/` (topics, type, diagrams, annotations, dependencies) |
| `study-site/` | The website |

## Site architecture (`study-site/`)

- `index.html`: learning path (micro, then macro) with overall progress.
- `chapter.html?c=<id>`: one shared template. It loads `js/manifest.js`, then `data/<id>.js`.
- `data/<id>.js`: one file per chapter: learn cards, examples, MCQs, long questions, cheat-sheet tables, source-page links and optional widgets.
- `js/engine.js`: renders every tab, grades answers, saves progress, renders `@@inline@@` and `@@@display@@@` LaTeX with KaTeX, builds the scan lightbox.
- `js/widgets.js`, `w-sd.js`, `w-misc.js`, `w-firm.js`, `w-triangle.js`, `w-asad.js`, `w-tax.js`, `w-deposit.js`, `w-money.js`, `w-trade.js`, `w-fx.js`: interactive diagrams and calculators.
- `css/app.css`: single design system (Geist, one teal accent, one radius scale, light and dark, reduced-motion safe).
- `vendor/`: KaTeX 0.19.0 and Geist fonts, vendored for offline use. Icons are from Phosphor (`js/icons.js`, generated from the official package).
- `assets/pages/`: about 250 JPEGs of the scanned pages (about 42 MB), used only by the "source" badges.

## Chapters and their sources

| Chapters | Source |
|---|---|
| Demand and supply (micro0) | Written for this site; your files contain no such chapter |
| Basic concepts, Elasticity, Market intervention I and II, Efficiency, Production (SR and LR), Production and factors, Ownership and expansion | `雞精notes/Micro/` cheat sheets (Micro 7 used for Basic concepts; Micro 1 is a duplicate of it; the second Micro 4 file is a duplicate) |
| Efficiency (questions) | `Chapter 15/Past Paper/Yupi econ exercise 15-16.pdf` |
| Externalities and equity | `Macro chap 1./Woody externality cheat sheet.pdf` and Micro 6 sections E and F |
| National income accounting | `Macro chap 1./GDP.pdf`, `GDP pp.pdf`, `GDP ans.pdf` and the Macro 1 cheat sheet |
| Macro 2 to 10 | `雞精notes/Macro/` cheat sheets |
| Fiscal policy (questions) | `22052026143757.pdf` (Ch.6 past-question set): all five sections A to E, 115 multiple-choice questions and 24 long questions |

## Method

1. All PDFs are image-only scans, so every page was rendered to PNG and read by eye (rotated pages were auto-orientated with Tesseract OSD and word-count scoring).
2. Content was transcribed into the per-chapter data files. Past-paper MCQs were re-derived from their data and agree with the printed answer keys.
3. Cheat-sheet chapters have no printed questions, so their multiple-choice items were written for the site from the cheat-sheet content, with an explanation under each.
4. Each chapter was checked by an automated interaction test (jsdom): tabs, answering, locking, retry, filters, reveal, saving, theme and language toggles, lightbox, no script errors, no KaTeX errors, no em or en dashes in the visible text. 20 of 20 chapters pass. The design was also checked visually in headless Chromium at desktop and 390 px widths.

## Decisions taken with you

- Item B4 of Macro 1 (HKCEE 2001-II Q.29) and Example Task 1 were left out.
- Small-print numbers that do not affect any calculation were accepted as transcribed.
- Your handwritten answers on the scans are not used for marking; the printed key and independent working are.
- English first; Chinese appears only as optional hints on card titles.

## Assumptions and limitations

- Diagram widgets use simple linear models with arbitrary units to teach the logic; they are not data from your notes.
- The Ch.6 past paper is fully included except question E10 (the printed key marks it "Del.") and a few long questions whose model answer is a drawn AD-AS diagram or a data chart. Where a multiple-choice question depends on a diagram, a text description is given and the page badge opens the original; you should look at the diagram for those (for example D13, D30, D35, D42, D43, D47).
- The Ch.15-16 paper is missing printed page 5 in the scan (heading of section D and its first three questions), so section D starts at question 4.
- Some past questions mention taxes that no longer exist in Hong Kong (estate duty, hotel tax); the printed key is followed and the question is flagged.
- Blank tables in cheat sheets (Micro 6, Micro 8, Micro 4) were filled in by reasoning from the diagrams; each is flagged under "Notes on the source material" in that chapter's Review tab and should be checked against your teacher's version.
- About 60 photo notes (`Macro chapter 3/4/5`, `Chapter 15/Notes`, loose JPGs) have not been read.
- The cheat sheets are commercial material (Woody Leung / Defining Education); their original source attributions are retained. The site was first prepared for local personal study and was later published at the workspace owner's request.

## Development and maintenance

- Add a chapter: write `data/<id>.js` calling `Yupi.register({...})` (copy `data/macro3.js` as a template), add `{id, group, title, zh, sum, ready:true}` to `js/manifest.js`, put any widget in `js/w-<name>.js` and add its `<script>` to `chapter.html`.
- JS strings containing a backslash (LaTeX) must be written as `String.raw` templates (`T` followed by a backtick string).
- After any change, open `chapter.html?c=<id>#selftest`: the page title reports a structural self-check (question count, answer letters, KaTeX errors, dashes).
- Re-render scans: `pdftoppm -jpeg -scale-to 1500 <pdf> assets/pages/<prefix>`; cheat sheets are stored upright at 2200 px wide.

## History

- 2026-10-18: Integrated into the workspace's GitHub Pages deployment at
  `/someProducts/yupi-econ/`, including the runtime source-page JPEGs. The raw
  `yupi/` PDF/photo reference folder remains local. Original local-only guidance
  was: "The cheat sheets are commercial material (Woody Leung / Defining
  Education); the site is for personal study and should not be published."
- Deployment validation covers all 20 chapters, 471 multiple-choice questions,
  runtime assets, and chapter scan references. Corrected Macro 10's source-image
  indices after visually verifying that printed pages 6 and 7 share scan 4;
  long-question answer badges now support both source/page/label triples and
  the older page/label pairs.

- Inventory of all PDFs (`yupi-structure.md`).
- First Macro 1 sample page, accepted with the decisions above.
- Rebuilt as a shared engine with LaTeX, the taste-skill design system and an index page; then all 20 chapters, micro first.
