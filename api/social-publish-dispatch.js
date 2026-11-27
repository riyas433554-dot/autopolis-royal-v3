import supabase from './db-client.js';
import youtubePublishHandler from './youtube-publish.js';
import metaPublishHandler from './meta-publish.js';

function isOwner(req) {
  const token = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN;
  return Boolean(token && req.headers?.authorization === 'Bearer ' + token);
}

function responseCapture() {
  return {
    code: 200, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {}, end() {},
  };
}

async function dispatchOne(job) {
  const response = responseCapture();
  const ownerToken = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN || '';
  if (job.provider === 'youtube') {
    await youtubePublishHandler({
      method: 'POST', headers: { authorization: 'Bearer ' + ownerToken },
      body: {
        task_id: job.task_id, account_id: job.account_id, title: job.title,
        description: job.description || '', video_url: job.video_url,
        privacy_status: job.privacy_status || 'public',
      },
    }, response);
  } else if (job.provider === 'instagram' || job.provider === 'facebook' || job.provider === 'facebook_reels') {
    await metaPublishHandler({
      method: 'POST', headers: { authorization: 'Bearer ' + ownerToken },
      body: { job_id: job.id },
    }, response);
  } else {
    response.code = 400;
    response.body = { error: 'Unsupported social provider' };
  }
  return response;
}

async function reconcileTask(taskId) {
  const { data: jobs, error } = await supabase.from('social_publish_jobs')
    .select('status,provider_url,provider_video_id,error')
    .eq('task_id', taskId);
  if (error || !jobs?.length) return;
  const published = jobs.filter(job => job.status === 'published');
  const pending = jobs.some(job => ['queued','dispatching','uploading'].includes(job.status));
  const allPublished = published.length === jobs.length;
  const renderPatch = {
    status: allPublished ? 'published' : pending ? 'publishing' : 'ready',
    updated_at: new Date().toISOString(),
    error: allPublished ? null : pending ? null : jobs.filter(job => job.status === 'error').map(job => job.error).filter(Boolean).slice(0,3).join(' | ').slice(0,500) || 'Some selected account publish jobs need attention',
  };
  if (published[0]) {
    renderPatch.provider_url = published[0].provider_url;
    renderPatch.provider_video_id = published[0].provider_video_id;
    if (allPublished) renderPatch.published_at = new Date().toISOString();
  }
  await supabase.from('video_render_jobs').update(renderPatch).eq('task_id', taskId);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isOwner(req)) return res.status(401).json({ error: 'Owner lifecycle token required' });

  const batchSize = Math.max(1, Math.min(2, Number.isSafeInteger(Number(req.body?.batch_size)) ? Number(req.body.batch_size) : 1));
  const minInterval = Math.max(60, Math.min(86400, Number(process.env.SOCIAL_ACCOUNT_MIN_INTERVAL_SECONDS || 900)));
  const dailyLimit = Math.max(1, Math.min(50, Number(process.env.SOCIAL_ACCOUNT_DAILY_LIMIT || 6)));
  try {
    const { data: jobs, error } = await supabase.rpc('claim_social_publish_jobs', {
      p_limit: batchSize,
      p_min_interval_seconds: minInterval,
      p_daily_limit: dailyLimit,
    });
    if (error) throw error;
    const results = [];
    for (const job of jobs || []) {
      const response = await dispatchOne(job);
      if (response.code < 200 || response.code >= 300 || response.body?.ok === false) {
        const attempts = Number(job.attempts || 0) + 1;
        const retryable = response.code === 429 || response.code >= 500;
        if (retryable && attempts < 5) {
          const delaySeconds = Math.min(3600, 60 * (2 ** Math.min(5, attempts - 1)));
          await supabase.from('social_publish_jobs').update({
            status: 'queued', attempts, next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
            dispatch_lease_expires_at: null, error: String(response.body?.error || 'Publisher failed').slice(0, 500),
            updated_at: new Date().toISOString(),
          }).eq('id', job.id).eq('status', 'error');
        }
      }
      await reconcileTask(Number(job.task_id));
      results.push({ job_id: job.id, provider: job.provider, http_status: response.code, ok: response.code >= 200 && response.code < 300 && response.body?.ok !== false });
    }
    return res.status(200).json({ ok: true, claimed: (jobs || []).length, processed: results.length, results });
  } catch (error) {
    console.error('Social publish dispatch failed:', String(error?.message || error).slice(0, 400));
    return res.status(500).json({ error: 'Could not dispatch social publish queue' });
  }
}
