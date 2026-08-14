import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { buildEmbeddingRequest, buildModelRequest, extractEmbeddings, extractModelContent, normalizeEndpointIdentity } from './gateway-core.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const webRoot = join(root, 'dist', 'web');
const devMode = process.argv.includes('--dev');
const host = process.env.ENABLEOS_HOST || '127.0.0.1';
const port = Number(process.env.ENABLEOS_PORT || (devMode ? 8787 : 4173));
const envKey = (process.env.ENABLEOS_API_KEY || '').trim();
const envEndpoint = (process.env.ENABLEOS_API_ENDPOINT || '').trim();
const envModel = (process.env.ENABLEOS_API_MODEL || '').trim();
const shutdownToken = (process.env.ENABLEOS_SHUTDOWN_TOKEN || '').trim();
let sessionKey = '';
let sessionEndpoint = '';

const attempts = new Map();
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function securityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
}

function json(response, status, body) {
  securityHeaders(response);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function localOriginAllowed(request) {
  const fetchSite = request.headers['sec-fetch-site'];
  if (fetchSite === 'cross-site') return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_500_000) throw new Error('请求内容过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function rateLimited(request) {
  const address = request.socket.remoteAddress || 'local';
  const now = Date.now();
  const current = (attempts.get(address) || []).filter((time) => now - time < 60_000);
  current.push(now);
  attempts.set(address, current);
  return current.length > 40;
}

function resolveModelConfig(body) {
  const endpoint = normalizeEndpointIdentity(envEndpoint || String(body.endpoint || '').trim());
  const model = envModel || String(body.model || '').trim();
  const apiKey = envKey || sessionKey;
  if (!apiKey) throw new Error('网关尚未配置模型密钥');
  if (!envKey && sessionKey && sessionEndpoint && endpoint !== sessionEndpoint) throw new Error('API 地址已变化，请为新地址重新输入会话密钥');
  return { apiKey, model, endpoint, protocol: body.protocol === 'chat-completions' ? 'chat-completions' : 'responses' };
}

async function requestModel(body, signal) {
  const { apiKey, model, endpoint, protocol } = resolveModelConfig(body);
  const system = String(body.system || '').slice(0, 30_000);
  const user = String(body.user || '').slice(0, 250_000);
  const request = buildModelRequest({ endpoint, protocol, model, system, user });
  const upstream = await fetch(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(request.body),
    signal,
  });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) throw new Error(payload?.error?.message || `模型服务返回 ${upstream.status}`);
  const content = extractModelContent(payload, protocol);
  if (!content) throw new Error('模型没有返回内容');
  return content;
}

async function requestEmbeddings(body, signal) {
  const { apiKey, endpoint } = resolveModelConfig({ ...body, model: body.embeddingModel });
  const input = (Array.isArray(body.input) ? body.input : []).map((value) => String(value).slice(0, 12_000));
  const request = buildEmbeddingRequest({ endpoint, model: body.embeddingModel, input });
  const upstream = await fetch(request.url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(request.body), signal,
  });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) throw new Error(payload?.error?.message || `向量服务返回 ${upstream.status}`);
  return extractEmbeddings(payload, input.length);
}

