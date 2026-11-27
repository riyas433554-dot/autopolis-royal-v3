import supabase from './db-client.js';

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

function addJob(rows, provider, accountId, task, videoUrl, format) {
  rows.push({
    task_id: task.id, provider, account_id: accountId, video_url: videoUrl,
    title: String(task.title || 'Autopolis video').slice(0, 100),
    description: String(task.description || '').slice(0, 5000),
    privacy_status: 'public', status: 'queued', next_attempt_at: new Date().toISOString(),
    platform_payload: {
      format,
      content_mode: task.content_mode || 'auto',
      content_category: task.content_category || 'general',
      caption: [task.title, task.description].filter(Boolean).join('\n\n').slice(0, 2200),
    },
  });
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
      .select('id,title,description,status,deliverable_type,content_mode,content_category,platform_targets')
      .eq('id', job.task_id).maybeSingle();
    if (taskError) throw taskError;
    if (!task || task.status !== 'done') return res.status(409).json({ error: 'Task must be done before render callback' });

    const targets = Array.isArray(task.platform_targets) && task.platform_targets.length
      ? [...new Set(task.platform_targets)] : ['youtube','facebook'];
    const accountRows = [];
    if (targets.includes('youtube') || targets.includes('youtube_shorts')) {
      const { data, error } = await supabase.from('connected_accounts')
        .select('account_id,account_name').eq('provider','youtube').eq('status','connected');
      if (error) throw error;
      for (const account of data || []) {
        addJob(accountRows, 'youtube', account.account_id, task, videoUrl,
          targets.includes('youtube') ? 'youtube_video' : 'youtube_short');
      }
    }
    if (targets.includes('facebook')) {
      const { data, error } = await supabase.from('connected_accounts')
        .select('account_id,account_name').eq('provider','meta').eq('status','connected');
      if (error) throw error;
      for (const account of (data || []).filter(item => !String(item.account_id).startsWith('ig:'))) {
        addJob(accountRows, 'facebook', account.account_id, task, videoUrl, 'facebook_video');
      }
    }
    if (targets.includes('facebook_reels')) {
      const { data, error } = await supabase.from('connected_accounts')
        .select('account_id,account_name').eq('provider','meta').eq('status','connected');
      if (error) throw error;
      for (const account of (data || []).filter(item => !String(item.account_id).startsWith('ig:'))) {
        addJob(accountRows, 'facebook_reels', account.account_id, task, videoUrl, 'facebook_reel');
      }
    }
    if (targets.includes('instagram_reels')) {
      const { data, error } = await supabase.from('connected_accounts')
        .select('account_id,account_name').eq('provider','meta').eq('status','connected');
      if (error) throw error;
      for (const account of (data || []).filter(item => String(item.account_id).startsWith('ig:'))) {
        addJob(accountRows, 'instagram', account.account_id, task, videoUrl, 'instagram_reel');
      }
    }

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
      platform_targets: targets,
      account_publish_jobs: (allJobs || []).length,
      queued_account_jobs: queuedCount,
      publish_policy: 'per-account queue; paced and retried independently',
    };
    const { error: updateError } = await supabase.from('video_render_jobs').update({
      status, video_url: videoUrl, qc_passed: true, qc_report: report,
      rendered_at: job.rendered_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error: accountRows.length ? null : 'QC passed, but no connected accounts matched the selected destinations',
      ...(allPublished ? {
        provider_url: (allJobs || []).find(item => item.provider_url)?.provider_url || null,
        provider_video_id: (allJobs || []).find(item => item.provider_video_id)?.provider_video_id || null,
        published_at: new Date().toISOString(),
      } : {}),
    }).eq('id', job.id);
    if (updateError) throw updateError;
    return res.status(200).json({ ok: true, status, account_jobs: (allJobs || []).length, queued_account_jobs: queuedCount, video_url: videoUrl });
  } catch (error) {
    console.error('Video render callback failed:', String(error?.message || error).slice(0, 500));
    return res.status(500).json({ error: 'Could not finalize video render callback' });
  }
}
