import supabase from './db-client.js';
import { createZip } from './zip-utils.js';

function isOwner(req) {
  const token = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN;
  return Boolean(token && req.headers?.authorization === 'Bearer ' + token);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const outputId = Number(req.query?.output_id);
    if (!Number.isInteger(outputId) || outputId <= 0) return res.status(400).json({ error: 'Valid output_id required' });
    const { data: output, error: outputError } = await supabase.from('outputs')
      .select('id,title,status,task_id').eq('id', outputId).maybeSingle();
    if (outputError) throw outputError;
    if (!output) return res.status(404).json({ error: 'Output not found' });
    const isPublic = ['in_library','reviewed','published'].includes(output.status);
    if (output.task_id && !isPublic && !isOwner(req)) return res.status(401).json({ error: 'Draft source package is private; owner token required' });
    const { data: files, error: filesError } = await supabase.rpc('get_company_artifact_files', { p_output_id: outputId });
    if (filesError) throw filesError;
    if (!Array.isArray(files) || !files.length) return res.status(404).json({ error: 'This deliverable has no source files to download' });
    const zip = createZip(files);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="autopolis-deliverable-' + outputId + '.zip"');
    res.setHeader('Content-Length', String(zip.length));
    return res.status(200).end(zip);
  } catch (error) {
    console.error('Deliverable ZIP download failed:', String(error?.message || error).slice(0, 400));
    return res.status(500).json({ error: 'Could not package deliverable source files' });
  }
}
