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

2026-10-18: Integrated with the existing hub deployment. The source folder gains
the `d-` prefix after the initial live deployment has been verified.
