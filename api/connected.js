import { createHash, randomBytes } from 'node:crypto';
import supabase from './db-client.js';

const PUBLIC_URL = (process.env.AUTOPOLIS_PUBLIC_URL || 'https://autopolis-royal-v3.onrender.com').replace(/\/$/, '');
const PROVIDERS = [
  {
    id: 'meta',
    name: 'Facebook + Instagram (Meta)',
    env: ['META_APP_ID', 'META_APP_SECRET', 'AUTOPOLIS_TOKEN_ENCRYPTION_KEY'],
    note: 'Instagram needs a Business/Creator account linked to a Facebook Page. Meta Dev mode only allows app owner/tester accounts until App Review passes.',
  },
  {
    id: 'youtube',
    name: 'YouTube (Google)',
    env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AUTOPOLIS_TOKEN_ENCRYPTION_KEY'],
    note: 'Uploads from an unverified YouTube API project may be restricted to private until Google verifies the app. Google Sign-In for login is separate.',
  },
];

function isOwner(req) {
  const token = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN;
  return Boolean(token && req.headers?.authorization === 'Bearer ' + token);
}

function encryptionKeyIsValid(value) {
  if (!value) return false;
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  return key.length === 32;
}

function providerConfig(provider) {
  return PROVIDERS.find(item => item.id === provider);
}

function callbackUri(provider) {
  return PUBLIC_URL + '/api/oauth/' + provider + '/callback';
}

function createAuthUrl(provider, state) {
  const config = providerConfig(provider);
  const redirectUri = callbackUri(provider);
  if (provider === 'meta') {
    const url = new URL('https://www.facebook.com/' + (process.env.META_API_VERSION || 'v24.0') + '/dialog/oauth');
    url.search = new URLSearchParams({
      client_id: process.env.META_APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management',
    }).toString();
    return url.toString();
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  }).toString();
  return url.toString();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('connected_accounts')
        .select('id,provider,account_name,account_id,avatar_url,status,last_sync,created_at')
        .order('id', { ascending: true });
      const tableMissing = !!error;
      const accounts = data || [];
      const providers = PROVIDERS.map(p => {
        const envPresent = Object.fromEntries(p.env.map(key => [key, key === 'AUTOPOLIS_TOKEN_ENCRYPTION_KEY' ? encryptionKeyIsValid(process.env[key]) : !!process.env[key]]));
        const ready = Object.values(envPresent).every(Boolean);
        const providerAccounts = accounts.filter(account => account.provider === p.id);
        return {
          id: p.id,
          name: p.name,
          env: p.env,
          envPresent,
          note: p.note,
          oauthReady: ready,
          accounts: providerAccounts,
          status: providerAccounts.length ? 'connected' : ready ? 'ready_to_connect' : 'setup_required',
          redirectUri: callbackUri(p.id),
        };
      });
      return res.status(200).json({
        providers,
        accounts,
        tableMissing,
        redirectUriNeeded: providers.map(provider => provider.redirectUri),
        message: tableMissing ? 'Connected account storage is unavailable.' : 'OAuth connects real provider accounts; tokens are encrypted and stored in a private server-only schema.',
      });
    }

    if (req.method === 'POST') {
      if (!isOwner(req)) return res.status(401).json({ error: 'Owner lifecycle token required to connect an account.' });
      const provider = typeof req.body?.provider === 'string' ? req.body.provider : '';
      const config = providerConfig(provider);
      if (!config) return res.status(400).json({ error: 'Unsupported provider. Use meta or youtube.' });
      const missing = config.env.filter(key => key === 'AUTOPOLIS_TOKEN_ENCRYPTION_KEY' ? !encryptionKeyIsValid(process.env[key]) : !process.env[key]);
      if (missing.length) return res.status(503).json({ error: 'Missing or invalid server environment variables: ' + missing.join(', ') });
      const state = randomBytes(32).toString('hex');
      const stateHash = createHash('sha256').update(state).digest('hex');
      const { error } = await supabase.rpc('create_oauth_state', {
        p_provider: provider,
        p_state_hash: stateHash,
        p_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      return res.status(200).json({ provider, redirectUri: callbackUri(provider), authUrl: createAuthUrl(provider, state) });
    }

    if (req.method === 'DELETE') {
      if (!isOwner(req)) return res.status(401).json({ error: 'Owner lifecycle token required to disconnect an account.' });
      const id = Number(req.body?.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Valid account id required' });
      const { data: account, error: accountError } = await supabase.from('connected_accounts')
        .select('id,provider,account_id').eq('id', id).maybeSingle();
      if (accountError) throw accountError;
      if (!account) return res.status(404).json({ error: 'Connected account not found' });
      const { error: tokenError } = await supabase.rpc('delete_oauth_tokens', {
        p_provider: account.provider,
        p_account_id: account.account_id,
      });
      if (tokenError) throw tokenError;
      const { error } = await supabase.from('connected_accounts').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Connected accounts API error:', err);
    return res.status(500).json({ error: 'Connected accounts request failed' });
  }
}
