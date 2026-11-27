const MODES = new Set(['auto', 'long_form', 'short_form', 'repurpose']);
const TARGETS = new Set([
  'youtube', 'youtube_shorts', 'facebook', 'facebook_reels', 'instagram_reels',
]);

const LONG_TARGETS = ['youtube', 'facebook'];
const SHORT_TARGETS = ['youtube_shorts', 'instagram_reels', 'facebook_reels'];

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function defaultMode(deliverableType) {
  const type = String(deliverableType || '').trim().toLowerCase();
  if (['reel', 'short', 'clip', 'casual_ai'].includes(type)) return 'short_form';
  return 'long_form';
}

function cleanCategory(value, deliverableType) {
  const category = String(value || deliverableType || 'general').trim();
  if (!category) return 'general';
  if (category.length > 120) throw new Error('Content category must be 120 characters or fewer');
  return category;
}

function cleanTargets(value, mode) {
  const defaults = mode === 'short_form' || mode === 'repurpose' ? SHORT_TARGETS : LONG_TARGETS;
  if (value === undefined || value === null) return [...defaults];
  if (!Array.isArray(value) || value.length === 0) throw new Error('platform_targets must be a non-empty array');
  const targets = [...new Set(value.map(item => String(item || '').trim().toLowerCase()))];
  for (const target of targets) {
    if (!TARGETS.has(target)) throw new Error('Unsupported platform target: ' + target);
  }
  return targets;
}

function cleanSegments(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) return [];
  const segments = [];
  for (const segment of value) {
    const start = Number(segment?.start_seconds);
    const end = Number(segment?.end_seconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return [];
    const hook = String(segment?.hook || '').trim().slice(0, 240);
    segments.push({ start_seconds: start, end_seconds: end, hook });
  }
  return segments;
}

/**
 * Normalize the shared intent for original long videos, original short videos,
 * and derivative clips. Category is free-form; only delivery destinations are
 * enumerated so the studio is not locked to anime/cartoon/movie genres.
 */
export function normalizeContentSpec({
  task,
  contentMode,
  contentCategory,
  platformTargets,
  sourceTaskId,
  segments,
} = {}) {
  const taskId = positiveInteger(task?.id);
  if (!taskId) throw new Error('A valid task id is required');
  const type = String(task?.deliverable_type || '').trim().toLowerCase();
  const modeValue = contentMode ?? task?.content_mode ?? 'auto';
  const requestedMode = String(modeValue || 'auto').trim().toLowerCase();
  if (!MODES.has(requestedMode)) throw new Error('Unsupported content mode: ' + requestedMode);
  const mode = requestedMode === 'auto' ? defaultMode(type) : requestedMode;
  const category = cleanCategory(contentCategory ?? task?.content_category, type);
  const targets = cleanTargets(platformTargets ?? task?.platform_targets, mode);
  const sourceId = positiveInteger(sourceTaskId ?? task?.source_video_task_id);
  const clipSegments = cleanSegments(segments ?? task?.clip_segments);

  if (mode === 'repurpose' && (!sourceId || clipSegments.length === 0 || sourceId === taskId)) {
    throw new Error('Repurpose mode requires a different source task and at least one valid clip segment');
  }
  if (mode !== 'repurpose' && sourceId) {
    throw new Error('source_video_task_id is only valid for repurpose mode');
  }

  return {
    task_id: taskId,
    content_mode: mode,
    content_category: category,
    platform_targets: targets,
    source_task_id: mode === 'repurpose' ? sourceId : null,
    clip_segments: mode === 'repurpose' ? clipSegments : [],
  };
}

export const CONTENT_MODE_VALUES = [...MODES];
export const PLATFORM_TARGET_VALUES = [...TARGETS];
