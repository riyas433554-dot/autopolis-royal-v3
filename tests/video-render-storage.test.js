import test from 'node:test';
import assert from 'node:assert/strict';

test('renderer storage URL route rejects missing renderer token', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  delete process.env.VIDEO_RENDERER_TOKEN;
  const { default: handler } = await import('../api/video-render-storage.js');
  const response = {
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {},
    end() {},
  };
  await handler({ method: 'POST', headers: { authorization: 'Bearer wrong' }, body: { task_id: 1, job_id: 'job-1', action: 'upload_url' } }, response);
  assert.equal(response.code, 401);
  assert.equal(response.body.error, 'Renderer token required');
});

test('renderer storage URL route validates action and task identifiers', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.VIDEO_RENDERER_TOKEN = 'renderer-secret';
  const { default: handler } = await import('../api/video-render-storage.js');
  const response = {
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {},
    end() {},
  };
  await handler({ method: 'POST', headers: { authorization: 'Bearer renderer-secret' }, body: { task_id: 1, job_id: 'job-1', action: 'delete' } }, response);
  assert.equal(response.code, 400);
  assert.match(response.body.error, /action/);
});
