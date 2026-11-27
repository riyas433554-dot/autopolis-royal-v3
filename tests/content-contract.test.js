import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContentSpec } from '../api/content-contract.js';

test('routes anime/movie/story tasks as long-form with full-video and promotional short defaults', () => {
  const spec = normalizeContentSpec({
    task: { id: 12, deliverable_type: 'anime', content_category: 'fantasy anime' },
  });
  assert.equal(spec.content_mode, 'long_form');
  assert.equal(spec.content_category, 'fantasy anime');
  assert.deepEqual(spec.platform_targets, ['youtube', 'facebook', 'youtube_shorts', 'instagram_reels', 'facebook_reels']);
});

test('short-form supports arbitrary categories and platform-specific short destinations', () => {
  const spec = normalizeContentSpec({
    task: { id: 13, deliverable_type: 'reel', content_category: 'street food ASMR' },
  });
  assert.equal(spec.content_mode, 'short_form');
  assert.equal(spec.content_category, 'street food ASMR');
  assert.deepEqual(spec.platform_targets, ['youtube_shorts', 'instagram_reels', 'facebook_reels']);
});

test('explicit mode and platform targets override inferred defaults', () => {
  const spec = normalizeContentSpec({
    task: { id: 14, deliverable_type: 'video', content_mode: 'short_form', content_category: 'science' },
    platformTargets: ['instagram_reels'],
  });
  assert.equal(spec.content_mode, 'short_form');
  assert.deepEqual(spec.platform_targets, ['instagram_reels']);
});

test('repurpose requires a source task and valid clip timeline', () => {
  const spec = normalizeContentSpec({
    task: { id: 15, deliverable_type: 'reel', content_mode: 'repurpose' },
    sourceTaskId: 12,
    segments: [{ start_seconds: 31.5, end_seconds: 47.25, hook: 'surprise reveal' }],
  });
  assert.equal(spec.source_task_id, 12);
  assert.deepEqual(spec.clip_segments, [{ start_seconds: 31.5, end_seconds: 47.25, hook: 'surprise reveal' }]);
  const autoSpec = normalizeContentSpec({ task: { id: 18, deliverable_type: 'clip', content_mode: 'repurpose', source_video_task_id: 12 } });
  assert.deepEqual(autoSpec.clip_segments, []);
  assert.throws(() => normalizeContentSpec({
    task: { id: 15, deliverable_type: 'reel', content_mode: 'repurpose' },
    segments: [{ start_seconds: 20, end_seconds: 10 }],
  }), /valid start\/end times/);
});

test('rejects unknown platform targets and unsupported content modes', () => {
  assert.throws(() => normalizeContentSpec({
    task: { id: 16, deliverable_type: 'video' },
    platformTargets: ['tiktok'],
  }), /Unsupported platform target/);
  assert.throws(() => normalizeContentSpec({
    task: { id: 16, deliverable_type: 'video', content_mode: 'unknown' },
  }), /Unsupported content mode/);
});
