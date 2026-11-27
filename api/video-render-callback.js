import supabase from './db-client.js';
import { dispatchVideoRender } from './video-renderer.js';
import { buildPublishJobs } from './social-publish-contract.js';
import { buildAutoRepurposeTask, needsAutoRepurpose } from './auto-repurpose-contract.js';

function isRenderer(req) {
  const token = process.env.VIDEO_RENDERER_CALLBACK_TOKEN;
  return Boolean(token && req.headers?.authorization === 'Bearer ' + token);
}

function safeMediaUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('video_url must be a valid HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('video_url must be credential-free HTTPS');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hosts = new Set([
    ...(supabaseUrl ? [new URL(supabaseUrl).hostname] : []),
    ...(process.env.AUTOPOLIS_MEDIA_HOSTS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean),
  ]);
  if (!hosts.has(url.hostname.toLowerCase())) throw new Error('video_url host is not on the media allowlist');
  return url.toString();
}

async function ensureAutoRepurpose(task, targets) {
  if (!needsAutoRepurpose(task, targets)) return null;
  const childPayload = buildAutoRepurposeTask(task, targets);
  let child = null;
  const { data: existing, error: findError } = await supabase.from('tasks').select('*')
    .eq('source_video_task_id', task.id).eq('auto_repurpose', true).maybeSingle();
  if (findError) throw findError;
  child = existing;
  if (!child) {
    const { data: inserted, error: insertError } = await supabase.from('tasks').insert(childPayload).select('*').single();
    if (insertError) {
      if (insertError.code !== '23505') throw insertError;
      const { data: raced, error: racedError } = await supabase.from('tasks').select('*')
        .eq('source_video_task_id', task.id).eq('auto_repurpose', true).maybeSingle();
      if (racedError) throw racedError;
      child = raced;
    } else child = inserted;
  }
  if (!child) throw new Error('Could not create or retrieve the automatic highlight task');

  const { data: existingRender, error: renderFindError } = await supabase.from('video_render_jobs')
    .select('id,status,renderer_job_id').eq('task_id', child.id).maybeSingle();
  if (renderFindError) throw renderFindError;
  if (existingRender) return { task_id: child.id, status: existingRender.status, job_id: existingRender.renderer_job_id };

  const publicBase = String(process.env.AUTOPOLIS_PUBLIC_URL || '').trim();
  if (!process.env.VIDEO_RENDERER_URL || !process.env.VIDEO_RENDERER_TOKEN || !publicBase) {
    return { task_id: child.id, status: 'not_configured', error: 'External video renderer is not configured for automatic highlight rendering' };
  }
  const { data: renderRow, error: insertRenderError } = await supabase.from('video_render_jobs')
    .insert({ task_id: child.id, provider: 'external', status: 'submitting' }).select('id').single();
  if (insertRenderError) throw insertRenderError;
  try {
    const callbackUrl = new URL('/api/video-render-callback', publicBase).toString();
    const dispatched = await dispatchVideoRender({ task: child, result: child.result, callbackUrl });
    const { error: updateError } = await supabase.from('video_render_jobs').update({
      renderer_job_id: dispatched.job_id, provider: dispatched.provider, status: 'submitted',
      submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', renderRow.id);
    if (updateError) throw updateError;
    return { task_id: child.id, status: 'submitted', job_id: dispatched.job_id };
  } catch (error) {
    await supabase.from('video_render_jobs').update({
      status: 'failed', error: String(error?.message || error).slice(0, 500), updated_at: new Date().toISOString(),
    }).eq('id', renderRow.id);
    return { task_id: child.id, status: 'failed', error: String(error?.message || error).slice(0, 300) };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isRenderer(req)) return res.status(401).json({ error: 'Renderer callback token required' });
  const providerJobId = String(req.body?.job_id || '').trim().slice(0, 160);
  if (!providerJobId) return res.status(400).json({ error: 'job_id is required' });
  if (req.body?.qc_passed !== true) return res.status(422).json({ error: 'Renderer callback must confirm qc_passed=true before publication' });

  let videoUrl;
  try { videoUrl = safeMediaUrl(req.body?.video_url); }
  catch (error) { return res.status(400).json({ error: error.message }); }

  try {
    const { data: job, error: jobError } = await supabase.from('video_render_jobs')
      .select('*').eq('renderer_job_id', providerJobId).maybeSingle();
    if (jobError) throw jobError;
    if (!job) return res.status(404).json({ error: 'Render job not found' });
    if (job.status === 'published') return res.status(200).json({ ok: true, already_published: true, video_url: job.provider_url });

    const { data: task, error: taskError } = await supabase.from('tasks')
      .select('id,title,description,status,deliverable_type,content_mode,content_category,platform_targets,building_slug,company_id')
      .eq('id', job.task_id).maybeSingle();
    if (taskError) throw taskError;
    if (!task || task.status !== 'done') return res.status(409).json({ error: 'Task must be done before render callback' });
    const targets = Array.isArray(task.platform_targets) && task.platform_targets.length
      ? [...new Set(task.platform_targets)] : ['youtube','facebook'];

    // Mark the source QC-passed before dispatching the derivative worker. The
    // signed source endpoint still checks QC and the render job's source task id.
    const { error: qcUpdateError } = await supabase.from('video_render_jobs').update({
      status: 'ready', video_url: videoUrl, qc_passed: true,
      qc_report: req.body?.qc_report && typeof req.body.qc_report === 'object' ? req.body.qc_report : {},
      rendered_at: job.rendered_at || new Date().toISOString(), updated_at: new Date().toISOString(), error: null,
    }).eq('id', job.id);
    if (qcUpdateError) throw qcUpdateError;

    const autoRepurpose = await ensureAutoRepurpose(task, targets);
    const autoEnabled = needsAutoRepurpose(task, targets);
    const directTargets = autoEnabled ? targets.filter(target => !['youtube_shorts','instagram_reels','facebook_reels'].includes(target)) : targets;
    const needsYoutube = directTargets.includes('youtube') || directTargets.includes('youtube_shorts');
    const needsMeta = directTargets.some(target => ['facebook','facebook_reels','instagram_reels'].includes(target));
    const accountRequests = [];
    if (needsYoutube) accountRequests.push(supabase.from('connected_accounts').select('account_id,account_name').eq('provider','youtube').eq('status','connected'));
    if (needsMeta) accountRequests.push(supabase.from('connected_accounts').select('account_id,account_name').eq('provider','meta').eq('status','connected'));
    const accountResults = await Promise.all(accountRequests);
    for (const result of accountResults) if (result.error) throw result.error;
    let index = 0;
    const youtubeAccounts = needsYoutube ? accountResults[index++].data || [] : [];
    const metaAccounts = needsMeta ? accountResults[index].data || [] : [];
    const accountRows = buildPublishJobs(task, videoUrl, directTargets, youtubeAccounts, metaAccounts);

    let queuedCount = 0;
    if (accountRows.length) {
      const { data, error } = await supabase.from('social_publish_jobs')
        .upsert(accountRows, { onConflict: 'task_id,provider,account_id', ignoreDuplicates: true })
        .select('id');
      if (error) throw error;
      queuedCount = (data || []).length;
    }
    const { data: allJobs, error: allJobsError } = await supabase.from('social_publish_jobs')
      .select('id,status,provider_url,provider_video_id,error').eq('task_id', job.task_id);
    if (allJobsError) throw allJobsError;
    const pending = (allJobs || []).some(item => ['queued','dispatching','uploading'].includes(item.status));
    const allPublished = (allJobs || []).length > 0 && (allJobs || []).every(item => item.status === 'published');
    const status = allPublished ? 'published' : pending ? 'publishing' : 'ready';
    const report = {
      ...(req.body?.qc_report && typeof req.body.qc_report === 'object' ? req.body.qc_report : {}),
      platform_targets: targets, direct_publish_targets: directTargets,
      account_publish_jobs: (allJobs || []).length, queued_account_jobs: queuedCount,
      auto_repurpose: autoRepurpose, publish_policy: 'per-account queue; paced and retried independently',
    };
    const { error: updateError } = await supabase.from('video_render_jobs').update({
      status, video_url: videoUrl, qc_passed: true, qc_report: report,
      rendered_at: job.rendered_at || new Date().toISOString(), updated_at: new Date().toISOString(),
      error: accountRows.length ? null : 'QC passed; no connected accounts matched direct destinations',
      ...(allPublished ? {
        provider_url: (allJobs || []).find(item => item.provider_url)?.provider_url || null,
        provider_video_id: (allJobs || []).find(item => item.provider_video_id)?.provider_video_id || null,
        published_at: new Date().toISOString(),
      } : {}),
    }).eq('id', job.id);
    if (updateError) throw updateError;
    return res.status(200).json({ ok: true, status, account_jobs: (allJobs || []).length, queued_account_jobs: queuedCount, auto_repurpose: autoRepurpose, video_url: videoUrl });
  } catch (error) {
    console.error('Video render callback failed:', String(error?.message || error).slice(0, 500));
    return res.status(500).json({ error: 'Could not finalize video render callback' });
  }
}
