import { createServer } from 'http';
import { URL } from 'url';
import { readFile } from 'fs/promises';
import { join } from 'path';

const PORT = process.env.PORT || 3201;
const DIST_DIR = join(import.meta.dirname, 'dist');

// Ensure Supabase env vars are set for server-side client
// Support VITE_ prefix fallback from .env (client uses VITE_, server needs NEXT_PUBLIC_ and SERVICE_ROLE)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  if (process.env.VITE_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }
}

// Warn if service role key is missing (handlers will fail at runtime)
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY is not set.');
  console.warn('   API handlers will fail when called. Add to your .env:');
  console.warn('   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>');
}

// JSON body parser
async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        const json = JSON.parse(data || '{}');
        resolve(json);
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// Load all handlers
const handlers = {};
const handlerFiles = [
  'activity', 'agents', 'awards', 'bookmarks', 'bootstrap', 'buildings',
  'clients', 'comments', 'companies', 'connected', 'dispatch', 'members',
  'messages', 'notifications', 'outputs', 'posts', 'profiles', 'resources',
  'reviews', 'scheduled', 'tasks', 'treasury',
];

for (const name of handlerFiles) {
  try {
    const mod = await import(`./api/${name}.js`);
    handlers[name] = mod.default;
    console.log(`Loaded handler: ${name}`);
  } catch (err) {
    console.error(`Failed to load handler ${name}:`, err.message);
  }
}

// Get MIME type for files
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

// Serve static files from dist/
async function serveStatic(pathname, req, res) {
  // Remove leading slash for file path
  let filePath = pathname === '/' ? '/index.html' : pathname;
  if (!filePath.endsWith('.html') && !filePath.includes('.')) {
    // SPA route - serve index.html
    filePath = '/index.html';
  }
  const fullPath = join(DIST_DIR, filePath);

  try {
    const content = await readFile(fullPath);
    res.setHeader('Content-Type', getMimeType(filePath));
    res.end(content);
  } catch (err) {
    // File not found - serve index.html for SPA routing
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
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Parse body for POST/PUT/DELETE
  let body = {};
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    body = await parseJsonBody(req);
  }

  // Route: /api/<name>
  const match = pathname.match(/^\/api\/(?!health$)(\w+)$/);
  if (match) {
    const handlerName = match[1];
    const handler = handlers[handlerName];

    if (handler) {
      const mockReq = {
        method: req.method,
        url: pathname,
        headers: req.headers,
        query: Object.fromEntries(url.searchParams),
        body: body,
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
          res.end(JSON.stringify({ error: err.message }));
        }
      }
    } else {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Handler not found' }));
    }
    return;
  }

  // Health check - API only
  if (pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, service: 'autopolis-royal-api', port: PORT }));
    return;
  }

  // Unknown API paths must not fall through to the SPA shell
  if (pathname.startsWith('/api/')) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'API route not found' }));
    return;
  }

  // Serve static files for all other routes (SPA)
  await serveStatic(pathname, req, res);
});

// Bind to 0.0.0.0 for external access (Render requires this)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Autopolis Royal server running on http://0.0.0.0:${PORT}`);
});