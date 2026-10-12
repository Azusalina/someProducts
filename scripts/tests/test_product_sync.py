"""End-to-end tests using isolated hub and bare product repositories."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "product-sync.py"


class ProductSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="product-sync-test-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "workspace"
        self.root.mkdir()
        self.git("init", "-b", "master")
        self.git("config", "user.name", "Fixture Author")
        self.git("config", "user.email", "fixture@example.test")
        self.remotes = {}
        for name in ["hub", "a", "b"]:
            remote = self.base / f"{name}.git"
            subprocess.run(["git", "init", "--bare", "-b", "master", str(remote)],
                           check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            self.remotes[name] = remote
        self.git("remote", "add", "origin", str(self.remotes["hub"]))
        (self.root / "scripts").mkdir()
        shutil.copyfile(SOURCE, self.root / "scripts/product-sync.py")
        self.config = {
            "version": 1, "owner": "Fixture", "hubRemote": "origin", "hubBranch": "master",
            "products": [
                {"folder": "a", "historyPaths": ["a", "old-a"], "url": str(self.remotes["a"])},
                {"folder": "b", "url": str(self.remotes["b"])}]}
        (self.root / "products.json").write_text(json.dumps(self.config))
        self.write("old-a/data.txt", "original a")
        self.write("b/data.txt", "original b")
        self.initial = self.commit("original products")
        self.git("mv", "old-a", "a")
        self.commit("rename a")
        self.run_sync("install")

    def git(self, *args, check=True, cwd=None):
        result = subprocess.run(["git", "-C", str(cwd or self.root), *args],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if check and result.returncode:
            self.fail(result.stderr.decode())
        return result

    def oid(self, name, ref="refs/heads/master"):
        result = self.git("rev-parse", "--verify", ref, cwd=self.remotes[name], check=False)
        return result.stdout.decode().strip() if not result.returncode else None

    def write(self, path, content):
        file = self.root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content)

    def commit(self, message):
        self.git("add", "-A")
        self.git("commit", "-m", message)
        return self.git("rev-parse", "HEAD").stdout.decode().strip()

    def run_sync(self, *args, check=True):
        result = subprocess.run([sys.executable, str(SOURCE), *args], cwd=self.root,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if check and result.returncode:
            self.fail(result.stderr.decode())
        return result

    def push(self, *args, check=True):
        return self.git("push", *args, "origin", "master", check=check)

    def test_history_rename_identity_isolation_and_incremental_push(self):
        self.push()
        a_tip, b_tip = self.oid("a"), self.oid("b")
        self.assertEqual(self.oid("hub"), self.git("rev-parse", "HEAD").stdout.decode().strip())
        self.assertEqual(self.git("rev-list", "--count", a_tip).stdout.strip(), b"1")
        self.assertEqual(self.git("show", f"{a_tip}:data.txt").stdout, b"original a")
        self.assertEqual(self.git("ls-tree", "--name-only", a_tip).stdout.strip(), b"data.txt")
        self.assertEqual(self.git("show", "-s", "--format=%an <%ae> %aI %cI %B", self.initial).stdout,
                         self.git("show", "-s", "--format=%an <%ae> %aI %cI %B", a_tip).stdout)
        self.write("a/data.txt", "changed a")
        self.commit("change only a")
        result = self.push()
        self.assertNotEqual(a_tip, self.oid("a"))
        self.assertEqual(b_tip, self.oid("b"))
        self.assertIn(b"1 changed / 2 total", result.stdout)
        self.write("workspace.txt", "hub only")
        self.commit("change only hub")
        a_tip = self.oid("a")
        result = self.push()
        self.assertEqual(a_tip, self.oid("a"))
        self.assertIn(b"0 changed / 2 total", result.stdout)

    def test_dry_run_never_publishes_products(self):
        for option in ["--dry-run", "-n", "-vn"]:
            result = self.push(option)
            self.assertIn(b"Dry-run", result.stdout)
            self.assertIsNone(self.oid("a"))
            self.assertIsNone(self.oid("b"))
            self.assertIsNone(self.oid("hub"))
        self.run_sync("sync", "--dry-run")
        self.assertIsNone(self.oid("a"))
        self.assertIsNone(self.oid("hub"))

    def test_product_rejection_aborts_hub_and_retry_repairs_partial_push(self):
        reject = self.remotes["b"] / "hooks/pre-receive"
        reject.write_text("#!/bin/sh\nexit 1\n")
        reject.chmod(0o755)
        result = self.push(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNotNone(self.oid("a"))
        self.assertIsNone(self.oid("b"))
        self.assertIsNone(self.oid("hub"))
        reject.unlink()
        result = self.push()
        self.assertIn(b"Unchanged: a", result.stdout)
        self.assertIsNotNone(self.oid("b"))
        self.assertIsNotNone(self.oid("hub"))

    def test_up_to_date_hub_still_synchronizes_products(self):
        self.push("--no-verify")
        self.assertIsNone(self.oid("a"))
        self.push()
        self.assertIsNotNone(self.oid("a"))
        self.assertIsNotNone(self.oid("b"))

    def test_divergent_product_blocks_all_destinations(self):
        self.push()
        hub_tip, a_tip = self.oid("hub"), self.oid("a")
        external = self.base / "external"
        subprocess.run(["git", "clone", str(self.remotes["b"]), str(external)],
                       check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.git("config", "user.name", "Remote Editor", cwd=external)
        self.git("config", "user.email", "remote@example.test", cwd=external)
        (external / "data.txt").write_text("remote b")
        self.git("add", ".", cwd=external)
        self.git("commit", "-m", "external change", cwd=external)
        self.git("push", cwd=external)
        self.write("a/data.txt", "pending a")
        self.write("b/data.txt", "pending b")
        self.commit("local changes")
        result = self.push(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"independent remote changes", result.stderr)
        self.assertEqual(a_tip, self.oid("a"))
        self.assertEqual(hub_tip, self.oid("hub"))

    def test_split_cache_rebuild_and_deletion_recreation(self):
        first = json.loads(self.run_sync("plan").stdout)["products"]
        state = self.root / ".git/product-sync"
        for cache in state.glob("*.json"):
            cache.unlink()
        second = json.loads(self.run_sync("plan").stdout)["products"]
        self.assertEqual(first, second)
        self.git("rm", "a/data.txt")
        self.commit("delete product content")
        empty = json.loads(self.run_sync("plan").stdout)["products"][0]
        self.assertEqual(self.git("ls-tree", empty["commit"]).stdout, b"")
        self.write("a/data.txt", "recreated")
        self.commit("recreate a")
        self.push()
        self.assertEqual(self.git("rev-list", "--count", self.oid("a")).stdout.strip(), b"3")

    def test_merge_preserves_product_parents(self):
        self.git("checkout", "-b", "feature")
        self.write("a/feature.txt", "feature")
        self.commit("product feature")
        self.git("checkout", "master")
        self.write("a/main.txt", "main")
        self.commit("product main")
        self.git("merge", "--no-ff", "feature", "-m", "merge feature")
        self.push()
        parents = self.git("rev-list", "--parents", "-1", self.oid("a")).stdout.split()
        self.assertEqual(len(parents), 3)
        self.assertEqual(self.git("show", f"{self.oid('a')}:feature.txt").stdout, b"feature")

    def test_hook_uses_pushed_commit_instead_of_worktree_head(self):
        pushed = self.git("rev-parse", "HEAD").stdout.decode().strip()
        self.write("a/data.txt", "not being pushed")
        self.commit("newer local commit")
        self.git("push", "origin", f"{pushed}:refs/heads/master")
        self.assertEqual(self.oid("hub"), pushed)
        self.assertEqual(self.git("show", f"{self.oid('a')}:data.txt").stdout, b"original a")

    def test_combination_preserves_both_histories_without_rewriting_destination(self):
        self.push()
        original_a, original_b = self.oid("a"), self.oid("b")
        self.git("mv", "b", "a/cli-mode")
        self.config["products"] = [self.config["products"][0]]
        self.config["products"][0]["historyImports"] = [
            {"path": "cli-mode", "commit": original_b}]
        (self.root / "products.json").write_text(json.dumps(self.config))
        self.commit("combine modes")
        self.push()
        combined = self.oid("a")
        self.git("merge-base", "--is-ancestor", original_a, combined)
        self.git("merge-base", "--is-ancestor", original_b, combined)
        self.assertEqual(len(self.git("rev-list", "--parents", "-1", combined).stdout.split()), 3)
        self.assertEqual(self.git("show", f"{combined}:cli-mode/data.txt").stdout, b"original b")
        self.write("a/cli-mode/data.txt", "updated cli")
        self.commit("update cli in combined product")
        self.push()
        final = self.oid("a")
        self.assertEqual(len(self.git("rev-list", "--parents", "-1", final).stdout.split()), 2)
        for cache in (self.root / ".git/product-sync").glob("*.json"):
            cache.unlink()
        self.assertEqual(json.loads(self.run_sync("plan").stdout)["products"][0]["commit"], final)

    def test_other_branch_does_not_publish_master_products(self):
        self.git("push", "origin", "HEAD:refs/heads/feature")
        self.assertIsNone(self.oid("a"))
        self.assertIsNone(self.oid("hub"))

    def test_up_to_date_other_branch_cannot_publish_unpushed_master(self):
        self.push()
        self.git("branch", "feature")
        self.git("push", "origin", "feature")
        a_tip = self.oid("a")
        self.write("a/data.txt", "unpublished master")
        self.commit("master ahead of hub")
        self.git("push", "origin", "feature")
        self.assertEqual(a_tip, self.oid("a"))

    def test_existing_hooks_preserved_and_uninstall_is_scoped(self):
        self.run_sync("uninstall")
        hook = self.root / ".git/hooks/pre-push"
        hook.write_text("#!/bin/sh\necho user-hook\n")
        result = self.run_sync("install", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("user-hook", hook.read_text())
        self.run_sync("uninstall")
        self.assertTrue(hook.exists())
        hook.unlink()
        self.git("config", "core.hooksPath", ".custom-hooks")
        self.assertNotEqual(self.run_sync("install", check=False).returncode, 0)


if __name__ == "__main__":
    unittest.main()
