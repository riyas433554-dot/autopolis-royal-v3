import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import supabase from './db-client.js';
import { buildCompanyOutput } from './company-output.js';

const ECC_REPO = 'affaan-m/ECC';
const MAX_OUTPUT_CHARS = 50000;

function positiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isOwner(req) {
  const token = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN;
  return Boolean(token && req.headers?.authorization === 'Bearer ' + token);
}

function gitBlobSha(content) {
  const bytes = Buffer.from(content, 'utf8');
  return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
}

async function getEccInstructions(sourceAgentKey) {
  const manifest = JSON.parse(await readFile(new URL('../data/ecc-agent-manifest.json', import.meta.url), 'utf8'));
  if (manifest.source_repository !== ECC_REPO || manifest.source_ref !== '4adeee6732a12d1540f49a4d50a38ce8c97f9a53') {
    throw new Error('Pinned ECC manifest validation failed');
  }
  const entry = manifest.agents.find(agent => agent.key === sourceAgentKey);
  if (!entry) throw new Error('Agent key is not present in the pinned ECC manifest');

  const url = 'https://raw.githubusercontent.com/' + ECC_REPO + '/' + manifest.source_ref + '/' + entry.path;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Pinned ECC role fetch failed (' + response.status + ')');
  const instructions = await response.text();
  if (gitBlobSha(instructions) !== entry.blob_sha) {
    throw new Error('Pinned ECC role SHA verification failed');
  }
  return instructions;
}

