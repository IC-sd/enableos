import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const playwrightPath = process.env.PLAYWRIGHT_PATH;
if (!playwrightPath) throw new Error('PLAYWRIGHT_PATH is required');
const { chromium } = await import(pathToFileURL(join(playwrightPath, 'index.mjs')).href);
const root = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
});
const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'zh-CN', bypassCSP: true });
const page = await context.newPage();
page.setDefaultTimeout(10_000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: '从一条要求，推进到可交付结果。' }).waitFor();
await page.getByText('按“原始要求 → 澄清 → 行动 → 证据 → 交付”推进，每一步都能修改、复核和追溯。').waitFor();
await page.waitForTimeout(800);
await page.screenshot({ path: 'docs/enableos-web-preview.png', fullPage: true });

await page.getByRole('button', { name: /设置/ }).click();
await page.getByRole('heading', { name: '设置' }).waitFor();
await page.getByRole('heading', { name: '入职边界核对' }).waitFor();
await page.getByText('未确认前，系统不会把工作资料发送给外部模型。').waitFor();
await page.getByRole('heading', { name: '数据、备份与审计' }).waitFor();
await page.getByRole('button', { name: '导出审计记录' }).waitFor();
await page.getByRole('button', { name: '验证审计文件' }).waitFor();
await page.getByRole('button', { name: '导出加密备份' }).click();
const backupDialog = page.getByRole('dialog', { name: '导出加密备份' });
await backupDialog.getByLabel('备份密码').waitFor();
if (await backupDialog.getByLabel('备份密码').getAttribute('type') !== 'password') throw new Error('Backup password field is not masked');
await page.keyboard.press('Escape');
await page.getByRole('heading', { name: '工作区健康检查' }).waitFor();
await page.locator('.mode-selector button').filter({ hasText: '模型增强' }).click();
await page.getByRole('combobox', { name: '接口协议' }).waitFor();
await page.getByPlaceholder('例如 text-embedding-3-small').waitFor();
await page.getByText(/最近诊断/).waitFor();
await page.screenshot({ path: 'docs/enableos-settings.png', fullPage: true });

await page.getByRole('button', { name: '交付' }).click();
await page.getByRole('heading', { name: '交付中心' }).waitFor();
const reportPanel = await page.locator('.report-builder').boundingBox();
const endDate = await page.locator('.date-range input[type="date"]').nth(1).boundingBox();
if (!reportPanel || !endDate || endDate.x + endDate.width > reportPanel.x + reportPanel.width + 1) throw new Error('End date input overflows the report builder panel');
await page.getByRole('button', { name: '生成本期汇报' }).click();
await page.locator('.report-textarea').waitFor();
await page.locator('.report-editor .citation-status.valid').waitFor();
await page.screenshot({ path: 'docs/enableos-report-center.png', fullPage: true });
await page.getByRole('button', { name: '工作线', exact: true }).click();
await page.getByRole('heading', { name: '从一条要求，推进到可交付结果。' }).waitFor();

await page.getByRole('button', { name: '收下一条要求' }).click();
await page.getByPlaceholder('粘贴对方的原话、会议记录或你还没想清楚的任务……').fill('明天前整理设备故障资料，并给导师一份可验证的AI辅助方案');
await page.getByRole('button', { name: '分析并创建任务' }).click();
await page.getByRole('heading', { name: '从一条要求，推进到可交付结果。' }).waitFor();
await page.locator('.canvas-heading h2').filter({ hasText: '设备故障' }).waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: 'docs/enableos-task-flow.png', fullPage: true });
await page.locator('.navigation').getByRole('button', { name: '任务', exact: true }).click();
await page.getByRole('heading', { name: '任务收件箱' }).waitFor();
const task = page.locator('.task-card').filter({ hasText: '设备故障' }).first();
if (await page.locator('.task-card').count() === 0) {
  throw new Error(`Task flow rendered no cards. Body text:\n${(await page.locator('body').innerText()).slice(0, 3000)}`);
}
if (!(await task.textContent())?.includes('设备故障')) throw new Error('Created task is missing from the task flow');
const beforeReload = await page.evaluate(async () => {
  const journal = localStorage.getItem('enableos-write-ahead');
  const tasks = await new Promise((resolve, reject) => {
    const request = indexedDB.open('enableos-workspace');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const tx = database.transaction('tasks', 'readonly');
      const get = tx.objectStore('tasks').getAll();
      get.onerror = () => reject(get.error);
      get.onsuccess = () => resolve(get.result);
    };
  });
  return { journal, tasks };
});
if (!JSON.stringify(beforeReload).includes('设备故障')) throw new Error('IndexedDB snapshot is missing the created task');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: '任务', exact: true }).click();
await page.getByRole('heading', { name: '任务收件箱' }).waitFor();
const persistedTask = page.locator('.task-card').filter({ hasText: '设备故障' }).first();
if (await page.locator('.task-card').count() === 0) {
  throw new Error(`Task did not persist. Browser state before reload: ${JSON.stringify(beforeReload).slice(0, 2500)}`);
}
if (!(await persistedTask.textContent())?.includes('设备故障')) throw new Error('Created task did not persist after reload');

