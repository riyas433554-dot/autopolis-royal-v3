import supabase from './db-client.js';

// Client Finder pipeline: Lead -> Contacted -> Proposal -> Deal -> Delivery -> Paid
// Outreach is DRAFT-ONLY here. Nothing is ever auto-sent; owner approval marks a
// draft approved, and sending still requires a genuinely connected channel.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const [leads, deals] = await Promise.all([
        supabase.from('client_leads').select('*').order('id', { ascending: false }).limit(120),
        supabase.from('deals').select('*').order('id', { ascending: false }).limit(80),
      ]);
      if (leads.error) throw leads.error;
      if (deals.error) throw deals.error;
      return res.status(200).json({ leads: leads.data, deals: deals.data });
    }
    if (req.method === 'POST') {
      const { kind } = req.body;
      if (kind === 'deal') {
        const { lead_id, company_id, title, value_coins } = req.body;
        if (!lead_id || !company_id) return res.status(400).json({ error: 'lead_id and company_id required' });
        const { data, error } = await supabase.from('deals').insert({ lead_id, company_id, title: title || 'Client deal', value_coins: Math.max(0, Number(value_coins) || 0), status: 'active' }).select().single();
        if (error) throw error;
        await supabase.from('client_leads').update({ stage: 'deal' }).eq('id', lead_id);
        return res.status(201).json(data);
      }
      const { business_name, contact_name, need, source_url, is_live, score, company_id, finder_name } = req.body;
      if (!business_name || !business_name.trim()) return res.status(400).json({ error: 'business_name required' });
      const live = !!is_live && !!(source_url || '').trim();
      const { data, error } = await supabase.from('client_leads').insert({ business_name: business_name.trim(), contact_name: contact_name || '', need: need || '', source_url: source_url || '', source_label: live ? 'Live — public source' : 'Demo/Simulated lead', is_live: live, score: Math.max(1, Math.min(100, Number(score) || 50)), stage: 'lead', company_id: company_id || null, finder_name: finder_name || 'Client Finder', outreach_draft: '', proposal_draft: '', follow_up: '' }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { kind, id } = req.body;
      if (kind === 'deal') {
        const { data: deal, error: e1 } = await supabase.from('deals').select('*').eq('id', id).single();
        if (e1) throw e1;
        const status = req.body.status;
        const { data, error } = await supabase.from('deals').update({ status }).eq('id', id).select().single();
        if (error) throw error;
        if (status === 'delivered') await supabase.from('client_leads').update({ stage: 'delivery' }).eq('id', deal.lead_id);
        if (status === 'paid' && deal.status !== 'paid') {
          await supabase.from('client_leads').update({ stage: 'paid' }).eq('id', deal.lead_id);
          const { data: comp } = await supabase.from('companies').select('*').eq('id', deal.company_id).single();
          if (comp && deal.value_coins > 0) {
            await supabase.from('companies').update({ balance_coins: (comp.balance_coins || 0) + deal.value_coins }).eq('id', comp.id);
            await supabase.from('treasury_txns').insert({ company_id: comp.id, type: 'client_payment', amount: deal.value_coins, note: `Client deal paid (simulated in-city payment): “${deal.title}”` });
            await supabase.from('posts').insert({ author_name: 'Autopolis Royal (Official)', author_handle: '@autopolisroyal', content: `💼 Client deal closed! ${comp.name} delivered “${deal.title}” — ${deal.value_coins} Royal Coins to their Treasury (simulated client payment, demo pipeline). #CityEvents #ClientWin`, image_url: '', hashtags: '#CityEvents #ClientWin', likes: 0, shares: 0, is_draft: false });
          }
        }
        return res.status(200).json(data);
      }
      const patch = {};
      for (const k of ['stage', 'outreach_draft', 'proposal_draft', 'follow_up', 'score', 'need', 'contact_name']) if (req.body[k] !== undefined) patch[k] = req.body[k];
      if (req.body.outreach_approved !== undefined) patch.outreach_approved = !!req.body.outreach_approved; // approval only — sending is never performed by this API
      const { data, error } = await supabase.from('client_leads').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body;
      const { error } = await supabase.from('client_leads').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
