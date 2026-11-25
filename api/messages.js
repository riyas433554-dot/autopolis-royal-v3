import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      if (req.query.conversation_id) {
        const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', req.query.conversation_id).order('id', { ascending: true });
        if (error) throw error;
        return res.status(200).json(data);
      }
      const { data, error } = await supabase.from('conversations').select('*').order('id', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { conversation_id, sender_name, content } = req.body;
      if (!conversation_id || !content) return res.status(400).json({ error: 'conversation_id and content required' });
      const { data, error } = await supabase.from('messages').insert({ conversation_id, sender_name: sender_name || 'You', content, is_read: true }).select().single();
      if (error) throw error;
      await supabase.from('conversations').update({ last_message: content }).eq('id', conversation_id);
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { conversation_id } = req.body;
      await supabase.from('conversations').update({ unread: 0 }).eq('id', conversation_id);
      await supabase.from('messages').update({ is_read: true }).eq('conversation_id', conversation_id);
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
