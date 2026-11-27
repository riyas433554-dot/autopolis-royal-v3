import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutoRepurposeTask, needsAutoRepurpose } from '../api/auto-repurpose-contract.js';

test('long-form tasks with Reel destinations create a derivative, not a full-video Reel post', () => {
  const task = { id: 88, title: 'Pilot movie', description: 'A story', content_mode: 'long_form', deliverable_type: 'movie', content_category: 'sci-fi' };
  assert.equal(needsAutoRepurpose(task, ['youtube','instagram_reels','facebook_reels']), true);
  const child = buildAutoRepurposeTask(task, ['youtube','instagram_reels','facebook_reels'], '2026-11-27T00:00:00.000Z');
  assert.equal(child.content_mode, 'repurpose');
  assert.equal(child.source_video_task_id, 88);
  assert.equal(child.auto_repurpose, true);
  assert.deepEqual(child.platform_targets, ['instagram_reels','facebook_reels']);
  assert.equal(child.status, 'done');
  assert.match(child.description, /QC-passed source video/);
});

test('short-form and repurpose tasks do not recursively create derivatives', () => {
  assert.equal(needsAutoRepurpose({ id: 1, content_mode: 'short_form', deliverable_type: 'reel' }, ['instagram_reels']), false);
  assert.equal(needsAutoRepurpose({ id: 2, content_mode: 'repurpose', deliverable_type: 'clip' }, ['facebook_reels']), false);
  assert.equal(needsAutoRepurpose({ id: 3, content_mode: 'auto', deliverable_type: 'video' }, ['youtube']), false);
});
