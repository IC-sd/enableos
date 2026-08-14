import { closeSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const url = 'http://127.0.0.1:4173';
const noOpen = process.argv.includes('--no-open');
const stdoutPath = join(root, 'server', 'enableos-runtime.log');
const stderrPath = join(root, 'server', 'enableos-error.log');
const pidPath = join(root, 'server', 'enableos.pid');
const tokenPath = join(root, 'server', 'enableos.token');

async function isReady() {
  try {
    const response = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1_000), cache: 'no-store' });
    const body = await response.json();
    return response.ok && body?.gateway === 'local';
  } catch {
    return false;
  }
}

function openBrowser() {
  if (noOpen) return;
  try {
    let child;
    if (process.platform === 'win32') {
      const command = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
      child = spawn(command, ['/d', '/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true });
    } else if (process.platform === 'darwin') {
      child = spawn('/usr/bin/open', [url], { detached: true, stdio: 'ignore' });
    } else {
      child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    }
    child.once('error', () => process.stderr.write(`Open this address manually: ${url}\n`));
    child.unref();
  } catch {
    process.stderr.write(`Open this address manually: ${url}\n`);
  }
}

if (await isReady()) {
  process.stdout.write(`EnableOS is already running: ${url}\n`);
  openBrowser();
  process.exit(0);
}

for (const path of [stdoutPath, stderrPath]) {
  try { if (statSync(path).size > 2_000_000) writeFileSync(path, '', 'utf8'); } catch { /* first launch */ }
}
const shutdownToken = randomBytes(32).toString('hex');
writeFileSync(tokenPath, shutdownToken, { encoding: 'utf8', mode: 0o600 });
const stdout = openSync(stdoutPath, 'a');
const stderr = openSync(stderrPath, 'a');
const child = spawn(process.execPath, [join(root, 'server', 'index.mjs')], {
  cwd: root,
  detached: true,
  windowsHide: true,
  stdio: ['ignore', stdout, stderr],
  env: { ...process.env, ENABLEOS_NO_OPEN: '1', ENABLEOS_SHUTDOWN_TOKEN: shutdownToken },
});
child.once('error', (error) => process.stderr.write(`Could not start EnableOS: ${error.message}\n`));
child.unref();
closeSync(stdout);
closeSync(stderr);
writeFileSync(pidPath, String(child.pid), 'utf8');

for (let attempt = 0; attempt < 50; attempt += 1) {
  if (await isReady()) {
    process.stdout.write(`EnableOS is ready: ${url}\n`);
    openBrowser();
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}

let details = '';
try { details = readFileSync(stderrPath, 'utf8').slice(-3_000); } catch { /* log may not exist */ }
process.stderr.write(`EnableOS did not become ready.\n${details || `Check ${stderrPath}`}\n`);
process.exit(1);
