# GitHub Pages

The public landing page is https://azusalina.github.io/someProducts/.

| Source folder | Published path |
| --- | --- |
| `d-ba/` | `/someProducts/ba/` |
| `d-gitpop/` | `/someProducts/gitpop/` |
| `d-ict/` | `/someProducts/ict/` |
| `d-la/` | `/someProducts/la/` |
| `d-todos/` | `/someProducts/todos/` |
| `d-Visualize-graph/` | `/someProducts/Visualize-graph/` |
| `d-yupi-econ/` | `/someProducts/yupi-econ/` |
| `d-balladeIV-liebe/` | `/someProducts/balladeIV-liebe/` |
| `d-hku/` | `/someProducts/hku/` |
| `d-ict-notes/` | `/someProducts/ict-notes/` |
| `d-count-month/` | `/someProducts/count-month/` |

`node scripts/build-pages.mjs` runs the existing checks and produces `.pages-dist/` using explicit runtime file lists. Little Algebra includes its reference PDFs and downloadable examples. Development servers, tests, node_modules, and the monitor/mediator tools are not included in the website artifact.

The workflow in `.github/workflows/pages.yml` publishes relevant pushes to `master` and supports manual runs. Repository Settings → Pages uses GitHub Actions. Public paths stay stable when a source folder gains its `d-` prefix. The build accepts the original folder names during the first deployment.

`deployment.json` records the deployed Git commit for verification. Folder prefixes are added only after the first successful publication.

The cutoff site's generated `product1/` files are served directly at `/someProducts/todos/`.
Its R/Python sources and tests stay in the product source folder; Pages serves
the prebuilt HTML, PNG/SVG, and CSV outputs without needing R or Python at runtime.
`tests/check_static.mjs` verifies the chart scripts and assets during the Pages build.

Yupi Economics publishes `claude-product/study-site/` at the site root, including
its local fonts, chapter data, and source-page JPEGs. Original references in
`yupi/` are ignored and are not uploaded. The build checks every chapter and
runtime asset before packaging; the public URL remains stable after renaming.

Ballade IV / Liebestraum publishes prebuilt `web/` data, sheet images, piano
samples, and browser modules. Microphone learning uses HTTPS on Pages. Rebuilding
the OMR/vector data remains a local development step; no Python server is required
on the published site. HKU publishes its offline app and referenced research/PDF
data; ICT notes publishes `learn/`. Original names are accepted until initial live
publication is verified, then sources gain their requested `d-` prefixes.
