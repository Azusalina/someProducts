# GitHub Pages

The public landing page is https://azusalina.github.io/someProducts/.

| Source folder | Published path |
| --- | --- |
| `d-ba/` | `/someProducts/ba/` |
| `d-gitpop/` | `/someProducts/gitpop/` |
| `d-ict/` | `/someProducts/ict/` |
| `d-jupasanalysis/` | `/someProducts/jupasanalysis/` |
| `d-la/` | `/someProducts/la/` |
| `todos/` (renamed to `d-todos/` after publication) | `/someProducts/todos/` |

`node scripts/build-pages.mjs` runs the existing checks and produces `.pages-dist/` using explicit runtime file lists. Little Algebra includes its reference PDFs and downloadable examples. Development servers, tests, node_modules, and the monitor/mediator tools are not included in the website artifact.

The workflow in `.github/workflows/pages.yml` publishes relevant pushes to `master` and supports manual runs. Repository Settings → Pages uses GitHub Actions. Public paths stay stable when a source folder gains its `d-` prefix. The build accepts the original folder names during the first deployment.

`deployment.json` records the deployed Git commit for verification. Folder prefixes are added only after the first successful publication.

The cutoff site's generated `product1/` files are served directly at `/someProducts/todos/`.
Its R/Python sources and tests stay in the product source folder; Pages serves
the prebuilt HTML, PNG/SVG, and CSV outputs without needing R or Python at runtime.
`tests/check_static.mjs` verifies the chart scripts and assets during the Pages build.
