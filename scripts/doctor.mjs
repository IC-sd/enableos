import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const jsonMode = process.argv.includes('--json');
const checks = [];

function record(name, ok, detail, blocking = false) {
  checks.push({ name, ok, detail, blocking });
}

async function exists(relativePath) {
  try {
    const info = await stat(join(root, relativePath));
    return info.isFile() || info.isDirectory();
  } catch {
    return false;
  }
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
record('Node.js', nodeMajor >= 20, `${process.versions.node}（需要 20 或更高）`, true);

for (const path of ['package.json', 'pnpm-lock.yaml', 'server/index.mjs', 'src/main.tsx']) {
  const present = await exists(path);
  record(path, present, present ? '存在' : '缺失', true);
}

const dependenciesPresent = await exists('node_modules');
record('依赖目录', dependenciesPresent, dependenciesPresent ? '已安装' : '缺失，请运行首次安装脚本', true);
const buildPresent = await exists('dist/web/index.html');
record('生产构建', buildPresent, buildPresent ? '已生成' : '缺失，请运行 pnpm build', true);

try {
  await access(join(root, 'server'), constants.W_OK);
  record('运行目录', true, '可写');
} catch {
  record('运行目录', false, 'server 目录不可写，无法保存本机运行凭证和日志', true);
}

try {
  const response = await fetch('http://127.0.0.1:4173/api/status', { cache: 'no-store', signal: AbortSignal.timeout(800) });
  const body = await response.json().catch(() => ({}));
  record('本机端口 4173', response.ok && body?.gateway === 'local', body?.gateway === 'local' ? 'EnableOS 正在运行' : '端口被其他服务占用', body?.gateway !== 'local');
} catch {
  record('本机端口 4173', true, '可用于启动');
}

const failed = checks.filter((check) => !check.ok);
const blocking = failed.filter((check) => check.blocking);

if (jsonMode) {
  process.stdout.write(`${JSON.stringify({ ok: blocking.length === 0, checks }, null, 2)}\n`);
} else {
  process.stdout.write('EnableOS 环境检查\n\n');
  for (const check of checks) process.stdout.write(`${check.ok ? '[通过]' : '[需处理]'} ${check.name}：${check.detail}\n`);
  process.stdout.write(`\n${blocking.length ? `发现 ${blocking.length} 个阻塞问题。` : '环境已满足运行条件。'}\n`);
}

process.exitCode = blocking.length ? 1 : 0;
