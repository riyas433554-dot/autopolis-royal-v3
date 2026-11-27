export function createTaskRunner({
  baseUrl,
  token,
  fetchImpl = fetch,
  intervalMs = 15000,
  logger = console,
}) {
  if (!baseUrl) throw new Error('Task runner baseUrl is required');
  if (!token) throw new Error('Task runner owner token is required');

  let stopped = false;
  let running = false;
  let timer = null;
  let loopPromise = null;

  async function tick() {
    if (stopped) return { status: 'stopped' };
    if (running) return { status: 'busy' };
    running = true;
    try {
      const response = await fetchImpl(new URL('/api/agent-run', baseUrl), {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'run_next' }),
        signal: AbortSignal.timeout(15 * 60 * 1000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error('Agent runner returned HTTP ' + response.status);
      }
      if (body?.task_id) {
        logger.info('[Autopolis task runner] completed task #' + body.task_id +
          (body.video_render?.status ? ' · video render: ' + body.video_render.status : ''));
      }
      return body;
    } catch (error) {
      logger.error('[Autopolis task runner] tick failed:', String(error?.message || error));
      return { error: String(error?.message || error) };
    } finally {
      running = false;
    }
  }

  function start() {
    if (loopPromise) return loopPromise;
    stopped = false;
    loopPromise = (async () => {
      while (!stopped) {
        await tick();
        if (stopped) break;
        await new Promise(resolve => {
          timer = setTimeout(resolve, intervalMs);
        });
      }
    })();
    return loopPromise;
  }

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  return { tick, start, stop };
}
