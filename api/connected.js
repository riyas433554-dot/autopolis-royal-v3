import supabase from './db-client.js';

// Connected accounts (Metricool-style). HONEST BY DESIGN:
// - No OAuth credentials exist in this deployment, so nothing can be "connected".
// - We only report WHICH env vars are present (booleans) — never their values.
// - There is deliberately NO fake connect endpoint. Disconnect only deletes a row
//   that a real OAuth flow would have created (tokens would live server-side only).
const PROVIDERS = [
  { id: 'meta', name: 'Facebook + Instagram (Meta)', env: ['META_APP_ID', 'META_APP_SECRET'], note: 'Instagram needs a Business/Creator account linked to a Facebook Page. In Meta Dev mode only the app owner/tester accounts can connect until App Review passes.' },
  { id: 'youtube', name: 'YouTube (Google)', env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], note: 'Uploads from an unverified YouTube API project are forced private until Google audits the app. (Google SIGN-IN for login is separate and already live.)' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      let accounts = [];
      let tableMissing = false;
      const { data, error } = await supabase.from('connected_accounts').select('*').order('id', { ascending: true });
      if (error) tableMissing = true; else accounts = data || [];
      const providers = PROVIDERS.map(p => {
        const envPresent = Object.fromEntries(p.env.map(k => [k, !!process.env[k]]));
        const ready = Object.values(envPresent).every(Boolean);
        return { ...p, envPresent, oauthReady: ready, accounts: accounts.filter(a => a.provider === p.id), status: accounts.some(a => a.provider === p.id) ? 'connected' : ready ? 'ready_to_connect' : 'setup_required' };
      });
      return res.status(200).json({ providers, accounts, tableMissing, redirectUriNeeded: ['/api/oauth/meta/callback', '/api/oauth/youtube/callback'], message: tableMissing ? 'Setup required: run supabase/schema.sql (connected_accounts table missing).' : 'No provider is connected. Add the listed server env vars + implement the OAuth callbacks to enable real connections.' });
    }
    if (req.method === 'POST') {
      return res.status(501).json({ error: 'OAuth is not configured in this deployment. Set META_APP_ID/META_APP_SECRET and/or GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET as SERVER env vars and implement the provider callbacks first. Nothing was connected.' });
    }
    if (req.method === 'DELETE') {
      const { id } = req.body;
      const { error } = await supabase.from('connected_accounts').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
