const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const HOST = process.env.ADMIN_HOST || '0.0.0.0';
const PORT = process.env.ADMIN_PORT ? Number(process.env.ADMIN_PORT) : 4000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const RELAY_FILE = path.join(__dirname, '..', 'relays.json');
const GIT_AUTO_PUSH = process.env.GIT_AUTO_PUSH === '1' || process.env.GIT_AUTO_PUSH === 'true';
const GIT_REMOTE = process.env.GIT_REMOTE || 'origin';
const GIT_BRANCH = process.env.GIT_BRANCH || 'main';
const GIT_COMMIT_MSG = process.env.GIT_COMMIT_MSG || 'Update relays.json via admin UI';
const GITHUB_RELAYS_URL = process.env.GITHUB_RELAYS_URL || '';

const execAsync = promisify(exec);

const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const toHttp = (url) => {
  if (url.startsWith('wss://')) return 'https://' + url.slice('wss://'.length);
  if (url.startsWith('ws://')) return 'http://' + url.slice('ws://'.length);
  return url;
};

const normalizeUrl = (u) => {
  const url = new URL(u);
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error('protocol must be ws:// or wss://');
  }
  if (!url.hostname) throw new Error('hostname required');
  const port = url.port || (url.protocol === 'wss:' ? '443' : '80');
  const pathPart = url.pathname && url.pathname !== '/' ? url.pathname : '';
  return `${url.protocol}//${url.hostname}:${port}${pathPart}`;
};

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    try {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve(text ? JSON.parse(text) : {});
    } catch (e) {
      reject(e);
    }
  });
  req.on('error', reject);
});

const authorize = (req) => {
  if (!ADMIN_TOKEN) return true;
  const token = req.headers['x-admin-token'];
  return token === ADMIN_TOKEN;
};

const loadRelaysLocal = () => JSON.parse(fs.readFileSync(RELAY_FILE, 'utf8'));

const saveRelays = (list) => {
  const unique = Array.from(new Set(list));
  const sorted = unique.sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(RELAY_FILE, JSON.stringify({ relays: sorted }, null, 2));
  return sorted;
};

async function fetchRemoteRelays() {
  if (!GITHUB_RELAYS_URL) return null;
  try {
    const headers = { 'User-Agent': 'kreo-relay-admin' };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetch(GITHUB_RELAYS_URL, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json || !Array.isArray(json.relays)) throw new Error('invalid relays payload');
    return { relays: json.relays, source: 'github' };
  } catch (e) {
    return { error: e.message, source: 'github' };
  }
}

async function gitAutoPush() {
  if (!GIT_AUTO_PUSH) return { pushed: false, message: 'auto-push disabled' };
  try {
    await execAsync('git add relays.json', { cwd: path.join(__dirname, '..') });
    const { stdout: statusOut } = await execAsync('git status --short relays.json', { cwd: path.join(__dirname, '..') });
    if (!statusOut.trim()) {
      return { pushed: false, message: 'no changes to commit' };
    }
    await execAsync(`git commit -m "${GIT_COMMIT_MSG}"`, { cwd: path.join(__dirname, '..') });
    await execAsync(`git push ${GIT_REMOTE} ${GIT_BRANCH}`, { cwd: path.join(__dirname, '..') });
    return { pushed: true, message: `pushed to ${GIT_REMOTE}/${GIT_BRANCH}` };
  } catch (e) {
    return { pushed: false, message: `git push failed: ${e.message}` };
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(INDEX_HTML);
    return;
  }

  if (req.url === '/api/relays' && req.method === 'GET') {
    if (!authorize(req)) {
      res.writeHead(401);
      return res.end();
    }
    try {
      const remote = await fetchRemoteRelays();
      if (remote && remote.relays) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(remote));
        return;
      }
      const data = loadRelaysLocal();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ relays: data.relays, source: 'local', remote_error: remote?.error || null }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.url === '/api/check' && req.method === 'POST') {
    if (!authorize(req)) {
      res.writeHead(401);
      return res.end();
    }
    try {
      const body = await readBody(req);
      const urls = Array.isArray(body.urls) ? body.urls.map((u) => String(u).trim()).filter(Boolean) : [];
      const normalized = urls.map(normalizeUrl);
      const results = await checkHealth(normalized);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.url === '/api/save' && req.method === 'POST') {
    if (!authorize(req)) {
      res.writeHead(401);
      return res.end();
    }
    try {
      const body = await readBody(req);
      const urls = Array.isArray(body.urls) ? body.urls.map((u) => String(u).trim()).filter(Boolean) : [];
      const normalized = urls.map(normalizeUrl);
      const merged = saveRelays(normalized);
      const gitResult = await gitAutoPush();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ relays: merged, git: gitResult }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, HOST, () => {
  console.log(`Admin UI running at http://${HOST}:${PORT} (use ADMIN_TOKEN header if configured)`);
});

const checkHealth = async (urls) => {
  const results = [];
  for (const url of urls) {
    const httpUrl = toHttp(url);
    const target = httpUrl.endsWith('/') ? `${httpUrl}health` : `${httpUrl}/health`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(target, { signal: controller.signal, headers: { 'User-Agent': 'kreo-relay-admin' } });
      clearTimeout(timeout);
      if (!res.ok) {
        results.push({ url, status: 'fail', detail: `HTTP ${res.status}` });
        continue;
      }
      const json = await res.json();
      if (json && json.status === 'ok') {
        results.push({ url, status: 'ok', detail: `connected_relays=${json.connected_relays ?? 'n/a'}` });
      } else {
        results.push({ url, status: 'fail', detail: 'invalid health payload' });
      }
    } catch (e) {
      results.push({ url, status: 'fail', detail: e.message });
    }
  }
  return results;
};
