# someProducts

## What is it?

A GitHub Pages hub for deployed learning websites and visual tools. Published
product folders use the `d-` prefix. Independent desktop/local products live in
`/home/a/Documents/products/`, outside this repository. Architecture, exceptions,
migration history, and validation are in [description.md](description.md).

## How to use

Build all websites with Node.js 22+:

```sh
node scripts/build-pages.mjs
```

Commit website changes here and push `master` to deploy through GitHub Actions:

```sh
git add <website-and-deployment-files>
git commit -m "Describe the website change"
git push
```

Open the [published hub](https://azusalina.github.io/someProducts/) or see
[DEPLOYMENT.md](DEPLOYMENT.md) for individual website URLs. Website runtime assets
are assembled into the ignored `.pages-dist/` folder.

The independent projects below each own their `.git`: open their directory under
`/home/a/Documents/products/` and commit/push there. Hub pushes do not publish them.

1. [filex](https://github.com/Azusalina/filex)
2. [filex-win](https://github.com/Azusalina/filex-win)
3. [filex-linux-gui](https://github.com/Azusalina/filex-linux-gui)
4. [toolkit](https://github.com/Azusalina/toolkit)
5. [integrate-toolkit-arch](https://github.com/Azusalina/integrate-toolkit-arch)
6. [mediator](https://github.com/Azusalina/mediator)
7. [monitor](https://github.com/Azusalina/monitor)
8. [mouse](https://github.com/Azusalina/mouse)
9. [c-autotrade](https://github.com/Azusalina/c-autotrade)

Keep `filex` beside `filex-linux-gui` for compilation and Toolkit beside its Arch
integration. Existing terminals may need `source ~/.bashrc` after the Filex move.

By request, `track`, `Visualize-sheet`, `skill-manager`, `crawlers`, and `roughwork`
remain here for now. Only retained `track` uses the legacy root push hook. On a
fresh clone, `python3 scripts/product-sync.py install` enables that optional
legacy sync; it does not manage the independent repositories above.
