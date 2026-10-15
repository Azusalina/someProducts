# someProducts

## What is it?

A local product workspace with one Git repository for everyday work. Each
registered desktop/local product folder is also published to its own public
GitHub repository, with its product history preserved. Website products remain
managed by this hub. GitHub Pages continues to deploy from this
hub. See [description.md](description.md) for architecture and maintenance details.

## How to use

Use Git and Python 3.10+ on Linux. Open each product's existing README for its
own prerequisites and instructions.

Work and commit in this workspace as usual:

```sh
cd /home/a/Documents/someProducts
git add <changed-files>
git commit -m "Describe the change"
git push
```

`git commit` records changes locally. `git push` publishes the committed changes
to the hub and automatically synchronizes the five registered product repositories:
`fileX`, `mediator`, `monitor`, `toolkit`, and `track`.

The pre-push hook synchronizes changed products to their registered
repositories before pushing `master` to `origin`. The root `.git` owns all
objects, commits, and synchronization state; product folders have no nested
`.git` directories. Only committed changes are published.

Automatic synchronization is enabled in this workspace. Hooks are local Git
settings and are not installed by `git clone`: install the hook once in each new
Linux clone. Installation checks that all registered destinations are accessible:

```sh
python3 scripts/product-sync.py install
```

Configure product folders, historical names, and remote destinations in
[products.json](products.json). A new product needs an empty GitHub repository
and a registry entry before its first push. `crawlers/` and `yupi-econ/` remain
ignored and are outside this registry.

```sh
python3 scripts/product-sync.py plan          # Inspect product commits locally
python3 scripts/product-sync.py sync --dry-run # Check remotes without publishing
python3 scripts/product-sync.py sync          # Retry product synchronization
python3 scripts/product-sync.py uninstall     # Remove only the managed push hook
```

If synchronization fails, resolve the reported issue and retry `git push`.
`git push --dry-run` never publishes product repositories. Existing website
URLs and deployment commands remain in [DEPLOYMENT.md](DEPLOYMENT.md).
