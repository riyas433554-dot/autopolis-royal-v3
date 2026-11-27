import supabase from './db-client.js';

function isRenderer(req) {
  const token = process.env.VIDEO_RENDERER_TOKEN;
  return Boolean(token && req.headers?.authorization === 'Bearer ' + token);
}

function validJobId(value) {
  const jobId = String(value || '').trim();
  return /^[a-zA-Z0-9-]{1,160}$/.test(jobId) ? jobId : null;
}

async function ensureBucket(bucket) {
  const { error: getError } = await supabase.storage.getBucket(bucket);
  if (!getError) return;
  const { error: createError } = await supabase.storage.createBucket(bucket, { public: false });
  if (createError && !/already exists|duplicate/i.test(String(createError.message || createError))) {
    throw createError;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isRenderer(req)) return res.status(401).json({ error: 'Renderer token required' });

  const taskId = Number(req.body?.task_id);
  const jobId = validJobId(req.body?.job_id);
  const action = String(req.body?.action || '');
  if (!Number.isSafeInteger(taskId) || taskId <= 0 || !jobId) {
    return res.status(400).json({ error: 'Valid task_id and job_id are required' });
  }
  if (!['upload_url', 'download_url', 'source_download_url'].includes(action)) {
    return res.status(400).json({ error: 'action must be upload_url, download_url, or source_download_url' });
  }
  const sourceTaskId = Number(req.body?.source_task_id);
  if (action === 'source_download_url' && (!Number.isSafeInteger(sourceTaskId) || sourceTaskId <= 0 || sourceTaskId === taskId)) {
    return res.status(400).json({ error: 'source_download_url requires a different valid source_task_id' });
  }

  const bucket = String(process.env.SUPABASE_VIDEO_BUCKET || 'autopolis-media').trim();
  const objectPath = `videos/task-${taskId}/${jobId}.mp4`;
  try {
    await ensureBucket(bucket);
    const storage = supabase.storage.from(bucket);
    if (action === 'source_download_url') {
      const { data: sourceJob, error: sourceError } = await supabase.from('video_render_jobs')
        .select('task_id,renderer_job_id,status,qc_passed')
        .eq('task_id', sourceTaskId).maybeSingle();
      if (sourceError) throw sourceError;
      if (!sourceJob || sourceJob.qc_passed !== true || !['ready', 'publishing', 'published'].includes(sourceJob.status) || !sourceJob.renderer_job_id) {
        return res.status(409).json({ error: 'Source video must have a QC-passed ready or published render' });
      }
      const sourcePath = `videos/task-${sourceTaskId}/${sourceJob.renderer_job_id}.mp4`;
      const { data, error } = await storage.createSignedUrl(sourcePath, 24 * 60 * 60);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Supabase did not return a source download URL');
      return res.status(200).json({ video_url: data.signedUrl, source_task_id: sourceTaskId, path: sourcePath });
    }
    if (action === 'upload_url') {
      const { data, error } = await storage.createSignedUploadUrl(objectPath, { upsert: true });
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Supabase did not return a signed upload URL');
      return res.status(200).json({ signed_url: data.signedUrl, path: objectPath, bucket });
    }
    const { data, error } = await storage.createSignedUrl(objectPath, 7 * 24 * 60 * 60);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Supabase did not return a signed download URL');
    return res.status(200).json({ video_url: data.signedUrl, path: objectPath, bucket });
  } catch (error) {
    console.error('Video render storage URL failed:', String(error?.message || error).slice(0, 400));
    return res.status(500).json({ error: 'Could not create video storage URL' });
  }
}
