import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoRenderPayload, dispatchVideoRender } from '../api/video-renderer.js';

test('builds a video render job from a completed task and script', () => {
  const payload = buildVideoRenderPayload({
    task: { id: 42, title: 'Create product launch reel', deliverable_type: 'reel', description: '30 sec vertical' },
    result: 'Scene 1: product reveal',
    callbackUrl: 'https://autopolis.example/api/video-render-callback',
  });
  assert.equal(payload.task_id, 42);
  assert.equal(payload.title, 'Create product launch reel');
  assert.equal(payload.deliverable_type, 'reel');
  assert.equal(payload.script, 'Scene 1: product reveal');
  assert.equal(payload.callback_url, 'https://autopolis.example/api/video-render-callback');
});

test('rejects non-video deliverables and empty scripts', () => {
  assert.throws(() => buildVideoRenderPayload({
    task: { id: 7, title: 'Write report', deliverable_type: 'report' },
    result: 'text',
  }), /video deliverable/);
  assert.throws(() => buildVideoRenderPayload({
    task: { id: 7, title: 'Make a reel', deliverable_type: 'reel' },
    result: '  ',
  }), /script is required/);
});

test('dispatches to configured renderer with bearer auth and stable idempotency key', async () => {
  let request;
  const result = await dispatchVideoRender({
    task: { id: 42, title: 'Create product launch reel', deliverable_type: 'reel' },
    result: 'Script',
    env: { VIDEO_RENDERER_URL: 'https://renderer.example/', VIDEO_RENDERER_TOKEN: 'secret' },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ job_id: 'render-123', status: 'queued' }), {
        status: 202, headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(request.url, 'https://renderer.example/v1/jobs');
  assert.equal(request.options.headers.authorization, 'Bearer secret');
  assert.equal(request.options.headers['idempotency-key'], 'autopolis-task-42');
  assert.equal(JSON.parse(request.options.body).task_id, 42);
  assert.equal(result.job_id, 'render-123');
});

test('fails closed when renderer configuration is absent or response is not accepted', async () => {
  await assert.rejects(dispatchVideoRender({
    task: { id: 42, title: 'Reel', deliverable_type: 'reel' }, result: 'Script', env: {},
  }), /VIDEO_RENDERER_URL and VIDEO_RENDERER_TOKEN/);
  await assert.rejects(dispatchVideoRender({
    task: { id: 42, title: 'Reel', deliverable_type: 'reel' }, result: 'Script',
    env: { VIDEO_RENDERER_URL: 'https://renderer.example', VIDEO_RENDERER_TOKEN: 'secret' },
    fetchImpl: async () => new Response(JSON.stringify({ error: 'busy' }), { status: 503 }),
  }), /renderer rejected job/);
});


test('includes long-form intent, free-form category, and target destinations in worker payload', () => {
  const payload = buildVideoRenderPayload({
    task: {
      id: 43, title: 'Documentary episode', deliverable_type: 'series_episode',
      content_mode: 'long_form', content_category: 'nature documentary',
      platform_targets: ['youtube', 'facebook'],
    },
    result: 'Scene-by-scene documentary script',
    callbackUrl: 'https://autopolis.example/api/video-render-callback',
  });
  assert.equal(payload.content_mode, 'long_form');
  assert.equal(payload.content_category, 'nature documentary');
  assert.deepEqual(payload.platform_targets, ['youtube', 'facebook']);
  assert.equal(payload.source_task_id, null);
});

test('includes source task and selected clip segments for repurpose payload', () => {
  const payload = buildVideoRenderPayload({
    task: {
      id: 44, title: 'Best scene edit', deliverable_type: 'clip',
      content_mode: 'repurpose', source_video_task_id: 43,
      platform_targets: ['instagram_reels'],
    },
    result: JSON.stringify({ clip_segments: [{ start_seconds: 12, end_seconds: 28, hook: 'reveal' }] }),
    callbackUrl: 'https://autopolis.example/api/video-render-callback',
  });
  assert.equal(payload.source_task_id, 43);
  assert.equal(payload.content_mode, 'repurpose');
  assert.deepEqual(payload.clip_segments, [{ start_seconds: 12, end_seconds: 28, hook: 'reveal' }]);
});
