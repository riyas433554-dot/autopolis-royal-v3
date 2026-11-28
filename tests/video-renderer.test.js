import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoRenderPayload, dispatchVideoRender, normalizeVideoResolution, extractVideoNarration, extractYoutubeDescription, extractYoutubeTitle, validateVideoDuration } from '../api/video-renderer.js';

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

test('extracts timed paragraph narration and skips music/end-card notes', () => {
  const result = [
    '## Voiceover Script',
    '',
    '**[0:00–0:05]**',
    'Autopolis Royal V3 is live.',
    '',
    '**[0:05–0:12]**',
    'Tasks are created in a queue.',
    '',
    '**[0:50–0:60]**',
    '[Music sting. End card.]',
    '',
    '## Visual Plan',
    'Not spoken.',
  ].join('\n');
  assert.equal(extractVideoNarration(result), 'Autopolis Royal V3 is live.\nTasks are created in a queue.');
});

test('extracts actual Autopolis deliverable voiceover and skips section labels', () => {
  const result = [
    '## [DELIVERABLE] Voiceover Script (45–60 seconds)',
    'Purpose: launch explainer.',
    '---',
    '**[0:00–0:05] Hook**',
    'Autopolis Royal V3 is live.',
    '',
    '**[0:05–0:15] Context**',
    'City tasks are created in a queue.',
    '',
    '**[0:15–0:30] Mechanism**',
    'Agents claim tasks using database leases.',
    '',
    '## [DELIVERABLE] Scene-by-Scene Visual Plan',
    'Do not narrate the visual plan.',
  ].join('\n');
  assert.equal(
    extractVideoNarration(result),
    'Autopolis Royal V3 is live.\nCity tasks are created in a queue.\nAgents claim tasks using database leases.',
  );
});

test('extracts actual deliverable YouTube title and description headings', () => {
  const result = [
    '## [DELIVERABLE] YouTube Title',
    'Autopolis Royal V3 — City Task Queue Launch',
    '',
    '## [DELIVERABLE] YouTube Description',
    'Autopolis Royal V3 is live.',
    'Tasks are created in a queue.',
    '',
    '## [DELIVERABLE] Thumbnail Concept',
    'Not part of description.',
  ].join('\n');
  assert.equal(extractYoutubeTitle(result, 'fallback'), 'Autopolis Royal V3 — City Task Queue Launch');
  assert.equal(extractYoutubeDescription(result, 'fallback'), 'Autopolis Royal V3 is live.\nTasks are created in a queue.');
});

test('extracts Scene time-range headers and blockquote narration', () => {
  const result = [
    '# Autopolis Royal V3 — Public YouTube Launch Short',
    '',
    '## Voiceover Script (45–60 seconds)',
    '',
    '**Scene 1 (0:00–0:08)**',
    '> Tasks are created in a queue.',
    '',
    '**Scene 2 (0:08–0:16)**',
    '> The runner selects eligible idle city staff or hired company agents.',
    '',
    '**Scene 3 (0:16–0:24)**',
    '> Task claims use database leases.',
    '',
    '---',
    '',
    '## Scene-by-Scene Visual Plan',
    'Do not narrate this section.',
  ].join('\n');
  assert.equal(
    extractVideoNarration(result),
    'Tasks are created in a queue.\nThe runner selects eligible idle city staff or hired company agents.\nTask claims use database leases.',
  );
});

test('includes selected customer resolution in render payload', () => {
  const payload = buildVideoRenderPayload({
    task: { id: 43, title: 'Cinematic short', deliverable_type: 'video', video_resolution: '1440p' },
    result: 'Narration',
  });
  assert.equal(payload.resolution, '1440p');
});

test('normalizes resolution only for video deliverables', () => {
  assert.equal(normalizeVideoResolution('reel', '1440p'), '1440p');
  assert.equal(normalizeVideoResolution('report', '1440p'), 'source');
  assert.throws(() => normalizeVideoResolution('video', '4k'), /Unsupported video resolution/);
});
