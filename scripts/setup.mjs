import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const managerVersion = '11.19.0';
const debug = process.argv.includes('--debug');
const candidates = process.platform === 'win32'
  ? [
      { command: 'pnpm.cmd', prefix: [] },
      { command: 'corepack.cmd', prefix: ['pnpm'] },
      { command: 'npx.cmd', prefix: ['--yes', `pnpm@${managerVersion}`] },
    ]
  : [
      { command: 'pnpm', prefix: [] },
      { command: 'corepack', prefix: ['pnpm'] },
      { command: 'npx', prefix: ['--yes', `pnpm@${managerVersion}`] },
    ];

function execute(candidate, args, stdio) {
  if (process.platform !== 'win32') return spawnSync(candidate.command, [...candidate.prefix, ...args], { cwd: root, stdio, shell: false });
  const commandLine = [candidate.command, ...candidate.prefix, ...args].join(' ');
  return spawnSync(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', ['/d', '/s', '/c', commandLine], { cwd: root, stdio, shell: false });
}

function available(candidate) {
  const result = execute(candidate, ['--version'], debug ? 'pipe' : 'ignore');
  if (debug) process.stdout.write(`${candidate.command}: status=${result.status} error=${result.error?.message || 'none'} stdout=${String(result.stdout || '').trim()} stderr=${String(result.stderr || '').trim()}\n`);
  return !result.error && result.status === 0;
}

function run(candidate, args) {
  const result = execute(candidate, args, 'inherit');
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}

const manager = candidates.find(available);
if (!manager) {
  process.stderr.write('未找到 pnpm、Corepack 或 npx。请安装 Node.js 20 或更高版本后重试。\n');
  process.exit(1);
}

process.stdout.write('正在安装锁定版本的依赖…\n');
run(manager, ['install', '--frozen-lockfile']);
process.stdout.write('\n正在验证并生成生产版本…\n');
run(manager, ['build']);
process.stdout.write('\n正在检查运行环境…\n');
run(manager, ['run', 'health']);
process.stdout.write('\n首次安装完成。现在可以双击“启动 EnableOS.cmd”。\n');
