# yupi econ study site

## What is it?

An offline, interactive study website for HKDSE Economics, built from your own scanned notes, cheat sheets and past papers in `yupi/`. It covers 20 chapters, micro first and then macro. Each chapter has learning cards, worked examples, multiple-choice practice with instant feedback, long questions with model answers, a cheat-sheet summary and a wrong-answer review. Formulas are shown in LaTeX, key diagrams are interactive, and every point links back to the scan page it came from.

More detail (architecture, sources, validation, limitations) is in [description.md](description.md).

## How to use

**Prerequisites:** a modern browser (Chrome, Firefox, Safari or Edge). No internet, server or install is needed.

**Open it:** visit [Yupi Economics](https://azusalina.github.io/someProducts/yupi-econ/) or double-click `study-site/index.html`. Pick a chapter from the learning path (micro 01 to 10, macro 11 to 20). Chapter pages are opened as `study-site/chapter.html?c=<id>`; for example `?c=macro1`.

**Inside a chapter:**
- **Learn:** open the cards, tick "Mark as read", and play with the diagram or calculator.
- **Examples:** try the question first, then press "Show working".
- **Practice:** click an option for instant feedback; wrong answers are collected in **Review**.
- **Long questions:** write your answer, reveal the model answer, then grade yourself.
- Tap a blue badge to open the original scan page. The translate button shows Chinese hints; the moon button switches light and dark.

**Configuration:** none. Progress is saved in your browser (localStorage) per chapter. "Reset all progress" on the home page clears it.

**Moving or removing it:** copy or delete the `claude-product` folder; nothing is installed elsewhere. Keep `study-site/assets/pages/` next to the HTML if you want the scan badges to work.
