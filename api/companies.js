import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('companies').select('*').order('id', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { name, building_slug, industry, daily_token_budget, color } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'Company name required' });
      const { data, error } = await supabase.from('companies').insert({ name: name.trim(), building_slug: building_slug || 'commerce-exchange', industry: industry || 'General Services', daily_token_budget: Number(daily_token_budget) || 50000, tokens_used_today: 0, balance_coins: 500, color: color || '#c9a227' }).select().single();
      if (error) throw error;
      await supabase.from('treasury_txns').insert({ company_id: data.id, type: 'grant', amount: 500, note: 'Royal founding grant (simulated city economy)' });
      await supabase.from('posts').insert({ author_name: 'Autopolis Royal (Official)', author_handle: '@autopolisroyal', content: `🏢 A new company just opened its doors in Autopolis Royal: ${data.name} (${data.industry})! Welcome to the city economy. #CityEvents #NewCompany`, image_url: '', hashtags: '#CityEvents #NewCompany', likes: 0, shares: 0, is_draft: false });
      await supabase.from('activity').insert({ type: 'event', title: 'New company founded: ' + data.name, building_slug: data.building_slug, detail: `${data.industry} · received 500 Royal Coins founding grant · daily token budget ${data.daily_token_budget}` });
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id, action } = req.body;
      if (action === 'reset_tokens') {
        const { data, error } = await supabase.from('companies').update({ tokens_used_today: 0 }).eq('id', id).select().single();
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (action === 'borrow_tokens') {
        const amount = Math.max(0, Math.min(50000, Number(req.body.amount) || 10000));
        const { data: comp, error: ce } = await supabase.from('companies').select('*').eq('id', id).single();
        if (ce) throw ce;
        const { data, error } = await supabase.from('companies').update({ daily_token_budget: (comp.daily_token_budget || 0) + amount }).eq('id', id).select().single();
        if (error) throw error;
        await supabase.from('activity').insert({ type: 'event', title: `Token Bank lent ${amount} tokens to ${comp.name}`, building_slug: 'royal-treasury-bank', detail: 'Simulated lending from the 30-crore daily city reserve. Unused tokens return to the Bank at day reset.' });
        return res.status(200).json(data);
      }
      return res.status(400).json({ error: 'Unknown action' });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
