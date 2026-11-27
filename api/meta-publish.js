import { createDecipheriv, createCipheriv, randomBytes } from 'node:crypto';
import supabase from './db-client.js';

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const GRAPH_VERSION = process.env.META_API_VERSION || 'v24.0';

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

async function graphJson(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const message = body.error?.message || 'Meta Graph API HTTP ' + response.status;
    const error = new Error(String(message).slice(0, 450));
    error.status = response.status;
    throw error;
  }
  return body;
}

async function getMetaToken(accountId) {
  const { data, error } = await supabase.rpc('get_oauth_tokens', { p_provider: 'meta', p_account_id: accountId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('No encrypted Meta OAuth token for this connected account');
  let token = decryptToken(row.access_token_ciphertext);
  if (row.expires_at && Date.parse(row.expires_at) > Date.now() + 5 * 60 * 1000) return token;
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID || '',
    client_secret: process.env.META_APP_SECRET || '',
    fb_exchange_token: token,
  });
  const refreshed = await graphJson(new URL('https://graph.facebook.com/' + GRAPH_VERSION + '/oauth/access_token?' + params));
  if (!refreshed.access_token) throw new Error('Meta token refresh did not return an access token');
  token = refreshed.access_token;
  const { error: saveError } = await supabase.rpc('store_oauth_tokens', {
    p_provider: 'meta', p_account_id: accountId,
    p_access_token_ciphertext: encryptToken(token),
    p_refresh_token_ciphertext: null,
    p_expires_at: new Date(Date.now() + Number(refreshed.expires_in || 5184000) * 1000).toISOString(),
    p_scopes: row.scopes || null,
  });
  if (saveError) throw saveError;
  return token;
}

async function fetchVideo(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('video_url must be a valid HTTPS URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('video_url must be credential-free HTTPS');
  const allowed = new Set([
    ...(process.env.NEXT_PUBLIC_SUPABASE_URL ? [new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname] : []),
    ...(process.env.AUTOPOLIS_MEDIA_HOSTS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean),
  ]);
  if (!allowed.has(parsed.hostname.toLowerCase())) throw new Error('video_url host is not on the configured media allowlist');
  const response = await fetch(parsed, { redirect: 'manual', signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error('Media download failed with HTTP ' + response.status);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_VIDEO_BYTES) throw new Error('Video exceeds 100 MB Meta upload limit');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_VIDEO_BYTES) throw new Error('Video is empty or exceeds 100 MB Meta upload limit');
  return bytes;
}

async function publishFacebookReel(job, pageId, token, bytes) {
  const startUrl = new URL('https://graph.facebook.com/' + GRAPH_VERSION + '/' + encodeURIComponent(pageId) + '/video_reels');
  startUrl.searchParams.set('upload_phase', 'start');
  startUrl.searchParams.set('access_token', token);
  const started = await graphJson(startUrl, { method: 'POST' });
  const videoId = started.video_id;
  if (!videoId) throw new Error('Meta did not return a Facebook Reel video_id');
  const uploadUrl = started.upload_url || 'https://rupload.facebook.com/video-upload/' + GRAPH_VERSION + '/' + encodeURIComponent(videoId);
  const uploaded = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: 'OAuth ' + token,
      offset: '0',
      file_size: String(bytes.length),
      'Content-Type': 'application/octet-stream',
    },
    body: bytes,
    signal: AbortSignal.timeout(180000),
  });
  const uploadBody = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok || uploadBody.success === false) throw new Error('Facebook Reel upload failed with HTTP ' + uploaded.status);
  const finishUrl = new URL('https://graph.facebook.com/' + GRAPH_VERSION + '/' + encodeURIComponent(pageId) + '/video_reels');
  finishUrl.search = new URLSearchParams({
    upload_phase: 'finish', video_id: videoId, video_state: 'PUBLISHED',
    description: String(job.platform_payload?.caption || job.description || job.title).slice(0, 2200),
    access_token: token,
  }).toString();
  const finished = await graphJson(finishUrl, { method: 'POST' });
  if (finished.success !== true) throw new Error('Facebook did not confirm Reel publication');
  return { id: videoId, url: 'https://www.facebook.com/reel/' + videoId };
}

