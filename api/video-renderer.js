import { normalizeContentSpec } from './content-contract.js';

const VIDEO_TYPES = new Set(['video', 'reel', 'anime', 'movie', 'short', 'long_video', 'series_episode', 'cartoon', 'documentary', 'explainer', 'casual_ai', 'clip']);

export function buildVideoRenderPayload({ task, result, callbackUrl, profile }) {
  const taskId = Number(task?.id);
  if (!Number.isInteger(taskId) || taskId <= 0) throw new Error('A valid task id is required');
  const type = String(task?.deliverable_type || '').trim().toLowerCase();
  if (!VIDEO_TYPES.has(type)) throw new Error('Task must be a video deliverable');
  const title = String(task?.title || '').trim();
  const script = typeof result === 'string' ? result.trim() : '';
  if (!title) throw new Error('Video title is required');
  if (!script) throw new Error('Video script is required');
  let parsedResult = null;
  if (typeof script === 'string' && script.startsWith('{')) {
    try { parsedResult = JSON.parse(script); } catch { /* plain scripts may begin with braces */ }
  }
  const contentSpec = normalizeContentSpec({
    task,
    segments: task?.clip_segments || parsedResult?.clip_segments,
    sourceTaskId: task?.source_video_task_id || parsedResult?.source_task_id,
  });
  const payload = {
    task_id: taskId,
    title: title.slice(0, 100),
    description: String(task?.description || '').slice(0, 5000),
    deliverable_type: type,
    script,
    profile: String(profile || 'cinematic').slice(0, 40),
    content_mode: contentSpec.content_mode,
    content_category: contentSpec.content_category,
    platform_targets: contentSpec.platform_targets,
    source_task_id: contentSpec.source_task_id,
    clip_segments: contentSpec.clip_segments,
  };
  if (callbackUrl) {
    const callback = new URL(callbackUrl);
    if (callback.protocol !== 'https:') throw new Error('Renderer callback URL must use HTTPS');
    payload.callback_url = callback.toString();
  }
  return payload;
}

export async function dispatchVideoRender({
  task,
  result,
  callbackUrl,
  profile,
  env = process.env,
  fetchImpl = fetch,
}) {
  const base = String(env.VIDEO_RENDERER_URL || '').trim();
  const token = String(env.VIDEO_RENDERER_TOKEN || '').trim();
  if (!base || !token) throw new Error('VIDEO_RENDERER_URL and VIDEO_RENDERER_TOKEN are required');
  let endpoint;
  try {
    endpoint = new URL(base);
  } catch {
    throw new Error('VIDEO_RENDERER_URL must be a valid URL');
  }
  const localHttp = endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !localHttp) throw new Error('VIDEO_RENDERER_URL must use HTTPS');
  endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + '/v1/jobs';
  endpoint.search = '';
  endpoint.hash = '';

  const payload = buildVideoRenderPayload({ task, result, callbackUrl, profile: profile || env.VIDEO_RENDER_PROFILE });
  const response = await fetchImpl(endpoint.toString(), {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      'idempotency-key': 'autopolis-task-' + payload.task_id,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.job_id) {
    throw new Error('Video renderer rejected job (HTTP ' + response.status + '): ' +
      String(body.error || body.message || 'missing job_id').slice(0, 300));
  }
  return {
    job_id: String(body.job_id).slice(0, 160),
    status: String(body.status || 'queued').slice(0, 40),
    provider: String(body.provider || 'external').slice(0, 80),
  };
}
