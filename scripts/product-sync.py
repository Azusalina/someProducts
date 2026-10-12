#!/usr/bin/env python3
"""Publish folder histories from the hub's object database; no nested checkouts."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

MARKER = "# someProducts-product-sync v1"


def git(root, *args, data=None, env=None, check=True):
    result = subprocess.run(["git", "-C", str(root), *args], input=data,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    if check and result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace").strip())
    return result


def value(root, *args):
    return git(root, *args).stdout.decode().strip()


def atomic_json(path, content):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(content, indent=2) + "\n")
    temporary.replace(path)


def load_config(root):
    config = json.loads((root / "products.json").read_text())
    if config.get("version") != 1:
        raise RuntimeError("Unsupported products.json version")
    folders = set()
    for product in config["products"]:
        folder = product["folder"]
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", folder) or folder in folders:
            raise RuntimeError(f"Invalid or duplicate product folder: {folder}")
        folders.add(folder)
        product.setdefault("historyPaths", [folder])
        for path in product["historyPaths"]:
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", path):
                raise RuntimeError(f"Invalid historical folder: {path}")
        product.setdefault("url", f"https://github.com/{config['owner']}/{folder}.git")
        product.setdefault("branch", config["hubBranch"])
        git(root, "check-ref-format", f"refs/heads/{product['branch']}")
    return config


class Splitter:
    def __init__(self, root, state):
        self.root = root
        self.state = state
        self.empty = git(root, "hash-object", "-w", "-t", "tree", "--stdin",
                         data=b"").stdout.decode().strip()
        self.trees = {}

    def tree(self, commit, paths):
        if commit not in self.trees:
            entries = git(self.root, "ls-tree", "-z", commit).stdout.split(b"\0")
            self.trees[commit] = {}
            for entry in filter(None, entries):
                info, name = entry.split(b"\t", 1)
                mode, kind, oid = info.split()
                if kind == b"tree":
                    self.trees[commit][name.decode()] = oid.decode()
        found = [self.trees[commit][path] for path in paths if path in self.trees[commit]]
        if len(found) > 1:
            raise RuntimeError(f"Historical folder aliases coexist at {commit}: {paths}")
        return found[0] if found else self.empty

    def ancestor(self, old, new):
        return git(self.root, "merge-base", "--is-ancestor", old, new,
                   check=False).returncode == 0

    def split(self, product, target):
        paths = product["historyPaths"]
        key = hashlib.sha256(json.dumps(paths).encode()).hexdigest()[:16]
        cache_path = self.state / f"{product['folder']}-{key}.json"
        cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
        # Reconstruct deterministically after an object cleanup or interrupted run.
        cache = {hub: split for hub, split in cache.items()
                 if split is None or git(self.root, "cat-file", "-e", split,
                                          check=False).returncode == 0}
        commits = value(self.root, "rev-list", "--reverse", "--topo-order", target).splitlines()
        for commit in commits:
            if commit in cache:
                continue
            raw = git(self.root, "cat-file", "commit", commit).stdout
            header, message = raw.split(b"\n\n", 1)
            fields = {}
            original_parents = []
            for line in header.splitlines():
                if line.startswith(b"parent "):
                    original_parents.append(line[7:].decode())
                elif line.startswith((b"author ", b"committer ", b"encoding ")):
                    name, content = line.split(b" ", 1)
                    fields[name] = content
            parents = list(dict.fromkeys(cache[parent] for parent in original_parents
                                         if cache[parent] is not None))
            # Keep only independent product parents; unrelated hub merges disappear.
            parents = [p for p in parents if not any(p != q and self.ancestor(p, q)
                                                    for q in parents)]
            tree = self.tree(commit, paths)
            if not parents and tree == self.empty:
                cache[commit] = None
                continue
            if len(parents) == 1 and value(self.root, "rev-parse", f"{parents[0]}^{{tree}}") == tree:
                cache[commit] = parents[0]
                continue
            environment = os.environ.copy()
            for field, prefix in [(b"author", "GIT_AUTHOR"), (b"committer", "GIT_COMMITTER")]:
                match = re.fullmatch(rb"(.*) <(.*)> (\d+ [+-]\d{4})", fields[field])
                if not match:
                    raise RuntimeError(f"Cannot preserve commit identity at {commit}")
                environment[prefix + "_NAME"] = match[1].decode(errors="surrogateescape")
                environment[prefix + "_EMAIL"] = match[2].decode(errors="surrogateescape")
                environment[prefix + "_DATE"] = "@" + match[3].decode()
            args = ["-c", "commit.gpgSign=false", "-c",
                    "i18n.commitEncoding=" + fields.get(b"encoding", b"UTF-8").decode(),
                    "commit-tree", tree]
            for parent in parents:
                args.extend(["-p", parent])
            cache[commit] = git(self.root, *args, data=message, env=environment).stdout.decode().strip()
        result = cache[target]
        if result is None:
            raise RuntimeError(f"No product history for {product['folder']} at {target}")
        # A ref protects exported objects from garbage collection, even before pushing.
        git(self.root, "update-ref", f"refs/products/{product['folder']}/{product['branch']}", result)
        atomic_json(cache_path, cache)
        return result


def plan(root, config, state, target, selected=None):
    splitter = Splitter(root, state)
    result = []
    for product in config["products"]:
        if selected and product["folder"] not in selected:
            continue
        tip = splitter.split(product, target)
        tree = value(root, "rev-parse", f"{tip}^{{tree}}")
        expected = splitter.tree(target, product["historyPaths"])
        if tree != expected:
            raise RuntimeError(f"Tree mismatch: {product['folder']}")
        result.append({**product, "commit": tip, "tree": tree,
                       "commits": int(value(root, "rev-list", "--count", tip))})
    if selected and selected != {p["folder"] for p in result}:
        raise RuntimeError("Unknown product selection")
    return result


def synchronize(root, exports, dry_run=False):
    pending = []
    # Preflight every destination before publishing anything. Never force-push.
    for product in exports:
        branch = f"refs/heads/{product['branch']}"
        remote = value(root, "ls-remote", "--heads", product["url"], branch)
        old = remote.split()[0] if remote else None
        if old == product["commit"]:
            print(f"Unchanged: {product['folder']}", flush=True)
            continue
        if old:
            if git(root, "cat-file", "-e", old, check=False).returncode:
                git(root, "fetch", "--no-tags", product["url"], branch)
            if git(root, "merge-base", "--is-ancestor", old, product["commit"],
                   check=False).returncode:
                raise RuntimeError(f"{product['folder']} has independent remote changes; "
                                   "import/reconcile them in the hub before retrying")
        pending.append(product)
    for product in pending:
        print(f"{'Would publish' if dry_run else 'Publishing'}: {product['folder']} "
              f"({product['commits']} commits)", flush=True)
        if not dry_run:
            git(root, "-c", "core.hooksPath=/dev/null", "push", "--porcelain",
                product["url"], f"{product['commit']}:refs/heads/{product['branch']}")
    print(f"Products {'planned' if dry_run else 'synchronized'}: {len(pending)} changed / "
          f"{len(exports)} total", flush=True)


def push_is_dry_run():
    # Git does not expose --dry-run to pre-push hooks. Read the actual push process
    # on this Linux workspace, through the optional /bin/sh hook launcher.
    pid = os.getppid()
    for _ in range(4):
        process = Path(f"/proc/{pid}")
        args = process.joinpath("cmdline").read_bytes().split(b"\0")
        if args and os.path.basename(os.fsdecode(args[0])) == "git" and b"push" in args:
            options = args[args.index(b"push") + 1:]
            for argument in options:
                if argument == b"--":
                    break
                if argument == b"--dry-run" or (argument.startswith(b"-") and
                        not argument.startswith(b"--") and b"n" in argument):
                    return True
            return False
        stat = process.joinpath("stat").read_text()
        pid = int(stat[stat.rfind(")") + 2:].split()[1])
    raise RuntimeError("Cannot identify invoking git push; use the explicit sync command")


def hook_target(root, config, remote, url, updates):
    hub_url = value(root, "remote", "get-url", "--push", config["hubRemote"])
    if remote != config["hubRemote"] and url != hub_url:
        return None
    branch = f"refs/heads/{config['hubBranch']}"
    for line in updates.splitlines():
        local_ref, local_oid, remote_ref, remote_oid = line.split()
        if remote_ref == branch:
            if set(local_oid) == {"0"}:
                raise RuntimeError("Delete the managed hub branch only after uninstalling product sync")
            return local_oid
    if not updates.strip():
        # Allows an ordinary retry to repair product synchronization even if the
        # hub already received the same commit during a previous interrupted push.
        current = git(root, "symbolic-ref", "--quiet", "HEAD", check=False)
        if current.stdout.decode().strip() == branch:
            return value(root, "rev-parse", branch)
    return None


def install(root):
    if git(root, "config", "--get", "core.hooksPath", check=False).returncode == 0:
        raise RuntimeError("Existing core.hooksPath; integrate product-sync manually")
    path = Path(value(root, "rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-push"))
    if path.exists() and MARKER not in path.read_text():
        raise RuntimeError("Existing pre-push hook; preserve it and integrate manually")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('#!/bin/sh\n' + MARKER + '\n'
                    'exec python3 "$(git rev-parse --show-toplevel)/scripts/product-sync.py" '
                    'hook "$@"\n')
    path.chmod(0o755)
    print(f"Installed: {path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["plan", "sync", "install", "uninstall", "hook"])
    parser.add_argument("hook_args", nargs="*")
    parser.add_argument("--revision", default="HEAD")
    parser.add_argument("--product", action="append")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    root = Path(value(Path.cwd(), "rev-parse", "--show-toplevel"))
    if args.command == "install":
        load_config(root)
        install(root)
        return
    if args.command == "uninstall":
        path = Path(value(root, "rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-push"))
        if path.exists() and MARKER in path.read_text():
            path.unlink()
            print("Removed the managed pre-push hook; product repositories and history remain")
        return
    config = load_config(root)
    target = args.revision
    if args.command == "hook":
        updates = sys.stdin.read()
        if len(args.hook_args) != 2:
            raise RuntimeError("Expected the pre-push remote name and URL")
        target = hook_target(root, config, *args.hook_args, updates)
        if not target:
            return
        if push_is_dry_run():
            print("Dry-run: no product repositories will be pushed")
            return
    target = value(root, "rev-parse", "--verify", f"{target}^{{commit}}")
    state = Path(value(root, "rev-parse", "--path-format=absolute", "--git-common-dir")) / "product-sync"
    state.mkdir(parents=True, exist_ok=True)
    with (state / "lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        exports = plan(root, config, state, target, set(args.product) if args.product else None)
        if args.command == "plan":
            print(json.dumps({"hubCommit": target, "products": exports}, indent=2))
        else:
            synchronize(root, exports, args.dry_run)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        print(f"Product sync failed: {error}", file=sys.stderr)
        sys.exit(1)
