import supabase from './db-client.js';
import { dispatchVideoRender } from './video-renderer.js';

function isOwner(req) {
  const token = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN;
  return Boolean(token && req.headers?.authorization === 'Bearer ' + token);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isOwner(req)) return res.status(401).json({ error: 'Owner token required' });

  const taskId = Number(req.body?.task_id);
  if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: 'Valid task_id is required' });
  if (!process.env.VIDEO_RENDERER_URL || !process.env.VIDEO_RENDERER_TOKEN || !process.env.AUTOPOLIS_PUBLIC_URL) {
    return res.status(503).json({ error: 'External video renderer is not configured' });
  }

  let renderRowId = null;
  try {
    const { data: task, error: taskError } = await supabase.from('tasks')
      .select('id,title,description,status,deliverable_type,result').eq('id', taskId).maybeSingle();
    if (taskError) throw taskError;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== 'done') return res.status(409).json({ error: 'Task must be done before video render retry' });
    if (!['video', 'reel', 'anime', 'movie'].includes(String(task.deliverable_type || '').toLowerCase())) {
      return res.status(409).json({ error: 'Task is not a video deliverable' });
    }
    const script = typeof task.result === 'string' ? task.result : JSON.stringify(task.result || '');
    if (!script.trim()) return res.status(409).json({ error: 'Task has no saved script/output to render' });

    const { data: existing, error: existingError } = await supabase.from('video_render_jobs')
      .select('*').eq('task_id', taskId).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === 'published') {
      return res.status(200).json({ ok: true, status: 'published', video_url: existing.provider_url });
    }
    if (existing?.status === 'publishing') {
      return res.status(202).json({ ok: true, status: 'publishing', message: 'YouTube upload is already in progress' });
    }

    let row = existing;
    if (!row) {
      const { data: inserted, error: insertError } = await supabase.from('video_render_jobs')
        .insert({ task_id: taskId, provider: 'external', status: 'submitting' }).select('*').single();
      if (insertError) throw insertError;
      row = inserted;
      renderRowId = row.id;
    } else {
      renderRowId = row.id;
      const { error: resetError } = await supabase.from('video_render_jobs').update({
        status: 'submitting', error: null, updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      if (resetError) throw resetError;
    }

    const callbackUrl = new URL('/api/video-render-callback', process.env.AUTOPOLIS_PUBLIC_URL).toString();
    const dispatched = await dispatchVideoRender({ task, result: script, callbackUrl });
    const update = {
      renderer_job_id: dispatched.job_id,
      provider: dispatched.provider,
      updated_at: new Date().toISOString(),
    };
    if (dispatched.status !== 'done') {
      update.status = 'submitted';
      update.submitted_at = new Date().toISOString();
    }
    const { error: updateError } = await supabase.from('video_render_jobs').update(update).eq('id', row.id);
    if (updateError) throw updateError;
    const { data: latest, error: latestError } = await supabase.from('video_render_jobs')
      .select('status,provider_url').eq('id', row.id).maybeSingle();
    if (latestError) throw latestError;
    return res.status(202).json({
      ok: true,
      status: latest?.status || dispatched.status,
      job_id: dispatched.job_id,
      video_url: latest?.provider_url || null,
    });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 500);
    if (renderRowId) {
      await supabase.from('video_render_jobs').update({
        status: 'failed', error: message, updated_at: new Date().toISOString(),
      }).eq('id', renderRowId);
    }
    console.error('Video render retry failed:', message);
    return res.status(500).json({ error: 'Could not retry video render job' });
  }
}
