import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('posts').select('*').order('id', { ascending: false }).limit(100);
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { author_name, author_handle, content, image_url, hashtags, is_draft } = req.body;
      if (!content || !content.trim()) return res.status(400).json({ error: 'content required' });
      const { data, error } = await supabase.from('posts').insert({ author_name: author_name || 'Guest Citizen', author_handle: author_handle || '@guest', content, image_url: image_url || '', hashtags: hashtags || '', is_draft: !!is_draft, likes: 0, shares: 0 }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id, action, content, is_draft } = req.body;
      const { data: cur, error: e1 } = await supabase.from('posts').select('*').eq('id', id).single();
      if (e1) throw e1;
      const patch = {};
      if (action === 'like') patch.likes = (cur.likes || 0) + 1;
      if (action === 'unlike') patch.likes = Math.max(0, (cur.likes || 0) - 1);
      if (action === 'share') patch.shares = (cur.shares || 0) + 1;
      if (content !== undefined) patch.content = content;
      if (is_draft !== undefined) patch.is_draft = is_draft;
      const { data, error } = await supabase.from('posts').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body;
      const { error } = await supabase.from('posts').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
