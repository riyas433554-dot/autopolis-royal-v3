import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('agents').select('*').order('id', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { name, role, department, building_slug } = req.body;
      if (!name || !role) return res.status(400).json({ error: 'name and role required' });
      const code = 'AGT-' + Math.floor(1000 + Math.random() * 9000);
      const { data, error } = await supabase.from('agents').insert({ name, code, role, department: department || 'General', building_slug: building_slug || 'royal-palace-hq', status: 'idle', current_task: 'Awaiting assignment', avatar_color: '#c9a227' }).select().single();
      if (error) throw error;
      // Extension: city event auto-post (graduation / new agent) — never blocks registration
      try {
        await supabase.from('posts').insert({ author_name: 'Autopolis Royal (Official)', author_handle: '@autopolisroyal', content: `🎓 A new agent graduated into city service! Welcome ${data.name} (${data.code}) — ${data.role}, now stationed in the city. Companies can hire from the Agents directory. #CityEvents #Graduation`, image_url: '', hashtags: '#CityEvents #Graduation', likes: 0, shares: 0, is_draft: false });
        await supabase.from('activity').insert({ type: 'event', title: 'New agent registered: ' + data.name, building_slug: data.building_slug, detail: `${data.code} · ${data.role} · ${data.department} · announced on Autopolis Social` });
      } catch (e) { console.error('auto-post failed (non-fatal):', e.message); }
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id, status, current_task } = req.body;
      const patch = {};
      if (status !== undefined) patch.status = status;
      if (current_task !== undefined) patch.current_task = current_task;
      const { data, error } = await supabase.from('agents').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
