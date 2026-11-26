import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      let q = supabase.from('reviews').select('*').order('id', { ascending: false }).limit(200);
      if (req.query.output_id) q = q.eq('output_id', req.query.output_id);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { output_id, reviewer_name, stars, comment } = req.body;
      const s = Number(stars);
      const id = Number(output_id);
      if (!Number.isInteger(id) || id <= 0 || !s || s < 1 || s > 5) return res.status(400).json({ error: 'output_id and stars (1–5) required' });
      const { data: out, error: outputError } = await supabase.from('outputs').select('status').eq('id', id).maybeSingle();
      if (outputError) throw outputError;
      if (!out) return res.status(404).json({ error: 'Output not found' });
      if (out.status === 'draft') return res.status(409).json({ error: 'Draft content is private until the owner submits it to the Library' });
      const { data, error } = await supabase.from('reviews').insert({ output_id: id, reviewer_name: reviewer_name || 'Guest Citizen', stars: s, comment: comment || '' }).select().single();
      if (error) throw error;
      if (out.status === 'in_library') await supabase.from('outputs').update({ status: 'reviewed' }).eq('id', id);
      return res.status(201).json(data);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
