const MAX_ARTIFACT_BYTES = 100000;

export function normalizeArtifactPath(value) {
  if (typeof value !== 'string') throw new Error('Invalid artifact path');
  const path = value.trim().replaceAll('\\', '/');
  if (!path || path.length > 160 || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
    throw new Error('Invalid or unsafe artifact path');
  }
  const segments = path.split('/');
  if (segments.length > 10 || segments.some(segment => !segment || segment === '.' || segment === '..' || segment.length > 80)) {
    throw new Error('Invalid or unsafe artifact path');
  }
  const reserved = segments.some(segment => {
    const lower = segment.toLowerCase();
    return lower === '.git' || lower === 'node_modules' || lower === 'secrets' || lower === 'credentials' ||
      lower.startsWith('.env') || lower.includes('id_rsa') || lower.includes('id_ed25519') ||
      /\.(pem|key|p12|pfx|secret|token)$/i.test(lower);
  });
  if (reserved) throw new Error('Reserved or unsafe artifact path');
  return segments.join('/');
}

export function validateArtifactContent(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Artifact content must be non-empty text');
  if (value.includes('\0')) throw new Error('Artifact content cannot contain binary NUL bytes');
  if (Buffer.byteLength(value, 'utf8') > MAX_ARTIFACT_BYTES) throw new Error('Artifact content size exceeds 100 KB per file');
  return value;
}

export function artifactMimeType(path) {
  const extension = String(path).split('.').pop().toLowerCase();
  const types = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    cjs: 'text/javascript; charset=utf-8',
    ts: 'text/plain; charset=utf-8',
    tsx: 'text/plain; charset=utf-8',
    jsx: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    yaml: 'text/yaml; charset=utf-8',
    yml: 'text/yaml; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
    svg: 'image/svg+xml',
    sh: 'text/x-shellscript; charset=utf-8',
    py: 'text/x-python; charset=utf-8',
    gd: 'text/plain; charset=utf-8',
    tscn: 'text/plain; charset=utf-8',
    tres: 'text/plain; charset=utf-8',
  };
  return types[extension] || 'text/plain; charset=utf-8';
}