await persistedTask.click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'docs/enableos-task-editor.png', fullPage: true });
page.once('dialog', (dialog) => dialog.accept());
await page.getByRole('dialog').getByRole('button', { name: '标记完成' }).click();
await page.waitForTimeout(300);
await page.locator('.segmented-control').getByRole('button', { name: '已完成' }).click();
const completedTask = page.locator('.task-card').filter({ hasText: '设备故障' }).first();
await completedTask.waitFor();
await completedTask.click();
await page.getByRole('dialog').getByRole('button', { name: '重新打开' }).click();
await page.locator('.segmented-control').getByRole('button', { name: '未完成' }).click();
await page.locator('.task-card').filter({ hasText: '设备故障' }).first().waitFor();
await page.waitForTimeout(700);
const reopened = await page.evaluate(async () => new Promise((resolve, reject) => {
  const request = indexedDB.open('enableos-workspace');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const tx = request.result.transaction('tasks', 'readonly');
    const get = tx.objectStore('tasks').getAll();
    get.onerror = () => reject(get.error);
    get.onsuccess = () => resolve(get.result.find((item) => item.title.includes('设备故障')));
  };
}));
if (!reopened || reopened.status === 'done' || reopened.completedAt) throw new Error(`Reopen did not clear the completed state: ${JSON.stringify(reopened)}`);

await page.getByRole('button', { name: '今天', exact: true }).click();
await page.getByRole('heading', { name: '今天', exact: true }).waitFor();
await page.getByText(/未来 7 天|今天到期|尚未排期/).first().waitFor();
await page.screenshot({ path: 'docs/enableos-today.png', fullPage: true });
await page.getByRole('button', { name: '任务', exact: true }).click();
await page.locator('.task-card').filter({ hasText: '设备故障' }).first().click();
page.once('dialog', (dialog) => dialog.accept());
await page.getByRole('dialog').getByRole('button', { name: '移入回收站' }).click();
await page.getByRole('button', { name: '回收站', exact: true }).click();
await page.getByRole('heading', { name: '回收站' }).waitFor();
const trashed = page.locator('.trash-list article').filter({ hasText: '设备故障' }).first();
await trashed.waitFor();
await page.screenshot({ path: 'docs/enableos-trash.png', fullPage: true });
await trashed.getByRole('button', { name: '恢复' }).click();
await page.locator('.navigation').getByRole('button', { name: '任务', exact: true }).click();
await page.locator('.task-card').filter({ hasText: '设备故障' }).first().waitFor();

await page.getByRole('button', { name: '资料', exact: true }).click();
await page.getByRole('heading', { name: '证据库' }).waitFor();
if (!page.url().endsWith('#/knowledge')) throw new Error('Browser route did not update');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: '证据库' }).waitFor();
await page.getByPlaceholder('例如：设备报警后应该先确认什么？').fill('AI机会应该如何验证？');
await page.getByRole('button', { name: '检索并回答' }).click();
await page.locator('.knowledge-answer .citation-status.valid').waitFor();

await page.addScriptTag({ path: join(root, 'node_modules', 'axe-core', 'axe.min.js') });
const violations = await page.evaluate(async () => {
  const result = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
  return result.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical').map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.map((node) => ({ target: node.target, html: node.html, summary: node.failureSummary })) }));
});
if (violations.length) throw new Error(`Accessibility violations:\n${JSON.stringify(violations, null, 2)}`);

await page.getByRole('button', { name: /搜索/ }).click();
await page.getByRole('dialog', { name: '搜索工作空间' }).waitFor();
await page.getByPlaceholder('搜索任务、项目、证据、实验或交付……').fill('AI机会');
await page.getByRole('dialog', { name: '搜索工作空间' }).getByText('AI机会验证框架').waitFor();
await page.getByRole('dialog', { name: '搜索工作空间' }).getByText('AI机会验证框架').click();
if (!page.url().includes('#/knowledge/')) throw new Error(`Search result did not open an entity route: ${page.url()}`);
const openedKnowledgeTitle = await page.getByRole('dialog').locator('input').first().inputValue();
if (openedKnowledgeTitle !== 'AI机会验证框架') throw new Error(`Search opened the wrong evidence item: ${openedKnowledgeTitle}`);
await page.keyboard.press('Escape');

await page.evaluate(async () => { await navigator.serviceWorker.ready; });
await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: '证据库' }).waitFor();
await context.setOffline(false);

const secondTab = await context.newPage();
await secondTab.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
await secondTab.getByText('另一个标签页正在编辑。当前页实时同步但不会写入，避免覆盖。').waitFor();
await secondTab.close();

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
const mobile = await mobileContext.newPage();
await mobile.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
await mobile.getByRole('heading', { name: '从一条要求，推进到可交付结果。' }).waitFor();
await mobile.waitForTimeout(800);
await mobile.screenshot({ path: 'docs/enableos-web-mobile.png', fullPage: true });

const mistakenFileEntry = await context.newPage();
await mistakenFileEntry.goto(pathToFileURL(join(root, 'index.html')).href, { waitUntil: 'domcontentloaded' });
await mistakenFileEntry.waitForURL('http://127.0.0.1:4173/');
await mistakenFileEntry.getByRole('heading', { name: '从一条要求，推进到可交付结果。' }).waitFor();
await mistakenFileEntry.close();

if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
process.stdout.write(JSON.stringify({ ok: true, desktop: 'docs/enableos-web-preview.png', settings: 'docs/enableos-settings.png', reportCenter: 'docs/enableos-report-center.png', taskFlow: 'docs/enableos-task-flow.png', taskEditor: 'docs/enableos-task-editor.png', mobile: 'docs/enableos-web-mobile.png' }));
await browser.close();
