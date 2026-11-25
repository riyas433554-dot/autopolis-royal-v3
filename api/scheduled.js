import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('scheduled_posts').select('*').order('id', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { content, platform, scheduled_for, status } = req.body;
      if (!content) return res.status(400).json({ error: 'content required' });
      const { data, error } = await supabase.from('scheduled_posts').insert({ content, platform: platform || 'Autopolis Social', scheduled_for: scheduled_for || '', status: status || 'draft' }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id, status, scheduled_for } = req.body;
      const patch = {};
      if (status !== undefined) patch.status = status;
      if (scheduled_for !== undefined) patch.scheduled_for = scheduled_for;
      const { data, error } = await supabase.from('scheduled_posts').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body;
      const { error } = await supabase.from('scheduled_posts').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
