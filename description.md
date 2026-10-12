# someProducts workspace management

## Repository layout

`someProducts` remains the source workspace and GitHub Pages deployment hub.
Every product stays in its existing folder and is committed through the root
Git repository. A product's independent repository contains the contents of that
folder at its repository root. No submodules, nested repositories, or additional
working copies are introduced.

The registry contains only these desktop/local product repositories under
`Azusalina`. The six deployed `d-*` website products stay managed by the hub
and are excluded from independent publication:

| Folder / repository | Historical folder names |
| --- | --- |
| fileX | — |
| mediator | — |
| monitor | — |
| monitor-cli | — |
| toolkit | — |
| track | — |

Workspace infrastructure such as `pages`, `scripts`, `.github`, `AGENTS.md`,
and the root documentation remains in the hub. Ignored folders `crawlers` and
`yupi-econ`, generated `.pages-dist`, and tool metadata are excluded.

## Setup status

As of 2026-10-12 19:57 Asia/Taipei, `fileX`, `mediator`, `monitor`, and
`monitor-cli` exist as public GitHub repositories, with their product histories
published to `master`. The latest committed fileX update is included.

`toolkit` and `track` are registered and their histories have been prepared in
the root object database, but their GitHub repositories could not be created:
GitHub returned a secondary content-creation rate limit, including after
progressively longer retry intervals. No reset time was supplied for that
secondary limit. Stop retrying immediately until the limit has subsided.

The automatic pre-push hook is deliberately **not installed yet**, so the two
missing destinations do not block existing hub pushes. Normal hub Git operations
remain available. After GitHub permits repository creation, finish setup with:

```sh
gh repo create Azusalina/toolkit --public
gh repo create Azusalina/track --public
python3 scripts/product-sync.py sync
python3 scripts/product-sync.py install
git push
```

The six accidentally created website repositories (`d-ba`, `d-gitpop`, `d-ict`,
`d-jupasanalysis`, `d-la`, and `d-todos`) were deleted after the user confirmed
their removal. They are excluded from the publication registry and local export
refs. Their original source folders, parent history, and deployment remain intact.

## History projection

`scripts/product-sync.py` traverses the selected hub revision's ancestry in
topological order and projects each commit's product tree to a standalone root
tree. `historyPaths` includes both current and previous names so the first
commits before a folder rename are retained. A pure folder rename does not
create a redundant standalone product commit.

Changes to other products or hub infrastructure disappear from a product's
history. Product creation, deletion, recreation, and independent merge parents
are retained. Redundant merge parents are removed. Authors, committers, their
timestamps, original commit messages, and declared message encoding are
preserved; a mixed-product commit retains its original message in each affected
product history. Commit hashes change because root trees and parents change.
Cryptographic commit signatures and hub tags are not copied to the projected
history. Product file contents, modes, and symlinks remain identical to their
hub subtree.

If multiple historical aliases coexist in a single revision, projection stops
with an error instead of choosing one silently. Adjust the registry to represent
the intended history before retrying.

All generated objects live in the existing root Git object database. Protected
refs `refs/products/<folder>/<branch>` retain their tips. Cache files and the
process lock live in `.git/product-sync/`; deleting caches causes a deterministic
rebuild. This does not change the hub's index, working tree, or commit ancestry.
Do not use a mirror push from the hub: it would include internal product refs.

## Push coordination

The locally installed `.git/hooks/pre-push` runs the tracked script when pushing
the configured `hubBranch` (`master`) to `hubRemote` (`origin`). It projects the
actual revision being pushed, even if local `HEAD` is newer. Other branch pushes
and unrelated remotes do not publish the managed product branch.

For every product, the coordinator reads the destination branch. Identical tips
are skipped. Any destination with changes that are not ancestors of the proposed
product commit blocks the entire operation during preflight. Once all targets
pass, changed products are pushed normally, then the original hub push proceeds.
The coordinator never force-pushes product repositories. Internal product pushes
disable their own hook invocation to prevent recursive synchronization.

A failure exits the hook with a nonzero status and prevents that invocation's
hub push. Git cannot atomically publish several repositories: a network error
or server rejection during publishing can leave earlier products updated.
Retrying skips completed products and finishes the rest. If the hub subsequently
rejects its push, products may already be updated; reconcile the hub branch and
retry. An up-to-date hub push also repairs outstanding product synchronization.

