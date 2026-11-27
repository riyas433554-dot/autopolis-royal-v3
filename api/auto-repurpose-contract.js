const REEL_TARGETS = new Set(['instagram_reels','facebook_reels']);
const SHORT_TYPES = new Set(['reel','short','clip','casual_ai']);

export function needsAutoRepurpose(task, targets) {
  const mode = String(task?.content_mode || 'auto').toLowerCase();
  const type = String(task?.deliverable_type || '').toLowerCase();
  const longForm = mode === 'long_form' || (mode === 'auto' && !SHORT_TYPES.has(type));
  return longForm && mode !== 'repurpose' && Array.isArray(targets) && targets.some(target => REEL_TARGETS.has(target));
}

export function buildAutoRepurposeTask(task, targets, now = new Date().toISOString()) {
  const reelTargets = [...new Set((Array.isArray(targets) ? targets : []).filter(target => REEL_TARGETS.has(target)))];
  if (!Number.isSafeInteger(Number(task?.id)) || Number(task.id) <= 0 || !reelTargets.length) {
    throw new Error('Auto repurpose requires a valid source task and at least one Reel destination');
  }
  const title = ('Best scenes · ' + String(task.title || 'Video')).slice(0, 100);
  const description = [
    'AUTOMATIC CONTENT STUDIO DERIVATIVE',
    'Source video task: #' + task.id,
    'Select up to three strongest hook / reveal / funny / surprising moments from the QC-passed source video.',
    'Create a vertical 9:16 highlight compilation with clean cuts, readable burned captions when transcription succeeds, normalized audio, and no invented scenes.',
    'Publish the derivative only to these selected destinations: ' + reelTargets.join(', '),
    'Source title: ' + String(task.title || ''),
    'Source brief: ' + String(task.description || '').slice(0, 7000),
  ].join('\n\n');
  return {
    title,
    description,
    building_slug: task.building_slug || 'operations-tower',
    agent_name: 'Content Studio Auto Editor',
    priority: 'high',
    company_id: task.company_id || null,
    assigned_agent_id: null,
    deliverable_type: 'clip',
    content_mode: 'repurpose',
    content_category: task.content_category || 'general',
    platform_targets: reelTargets,
    source_video_task_id: Number(task.id),
    auto_repurpose: true,
    status: 'done',
    progress: 100,
    result: 'Content Studio: automatically select and assemble the best scenes from source task #' + task.id + '.',
    completed_at: now,
  };
}