function responseText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim();
  return '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isOwner(req)) return res.status(401).json({ error: 'Unauthorized' });

  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const apiKey = process.env.AUTOPOLIS_LLM_API_KEY || nvidiaKey;
  const model = process.env.AUTOPOLIS_LLM_MODEL ||
    (nvidiaKey ? 'nvidia/nemotron-3.5-super-vl-120b-a12b' : '');
  const endpoint = process.env.AUTOPOLIS_LLM_BASE_URL ||
    (nvidiaKey ? 'https://integrate.api.nvidia.com/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions');
  const configuredMaxTokens = Number(process.env.AUTOPOLIS_LLM_MAX_TOKENS || 8000);
  const maxTokens = Number.isInteger(configuredMaxTokens) && configuredMaxTokens >= 1024 && configuredMaxTokens <= 16000
    ? configuredMaxTokens : 8000;
  if (!apiKey || !model) {
    return res.status(503).json({
      error: 'Agent runtime is not configured. Set AUTOPOLIS_LLM_API_KEY and AUTOPOLIS_LLM_MODEL on the server.'
    });
  }

  let endpointUrl;
  try {
    endpointUrl = new URL(endpoint);
    const localHttp = endpointUrl.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(endpointUrl.hostname);
    if (endpointUrl.protocol !== 'https:' && !localHttp) {
      return res.status(400).json({ error: 'LLM endpoint must use HTTPS (HTTP is allowed only for localhost)' });
    }
  } catch {
    return res.status(400).json({ error: 'AUTOPOLIS_LLM_BASE_URL is not a valid URL' });
  }

  const taskId = positiveInteger(req.body?.task_id);
  const agentId = positiveInteger(req.body?.agent_id);
  if (!taskId || !agentId) return res.status(400).json({ error: 'Valid task_id and agent_id are required' });

  let claimedTask = null;
  let runId = null;
  let agent = null;

  try {
    const [{ data: task, error: taskError }, { data: agentRow, error: agentError }] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', taskId).maybeSingle(),
      supabase.from('agents').select('*').eq('id', agentId).maybeSingle(),
    ]);
    if (taskError) throw taskError;
    if (agentError) throw agentError;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!agentRow) return res.status(404).json({ error: 'Agent not found' });
    if (task.status !== 'queued') return res.status(409).json({ error: 'Task must be queued before it can run' });
    if (['busy', 'working'].includes(String(agentRow.status).toLowerCase())) {
      return res.status(409).json({ error: 'Agent is already busy' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('agent_lifecycle_profiles').select('*').eq('agent_id', agentId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || !['city_staff', 'company'].includes(profile.lifecycle_status)) {
      return res.status(409).json({ error: 'Only ECC city staff or hired company agents can execute city work; Academy agents must train first' });
    }
    if (task.assigned_agent_id && Number(task.assigned_agent_id) !== agentId) {
      return res.status(409).json({ error: 'Task is assigned to a different agent' });
    }
    if (profile.lifecycle_status === 'company' && task.company_id && Number(task.company_id) !== Number(profile.company_id)) {
      return res.status(409).json({ error: 'Task belongs to a different company' });
    }
    if (profile.lifecycle_status === 'company') {
      const { data: membership, error: memberError } = await supabase
        .from('company_members').select('id').eq('agent_id', agentId).eq('company_id', profile.company_id).eq('is_active', true).limit(1);
      if (memberError) throw memberError;
      if (!membership?.length) return res.status(409).json({ error: 'Company agent has no active company membership' });
    }

    let instructions;
    if (profile.source_repo === ECC_REPO && profile.source_agent_key) {
      instructions = await getEccInstructions(profile.source_agent_key);
    } else {
      instructions = 'You are ' + agentRow.name + ', a scratch city agent. Your role is ' + agentRow.role +
        '. Department: ' + (agentRow.department || 'General') + '. Follow the task and provide a useful written deliverable.';
    }

    const now = new Date().toISOString();
    const { data: claim, error: claimError } = await supabase.from('tasks').update({
      status: 'running',
      progress: 10,
      started_at: now,
      completed_at: null,
      error: null,
      attempts: Number(task.attempts || 0) + 1,
      agent_name: agentRow.name,
    }).eq('id', taskId).eq('status', 'queued').select().maybeSingle();
    if (claimError) throw claimError;
    if (!claim) return res.status(409).json({ error: 'Task was claimed by another runner; refresh the queue' });
    claimedTask = claim;

    const { data: run, error: runError } = await supabase.from('agent_runs').insert({
      task_id: taskId,
      agent_id: agentId,
      lifecycle_profile_id: profile.id,
      provider: endpointUrl.hostname,
      model,
      status: 'running',
      input_text: task.title,
      started_at: now,
    }).select('id').single();
    if (runError) {
      await supabase.from('tasks').update({ status: 'queued', progress: 0, started_at: null, error: 'Agent run ledger unavailable' }).eq('id', taskId);
      claimedTask = null;
      throw runError;
    }
    runId = run.id;
    agent = agentRow;

    const { error: busyError } = await supabase.from('agents').update({
      status: 'busy',
      current_task: 'Running task #' + taskId + ': ' + task.title,
    }).eq('id', agentId);
    if (busyError) throw busyError;

    const systemPrompt = instructions + '\n\nAUTOPOLIS CITY EXECUTION POLICY:\n' +
      '- You are generating the deliverable for one assigned task.\n' +
      '- Do not claim that you used tools, changed files, sent messages, browsed websites, or performed external actions unless a tool result is explicitly provided in this conversation.\n' +
      '- No tools are available in this run. Produce a complete, self-contained deliverable: code, proposal, app/website specification, automation design, game design, ad/video script, or report as requested.\n' +
      '- Company agents must produce a draft artifact suitable for owner review; never claim publication, client contact, payment, deployment, or hosting.\n' +
      '- Respect safety, privacy, copyright, and task scope. Use original or licensed creative material; state assumptions and blockers.\n' +
      '- Return the deliverable directly, with concise completion notes.';

    const llmResponse = await fetch(endpointUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'City task: ' + task.title + '\nTask details / acceptance criteria: ' + (task.description || 'Not provided') + '\nBuilding: ' + (task.building_slug || 'operations-tower') + '\nPriority: ' + (task.priority || 'medium') },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(90000),
    });
    const responsePayload = await llmResponse.json().catch(() => null);
    if (!llmResponse.ok) {
      const providerMessage = responsePayload?.error?.message || 'LLM provider returned HTTP ' + llmResponse.status;
      throw new Error(String(providerMessage).slice(0, 500));
    }

    const output = responseText(responsePayload);
    if (!output) throw new Error('LLM response contained no assistant text');
    const result = output.slice(0, MAX_OUTPUT_CHARS);
    let outputRecord = null;
    const companyOutput = buildCompanyOutput({ task, agent: agentRow, profile, result });
    if (companyOutput) {
      const { data: existingOutput, error: existingOutputError } = await supabase
        .from('outputs').select('id').eq('task_id', taskId).maybeSingle();
      if (existingOutputError) throw existingOutputError;
      const outputWrite = existingOutput
        ? await supabase.from('outputs').update(companyOutput).eq('id', existingOutput.id).select('id').single()
        : await supabase.from('outputs').insert(companyOutput).select('id').single();
      if (outputWrite.error) throw outputWrite.error;
      outputRecord = outputWrite.data;
    }
    const completedAt = new Date().toISOString();

    const { error: taskUpdateError } = await supabase.from('tasks').update({
      status: 'done',
      progress: 100,
      result,
      error: null,
      completed_at: completedAt,
    }).eq('id', taskId).eq('status', 'running');
    if (taskUpdateError) throw taskUpdateError;

    await supabase.from('agent_runs').update({
      status: 'succeeded',
      output_text: result,
      completed_at: completedAt,
    }).eq('id', runId);
    await supabase.from('agents').update({
      status: 'idle',
      current_task: 'Completed task #' + taskId,
    }).eq('id', agentId);
    await supabase.from('activity').insert({
      type: 'task',
      title: 'ECC agent completed task #' + taskId,
      building_slug: task.building_slug || agentRow.building_slug,
      detail: agentRow.name + ' · ' + model + ' · ' + task.title,
    });

    return res.status(200).json({ ok: true, task_id: taskId, agent_id: agentId, agent_name: agentRow.name, model, result, output_id: outputRecord?.id || null });
  } catch (error) {
    const rawMessage = String(error?.message || error).slice(0, 1000);
    const message = apiKey ? rawMessage.replaceAll(apiKey, '[redacted]') : rawMessage;
    const completedAt = new Date().toISOString();
    if (claimedTask) {
      await supabase.from('tasks').update({
        status: 'error',
        progress: 0,
        error: message,
        completed_at: completedAt,
      }).eq('id', taskId).eq('status', 'running');
    }
    if (runId) {
      await supabase.from('agent_runs').update({
        status: 'failed',
        error: message,
        completed_at: completedAt,
      }).eq('id', runId);
    }
    if (agent) {
      await supabase.from('agents').update({
        status: 'error',
        current_task: 'Task #' + taskId + ' failed: ' + message.slice(0, 180),
      }).eq('id', agent.id);
    }
    console.error('Autopolis agent run failed:', message);
    return res.status(502).json({ error: 'Agent run failed; inspect the task error after refresh', task_id: taskId });
  }
}