Git does not pass its dry-run flag to pre-push hooks. On this Linux workspace,
the coordinator reads the invoking Git process's arguments through `/proc`,
recognizes `--dry-run`, `-n`, and combined short flags, and avoids product pushes.
If it cannot inspect the invoking process, it stops instead of guessing. This
automatic hook implementation requires Linux with accessible `/proc`.

`git push --no-verify` bypasses the hook, as with any Git hook. It is an explicit
escape hatch and does not synchronize products. A later normal push or explicit
`sync` command repairs this. Hook installation is local to a clone and must be
repeated after cloning. It refuses to replace an existing unmanaged pre-push
hook or an existing `core.hooksPath` setting. Uninstallation removes only a hook
with this tool's ownership marker; it does not delete repositories or exports.

## Configuration and maintenance

`products.json` is the tracked source of folder mappings. `owner` supplies the
default GitHub owner; repository names default to `folder`, and the destination
branch defaults to `hubBranch`. An entry can override `url`, `branch`, or
`historyPaths`. Folder aliases must be single path components.

For a new product, create an empty repository without GitHub-generated README,
license, or `.gitignore`, then add its registry entry and commit its source in
the hub. For example:

```sh
gh repo create Azusalina/new-product --public
git add products.json new-product
git commit -m "Add new-product"
python3 scripts/product-sync.py plan --product new-product
git push
```

`plan` projects committed `HEAD` by default, so run it after committing a new
product. `--revision <commit>` selects a different committed revision.
`sync --product <folder>` allows a targeted retry; repeat `--product` to select
several. Explicit `sync` publishes product repositories only, leaving the hub
push to `git push`. Remote authentication uses normal Git credentials. Creating
repositories additionally requires GitHub CLI authentication.

Product repositories are publication destinations for hub development. If edits
are made directly in one, synchronization stops on divergence. Fetch and review
those edits and integrate them into the hub product before resuming; do not
force-push away remote work. A product-only clone does not install this hub's
synchronization hook.

## Deployment preservation

The existing `.github/workflows/pages.yml`, `scripts/build-pages.mjs`,
`pages/index.html`, and `DEPLOYMENT.md` are unchanged. The hub keeps full product
source trees, so Actions continues building the same six websites from the same
paths. Product repositories do not receive a new deployment workflow. Existing
`/someProducts/<site>/` URLs stay in use. See [DEPLOYMENT.md](DEPLOYMENT.md) for
the existing source-to-URL mapping.

## Validation

Run the isolated local integration suite without network access:

```sh
python3 -B -m unittest discover -s scripts/tests -v
```

The suite exercises initial publication, rename history and identity preservation,
product isolation, incremental and hub-only pushes, actual pushed revisions,
other-branch behavior (including an already-current branch with unpublished
master changes), dry-runs, divergent remotes, partial rejection and retry,
an already-current hub, cache reconstruction, deletion/recreation, merge parents,
and preservation of existing hook settings. Fixtures create separate temporary
bare hub and product repositories; they do not change live product branches.
All 11 integration tests passed on 2026-10-12.

Initial projection of the 2026-10-12 hub revision retained
3 commits for `fileX` and `mediator`; 7 for `monitor`; 1 for `monitor-cli`; 4 for `toolkit`;
and 5 for `track`. Root trees are checked against the corresponding hub subtrees
before any publication. This reflects the committed source at migration time,
including files already tracked in that source.

## Sources

- [Git hook interface and pre-push exit behavior](https://git-scm.com/docs/githooks)
- [Git commit-tree plumbing](https://git-scm.com/docs/git-commit-tree)
- [Git revision traversal](https://git-scm.com/docs/git-rev-list)
- [GitHub secondary rate limits and retry behavior](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#exceeding-the-rate-limit)

## History

2026-10-12: Added independent public desktop/local product repositories while retaining one
local Git workspace, the existing total-repository source history, and the
existing GitHub Pages deployment arrangement. The chosen migration preserves
each product's relevant history. The publication registry is scoped to `mediator`,
`fileX`, `monitor`, `monitor-cli`, `toolkit`, and `track`; deployed website products
remain managed by the parent repository.
