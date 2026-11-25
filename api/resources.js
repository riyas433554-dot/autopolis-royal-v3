import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('resources').select('*').order('id', { ascending: false }).limit(120);
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { title, url, type, tags, added_by } = req.body;
      if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
      const { data, error } = await supabase.from('resources').insert({ title: title.trim(), url: url || '', type: type || 'reference', tags: tags || '', added_by: added_by || 'Owner' }).select().single();
      if (error) throw error;
      await supabase.from('activity').insert({ type: 'event', title: 'Owner added a resource: ' + data.title, building_slug: 'grand-library', detail: `${data.type} · ${data.tags || 'no tags'} · Store 1 of the Resource Library` });
      return res.status(201).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body;
      const { error } = await supabase.from('resources').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
