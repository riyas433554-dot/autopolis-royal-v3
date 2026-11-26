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
      const body = req.body || {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const role = typeof body.role === 'string' ? body.role.trim() : '';
      const department = typeof body.department === 'string' && body.department.trim() ? body.department.trim() : 'General';
      if (!name || !role) return res.status(400).json({ error: 'name and role required' });

      // Scratch agents enter the Academy first; a user-selected city building
      // cannot bypass lifecycle training or company hiring.
      const code = 'AGT-' + Math.floor(1000 + Math.random() * 9000);
      const { data, error } = await supabase.from('agents').insert({
        name, code, role, department, building_slug: 'agent-academy',
        status: 'idle', current_task: 'Awaiting Academy training', avatar_color: '#c9a227'
      }).select().single();
      if (error) throw error;

      const { data: profile, error: profileError } = await supabase.from('agent_lifecycle_profiles').insert({
        agent_id: data.id,
        origin: 'scratch',
        lifecycle_status: 'academy',
        training_level: 0,
        assigned_building_slug: 'agent-academy',
        assignment_duty: 'academy_training'
      }).select('id').single();
      if (profileError) {
        await supabase.from('agents').delete().eq('id', data.id);
        return res.status(503).json({ error: 'Apply ECC lifecycle migrations before registering scratch trainees' });
      }

      const { error: eventError } = await supabase.from('agent_lifecycle_events').insert({
        agent_id: data.id,
        profile_id: profile.id,
        event_type: 'scratch_agent_registered',
        to_status: 'academy',
        training_level: 0,
        details: { origin: 'scratch' }
      });
      if (eventError) {
        await supabase.from('agent_lifecycle_profiles').delete().eq('id', profile.id);
        await supabase.from('agents').delete().eq('id', data.id);
        return res.status(503).json({ error: 'Lifecycle event ledger is unavailable; scratch registration was rolled back' });
      }

      // Social/activity announcement is non-critical and cannot undo registration.
      try {
        await supabase.from('posts').insert({
          author_name: 'Autopolis Royal (Official)',
          author_handle: '@autopolisroyal',
          content: '🎓 ' + name + ' (' + data.code + ') enrolled as a scratch trainee in Autopolis Institute. Academy training is required before company hiring. #Academy #CityEvents',
          image_url: '', hashtags: '#Academy #CityEvents', likes: 0, shares: 0, is_draft: false
        });
        await supabase.from('activity').insert({
          type: 'event',
          title: 'Scratch trainee enrolled: ' + name,
          building_slug: 'agent-academy',
          detail: data.code + ' · ' + role + ' · Academy training required'
        });
      } catch (announcementError) {
        console.error('scratch registration announcement failed (non-fatal):', announcementError.message);
      }
      return res.status(201).json({ ...data, lifecycle_status: 'academy', lifecycle_profile_id: profile.id });
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
