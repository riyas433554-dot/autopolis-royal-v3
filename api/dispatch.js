import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('dispatch_inbox').select('*').order('id', { ascending: false }).limit(80);
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { source, title, detail, company_id, building_slug, agent_name } = req.body;
      if (!title || !title.trim()) return res.status(400).json({ error: 'Work title required' });
      const { data, error } = await supabase.from('dispatch_inbox').insert({ source: source || 'owner', title: title.trim(), detail: detail || '', company_id: company_id || null, building_slug: building_slug || 'operations-tower', agent_name: agent_name || '', status: 'new' }).select().single();
      if (error) throw error;
      await supabase.from('activity').insert({ type: 'task', title: 'Work arrived in Dispatch Inbox: ' + data.title, building_slug: data.building_slug, detail: `Source: ${data.source === 'claude_code' ? 'Claude Code / external work order (pasted by owner — no live integration)' : data.source === 'city' ? 'City department (in-city request)' : 'City Owner'} · ${data.detail || 'no details'}` });
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id, action } = req.body;
      const { data: item, error: e1 } = await supabase.from('dispatch_inbox').select('*').eq('id', id).single();
      if (e1) throw e1;
      if (action === 'dispatch') {
        if (item.status === 'dispatched') return res.status(400).json({ error: 'Already dispatched to City Operations.' });
        const { data: task, error: te } = await supabase.from('tasks').insert({ title: item.title, building_slug: item.building_slug, agent_name: item.agent_name || 'Unassigned', status: 'queued', progress: 0, priority: 'medium' }).select().single();
        if (te) throw te;
        const { data, error } = await supabase.from('dispatch_inbox').update({ status: 'dispatched' }).eq('id', id).select().single();
        if (error) throw error;
        await supabase.from('activity').insert({ type: 'task', title: 'Dispatched to Operations: ' + item.title, building_slug: item.building_slug, detail: `Created task #${task.id} in City Operations · agent: ${task.agent_name} · source: ${item.source}` });
        return res.status(200).json({ item: data, task });
      }
      if (action === 'done') {
        const { data, error } = await supabase.from('dispatch_inbox').update({ status: 'done' }).eq('id', id).select().single();
        if (error) throw error;
        return res.status(200).json(data);
      }
      return res.status(400).json({ error: 'Unknown action' });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
