import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskRunner } from '../task-runner.js';

test('tick invokes the protected run_next agent endpoint', async () => {
  let request;
  const runner = createTaskRunner({
    baseUrl: 'http://127.0.0.1:3201',
    token: 'owner-secret',
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return { ok: true, status: 200, json: async () => ({ ok: true, no_work: true }) };
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  const result = await runner.tick();

  assert.equal(result.no_work, true);
  assert.equal(request.url, 'http://127.0.0.1:3201/api/agent-run');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.authorization, 'Bearer owner-secret');
  assert.deepEqual(JSON.parse(request.options.body), { action: 'run_next' });
});

test('tick prevents concurrent task-runner requests', async () => {
  let resolveFetch;
  let calls = 0;
  const runner = createTaskRunner({
    baseUrl: 'http://localhost:3201',
    token: 'token',
    fetchImpl: () => {
      calls += 1;
      return new Promise(resolve => { resolveFetch = resolve; });
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  const first = runner.tick();
  const second = await runner.tick();
  assert.equal(second.status, 'busy');
  assert.equal(calls, 1);

  resolveFetch({ ok: true, status: 200, json: async () => ({ ok: true, no_work: true }) });
  await first;
});

test('tick reports a non-success response without throwing', async () => {
  const runner = createTaskRunner({
    baseUrl: 'https://example.test',
    token: 'token',
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ error: 'not ready' }) }),
    logger: { info() {}, warn() {}, error() {} },
  });

  const result = await runner.tick();
  assert.equal(result.error, 'Agent runner returned HTTP 503');
});
