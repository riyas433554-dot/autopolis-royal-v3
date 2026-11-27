import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import supabase from './db-client.js';

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

function isOwner(req) {
  const token = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN;
  return Boolean(token && req.headers?.authorization === 'Bearer ' + token);
}

function encryptionKey() {
  const value = process.env.AUTOPOLIS_TOKEN_ENCRYPTION_KEY || '';
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('OAuth token encryption key is not configured');
  return key;
}

function decryptToken(value) {
  if (!value) return null;
  const [version, ivText, tagText, dataText] = String(value).split('.');
  if (version !== 'v1' || !ivText || !tagText || !dataText) throw new Error('Stored OAuth token format is invalid');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64url')), decipher.final()]).toString('utf8');
}

function encryptToken(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

function safeMediaUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('video_url must be a valid HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('video_url must be a credential-free HTTPS URL');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const allowed = new Set([...(supabaseUrl ? [new URL(supabaseUrl).hostname] : []),
    ...(process.env.AUTOPOLIS_MEDIA_HOSTS || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean)]);
  if (!allowed.has(url.hostname.toLowerCase())) throw new Error('video_url host is not on the configured media allowlist');
  return url;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25000), ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.error?.message || body.error_description || 'Google API HTTP ' + response.status).slice(0, 400));
  return body;
}

async function getAccessToken(accountId) {
  const { data, error } = await supabase.rpc('get_oauth_tokens', { p_provider: 'youtube', p_account_id: accountId });
  if (error) throw error;
  const token = Array.isArray(data) ? data[0] : data;
  if (!token) throw new Error('No stored YouTube OAuth token for selected account');
  let accessToken = decryptToken(token.access_token_ciphertext);
  const refreshToken = decryptToken(token.refresh_token_ciphertext);
  if (token.expires_at && Date.parse(token.expires_at) > Date.now() + 60000) return accessToken;
  if (!refreshToken) throw new Error('YouTube token expired and no refresh token is stored; reconnect this account');
  const refreshed = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!refreshed.access_token) throw new Error('Google refresh response did not include an access token');
  accessToken = refreshed.access_token;
  const { error: saveError } = await supabase.rpc('store_oauth_tokens', {
    p_provider: 'youtube', p_account_id: accountId,
    p_access_token_ciphertext: encryptToken(accessToken),
    p_refresh_token_ciphertext: null,
    p_expires_at: new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString(),
    p_scopes: token.scopes || null,
  });
  if (saveError) throw saveError;
  return accessToken;
}

async function uploadJob(job) {
  const mediaUrl = safeMediaUrl(job.video_url);
  const mediaResponse = await fetch(mediaUrl, { redirect: 'manual', signal: AbortSignal.timeout(60000) });
  if (!mediaResponse.ok) throw new Error('Media fetch failed with HTTP ' + mediaResponse.status + (mediaResponse.status >= 300 && mediaResponse.status < 400 ? ' (redirects are blocked)' : ''));
  const declaredLength = Number(mediaResponse.headers.get('content-length') || 0);
  if (declaredLength > MAX_VIDEO_BYTES) throw new Error('Video exceeds 100 MB upload limit');
  const bytes = Buffer.from(await mediaResponse.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_VIDEO_BYTES) throw new Error('Video is empty or exceeds 100 MB upload limit');
  const contentType = mediaResponse.headers.get('content-type') || 'video/mp4';
  if (!contentType.startsWith('video/')) throw new Error('Source media must have a video/* content type');

  const accessToken = await getAccessToken(job.account_id);
  const metadata = {
    snippet: { title: job.title, description: job.description || '', categoryId: '22' },
    status: { privacyStatus: job.privacy_status, selfDeclaredMadeForKids: false },
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=UTF-8' }));
  form.append('video', new Blob([bytes], { type: contentType }), 'autopolis-video.mp4');
  const response = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken },
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id) throw new Error(String(result.error?.message || 'YouTube upload failed with HTTP ' + response.status).slice(0, 500));
  return { videoId: result.id, url: 'https://www.youtube.com/watch?v=' + result.id };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isOwner(req)) return res.status(401).json({ error: 'Owner lifecycle token required' });

  const taskId = Number(req.body?.task_id);
  const accountId = typeof req.body?.account_id === 'string' ? req.body.account_id.trim() : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 100) : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 5000) : '';
  const privacyStatus = ['public', 'unlisted', 'private'].includes(req.body?.privacy_status) ? req.body.privacy_status : 'public';
  if (!Number.isInteger(taskId) || taskId <= 0 || !accountId || !title) {
    return res.status(400).json({ error: 'task_id, exact connected YouTube account_id, and title are required' });
  }

  let videoUrl;
  try { videoUrl = safeMediaUrl(req.body?.video_url); }
  catch (error) { return res.status(400).json({ error: String(error?.message || error) }); }

  try {
    const [{ data: task, error: taskError }, { data: account, error: accountError }] = await Promise.all([
      supabase.from('tasks').select('id,status').eq('id', taskId).maybeSingle(),
      supabase.from('connected_accounts').select('id,account_id,account_name,status').eq('provider', 'youtube').eq('account_id', accountId).maybeSingle(),
    ]);
    if (taskError) throw taskError;
    if (accountError) throw accountError;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== 'done') return res.status(409).json({ error: 'Video task must finish and pass QC before publishing' });
    if (!account || account.status !== 'connected') return res.status(404).json({ error: 'Selected YouTube account is not connected' });

    const { data: existing, error: existingError } = await supabase.from('social_publish_jobs')
      .select('*').eq('task_id', taskId).eq('provider', 'youtube').eq('account_id', accountId).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === 'published') return res.status(200).json({ ok: true, already_published: true, job: existing });
    let job = existing;
    if (!job) {
      const { data, error } = await supabase.from('social_publish_jobs').insert({
        task_id: taskId, provider: 'youtube', account_id: accountId, video_url: videoUrl.toString(),
        title, description, privacy_status: privacyStatus, status: 'queued',
      }).select('*').single();
      if (error) throw error;
      job = data;
    }
    if (!['queued', 'error', 'dispatching'].includes(job.status)) {
      return res.status(409).json({ error: 'This account publish job is already being processed' });
    }
    const { data: uploading, error: updateError } = await supabase.from('social_publish_jobs')
      .update({ status: 'uploading', attempts: Number(job.attempts || 0) + 1, error: null, updated_at: new Date().toISOString() })
      .eq('id', job.id).eq('status', job.status).select('*').maybeSingle();
    if (updateError) throw updateError;
    if (!uploading) return res.status(409).json({ error: 'Another publisher claimed this account job; no duplicate upload started' });
    try {
      const published = await uploadJob(uploading);
      const { data: finalJob, error: finalError } = await supabase.from('social_publish_jobs').update({
        status: 'published', provider_video_id: published.videoId, provider_url: published.url,
        published_at: new Date().toISOString(), updated_at: new Date().toISOString(), error: null,
      }).eq('id', job.id).select('*').single();
      if (finalError) throw finalError;
      return res.status(200).json({ ok: true, job: finalJob, account_name: account.account_name });
    } catch (uploadError) {
      const message = String(uploadError?.message || uploadError).slice(0, 500);
      await supabase.from('social_publish_jobs').update({ status: 'error', error: message, updated_at: new Date().toISOString() }).eq('id', job.id);
      return res.status(502).json({ ok: false, job_id: job.id, error: message });
    }
  } catch (error) {
    console.error('YouTube publish error:', String(error?.message || error).slice(0, 500));
    return res.status(500).json({ error: 'YouTube publish request failed: ' + String(error?.message || error).slice(0, 250) });
  }
}
