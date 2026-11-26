import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { createZip } from '../api/zip-utils.js';

test('creates a valid local ZIP entry that can be inflated', () => {
  const zip = createZip([{ path: 'README.md', content: '# Demo\\nHello' }]);
  assert.equal(zip.subarray(0, 4).toString('hex'), '504b0304');
  const nameLength = zip.readUInt16LE(26);
  const extraLength = zip.readUInt16LE(28);
  const compressedSize = zip.readUInt32LE(18);
  const dataStart = 30 + nameLength + extraLength;
  const name = zip.subarray(30, 30 + nameLength).toString('utf8');
  const compressed = zip.subarray(dataStart, dataStart + compressedSize);
  assert.equal(name, 'README.md');
  assert.equal(inflateRawSync(compressed).toString('utf8'), '# Demo\\nHello');
});

test('includes a central directory and correct file count', () => {
  const zip = createZip([{ path: 'a.txt', content: 'a' }, { path: 'src/b.js', content: 'b' }]);
  assert.equal(zip.readUInt16LE(zip.length - 12), 2);
  assert.equal(zip.subarray(zip.length - 22, zip.length - 18).toString('hex'), '504b0506');
});

test('rejects unsafe paths before packaging', () => {
  assert.throws(() => createZip([{ path: '../private.key', content: 'secret' }]), /unsafe|reserved|invalid/i);
});
