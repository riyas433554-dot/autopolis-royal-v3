import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../data/ecc-agent-manifest.json', import.meta.url), 'utf8'));

test('ECC manifest is pinned and contains 72 reviewed role-definition entries', () => {
  assert.equal(manifest.source_repository, 'affaan-m/ECC');
  assert.equal(manifest.source_ref, '4adeee6732a12d1540f49a4d50a38ce8c97f9a53');
  assert.equal(manifest.agent_definition_count, 72);
  assert.equal(manifest.agents.length, 72);
  assert.equal(manifest.source_type, 'markdown_agent_definitions_not_model_weights');
});

test('ECC manifest paths, keys and upstream blob SHAs are unique and valid', () => {
  const keys = manifest.agents.map(agent => agent.key);
  const paths = manifest.agents.map(agent => agent.path);
  assert.equal(new Set(keys).size, 72);
  assert.equal(new Set(paths).size, 72);
  for (const agent of manifest.agents) {
    assert.match(agent.key, /^[a-z0-9-]+$/);
    assert.match(agent.path, /^agents\/[a-z0-9-]+\.md$/);
    assert.match(agent.blob_sha, /^[a-f0-9]{40}$/);
  }
});
