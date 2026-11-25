import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('company_members').select('*').order('id', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { company_id, agent_id, agent_name } = req.body;
      if (!company_id || !agent_name) return res.status(400).json({ error: 'company_id and agent_name required' });
      const { data: dup } = await supabase.from('company_members').select('id').eq('company_id', company_id).eq('agent_name', agent_name);
      if (dup && dup.length) return res.status(400).json({ error: agent_name + ' is already on this company roster.' });
      const { data, error } = await supabase.from('company_members').insert({ company_id, agent_id: agent_id || null, agent_name, is_active: false }).select().single();
      if (error) throw error;
      const { data: comp } = await supabase.from('companies').select('*').eq('id', company_id).single();
      if (comp) {
        await supabase.from('posts').insert({ author_name: 'Autopolis Royal (Official)', author_handle: '@autopolisroyal', content: `🤝 New hire in the city! ${agent_name} just joined ${comp.name}. Welcome aboard! #CityEvents #NewHire`, image_url: '', hashtags: '#CityEvents #NewHire', likes: 0, shares: 0, is_draft: false });
        await supabase.from('activity').insert({ type: 'event', title: `New hire: ${agent_name} joined ${comp.name}`, building_slug: comp.building_slug, detail: 'Added to company roster (activate to start work — max 2 active agents per company).' });
      }
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id, is_active } = req.body;
      const { data: member, error: e1 } = await supabase.from('company_members').select('*').eq('id', id).single();
      if (e1) throw e1;
      if (is_active === true && !member.is_active) {
        const { data: actives } = await supabase.from('company_members').select('id').eq('company_id', member.company_id).eq('is_active', true);
        if (actives && actives.length >= 2) return res.status(400).json({ error: 'City limit reached: this company already has 2 active agents. Deactivate one agent before activating another.' });
      }
      const { data, error } = await supabase.from('company_members').update({ is_active }).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body;
      const { error } = await supabase.from('company_members').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
