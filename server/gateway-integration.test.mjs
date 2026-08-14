import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let upstream;
let gateway;
let upstreamPort;
let gatewayPort;
const shutdownToken = 'integration-shutdown-token';

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`gateway did not start at ${url}`);
}

beforeAll(async () => {
  upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (request.headers.authorization !== 'Bearer integration-key') { response.writeHead(401); response.end('{"error":{"message":"bad key"}}'); return; }
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/v1/responses') response.end(JSON.stringify({ output_text: body.input === '连接测试' ? 'OK' : 'response-answer' }));
    else if (request.url === '/v1/chat/completions') response.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
    else if (request.url === '/v1/embeddings') response.end(JSON.stringify({ data: body.input.map((_, index) => ({ index, embedding: [index + 1, 0.5, 0.25] })) }));
    else { response.writeHead(404); response.end('{}'); }
  });
  upstreamPort = await listen(upstream);
  const reservation = createServer();
  gatewayPort = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  gateway = spawn(process.execPath, ['server/index.mjs', '--dev'], {
    cwd: process.cwd(), stdio: 'ignore', windowsHide: true,
    env: { ...process.env, ENABLEOS_PORT: String(gatewayPort), ENABLEOS_SHUTDOWN_TOKEN: shutdownToken },
  });
  await waitFor(`http://127.0.0.1:${gatewayPort}/api/status`);
}, 15_000);

afterAll(async () => {
  try { await fetch(`http://127.0.0.1:${gatewayPort}/api/shutdown`, { method: 'POST', headers: { 'x-enableos-shutdown': shutdownToken } }); } catch { /* already stopped */ }
  if (gateway && !gateway.killed) gateway.kill();
  if (upstream) await new Promise((resolve) => upstream.close(resolve));
});

describe('live local gateway', () => {
  it('binds the session key to one endpoint and proxies all supported contracts', async () => {
    const base = `http://127.0.0.1:${gatewayPort}`;
    const endpoint = `http://127.0.0.1:${upstreamPort}/v1`;
    const key = await fetch(`${base}/api/session-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: 'integration-key', endpoint }) });
    expect(key.ok).toBe(true);
    const responses = await fetch(`${base}/api/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint, model: 'test', protocol: 'responses' }) });
    expect((await responses.json()).content).toBe('OK');
    const chat = await fetch(`${base}/api/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint, model: 'test', protocol: 'chat-completions' }) });
    expect((await chat.json()).content).toBe('OK');
    const embeddings = await fetch(`${base}/api/embeddings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint, embeddingModel: 'embed', input: ['a', 'b'] }) });
    const embeddingBody = await embeddings.json();
    expect(embeddingBody.vectors).toEqual([[1, .5, .25], [2, .5, .25]]);
    expect(embeddingBody.dimensions).toBe(3);
    const changed = await fetch(`${base}/api/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: `http://127.0.0.1:${upstreamPort + 1}/v1`, model: 'test', protocol: 'responses' }) });
    expect(changed.status).toBe(500);
    expect((await changed.json()).error).toContain('重新输入会话密钥');
  });
});
