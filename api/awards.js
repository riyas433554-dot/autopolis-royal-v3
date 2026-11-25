import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('awards').select('*').order('id', { ascending: false }).limit(60);
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const { output_id, category, prize_coins } = req.body;
      if (!output_id) return res.status(400).json({ error: 'output_id required' });
      const { data: out, error: e1 } = await supabase.from('outputs').select('*').eq('id', output_id).single();
      if (e1) throw e1;
      const { data: revs } = await supabase.from('reviews').select('stars').eq('output_id', output_id);
      if (!revs || revs.length === 0) return res.status(400).json({ error: 'This output must be reviewed (at least 1 star review) before it can receive an award.' });
      const avg = revs.reduce((s, r) => s + r.stars, 0) / revs.length;
      const prize = Math.max(0, Number(prize_coins) || Math.round(avg * 50));
      const { data: comp } = await supabase.from('companies').select('*').eq('id', out.company_id).single();
      const recipient = comp ? comp.name : out.agent_name;
      const title = `${category || 'Royal Excellence Award'} — “${out.title}”`;
      const { data, error } = await supabase.from('awards').insert({ title, recipient, category: category || 'Royal Excellence Award', prize_coins: prize, output_id }).select().single();
      if (error) throw error;
      if (comp && prize > 0) {
        await supabase.from('companies').update({ balance_coins: (comp.balance_coins || 0) + prize }).eq('id', comp.id);
        await supabase.from('treasury_txns').insert({ company_id: comp.id, type: 'award', amount: prize, note: `${category || 'Royal Excellence Award'} for “${out.title}” (avg ${avg.toFixed(1)}★)` });
      }
      await supabase.from('posts').insert({ author_name: 'Autopolis Royal (Official)', author_handle: '@autopolisroyal', content: `🏆 AWARD! ${recipient} wins the ${category || 'Royal Excellence Award'} for “${out.title}” (${avg.toFixed(1)}★ from ${revs.length} review${revs.length > 1 ? 's' : ''}) — ${prize} Royal Coins to their Treasury! Congratulations! #CityEvents #Awards`, image_url: '', hashtags: '#CityEvents #Awards', likes: 0, shares: 0, is_draft: false });
      await supabase.from('activity').insert({ type: 'event', title: 'Award: ' + title, building_slug: out.building_slug, detail: `${recipient} · ${prize} Royal Coins · avg ${avg.toFixed(1)}★ · announced on Autopolis Social` });
      await supabase.from('notifications').insert({ type: 'award', title: '🏆 ' + title, detail: `${recipient} received ${prize} Royal Coins. See the Award Center for leaderboards.`, is_read: false });
      return res.status(201).json(data);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { console.error('API error:', err); res.status(500).json({ error: err.message }); }
}
