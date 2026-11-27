import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCallbackPrivacyStatus } from '../api/video-render-policy.js';

test('render callback uploads are private by default and cannot auto-publish publicly', () => {
  assert.equal(renderCallbackPrivacyStatus(), 'private');
});
