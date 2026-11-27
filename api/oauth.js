import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import supabase from './db-client.js';

const PUBLIC_URL = (process.env.AUTOPOLIS_PUBLIC_URL || 'https://autopolis-royal-v3.onrender.com').replace(/\/$/, '');

function callbackUri(provider) {
  return PUBLIC_URL + '/api/oauth/' + provider + '/callback';
}

function redirect(res, params) {
  const url = new URL('/connected', PUBLIC_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  res.status(302);
  res.setHeader('Location', url.toString());
  return res.end();
}

function getEncryptionKey() {
  const value = process.env.AUTOPOLIS_TOKEN_ENCRYPTION_KEY || '';
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('AUTOPOLIS_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 or 64-char hex)');
  return key;
}

function encryptToken(value) {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

async function fetchJson(url, options) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25000), ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || data?.error_description || 'OAuth provider returned HTTP ' + response.status;
    throw new Error(String(message).slice(0, 400));
  }
  return data || {};
}

async function saveAccount({ provider, accountId, accountName, avatarUrl, accessToken, refreshToken, expiresAt, scopes }) {
  if (!accountId || !accessToken) throw new Error('OAuth provider returned an incomplete account');
  const { error: tokenError } = await supabase.rpc('store_oauth_tokens', {
    p_provider: provider,
    p_account_id: String(accountId),
    p_access_token_ciphertext: encryptToken(accessToken),
    p_refresh_token_ciphertext: encryptToken(refreshToken),
    p_expires_at: expiresAt || null,
    p_scopes: scopes || null,
  });
  if (tokenError) throw tokenError;
  const { error } = await supabase.from('connected_accounts').upsert({
    provider,
    account_name: String(accountName || provider + ' account').slice(0, 200),
    account_id: String(accountId),
    avatar_url: avatarUrl || '',
    status: 'connected',
    last_sync: new Date().toISOString(),
  }, { onConflict: 'provider,account_id' });
  if (error) throw error;
}

async function metaAccounts(code) {
  const version = process.env.META_API_VERSION || 'v24.0';
  const redirectUri = callbackUri('meta');
  const shortUrl = new URL('https://graph.facebook.com/' + version + '/oauth/access_token');
  shortUrl.search = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri: redirectUri,
    code,
  }).toString();
  const shortToken = await fetchJson(shortUrl);
  const longUrl = new URL('https://graph.facebook.com/' + version + '/oauth/access_token');
  longUrl.search = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    fb_exchange_token: shortToken.access_token,
  }).toString();
  const longToken = await fetchJson(longUrl);
  const accessToken = longToken.access_token || shortToken.access_token;
  if (!accessToken) throw new Error('Meta did not return an access token');
  const expiresAt = new Date(Date.now() + Number(longToken.expires_in || shortToken.expires_in || 3600) * 1000).toISOString();
  const meUrl = new URL('https://graph.facebook.com/' + version + '/me');
  meUrl.search = new URLSearchParams({ fields: 'id,name', access_token: accessToken }).toString();
  const me = await fetchJson(meUrl);
  const pagesUrl = new URL('https://graph.facebook.com/' + version + '/me/accounts');
  pagesUrl.search = new URLSearchParams({
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    limit: '100',
    access_token: accessToken,
  }).toString();
  let pageResponse = await fetchJson(pagesUrl);
  const pages = [];
  while (pageResponse && pages.length < 500) {
    for (const item of pageResponse.data || []) {
      pages.push(item);
      if (pages.length >= 500) break;
    }
    const nextPage = pageResponse.paging?.next;
    pageResponse = nextPage && pages.length < 500 ? await fetchJson(nextPage) : null;
  }
  let saved = 0;
  for (const page of pages) {
    const pageToken = page.access_token || accessToken;
    await saveAccount({
      provider: 'meta', accountId: page.id, accountName: page.name,
      accessToken: pageToken, expiresAt, scopes: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management',
    });
    saved++;
    const instagram = page.instagram_business_account;
    if (instagram?.id) {
      await saveAccount({
        provider: 'meta', accountId: 'ig:' + instagram.id, accountName: '@' + (instagram.username || instagram.id),
        accessToken: pageToken, expiresAt, scopes: 'instagram_basic,instagram_content_publish',
      });
      saved++;
    }
  }
  if (!saved) {
    await saveAccount({
      provider: 'meta', accountId: me.id, accountName: me.name || 'Facebook account',
      accessToken, expiresAt, scopes: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management',
    });
    saved = 1;
  }
  return saved;
}

async function youtubeAccounts(code) {
  const tokenResponse = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUri('youtube'),
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenResponse.access_token) throw new Error('Google did not return an access token');
  const channelResponse = await fetchJson('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: 'Bearer ' + tokenResponse.access_token },
  });
  const channels = channelResponse.items || [];
  if (!channels.length) throw new Error('No YouTube channel was returned for this Google account');
  const expiresAt = new Date(Date.now() + Number(tokenResponse.expires_in || 3600) * 1000).toISOString();
  for (const channel of channels) {
    const snippet = channel.snippet || {};
    const thumbnails = snippet.thumbnails || {};
    const avatar = thumbnails.high?.url || thumbnails.default?.url || thumbnails.medium?.url || '';
    await saveAccount({
      provider: 'youtube',
      accountId: channel.id,
      accountName: snippet.title || channel.id,
      avatarUrl: avatar,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || null,
      expiresAt,
      scopes: tokenResponse.scope || 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    });
  }
  return channels.length;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'OAuth callback must be GET' });
  const match = String(req.url || '').match(/^\/api\/oauth\/(meta|youtube)\/callback$/);
  if (!match) return res.status(404).json({ error: 'OAuth callback route not found' });
  const provider = match[1];
  const query = req.query || {};
  if (query.error) return redirect(res, { oauth_status: 'error', provider, oauth_message: String(query.error_description || query.error).slice(0, 180) });
  const state = typeof query.state === 'string' ? query.state : '';
  const code = typeof query.code === 'string' ? query.code : '';
  if (!state || !code) return redirect(res, { oauth_status: 'error', provider, oauth_message: 'Missing OAuth state or code.' });

  try {
    const stateHash = createHash('sha256').update(state).digest('hex');
    const { data: consumed, error: stateError } = await supabase.rpc('consume_oauth_state', {
      p_provider: provider,
      p_state_hash: stateHash,
    });
    if (stateError) throw stateError;
    if (consumed !== true) return redirect(res, { oauth_status: 'error', provider, oauth_message: 'OAuth state expired or already used. Please connect again.' });
    getEncryptionKey();
    const count = provider === 'meta' ? await metaAccounts(code) : await youtubeAccounts(code);
    return redirect(res, { oauth_status: 'success', provider, connected: count });
  } catch (error) {
    console.error('OAuth callback failed for ' + provider + ':', String(error?.message || error).slice(0, 500));
    return redirect(res, { oauth_status: 'error', provider, oauth_message: 'OAuth failed. Check provider setup and Render logs, then reconnect.' });
  }
}
