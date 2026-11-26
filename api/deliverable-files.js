import supabase from './db-client.js';

function isOwner(req) {
  const token = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN;
  return Boolean(token && req.headers?.authorization === 'Bearer ' + token);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const outputId = Number(req.query?.output_id);
    if (!Number.isInteger(outputId) || outputId <= 0) return res.status(400).json({ error: 'Valid output_id required' });
    const { data: output, error: outputError } = await supabase.from('outputs')
      .select('id,status,task_id').eq('id', outputId).maybeSingle();
    if (outputError) throw outputError;
    if (!output) return res.status(404).json({ error: 'Output not found' });
    const isPublic = ['in_library','reviewed','published'].includes(output.status);
    if (output.task_id && !isPublic && !isOwner(req)) return res.status(401).json({ error: 'Company source files are private drafts; owner token required' });
    const { data, error } = await supabase.rpc('get_company_artifact_files', { p_output_id: outputId });
    if (error) throw error;
    return res.status(200).json(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Deliverable files API error:', String(error?.message || error).slice(0, 400));
    return res.status(500).json({ error: 'Could not load deliverable files' });
  }
}