async function handleApi(request, response, url) {
  if (!localOriginAllowed(request)) return json(response, 403, { error: '只允许本机页面访问 AI 网关' });
  if (rateLimited(request)) return json(response, 429, { error: '请求过于频繁，请稍后再试' });

  if (request.method === 'GET' && url.pathname === '/api/status') {
    return json(response, 200, {
      ok: true,
      gateway: 'local',
      hasApiKey: Boolean(envKey || sessionKey),
      keySource: envKey ? 'environment' : sessionKey ? 'session' : 'none',
      keyEndpointBound: Boolean(sessionKey && sessionEndpoint),
      endpointLocked: Boolean(envEndpoint),
      modelLocked: Boolean(envModel),
      supportsShutdown: Boolean(shutdownToken),
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/shutdown') {
    if (!shutdownToken || request.headers['x-enableos-shutdown'] !== shutdownToken) return json(response, 403, { error: '关闭凭证无效' });
    json(response, 200, { ok: true, message: 'EnableOS 正在安全关闭' });
    setImmediate(() => server.close(() => process.exit(0)));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/session-key') {
    const body = await readJson(request);
    const next = String(body.apiKey || '').trim();
    if (next.length < 8) return json(response, 400, { error: '密钥格式无效' });
    const endpoint = normalizeEndpointIdentity(String(body.endpoint || '').trim());
    sessionKey = next;
    sessionEndpoint = endpoint;
    return json(response, 200, { ok: true, message: '密钥仅保存在本次网关进程的内存中，关闭后自动清除。' });
  }

  if (request.method === 'DELETE' && url.pathname === '/api/session-key') {
    sessionKey = '';
    sessionEndpoint = '';
    return json(response, 200, { ok: true });
  }

  if (request.method === 'POST' && (url.pathname === '/api/ai' || url.pathname === '/api/test' || url.pathname === '/api/embeddings')) {
    const body = await readJson(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      if (url.pathname === '/api/embeddings') {
        const startedAt = Date.now();
        const vectors = await requestEmbeddings(body, controller.signal);
        return json(response, 200, { ok: true, vectors, model: body.embeddingModel, latencyMs: Date.now() - startedAt, dimensions: vectors[0]?.length || 0 });
      }
      const startedAt = Date.now();
      const content = await requestModel(url.pathname === '/api/test'
        ? { ...body, system: '只回复 OK', user: '连接测试' }
        : body, controller.signal);
      return json(response, 200, { ok: true, content, latencyMs: Date.now() - startedAt, protocol: body.protocol || 'responses' });
    } finally {
      clearTimeout(timeout);
    }
  }

  return json(response, 404, { error: '接口不存在' });
}

async function serveFile(request, response, url) {
  if (devMode) return json(response, 404, { error: '开发模式仅提供 API，请访问 Vite 地址。' });
  if (!['GET', 'HEAD'].includes(request.method || 'GET')) return json(response, 405, { error: '请求方法不允许' });
  const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const basePath = resolve(webRoot);
  let filePath = resolve(basePath, requested.replace(/^[/\\]+/, ''));
  if (filePath !== basePath && !filePath.startsWith(`${basePath}${sep}`)) return json(response, 403, { error: '路径无效' });
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(webRoot, 'index.html');
  }
  const content = await readFile(filePath);
  securityHeaders(response);
  const immutable = /\/assets\//.test(url.pathname);
  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  response.end(request.method === 'HEAD' ? undefined : content);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);
    if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
    else await serveFile(request, response, url);
  } catch (error) {
    const message = error?.name === 'AbortError' ? '模型请求超时' : error instanceof Error ? error.message : '服务异常';
    json(response, 500, { error: message });
  }
});

function openBrowser(url) {
  try {
    let opener;
    if (process.platform === 'win32') {
      const command = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
      opener = spawn(command, ['/d', '/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true });
    } else if (process.platform === 'darwin') {
      opener = spawn('/usr/bin/open', [url], { detached: true, stdio: 'ignore' });
    } else {
      opener = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    }
    opener.once('error', (error) => {
      process.stderr.write(`Could not open the browser automatically: ${error.message}\nOpen ${url} manually.\n`);
    });
    opener.unref();
  } catch (error) {
    process.stderr.write(`Could not open the browser automatically: ${error instanceof Error ? error.message : 'unknown error'}\nOpen ${url} manually.\n`);
  }
}

server.on('error', (error) => {
  process.stderr.write(`EnableOS could not start on http://${host}:${port}: ${error.message}\n`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  const url = devMode ? 'http://127.0.0.1:5173' : `http://${host}:${port}`;
  process.stdout.write(`EnableOS ${devMode ? 'AI gateway' : 'web'}: ${url}\n`);
  if (!devMode && host === '127.0.0.1' && !process.env.ENABLEOS_NO_OPEN) {
    openBrowser(url);
  }
});
