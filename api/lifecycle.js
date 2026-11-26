import supabase from './db-client.js';

function positiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function scoreValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function mistakeValue(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function isOwner(req) {
  const token = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN;
  return Boolean(token && req.headers?.authorization === `Bearer ${token}`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('agent_lifecycle_profiles')
        .select('*, agent:agents(id,name,code,role,department,building_slug,status,current_task), company:companies(id,name,building_slug)')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!isOwner(req)) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body || {};
    const agentId = positiveInteger(body.agent_id);
    if (!agentId) return res.status(400).json({ error: 'Valid agent_id required' });

    let rpcName;
    let rpcArgs;
    if (body.action === 'start_training') {
      rpcName = 'start_agent_training';
      rpcArgs = { p_agent_id: agentId, p_track: typeof body.track === 'string' ? body.track : null };
    } else if (body.action === 'complete_training' || body.action === 'record_work') {
      const score = scoreValue(body.score);
      const mistakes = mistakeValue(body.mistakes);
      if (score === null) return res.status(400).json({ error: 'score must be between 0 and 100' });
      if (mistakes === null) return res.status(400).json({ error: 'mistakes must be a non-negative integer' });
      rpcName = body.action === 'complete_training' ? 'complete_agent_training' : 'record_agent_work';
      rpcArgs = { p_agent_id: agentId, p_score: score, p_mistakes: mistakes,
        p_feedback: typeof body.feedback === 'string' ? body.feedback.slice(0, 4000) : null };
    } else if (body.action === 'hire') {
      const companyId = positiveInteger(body.company_id);
      if (!companyId) return res.status(400).json({ error: 'Valid company_id required' });
      rpcName = 'hire_lifecycle_agent';
      rpcArgs = { p_agent_id: agentId, p_company_id: companyId };
    } else {
      return res.status(400).json({ error: 'Unknown lifecycle action' });
    }

    const { data, error } = await supabase.rpc(rpcName, rpcArgs);
    if (error) {
      const message = String(error.message || error);
      const clientError = /must |not found|must be|reached its|not in|invalid|eligible/i.test(message);
      return res.status(clientError ? 409 : 500).json({
        error: clientError ? message.slice(0, 300) : 'Lifecycle transition failed'
      });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error('Lifecycle API error:', error);
    return res.status(500).json({ error: 'Lifecycle request failed' });
  }
}
