import { createServer } from 'http';
import { URL } from 'url';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createTaskRunner } from './task-runner.js';

const PORT = process.env.PORT || 3201;
const DIST_DIR = join(import.meta.dirname, 'dist');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.VITE_SUPABASE_URL;
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY is not set; API handlers will fail at runtime.');
}

async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const handlers = {};
const handlerFiles = [
  'activity', 'agents', 'agent-run', 'awards', 'bookmarks', 'bootstrap', 'buildings',
  'clients', 'comments', 'companies', 'connected', 'deliverable-files', 'download-deliverable', 'dispatch', 'eccimport', 'lifecycle', 'members',
  'messages', 'notifications', 'outputs', 'oauth', 'posts', 'profiles', 'resources',
  'reviews', 'scheduled', 'tasks', 'treasury', 'youtube-publish', 'video-render-callback', 'video-render-retry', 'video-render-storage', 'execution-report',
];

for (const name of handlerFiles) {
  try {
    const mod = await import('./api/' + name + '.js');
    handlers[name] = mod.default;
    console.log('Loaded handler: ' + name);
  } catch (err) {
    console.error('Failed to load handler ' + name + ':', err.message);
  }
}

function getMimeType(path) {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.js')) return 'application/javascript';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.woff')) return 'font/woff';
  if (path.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

async function serveStatic(pathname, req, res) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  if (!filePath.endsWith('.html') && !filePath.includes('.')) filePath = '/index.html';
  const fullPath = join(DIST_DIR, filePath);
  try {
    const content = await readFile(fullPath);
    res.setHeader('Content-Type', getMimeType(filePath));
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      try {
        const content = await readFile(join(DIST_DIR, 'index.html'));
        res.setHeader('Content-Type', 'text/html');
        res.end(content);
      } catch {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } else {
      console.error('Static file error:', err.message);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const pathname = url.pathname;

  let body = {};
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) body = await parseJsonBody(req);

  // Support hyphenated API handler names such as /api/agent-run.
  const oauthCallback = pathname.match(/^\/api\/oauth\/(meta|youtube)\/callback$/);
  const match = pathname.match(/^\/api\/(?!health$)([\w-]+)$/);
  if (match || oauthCallback) {
    const handlerName = oauthCallback ? 'oauth' : match[1];
    const handler = handlers[handlerName];
    if (handler) {
      const mockReq = {
        method: req.method,
        url: pathname,
        headers: req.headers,
        query: Object.fromEntries(url.searchParams),
        body,
      };
      const mockRes = {
        headersSent: false,
        setHeader(name, value) { res.setHeader(name, value); },
        status(code) { res.statusCode = code; return mockRes; },
        json(data) {
          if (res.headersSent) return;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
          mockRes.headersSent = true;
        },
        end(data) {
          if (res.headersSent) return;
          res.end(data);
          mockRes.headersSent = true;
        },
      };
      try {
        await handler(mockReq, mockRes);
      } catch (err) {
        console.error('Handler error:', err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
    } else {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Handler not found' }));
    }
    return;
  }

  if (pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, service: 'autopolis-royal-api', port: PORT }));
    return;
  }

  if (pathname.startsWith('/api/')) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'API route not found' }));
    return;
  }

  await serveStatic(pathname, req, res);
});

const taskRunnerToken = process.env.AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN || '';
const taskRunner = taskRunnerToken ? createTaskRunner({
  baseUrl: 'http://127.0.0.1:' + PORT,
  token: taskRunnerToken,
}) : null;

server.listen(PORT, '0.0.0.0', () => {
  console.log('Autopolis Royal server running on http://0.0.0.0:' + PORT);
  if (taskRunner) {
    console.log('Autonomous task runner enabled; polling queued tasks.');
    taskRunner.start().catch(error => console.error('[Autopolis task runner] stopped:', error));
    server.on('close', taskRunner.stop);
  } else {
    console.warn('Autonomous task runner disabled: AUTOPOLIS_LIFECYCLE_ADMIN_TOKEN is missing.');
  }
});
