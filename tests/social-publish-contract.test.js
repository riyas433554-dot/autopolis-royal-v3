import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublishJobs } from '../api/social-publish-contract.js';

test('fans out one durable publish job per connected account and destination', () => {
  const task = { id: 71, title: 'Pilot', description: 'Episode one', content_mode: 'long_form', content_category: 'fantasy' };
  const youtube = [{ account_id: 'yt-a' }, { account_id: 'yt-b' }];
  const meta = [{ account_id: 'page-a' }, { account_id: 'page-b' }, { account_id: 'ig:insta-a' }, { account_id: 'ig:insta-b' }];
  const jobs = buildPublishJobs(task, 'https://media.example/video.mp4', ['youtube','facebook','facebook_reels','instagram_reels'], youtube, meta);
  assert.equal(jobs.length, 8);
  assert.equal(new Set(jobs.map(job => job.provider + ':' + job.account_id)).size, 8);
  assert.equal(jobs.filter(job => job.provider === 'youtube').length, 2);
  assert.equal(jobs.filter(job => job.provider === 'facebook').length, 2);
  assert.equal(jobs.filter(job => job.provider === 'facebook_reels').length, 2);
  assert.equal(jobs.filter(job => job.provider === 'instagram').length, 2);
  assert.ok(jobs.every(job => job.status === 'queued' && job.platform_payload.content_category === 'fantasy'));
});

test('does not create jobs for a destination with no matching connected account', () => {
  const jobs = buildPublishJobs({ id: 9, title: 'No accounts' }, 'https://media.example/video.mp4', ['instagram_reels'], [], [{ account_id: 'page-only' }]);
  assert.deepEqual(jobs, []);
});
