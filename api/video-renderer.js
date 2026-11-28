import { createHash } from 'node:crypto';

const VIDEO_TYPES = new Set(['video', 'reel', 'anime', 'movie']);
const VIDEO_RESOLUTIONS = new Set(['source', '720p', '1080p', '1440p']);

export function normalizeVideoResolution(deliverableType, value = 'source') {
  const type = String(deliverableType || '').trim().toLowerCase();
  if (!VIDEO_TYPES.has(type)) return 'source';
  const resolution = String(value || 'source').trim().toLowerCase();
  if (!VIDEO_RESOLUTIONS.has(resolution)) {
    throw new Error('Unsupported video resolution profile: ' + resolution);
  }
  return resolution;
}

export function extractVideoNarration(result) {
  const text = typeof result === 'string' ? result.trim() : '';
  if (!text) return '';
  const heading = /^#{1,6}\s*(?:\[[^\]]+\]\s*)?(?:voiceover|voice-over|narration)\s+script\b[^\n]*$/im.exec(text);
  if (!heading) return text;

  const start = heading.index + heading[0].length;
  const remainder = text.slice(start);
  const nextHeading = /^#{1,6}\s+[^\n]+$/m.exec(remainder);
  const section = nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
  const spokenLines = [];
  let pendingTimedLine = false;
  const cleanSpokenLine = value => value
    .replace(/^\s*>\s?/, '')
    .replace(/\*\*/g, '')
    .replaceAll(String.fromCharCode(96), '')
    .replace(/^\s*(?:hook|opening|closing|voiceover|vo)\s*:\s*/i, '')
    .trim();

  for (const line of section.split(/\r?\n/)) {
    if (line.trim().startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
      if (cells.length < 2 || !/^\d{1,2}:\d{2}/.test(cells[0])) continue;
      const spoken = cleanSpokenLine(cells[1]);
      if (spoken) spokenLines.push(spoken);
      continue;
    }

    const timed = line.match(/^\s*\*{0,2}\s*(?:(?:scene|shot)\s+\d+\s*)?(?:\(\s*)?\[?(\d{1,2}:\d{2}(?:\s*[–—-]\s*\d{1,2}:\d{2})?)\]?\s*\)?\s*\*{0,2}\s*(.*?)\s*\*{0,2}\s*$/i);
    if (timed) {
      const inlineSpoken = cleanSpokenLine(timed[2]);
      const isSectionLabel = /^(?:hook|opening|context|mechanism|render(?:\s+and\s+publish)?|close|closing)\b/i.test(inlineSpoken);
      if (inlineSpoken && !isSectionLabel) spokenLines.push(inlineSpoken);
      pendingTimedLine = !inlineSpoken || isSectionLabel;
      continue;
    }

    if (!pendingTimedLine || !line.trim() || /^\s*[-—]{3,}\s*$/.test(line)) continue;
    pendingTimedLine = false;
    const spoken = cleanSpokenLine(line);
    if (spoken && !/^\[(?:music|sfx|visual|end card)\b/i.test(spoken)) spokenLines.push(spoken);
  }

  if (!spokenLines.length) {
    throw new Error('Could not extract spoken lines from the markdown voiceover script');
  }
  return spokenLines.join('\n');
}

export function extractYoutubeTitle(result, fallback = '') {
  const text = typeof result === 'string' ? result : '';
  const heading = /^#{1,6}\s*(?:\[[^\]]+\]\s*)?(?:youtube\s+)?title\b[^\n]*$/im.exec(text);
  if (!heading) return String(fallback || '').trim().slice(0, 100);
  const remainder = text.slice(heading.index + heading[0].length);
  const nextHeading = /^#{1,6}\s+[^\n]+$/m.exec(remainder);
  let section = (nextHeading ? remainder.slice(0, nextHeading.index) : remainder).trim();
  const separated = section.split(/\r?\n\s*---+\s*\r?\n/);
  if (separated.length >= 3) section = separated[1].trim();
  const title = section
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*[-*]\s*/, '').replace(/\*\*/g, '').trim())
    .find(Boolean);
  return String(title || fallback || '').trim().slice(0, 100);
}