async function publishInstagramReel(job, instagramId, token) {
  const caption = String(job.platform_payload?.caption || job.description || job.title).slice(0, 2200);
  const createUrl = new URL('https://graph.facebook.com/' + GRAPH_VERSION + '/' + encodeURIComponent(instagramId) + '/media');
  createUrl.search = new URLSearchParams({
    media_type: 'REELS',
    video_url: job.video_url,
    caption,
    share_to_feed: 'true',
    access_token: token,
  }).toString();
  const created = await graphJson(createUrl, { method: 'POST' });
  if (!created.id) throw new Error('Instagram did not return a Reel media container id');
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const statusUrl = new URL('https://graph.facebook.com/' + GRAPH_VERSION + '/' + encodeURIComponent(created.id));
    statusUrl.search = new URLSearchParams({ fields: 'status_code', access_token: token }).toString();
    const status = await graphJson(statusUrl);
    if (status.status_code === 'FINISHED') break;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error('Instagram Reel processing failed: ' + status.status_code);
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (Date.now() >= deadline) throw new Error('Instagram Reel processing timed out');
  const publishUrl = new URL('https://graph.facebook.com/' + GRAPH_VERSION + '/' + encodeURIComponent(instagramId) + '/media_publish');
  publishUrl.search = new URLSearchParams({ creation_id: created.id, access_token: token }).toString();
  const published = await graphJson(publishUrl, { method: 'POST' });
  if (!published.id) throw new Error('Instagram did not confirm Reel publication');
  const permalinkUrl = new URL('https://graph.facebook.com/' + GRAPH_VERSION + '/' + encodeURIComponent(published.id));
  permalinkUrl.search = new URLSearchParams({ fields: 'permalink', access_token: token }).toString();
  const details = await graphJson(permalinkUrl).catch(() => ({}));
  return { id: published.id, url: details.permalink || 'https://www.instagram.com/reel/' + published.id + '/' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isOwner(req)) return res.status(401).json({ error: 'Owner lifecycle token required' });

  const jobId = Number(req.body?.job_id);
  if (!Number.isSafeInteger(jobId) || jobId <= 0) return res.status(400).json({ error: 'Valid social publish job_id required' });
  try {
    const { data: job, error } = await supabase.from('social_publish_jobs').select('*').eq('id', jobId).maybeSingle();
    if (error) throw error;
    if (!job) return res.status(404).json({ error: 'Publish job not found' });
    if (!['dispatching', 'queued', 'error'].includes(job.status)) return res.status(409).json({ error: 'Publish job is already in progress or finished' });
    const { data: uploading, error: claimError } = await supabase.from('social_publish_jobs')
      .update({ status: 'uploading', attempts: Number(job.attempts || 0) + 1, last_attempt_at: new Date().toISOString(), dispatch_lease_expires_at: null, error: null, updated_at: new Date().toISOString() })
      .eq('id', job.id).eq('status', job.status).select('*').maybeSingle();
    if (claimError) throw claimError;
    if (!uploading) return res.status(409).json({ error: 'Another publisher claimed this account job; duplicate upload prevented' });

    try {
      const accountId = uploading.account_id;
      const instagram = uploading.provider === 'instagram';
      if (!instagram && uploading.provider !== 'facebook') throw new Error('Unsupported Meta destination provider');
      const token = await getMetaToken(accountId);
      const bytes = instagram ? null : await fetchVideo(uploading.video_url);
      const published = instagram
        ? await publishInstagramReel(uploading, accountId.replace(/^ig:/, ''), token)
        : await publishFacebookReel(uploading, accountId, token, bytes);
      const { data: finalJob, error: finalError } = await supabase.from('social_publish_jobs').update({
        status: 'published', provider_video_id: published.id, provider_url: published.url,
        published_at: new Date().toISOString(), updated_at: new Date().toISOString(), error: null,
      }).eq('id', job.id).select('*').single();
      if (finalError) throw finalError;
      return res.status(200).json({ ok: true, job: finalJob });
    } catch (publishError) {
      const message = String(publishError?.message || publishError).slice(0, 500);
      await supabase.from('social_publish_jobs').update({ status: 'error', error: message, dispatch_lease_expires_at: null, updated_at: new Date().toISOString() }).eq('id', job.id);
      return res.status(502).json({ ok: false, job_id: job.id, error: message });
    }
  } catch (outerError) {
    console.error('Meta publish error:', String(outerError?.message || outerError).slice(0, 500));
    return res.status(500).json({ error: 'Meta publish request failed' });
  }
}
