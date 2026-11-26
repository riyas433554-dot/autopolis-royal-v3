import supabase from './db-client.js';
import { readFile } from 'node:fs/promises';

const ECC_REPO = 'affaan-m/ECC';

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\\r?\\n([\\s\\S]*?)\\r?\\n---/);
  if (!match) throw new Error('ECC agent file has no frontmatter');
  const fields = {};
  for (const line of match[1].split(/\\r?\\n/)) {
    const m = line.match(/^([a-zA-Z0-9_-]+):\\s*(.*)$/);
    if (!m) continue;
    fields[m[1]] = m[2].trim().replace(/^(['"])(.*)\\1$/, '$2');
  }
  return fields;
}

async function mapLimit(items, limit, fn) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

function displayName(key) {
  return key.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function safeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const adminToken = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN;
  if (!adminToken) return res.status(503).json({ error: 'Lifecycle admin token is not configured' });
  const authorization = req.headers?.authorization || '';
  if (authorization !== `Bearer ${adminToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const manifestText = await readFile(new URL('../data/ecc-agent-manifest.json', import.meta.url), 'utf8');
    const manifest = JSON.parse(manifestText);
    if (manifest.source_repository !== ECC_REPO || !Array.isArray(manifest.agents) || manifest.agents.length !== 72) {
      return res.status(500).json({ error: 'Pinned ECC manifest failed validation' });
    }

    const { data: buildingRows, error: buildingError } = await supabase
      .from('buildings').select('slug').order('slug', { ascending: true });
    if (buildingError) throw buildingError;
    const cityBuildings = (buildingRows || [])
      .map(row => row.slug)
      .filter(slug => slug && slug !== 'agent-academy');
    if (!cityBuildings.length) return res.status(409).json({ error: 'No city buildings available for ECC placement' });

    const payload = await mapLimit(manifest.agents, 4, async (entry, index) => {
      const url = `https://raw.githubusercontent.com/${ECC_REPO}/${manifest.source_ref}/${entry.path}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`ECC source fetch failed for ${entry.key} (${response.status})`);
      const markdown = await response.text();
      const meta = parseFrontmatter(markdown);
      const isAcademy = index % 2 === 0;
      const assignedBuilding = isAcademy ? 'agent-academy' : cityBuildings[Math.floor(index / 2) % cityBuildings.length];
      return {
        source_agent_key: entry.key,
        source_path: entry.path,
        source_blob_sha: entry.blob_sha,
        name: safeString(meta.name, displayName(entry.key)),
        role: safeString(meta.description, displayName(entry.key)),
        department: 'ECC',
        source_description: safeString(meta.description),
        source_tools: safeString(meta.tools),
        source_model: safeString(meta.model),
        lifecycle_status: isAcademy ? 'academy' : 'city_staff',
        assigned_building_slug: assignedBuilding,
        assignment_duty: isAcademy ? 'academy_training' : 'interviews_hiring_and_building_support'
      };
    });

    const { data, error } = await supabase.rpc('import_ecc_agent_definitions', { p_agents: payload });
    if (error) throw error;
    return res.status(200).json({
      ok: true,
      source_repository: ECC_REPO,
      source_ref: manifest.source_ref,
      definitions: payload.length,
      result: data
    });
  } catch (error) {
    console.error('ECC import failed:', error);
    return res.status(502).json({ error: 'ECC import failed; no success was reported' });
  }
}
