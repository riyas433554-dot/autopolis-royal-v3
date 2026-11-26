import supabase from './db-client.js';

// Health/setup check includes the additive ECC lifecycle and execution migrations.
const TABLES = [
  'buildings', 'agents', 'tasks', 'activity', 'posts', 'comments', 'bookmarks',
  'conversations', 'messages', 'notifications', 'profiles', 'scheduled_posts',
  'companies', 'company_members', 'outputs', 'reviews', 'awards', 'treasury_txns',
  'dispatch_inbox', 'resources', 'connected_accounts', 'client_leads', 'deals',
  'agent_lifecycle_profiles', 'agent_training_cycles', 'agent_lifecycle_events', 'agent_runs',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const tables = {};
  const missing = [];
  for (const table of TABLES) {
    try {
      const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
      if (error) throw error;
      tables[table] = { exists: true, rows: count ?? 0 };
    } catch (error) {
      tables[table] = { exists: false, error: String(error.message || error).slice(0, 160) };
      missing.push(table);
    }
  }

  const buildingsOk = tables.buildings?.exists && (tables.buildings.rows || 0) >= 37;
  const ok = missing.length === 0 && buildingsOk;
  return res.status(200).json({
    ok,
    app: 'Autopolis Royal',
    buildings_expected: 37,
    buildings_found: tables.buildings?.rows ?? 0,
    missing_tables: missing,
    tables,
    message: ok
      ? 'All base and ECC lifecycle/execution tables are present. City directory complete (37 buildings).'
      : 'Setup required: run supabase/schema.sql, then timestamped migrations 001–005 in order. The app degrades gracefully until database setup is complete.',
  });
}