export function extractYoutubeDescription(result, fallback = '') {
  const text = typeof result === 'string' ? result : '';
  const heading = /^#{1,6}\s*(?:\[[^\]]+\]\s*)?(?:youtube\s+)?description\b[^\n]*$/im.exec(text);
  if (!heading) return String(fallback || '').trim().slice(0, 5000);
  const remainder = text.slice(heading.index + heading[0].length);
  const nextHeading = /^#{1,6}\s+[^\n]+$/m.exec(remainder);
  let section = (nextHeading ? remainder.slice(0, nextHeading.index) : remainder).trim();
  const separated = section.split(/\r?\n\s*---+\s*\r?\n/);
  if (separated.length >= 3) section = separated[1].trim();
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


export function isPrivateVideoTestTask(task) {
  return String(task?.description || '').trimStart().startsWith('[AUTOPOLIS PRIVATE QC TEST]');
}

export function classifyVideoRenderCallback({ task, provider }) {
  const markedPrivate = isPrivateVideoTestTask(task);
  const privateProvider = String(provider || '').trim() === 'private_test';
  if (markedPrivate !== privateProvider) {
    return { mode: 'reject', error: markedPrivate
      ? 'Private QC task is missing private_test render-job provider isolation'
      : 'private_test render job requires the exact private QC task marker' };
  }
  return { mode: markedPrivate ? 'private_test' : 'public' };
}

export function validateRendererQcReport(qcReport, maxUnnarratedSeconds = 3) {
  const report = qcReport && typeof qcReport === 'object' && !Array.isArray(qcReport) ? qcReport : null;
  if (!report) return 'QC report is required';
  const duration = Number(report.duration_seconds);
  const voiceDuration = Number(report.voice_duration_seconds);
  const width = Number(report.width);
  const height = Number(report.height);
  if (!Number.isFinite(duration) || duration <= 0 ||
      !Number.isFinite(voiceDuration) || voiceDuration <= 0 ||
      !Number.isInteger(width) || width <= 0 ||
      !Number.isInteger(height) || height <= 0 ||
      typeof report.video_codec !== 'string' || !report.video_codec.trim() ||
      typeof report.audio_codec !== 'string' || !report.audio_codec.trim()) {
    return 'QC report must include positive duration, narration duration, dimensions, and video/audio codecs';
  }
  if (!Number.isFinite(maxUnnarratedSeconds) || maxUnnarratedSeconds < 0) {
    return 'Narration QC tolerance must be a non-negative number';
  }
  const uncovered = Math.max(0, duration - voiceDuration);
  if (uncovered > maxUnnarratedSeconds) {
    return 'QC failed: narration coverage is too short; ' +
      'video=' + duration.toFixed(2) + 's voice=' + voiceDuration.toFixed(2) +
      's uncovered=' + uncovered.toFixed(2) + 's allowed=' + maxUnnarratedSeconds.toFixed(2) + 's';
  }

  const profile = String(report.resolution_profile || 'source').toLowerCase();
  if (profile !== 'source') {
    const dimensions = {
      '720p': [1280, 720],
      '1080p': [1920, 1080],
      '1440p': [2560, 1440],
    };
    const target = dimensions[profile];
    if (!target) return 'QC report contains an unsupported resolution profile';
    const expected = report.deliverable_type === 'reel' ? [target[1], target[0]] : target;
    if (width < expected[0] || height < expected[1]) {
      return 'QC failed: requested ' + profile + ' profile requires at least ' +
        expected[0] + 'x' + expected[1] + '; got ' + width + 'x' + height;
    }
  }
  return null;
}

export function buildVideoRenderPayload({ task, result, callbackUrl, profile, resolution }) {
  const taskId = Number(task?.id);
  if (!Number.isInteger(taskId) || taskId <= 0) throw new Error('A valid task id is required');
  const type = String(task?.deliverable_type || '').trim().toLowerCase();
  if (!VIDEO_TYPES.has(type)) throw new Error('Task must be a video deliverable');
  const title = extractYoutubeTitle(result, task?.title);
  const script = extractVideoNarration(result);
  if (!title) throw new Error('Video title is required');
  if (!script) throw new Error('Video script is required');
  const requestedResolution = normalizeVideoResolution(
    type, resolution || task?.video_resolution || task?.resolution || 'source',
  );
  const payload = {
    task_id: taskId,
    private_test: isPrivateVideoTestTask(task),
    title: title.slice(0, 100),
    description: extractYoutubeDescription(result, task?.description),
    deliverable_type: type,
    script,
    profile: String(profile || 'cinematic').slice(0, 40),
    resolution: requestedResolution,
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
  resolution,
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

  const payload = buildVideoRenderPayload({
    task, result, callbackUrl,
    profile: profile || env.VIDEO_RENDER_PROFILE,
    resolution: resolution || task?.video_resolution || task?.resolution || env.VIDEO_RENDER_RESOLUTION,
  });
  const response = await fetchImpl(endpoint.toString(), {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      'idempotency-key': 'autopolis-task-' + payload.task_id + '-' + createHash('sha256').update(payload.script + '\\0' + payload.resolution).digest('hex').slice(0, 16),
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
