import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoRenderPayload, dispatchVideoRender, extractVideoNarration, extractYoutubeDescription, extractYoutubeTitle, validateVideoDuration } from '../api/video-renderer.js';

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
  assert.match(request.options.headers['idempotency-key'], /^autopolis-task-42-[a-f0-9]{16}$/);
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

test('extracts only spoken lines from a markdown voiceover table', () => {
  const result = [
    '# Campaign',
    '## Voiceover Script (45–60 seconds)',
    '| Time | Voiceover | On-screen text |',
    '|---|---|---|',
    '| 0:00–0:05 | **Hook:** Three systems. One workflow. | Three systems |',
    '| 0:05–0:10 | Tasks move to an eligible agent. | Task routing |',
    '## Visual Plan',
    'Do not narrate this section.',
  ].join('\n');
  assert.equal(extractVideoNarration(result), 'Three systems. One workflow.\nTasks move to an eligible agent.');
});

test('preserves a plain-text script and extracts a clean YouTube description', () => {
  assert.equal(extractVideoNarration('A plain spoken script.'), 'A plain spoken script.');
  const result = '## Description\n\n```\nA concise public description.\n#Autopolis\n```\n\n## Thumbnail\nNot part of the description.';
  assert.equal(extractYoutubeDescription(result, 'fallback'), 'A concise public description.\n#Autopolis');
  assert.equal(extractYoutubeTitle('## Title\n\nRoyal V3 Launch\n\n## Description\ntext', 'fallback'), 'Royal V3 Launch');
});

test('duration QC enforces a requested 45–60 second public short', () => {
  assert.equal(validateVideoDuration('Create a 45–60 second YouTube short', { duration_seconds: 52 }), null);
  assert.match(validateVideoDuration('Create a 45–60 second YouTube short', { duration_seconds: 78 }), /45–60 seconds/);
  assert.equal(validateVideoDuration('Create a 30 second reel', { duration_seconds: 78 }), null);
});

test('render idempotency key changes when spoken script changes', async () => {
  const keys = [];
  for (const script of ['First script', 'Updated script']) {
    await dispatchVideoRender({
      task: { id: 88, title: 'Launch', deliverable_type: 'video' },
      result: script,
      env: { VIDEO_RENDERER_URL: 'https://renderer.example', VIDEO_RENDERER_TOKEN: 'secret' },
      fetchImpl: async (_url, options) => {
        keys.push(options.headers['idempotency-key']);
        return new Response(JSON.stringify({ job_id: 'job-' + keys.length, status: 'queued' }), { status: 202 });
      },
    });
  }
  assert.notEqual(keys[0], keys[1]);
});
