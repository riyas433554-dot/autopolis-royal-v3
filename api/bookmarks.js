import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const email = req.query.user_email || 'guest';
      const { data, error } = await supabase.from('bookmarks').select('*').eq('user_email', email);
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { post_id, user_email } = req.body;
      const { data: existing } = await supabase.from('bookmarks').select('*').eq('post_id', post_id).eq('user_email', user_email || 'guest');
      if (existing && existing.length) {
        await supabase.from('bookmarks').delete().eq('id', existing[0].id);
        return res.status(200).json({ saved: false });
      }
      const { data, error } = await supabase.from('bookmarks').insert({ post_id, user_email: user_email || 'guest' }).select().single();
      if (error) throw error;
      return res.status(201).json({ saved: true, row: data });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
