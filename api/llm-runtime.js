export function getLlmConfig() {
  const customKey = process.env.AUTOPOLIS_LLM_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const provider = customKey ? 'custom' : nvidiaKey ? 'nvidia' : '';
  return {
    provider,
    apiKey: customKey || nvidiaKey || '',
    model: process.env.AUTOPOLIS_LLM_MODEL ||
      (provider === 'nvidia' ? 'nvidia/nemotron-3.5-super-vl-120b-a12b' : ''),
    endpoint: process.env.AUTOPOLIS_LLM_BASE_URL ||
      (provider === 'nvidia' ? 'https://integrate.api.nvidia.com/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'),
    maxTokens: (() => {
      const value = Number(process.env.AUTOPOLIS_LLM_MAX_TOKENS || 8000);
      return Number.isInteger(value) && value >= 1024 && value <= 16000 ? value : 8000;
    })(),
  };
}

export function responseText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim();
  return '';
}

async function readJson(response) {
  return response.json().catch(() => null);
}

function providerError(payload, status) {
  return String(payload?.error?.message || payload?.message || payload?.detail || 'LLM provider returned HTTP ' + status).slice(0, 500);
}

export async function callChatCompletion(config, messages, maxTokens, options = {}) {
  if (!config.apiKey || !config.model) throw new Error('LLM runtime is not configured');
  const endpoint = new URL(config.endpoint);
  const localHttp = endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !localHttp) throw new Error('LLM endpoint must use HTTPS (HTTP allowed only for localhost)');
  const isNvidia = config.provider === 'nvidia' || endpoint.hostname === 'integrate.api.nvidia.com';
  const body = {
    model: config.model,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: maxTokens,
    stream: false,
  };
  if (isNvidia && options.reasoningEffort) body.reasoning_effort = options.reasoningEffort;
  if (options.tools) body.tools = options.tools;
  if (options.toolChoice) body.tool_choice = options.toolChoice;
  if (options.parallelToolCalls !== undefined) body.parallel_tool_calls = options.parallelToolCalls;
  if (options.responseFormat) body.response_format = options.responseFormat;

  let response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  let payload = await readJson(response);
  if (response.status === 202 && isNvidia) {
    const requestId = response.headers.get('NVCF-REQID') || payload?.requestId || payload?.request_id;
    if (!requestId || String(requestId).length > 64) throw new Error('NVIDIA returned pending status without a valid request id');
    const statusUrl = new URL('/v1/status/' + encodeURIComponent(String(requestId)), endpoint.origin);
    const pollDeadline = Date.now() + 60000;
    let fulfilled = false;
    for (let attempt = 0; attempt < 40 && Date.now() < pollDeadline; attempt++) {
      await new Promise(resolve => setTimeout(resolve, Math.min(1500, Math.max(0, pollDeadline - Date.now()))));
      response = await fetch(statusUrl, {
        headers: { Authorization: 'Bearer ' + config.apiKey, Accept: 'application/json', 'NVCF-POLL-SECONDS': '10' },
        signal: AbortSignal.timeout(Math.min(10000, Math.max(1000, pollDeadline - Date.now()))),
      });
      payload = await readJson(response);
      if (response.status === 202) continue;
      if (!response.ok) throw new Error(providerError(payload, response.status));
      fulfilled = true;
      break;
    }
    if (!fulfilled) throw new Error('NVIDIA inference is still pending after 60 seconds; retry the task');
  }
  if (!response.ok) throw new Error(providerError(payload, response.status));
  return payload;
}
