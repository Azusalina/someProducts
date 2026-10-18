# Yupi Economics — deployment

The study website lives in `claude-product/study-site/`; GitHub Pages publishes
its contents at `/someProducts/yupi-econ/`. The runtime includes local JavaScript,
chapter data, CSS, vendored fonts/KaTeX, and source-page JPEGs. Original PDF/photo
references in `yupi/` stay local and are ignored by this folder's `.gitignore`.

The existing product documentation is preserved in
[claude-product/description.md](claude-product/description.md), and its source
inventory is in [claude-product/yupi-structure.md](claude-product/yupi-structure.md).

`scripts/build-pages.mjs` accepts the original folder name and `d-yupi-econ`.
It flattens only the runtime website into the published directory, keeping the
public URL stable after renaming. The Pages workflow watches both source names.
`scripts/check-yupi-econ.mjs` verifies chapter registration, question answers,
source scans, and static asset references without additional dependencies.

## Validation and history

2026-10-18: Integrated with the existing hub deployment. Initial deployment
`e5c0896a28c8fdac9e31c4182351bd7bf9dec43b` succeeded in
[Actions run 39139411614](https://github.com/Azusalina/someProducts/actions/runs/39139411614).
The public deployment metadata and browser checks confirmed the live website
before the complete local folder was renamed to `d-yupi-econ`.

The source checks passed for all 20 chapters, 471 multiple-choice questions,
216 chapter source-scan references, JavaScript syntax, and required runtime
assets. Browser checks passed locally and on the live site for all 20 chapter
self-tests, chapter navigation, long-answer source images, saved progress,
and a 390px viewport without horizontal overflow or failed resources.

The directory rename preserves the exact runtime files and the public path
`/someProducts/yupi-econ/`. The ignored `yupi/` reference directory moved with
the product and remains excluded from both Git and the website artifact.
