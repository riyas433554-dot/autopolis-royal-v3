import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import supabase from './db-client.js';

const ECC_REPO = 'affaan-m/ECC';
const ECC_REF = '4adeee6732a12d1540f49a4d50a38ce8c97f9a53';

function runtimeConfig() {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  return {
    apiKey: process.env.AUTOPOLIS_LLM_API_KEY || nvidiaKey,
    model: process.env.AUTOPOLIS_LLM_MODEL || (nvidiaKey ? 'nvidia/nemotron-3.5-super-vl-120b-a12b' : ''),
    endpoint: process.env.AUTOPOLIS_LLM_BASE_URL ||
      (nvidiaKey ? 'https://integrate.api.nvidia.com/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'),
  };
}

function gitBlobSha(content) {
  const bytes = Buffer.from(content, 'utf8');
  return createHash('sha1').update('blob ' + bytes.length + '\\0').update(bytes).digest('hex');
}

async function getTrainingInstructions(profile, agent) {
  if (profile.source_repo !== ECC_REPO || !profile.source_agent_key) {
    return 'You are ' + agent.name + '. Your role is ' + agent.role + '. Department: ' + (agent.department || 'General') + '.';
  }
  const manifest = JSON.parse(await readFile(new URL('../data/ecc-agent-manifest.json', import.meta.url), 'utf8'));
  if (manifest.source_repository !== ECC_REPO || manifest.source_ref !== ECC_REF) {
    throw new Error('Pinned ECC manifest validation failed');
  }
  const entry = manifest.agents.find(item => item.key === profile.source_agent_key);
  if (!entry || entry.blob_sha !== profile.source_blob_sha) throw new Error('ECC lifecycle source metadata mismatch');
  const response = await fetch('https://raw.githubusercontent.com/' + ECC_REPO + '/' + ECC_REF + '/' + entry.path, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Pinned ECC role fetch failed (' + response.status + ')');
  const instructions = await response.text();
  if (gitBlobSha(instructions) !== entry.blob_sha) throw new Error('Pinned ECC role SHA verification failed');
  return instructions;
}

function responseText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim();
  return '';
}

async function callModel(config, messages, maxTokens) {
  const endpoint = new URL(config.endpoint);
  const localHttp = endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !localHttp) throw new Error('LLM endpoint must use HTTPS (HTTP allowed only for localhost)');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, messages, temperature: 0.2, max_tokens: maxTokens, stream: false }),
    signal: AbortSignal.timeout(90000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || 'LLM provider returned HTTP ' + response.status);
  const text = responseText(payload);
  if (!text) throw new Error('LLM returned no assistant text');
  return text;
}

function parseEvaluation(text) {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('Evaluator did not return JSON');
  const parsed = JSON.parse(text.slice(first, last + 1));
  const score = Number(parsed.score);
  const mistakes = Number(parsed.mistakes);
  if (!Number.isInteger(score) || score < 0 || score > 100 ||
      !Number.isInteger(mistakes) || mistakes < 0 || mistakes > 100 ||
      typeof parsed.feedback !== 'string' || !parsed.feedback.trim()) {
    throw new Error('Evaluator JSON failed score/mistake/feedback validation');
  }
  return { score, mistakes, feedback: parsed.feedback.trim().slice(0, 3500), criteria: parsed.criteria || {} };
}

async function runAiTraining(agentId, track) {
  const config = runtimeConfig();
  if (!config.apiKey || !config.model) {
    const error = new Error('Agent runtime is not configured. Add NVIDIA_API_KEY (preferred) or AUTOPOLIS_LLM_API_KEY and a model.');
    error.statusCode = 503;
    throw error;
  }
  const [{ data: profile, error: profileError }, { data: agent, error: agentError }] = await Promise.all([
    supabase.from('agent_lifecycle_profiles').select('*').eq('agent_id', agentId).maybeSingle(),
    supabase.from('agents').select('*').eq('id', agentId).maybeSingle(),
  ]);
  if (profileError) throw profileError;
  if (agentError) throw agentError;
  if (!profile || !agent) throw new Error('Agent lifecycle profile or agent record not found');
  if (!['academy', 'training'].includes(profile.lifecycle_status)) throw new Error('Agent must be in Academy to run AI training');

  const { data: started, error: startError } = await supabase.rpc('start_agent_training', {
    p_agent_id: agentId,
    p_track: track || (profile.training_level === 0 ? 'foundation' : 'strict_level_' + profile.training_level),
  });
  if (startError) throw startError;
  const instructions = await getTrainingInstructions(profile, agent);
  const assignment = 'ACADEMY PRACTICAL ASSESSMENT\n' +
    'Agent: ' + agent.name + '\nRole: ' + agent.role + '\nTraining level: ' + profile.training_level + '\nTrack: ' + started.track + '\n\n' +
    'Produce one complete, practical role-specific work sample for Autopolis Royal. Show the reasoning needed for the deliverable, state assumptions, include validation/checklist, and demonstrate safety and quality. Do not claim external actions or tool use. Make the result strong enough to be reviewed and reused.';
  const submission = await callModel(config, [
    { role: 'system', content: instructions + '\n\nYou are taking an Academy assessment. Follow the role instructions, but produce a concrete, verifiable work sample rather than a generic description.' },
    { role: 'user', content: assignment },
  ], 5000);
  const evaluatorModel = process.env.AUTOPOLIS_LLM_EVALUATOR_MODEL || config.model;
  const evaluationText = await callModel({ ...config, model: evaluatorModel }, [
    { role: 'system', content: 'You are a strict independent Academy evaluator. Grade the submitted work against the agent role and task. Score 0-100: role fit 25, correctness 25, completeness 20, practical usefulness 20, safety/quality 10. Count material mistakes; 10 or more mistakes fails. Do not inflate scores. Return ONLY JSON: {"score": integer, "mistakes": integer, "feedback": string, "criteria": {"role_fit": number, "correctness": number, "completeness": number, "usefulness": number, "safety": number}}.' },
    { role: 'user', content: 'ROLE: ' + agent.role + '\nTASK: ' + assignment + '\nSUBMISSION:\n' + submission.slice(0, 18000) },
  ], 1400);
  const evaluation = parseEvaluation(evaluationText);
  const { error: cycleUpdateError } = await supabase.from('agent_training_cycles').update({
    submission: submission.slice(0, 30000),
    evaluation,
    evaluator_model: evaluatorModel,
    feedback: evaluation.feedback,
  }).eq('id', started.cycle_id);
  if (cycleUpdateError) throw cycleUpdateError;
  const { data: completion, error: completeError } = await supabase.rpc('complete_agent_training', {
    p_agent_id: agentId,
    p_score: evaluation.score,
    p_mistakes: evaluation.mistakes,
    p_feedback: evaluation.feedback,
  });
  if (completeError) throw completeError;
  return { ok: true, agent_id: agentId, agent_name: agent.name, model: config.model, evaluator_model: evaluatorModel,
    submission, evaluation, completion };
}


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

    if (body.action === 'run_training') {
      try {
        const result = await runAiTraining(agentId, typeof body.track === 'string' ? body.track : null);
        return res.status(200).json(result);
      } catch (trainingError) {
        const statusCode = Number(trainingError?.statusCode) || 502;
        const message = String(trainingError?.message || trainingError).slice(0, 500);
        console.error('AI Academy training failed:', message);
        return res.status(statusCode).json({ error: message });
      }
    }

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
