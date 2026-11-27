import supabase from './db-client.js';
import youtubePublishHandler from './youtube-publish.js';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isRenderer(req)) return res.status(401).json({ error: 'Renderer callback token required' });

  const providerJobId = String(req.body?.job_id || '').trim().slice(0, 160);
  if (!providerJobId) return res.status(400).json({ error: 'job_id is required' });
  if (req.body?.qc_passed !== true) {
    return res.status(422).json({ error: 'Renderer callback must confirm qc_passed=true before publication' });
  }

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
      .select('id,title,description,status,deliverable_type').eq('id', job.task_id).maybeSingle();
    if (taskError) throw taskError;
    if (!task || task.status !== 'done') return res.status(409).json({ error: 'Task must be done before render callback' });

    const { data: account, error: accountError } = await supabase.from('connected_accounts')
      .select('account_id,account_name').eq('provider', 'youtube').eq('status', 'connected').limit(1).maybeSingle();
    if (accountError) throw accountError;

    const { error: readyError } = await supabase.from('video_render_jobs').update({
      status: account ? 'publishing' : 'ready',
      video_url: videoUrl,
      qc_passed: true,
      qc_report: req.body?.qc_report && typeof req.body.qc_report === 'object' ? req.body.qc_report : {},
      rendered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error: account ? null : 'QC passed; no connected YouTube account found',
    }).eq('id', job.id);
    if (readyError) throw readyError;
    if (!account) return res.status(200).json({ ok: true, status: 'ready', video_url: videoUrl });

    const ownerToken = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN || '';
    let uploadResult;
    let uploadStatus = 500;
    const uploadRes = {
      status(code) { uploadStatus = code; return this; },
      json(data) { uploadResult = data; return this; },
      setHeader() {},
      end() {},
    };
    await youtubePublishHandler({
      method: 'POST',
      headers: { authorization: 'Bearer ' + ownerToken },
      body: {
        task_id: job.task_id,
        account_id: account.account_id,
        title: task.title,
        description: task.description || '',
        video_url: videoUrl,
        privacy_status: 'public',
      },
    }, uploadRes);

    if (uploadStatus < 200 || uploadStatus >= 300 || uploadResult?.ok !== true) {
      const message = String(uploadResult?.error || 'YouTube publisher did not confirm upload').slice(0, 500);
      await supabase.from('video_render_jobs').update({
        status: 'ready', error: message, updated_at: new Date().toISOString(),
      }).eq('id', job.id);
      return res.status(502).json({ ok: false, status: 'ready', error: message });
    }

    const published = uploadResult.job;
    const { error: publishedError } = await supabase.from('video_render_jobs').update({
      status: 'published',
      provider_video_id: published?.provider_video_id || published?.provider_video_id || null,
      provider_url: published?.provider_url || published?.provider_url || null,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error: null,
    }).eq('id', job.id);
    if (publishedError) throw publishedError;
    return res.status(200).json({ ok: true, status: 'published', video_url: published?.provider_url || null });
  } catch (error) {
    console.error('Video render callback failed:', String(error?.message || error).slice(0, 500));
    return res.status(500).json({ error: 'Could not finalize video render callback' });
  }
}
