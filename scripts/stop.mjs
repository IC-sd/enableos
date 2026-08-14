import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tokenPath = join(root, 'server', 'enableos.token');
const pidPath = join(root, 'server', 'enableos.pid');

let token = '';
try { token = readFileSync(tokenPath, 'utf8').trim(); } catch {
  process.stdout.write('EnableOS 没有可用的运行凭证，可能已经关闭。\n');
  process.exit(0);
}

try {
  const response = await fetch('http://127.0.0.1:4173/api/shutdown', { method: 'POST', headers: { 'X-EnableOS-Shutdown': token }, signal: AbortSignal.timeout(3_000) });
  if (!response.ok) throw new Error(`本机网关返回 ${response.status}`);
  for (const path of [tokenPath, pidPath]) { try { unlinkSync(path); } catch { /* already removed */ } }
  process.stdout.write('EnableOS 已安全关闭。\n');
} catch (error) {
  process.stderr.write(`无法安全关闭：${error instanceof Error ? error.message : '未知错误'}\n请确认当前运行的是最新版本。\n`);
  process.exit(1);
}
