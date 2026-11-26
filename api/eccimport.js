import supabase from './db-client.js';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const ECC_REPO = 'affaan-m/ECC';

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error('ECC agent file has no frontmatter');
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    fields[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return fields;
}

function extractAgentFiles(tarball, expectedPaths) {
  const tar = gunzipSync(tarball);
  const expected = new Set(expectedPaths);
  const found = new Map();
  let offset = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;

    const name = header.subarray(0, 100).toString('utf8').split(String.fromCharCode(0))[0];
    const prefix = header.subarray(345, 500).toString('utf8').split(String.fromCharCode(0))[0];
    const path = prefix ? `${prefix}/${name}` : name;
    const sizeText = header.subarray(124, 136).toString('utf8').split(String.fromCharCode(0))[0].trim();
    const size = Number.parseInt(sizeText || '0', 8);
    if (!Number.isFinite(size) || size < 0) throw new Error('Invalid ECC archive entry size');

    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) throw new Error('Truncated ECC source archive');
    for (const expectedPath of expected) {
      if (path.endsWith('/' + expectedPath)) {
        found.set(expectedPath, tar.subarray(dataStart, dataEnd).toString('utf8'));
      }
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  if (found.size !== expected.size) {
    throw new Error(`Pinned ECC archive missing ${expected.size - found.size} expected agent files`);
  }
  return found;
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

    const archiveResponse = await fetch(
      `https://codeload.github.com/${ECC_REPO}/tar.gz/${manifest.source_ref}`,
      { signal: AbortSignal.timeout(25000) }
    );
    if (!archiveResponse.ok) throw new Error(`Pinned ECC archive fetch failed (${archiveResponse.status})`);
    const archive = Buffer.from(await archiveResponse.arrayBuffer());
    const sourceFiles = extractAgentFiles(archive, manifest.agents.map(entry => entry.path));

    const payload = manifest.agents.map((entry, index) => {
      const markdown = sourceFiles.get(entry.path);
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
