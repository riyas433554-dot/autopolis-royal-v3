export function createTaskRunner({
  baseUrl,
  token,
  fetchImpl = fetch,
  intervalMs = 15000,
  concurrency = 2,
  logger = console,
}) {
  if (!baseUrl) throw new Error('Task runner baseUrl is required');
  if (!token) throw new Error('Task runner owner token is required');
  const workerCount = Math.max(1, Math.min(4, Math.floor(Number(concurrency) || 1)));

  let stopped = false;
  let activeTicks = 0;
  let loopPromise = null;
  const controllers = new Set();
  const sleepers = new Map();

  async function tick() {
    if (stopped) return { status: 'stopped' };
    if (activeTicks >= workerCount) return { status: 'busy' };
    activeTicks += 1;
    const controller = new AbortController();
    controllers.add(controller);
    try {
      const response = await fetchImpl(new URL('/api/agent-run', baseUrl), {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'run_next' }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15 * 60 * 1000)]),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = body?.error || body?.message;
        throw new Error('Agent runner returned HTTP ' + response.status + (detail ? ': ' + detail : ''));
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
      controllers.delete(controller);
      activeTicks -= 1;
    }
  }

  function sleep() {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        sleepers.delete(timer);
        resolve();
      }, intervalMs);
      sleepers.set(timer, resolve);
    });
  }

  function start() {
    if (loopPromise) return loopPromise;
    stopped = false;
    loopPromise = Promise.all(Array.from({ length: workerCount }, async () => {
      while (!stopped) {
        await tick();
        if (stopped) break;
        await sleep();
      }
    }));
    return loopPromise;
  }

  function stop() {
    stopped = true;
    for (const controller of controllers) controller.abort();
    for (const [timer, resolve] of sleepers) {
      clearTimeout(timer);
      resolve();
    }
    sleepers.clear();
  }

  return { tick, start, stop };
}
