import supabase from './db-client.js';

function isOwner(req) {
  const token = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN;
  return Boolean(token && req.headers?.authorization === 'Bearer ' + token);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      if (req.query?.include_content === '1') {
        const id = Number(req.query.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Valid output id required' });
        const { data: output, error: outputError } = await supabase.from('outputs')
          .select('id,title,type,company_id,agent_name,building_slug,status,views,likes,tokens_used,earning_coins,created_at,task_id,deliverable_type,content')
          .eq('id', id).maybeSingle();
        if (outputError) throw outputError;
        if (!output) return res.status(404).json({ error: 'Output not found' });
        const isPublic = ['in_library', 'reviewed', 'published'].includes(output.status);
        if (!isPublic && !isOwner(req)) return res.status(401).json({ error: 'Draft deliverable is private; owner token required' });
        const { data: privateContent, error: contentError } = await supabase.rpc('get_company_deliverable', { p_output_id: id });
        if (contentError) throw contentError;
        return res.status(200).json({ ...output, content: privateContent || output.content || '' });
      }
      const { data, error } = await supabase.from('outputs')
        .select('id,title,type,company_id,agent_name,building_slug,status,views,likes,tokens_used,earning_coins,created_at,task_id,deliverable_type')
        .order('id', { ascending: false }).limit(120);
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { title, type, company_id, agent_name, building_slug, tokens_used } = req.body;
      if (!title || !title.trim() || !company_id) return res.status(400).json({ error: 'title and company_id required' });
      const tokens = Math.max(0, Number(tokens_used) || 0);
      const { data: comp, error: ce } = await supabase.from('companies').select('*').eq('id', company_id).single();
      if (ce) throw ce;
      const remaining = (comp.daily_token_budget || 0) - (comp.tokens_used_today || 0);
      if (tokens > remaining) return res.status(400).json({ error: `Daily token budget exceeded for ${comp.name}: needs ${tokens} tokens, only ${remaining} remaining today. Reduce tokens or reset the day in Companies.` });
      const { data, error } = await supabase.from('outputs').insert({ title: title.trim(), type: type || 'report', company_id, agent_name: agent_name || 'Unassigned', building_slug: building_slug || comp.building_slug, status: 'in_library', views: 0, likes: 0, tokens_used: tokens, earning_coins: 0, content: '' }).select().single();
      if (error) throw error;
      if (tokens > 0) await supabase.from('companies').update({ tokens_used_today: (comp.tokens_used_today || 0) + tokens }).eq('id', company_id);
      await supabase.from('activity').insert({ type: 'visit', title: `${agent_name || 'Agent'} delivered output to the Resource Library`, building_slug: 'grand-library', detail: `“${data.title}” by ${comp.name} · ${tokens} tokens used · awaiting review (simulated visit to Grand Library).`.slice(0, 500) });
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id, action } = req.body;
      const outputId = Number(id);
      if (!Number.isInteger(outputId) || outputId <= 0) return res.status(400).json({ error: 'Valid output id required' });
      const { data: out, error: e1 } = await supabase.from('outputs').select('*').eq('id', outputId).single();
      if (e1) throw e1;
      if (action === 'view' || action === 'like' || action === 'unlike') {
        const patch = action === 'view' ? { views: (out.views || 0) + 1 } : { likes: Math.max(0, (out.likes || 0) + (action === 'like' ? 1 : -1)) };
        const { data, error } = await supabase.from('outputs').update(patch).eq('id', outputId).select().single();
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (action === 'submit_for_review') {
        if (!isOwner(req)) return res.status(401).json({ error: 'Owner token required to submit a company draft to the public Library' });
        if (!out.task_id || out.status !== 'draft') return res.status(409).json({ error: 'Only task-generated drafts can be submitted for review' });
        const { data: content, error: contentError } = await supabase.rpc('get_company_deliverable', { p_output_id: outputId });
        if (contentError) throw contentError;
        if (typeof content !== 'string' || !content.trim()) return res.status(409).json({ error: 'Draft has no saved deliverable content' });
        const { data, error } = await supabase.from('outputs').update({ status: 'in_library' }).eq('id', outputId).select().single();
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (action === 'publish') {
        if (out.status === 'published') return res.status(400).json({ error: 'This output is already published.' });
        if (out.task_id) {
          if (!isOwner(req)) return res.status(401).json({ error: 'Owner token required to publish a company deliverable' });
          if (out.status !== 'reviewed') return res.status(409).json({ error: 'Company deliverables must be submitted to the Library and reviewed before publishing' });
          const { data: content, error: contentError } = await supabase.rpc('get_company_deliverable', { p_output_id: outputId });
          if (contentError) throw contentError;
          if (typeof content !== 'string' || !content.trim()) return res.status(409).json({ error: 'Company deliverable content is missing' });
        }
        const { data: revs } = await supabase.from('reviews').select('stars').eq('output_id', outputId);
        const avg = revs && revs.length ? revs.reduce((s, r) => s + r.stars, 0) / revs.length : 0;
        // Disclosed simulated-economy formula: 40 base + 2/like + 1 per 5 views + 15/avg-star
        const earning = Math.round(40 + (out.likes || 0) * 2 + Math.floor((out.views || 0) / 5) + avg * 15);
        const { data, error } = await supabase.from('outputs').update({ status: 'published', earning_coins: earning }).eq('id', outputId).select().single();
        if (error) throw error;
        const { data: comp } = await supabase.from('companies').select('*').eq('id', out.company_id).single();
        if (comp) {
          await supabase.from('companies').update({ balance_coins: (comp.balance_coins || 0) + earning }).eq('id', comp.id);
          await supabase.from('treasury_txns').insert({ company_id: comp.id, type: 'publishing', amount: earning, note: `Publishing earning for “${out.title}” (base 40 + likes×2 + views/5 + stars×15)` });
          await supabase.from('posts').insert({ author_name: 'Autopolis Royal (Official)', author_handle: '@autopolisroyal', content: `📢 Just published from the Resource Library: “${out.title}” by ${comp.name} — earned ${earning} Royal Coins for the Treasury! #CityEvents #Published`, image_url: '', hashtags: '#CityEvents #Published', likes: 0, shares: 0, is_draft: false });
          await supabase.from('activity').insert({ type: 'event', title: 'Output published: ' + out.title, building_slug: out.building_slug, detail: `${comp.name} earned ${earning} Royal Coins · avg review ${avg ? avg.toFixed(1) + '★' : 'not reviewed'}` });
          if (out.type === 'video' || out.type === 'documentary' || out.type === 'anime') {
            await supabase.from('activity').insert({ type: 'event', title: '🎬 Now screening at Royal Cinema Hall: “' + out.title + '”', building_slug: 'culture-theatre', detail: `Premiere screening by ${comp.name} (simulated showtime). Audience stars/views/likes collect in the Resource Library and feed the Award Center.` });
            await supabase.from('notifications').insert({ type: 'event', title: '🎬 Cinema premiere: “' + out.title + '”', detail: 'Now screening at the Royal Cinema Hall (Culture Theatre). Watch the reviews roll in!', is_read: false });
          }
        }
        return res.status(200).json(data);
      }
      return res.status(400).json({ error: 'Unknown action' });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
