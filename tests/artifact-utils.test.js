import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArtifactPath, artifactMimeType, validateArtifactContent } from '../api/artifact-utils.js';

test('normalizes nested artifact paths and Windows separators', () => {
  assert.equal(normalizeArtifactPath('src\\main.ts'), 'src/main.ts');
  assert.equal(normalizeArtifactPath('public/index.html'), 'public/index.html');
});

test('rejects traversal, absolute paths, hidden env files and dependency folders', () => {
  for (const path of ['../secret.txt', '/etc/passwd', 'src/../../x', '.env', '.env.production', 'node_modules/pkg/index.js', '.git/config', 'keys/private.pem']) {
    assert.throws(() => normalizeArtifactPath(path), /unsafe|invalid|reserved/i, path);
  }
});

test('maps common project file types to safe text MIME types', () => {
  assert.equal(artifactMimeType('src/App.tsx'), 'text/plain; charset=utf-8');
  assert.equal(artifactMimeType('public/index.html'), 'text/html; charset=utf-8');
  assert.equal(artifactMimeType('package.json'), 'application/json; charset=utf-8');
});

test('rejects empty, binary and oversized text artifacts', () => {
  assert.throws(() => validateArtifactContent('  '), /non-empty/i);
  assert.throws(() => validateArtifactContent('hello' + String.fromCharCode(0) + 'world'), /binary/i);
  assert.throws(() => validateArtifactContent('x'.repeat(100001)), /size/i);
});
