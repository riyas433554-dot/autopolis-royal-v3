import supabase from './db-client.js';

// Health/setup check: verifies every table the app needs and reports what is
// missing ("Setup required: run supabase/schema.sql") instead of crashing.
const TABLES = ['buildings', 'agents', 'tasks', 'activity', 'posts', 'comments', 'bookmarks', 'conversations', 'messages', 'notifications', 'profiles', 'scheduled_posts', 'companies', 'company_members', 'outputs', 'reviews', 'awards', 'treasury_txns', 'dispatch_inbox', 'resources', 'connected_accounts', 'client_leads', 'deals'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const tables = {};
  const missing = [];
  for (const t of TABLES) {
    try {
      const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true });
      if (error) throw error;
      tables[t] = { exists: true, rows: count ?? 0 };
    } catch (e) {
      tables[t] = { exists: false, error: String(e.message || e).slice(0, 160) };
      missing.push(t);
    }
  }
  const buildingsOk = tables.buildings?.exists && (tables.buildings.rows || 0) >= 37;
  return res.status(200).json({
    ok: missing.length === 0 && buildingsOk,
    app: 'Autopolis Royal',
    buildings_expected: 37,
    buildings_found: tables.buildings?.rows ?? 0,
    missing_tables: missing,
    tables,
    message: missing.length === 0 && buildingsOk
      ? 'All tables present. City directory complete (37 buildings).'
      : 'Setup required: run supabase/schema.sql in Supabase → SQL Editor (creates missing tables + seeds 37 buildings, companies, roles and Demo-labelled sample tasks). The app degrades gracefully with built-in fallback data until then.',
  });
}
