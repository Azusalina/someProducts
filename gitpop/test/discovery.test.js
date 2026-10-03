import test from 'node:test';
import assert from 'node:assert/strict';
import { repos, categories, filterRepos, makeBag } from '../src/repos.js';

test('every discovery has a unique GitHub source, a visual study, and a build prompt', () => {
  assert.equal(new Set(repos.map(repo => repo.id)).size, repos.length);
  for (const repo of repos) {
    assert.match(repo.id, /^[\w.-]+\/[\w.-]+$/);
    assert.ok(categories.includes(repo.category));
    assert.ok(repo.description && repo.spark && repo.visual && repo.tags.length);
  }
});
test('topic filters never offer unrelated repositories and every topic has multiple options', () => {
  assert.equal(filterRepos(categories[0]).length, repos.length);
  for (const category of categories.slice(1)) {
    const pool = filterRepos(category);
    assert.ok(pool.length >= 2);
    assert.ok(pool.every(repo => repo.category === category));
  }
});
test('random discovery cycles include each eligible repo once and avoid repeating the current repo at cycle boundaries', () => {
  for (const category of categories) {
    const pool = filterRepos(category);
    for (const current of pool) {
      for (const random of [() => 0, () => .5, () => .99999]) {
        const bag = makeBag(pool, current.id, random);
        assert.equal(bag.length, pool.length);
        assert.equal(new Set(bag.map(repo => repo.id)).size, pool.length);
        assert.notEqual(bag.at(-1).id, current.id);
        assert.deepEqual(new Set(bag.map(repo => repo.id)), new Set(pool.map(repo => repo.id)));
      }
    }
  }
});
