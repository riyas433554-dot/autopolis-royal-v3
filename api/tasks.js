import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('tasks').select('*').order('id', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const description = typeof body.description === 'string' ? body.description.trim().slice(0, 12000) : '';
      let building_slug = typeof body.building_slug === 'string' ? body.building_slug : '';
      const agent_name = typeof body.agent_name === 'string' ? body.agent_name : '';
      const priority = ['low', 'medium', 'high', 'critical'].includes(body.priority) ? body.priority : 'medium';
      const deliverableTypes = ['app', 'website', 'automation', 'game', 'ad', 'video', 'reel', 'anime', 'movie', 'short', 'long_video', 'series_episode', 'cartoon', 'documentary', 'explainer', 'casual_ai', 'clip', 'proposal', 'report', 'design', 'code', 'other'];
      const deliverable_type = deliverableTypes.includes(body.deliverable_type) ? body.deliverable_type : 'report';
      const contentModes = ['auto', 'long_form', 'short_form', 'repurpose'];
      const content_mode = body.content_mode === undefined ? 'auto' : body.content_mode;
      if (!contentModes.includes(content_mode)) return res.status(400).json({ error: 'content_mode must be auto, long_form, short_form, or repurpose' });
      const content_category = typeof body.content_category === 'string' ? body.content_category.trim().slice(0, 120) : '';
      const validTargets = ['youtube', 'youtube_shorts', 'facebook', 'facebook_reels', 'instagram_reels'];
      const defaultTargets = content_mode === 'short_form' || content_mode === 'repurpose' || ['reel', 'short', 'clip', 'casual_ai'].includes(deliverable_type)
        ? ['youtube_shorts', 'instagram_reels', 'facebook_reels'] : ['youtube', 'facebook'];
      const platform_targets = body.platform_targets === undefined ? defaultTargets : body.platform_targets;
      if (!Array.isArray(platform_targets) || platform_targets.length === 0 || platform_targets.some(target => !validTargets.includes(target))) {
        return res.status(400).json({ error: 'platform_targets must be a non-empty array of supported destinations' });
      }
      const source_video_task_id = body.source_video_task_id === null || body.source_video_task_id === undefined || body.source_video_task_id === ''
        ? null : Number(body.source_video_task_id);
      if (source_video_task_id !== null && (!Number.isSafeInteger(source_video_task_id) || source_video_task_id <= 0)) {
        return res.status(400).json({ error: 'source_video_task_id must be a positive integer' });
      }
      if (content_mode === 'repurpose' && source_video_task_id === null) {
        return res.status(400).json({ error: 'repurpose tasks require source_video_task_id' });
      }
      if (content_mode !== 'repurpose' && source_video_task_id !== null) {
        return res.status(400).json({ error: 'source_video_task_id is only valid for repurpose tasks' });
      }
      const company_id = body.company_id === null || body.company_id === undefined || body.company_id === ''
        ? null : Number(body.company_id);
      const assigned_agent_id = body.assigned_agent_id === null || body.assigned_agent_id === undefined || body.assigned_agent_id === ''
        ? null : Number(body.assigned_agent_id);
      if (!title) return res.status(400).json({ error: 'title required' });
      if (company_id !== null && (!Number.isInteger(company_id) || company_id <= 0)) {
        return res.status(400).json({ error: 'company_id must be a positive integer' });
      }
      if (assigned_agent_id !== null && (!Number.isInteger(assigned_agent_id) || assigned_agent_id <= 0)) {
        return res.status(400).json({ error: 'assigned_agent_id must be a positive integer' });
      }
      if (company_id !== null) {
        const { data: company, error: companyError } = await supabase
          .from('companies').select('id,building_slug').eq('id', company_id).maybeSingle();
        if (companyError) throw companyError;
        if (!company) return res.status(404).json({ error: 'Company not found' });
        building_slug = company.building_slug || building_slug;
      }
      let assignedAgentName = agent_name || 'Unassigned';
      if (assigned_agent_id !== null) {
        const { data: assignedAgent, error: agentError } = await supabase
          .from('agents').select('id,name').eq('id', assigned_agent_id).maybeSingle();
        if (agentError) throw agentError;
        if (!assignedAgent) return res.status(404).json({ error: 'Assigned agent not found' });
        assignedAgentName = assignedAgent.name || assignedAgentName;
      }
      const { data, error } = await supabase.from('tasks').insert({
        title,
        description,
        building_slug: building_slug || 'operations-tower',
        agent_name: assignedAgentName,
        priority,
        company_id,
        assigned_agent_id,
        deliverable_type,
        content_mode,
        content_category: content_category || deliverable_type,
        platform_targets: [...new Set(platform_targets)],
        source_video_task_id,
        status: 'queued',
        progress: 0
      }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id, status, progress, agent_name } = req.body;
      const patch = {};
      if (status !== undefined) patch.status = status;
      if (progress !== undefined) patch.progress = progress;
      if (agent_name !== undefined) patch.agent_name = agent_name;
      if (status === 'queued') {
        patch.progress = 0;
        patch.error = null;
        patch.started_at = null;
        patch.completed_at = null;
        patch.claimed_agent_id = null;
        patch.lease_expires_at = null;
        patch.lease_token = null;
      }
      const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body;
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
