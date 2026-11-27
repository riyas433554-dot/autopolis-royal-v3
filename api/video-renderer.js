import { createHash } from 'node:crypto';

const VIDEO_TYPES = new Set(['video', 'reel', 'anime', 'movie']);

export function extractVideoNarration(result) {
  const text = typeof result === 'string' ? result.trim() : '';
  if (!text) return '';
  const heading = /^#{1,6}\s*(?:voiceover|voice-over|narration)\s+script\b[^\n]*$/im.exec(text);
  if (!heading) return text;

  const start = heading.index + heading[0].length;
  const remainder = text.slice(start);
  const nextHeading = /^#{1,6}\s+[^\n]+$/m.exec(remainder);
  const section = nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
  const spokenLines = [];

  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length < 2 || !/^\d{1,2}:\d{2}/.test(cells[0])) continue;
    const spoken = cells[1]
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .replace(/^\s*(?:hook|opening|closing|voiceover|vo)\s*:\s*/i, '')
      .trim();
    if (spoken) spokenLines.push(spoken);
  }

  if (!spokenLines.length) {
    throw new Error('Could not extract spoken lines from the markdown voiceover script');
  }
  return spokenLines.join('\n');
}

export function extractYoutubeTitle(result, fallback = '') {
  const text = typeof result === 'string' ? result : '';
  const heading = /^#{1,6}\s*(?:youtube\s+)?title\b[^\n]*$/im.exec(text);
  if (!heading) return String(fallback || '').trim().slice(0, 100);
  const remainder = text.slice(heading.index + heading[0].length);
  const nextHeading = /^#{1,6}\s+[^\n]+$/m.exec(remainder);
  const section = (nextHeading ? remainder.slice(0, nextHeading.index) : remainder)
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*[-*]\s*/, '').replace(/\*\*/g, '').trim())
    .find(Boolean);
  return String(section || fallback || '').trim().slice(0, 100);
}

export function extractYoutubeDescription(result, fallback = '') {
  const text = typeof result === 'string' ? result : '';
  const heading = /^#{1,6}\s*(?:youtube\s+)?description\b[^\n]*$/im.exec(text);
  if (!heading) return String(fallback || '').trim().slice(0, 5000);
  const remainder = text.slice(heading.index + heading[0].length);
  const nextHeading = /^#{1,6}\s+[^\n]+$/m.exec(remainder);
  let section = (nextHeading ? remainder.slice(0, nextHeading.index) : remainder).trim();
  section = section.replace(/^```[^\n]*\n/, '').replace(/\n```\s*$/, '').trim();
  return (section || String(fallback || '').trim()).slice(0, 5000);
}

export function validateVideoDuration(taskDescription, qcReport) {
  const description = String(taskDescription || '');
  if (!/45\s*(?:–|-|to)\s*60\s*(?:seconds?|secs?|s)?/i.test(description)) return null;
  const duration = Number(qcReport?.duration_seconds);
  if (!Number.isFinite(duration)) return 'QC failed: duration_seconds is required for a 45–60 second video';
  if (duration < 45 || duration > 60) {
    return 'QC failed: video duration must be 45–60 seconds; got ' + duration.toFixed(2) + ' seconds';
  }
  return null;
}

export function buildVideoRenderPayload({ task, result, callbackUrl, profile }) {
  const taskId = Number(task?.id);
  if (!Number.isInteger(taskId) || taskId <= 0) throw new Error('A valid task id is required');
  const type = String(task?.deliverable_type || '').trim().toLowerCase();
  if (!VIDEO_TYPES.has(type)) throw new Error('Task must be a video deliverable');
  const title = extractYoutubeTitle(result, task?.title);
  const script = extractVideoNarration(result);
  if (!title) throw new Error('Video title is required');
  if (!script) throw new Error('Video script is required');
  const payload = {
    task_id: taskId,
    title: title.slice(0, 100),
    description: extractYoutubeDescription(result, task?.description),
    deliverable_type: type,
    script,
    profile: String(profile || 'cinematic').slice(0, 40),
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
      'idempotency-key': 'autopolis-task-' + payload.task_id + '-' + createHash('sha256').update(payload.script).digest('hex').slice(0, 16),
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
