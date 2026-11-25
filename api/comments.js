import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      let q = supabase.from('comments').select('*').order('id', { ascending: true });
      if (req.query.post_id) q = q.eq('post_id', req.query.post_id);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { post_id, author_name, content, parent_id } = req.body;
      if (!post_id || !content) return res.status(400).json({ error: 'post_id and content required' });
      const { data, error } = await supabase.from('comments').insert({ post_id, author_name: author_name || 'Guest Citizen', content, parent_id: parent_id || null }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
