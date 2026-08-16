import type { AppDatabase } from '../../shared/models';

export interface WorkspaceHealthIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  count: number;
  title: string;
  detail: string;
  repairable: boolean;
}

function duplicateCount(values: string[]): number {
  return values.length - new Set(values).size;
}

export function inspectWorkspace(database: AppDatabase): WorkspaceHealthIssue[] {
  const issues: WorkspaceHealthIssue[] = [];
  const projectIds = new Set(database.projects.map((project) => project.id));
  const taskIds = new Set(database.tasks.map((task) => task.id));
  const linked = [...database.tasks, ...database.knowledge, ...database.scenarios, ...database.reports]
    .filter((item) => item.projectId && !projectIds.has(item.projectId)).length;
  if (linked) issues.push({ code: 'orphan-project-links', severity: 'error', count: linked, title: '存在失效的项目关联', detail: '关联项目已不存在，可能影响筛选、汇报和证据追踪。', repairable: true });

  const orphanTaskLinks = [...database.knowledge, ...database.scenarios, ...database.reports]
    .filter((item) => item.taskId && !taskIds.has(item.taskId)).length;
  if (orphanTaskLinks) issues.push({ code: 'orphan-task-links', severity: 'error', count: orphanTaskLinks, title: '存在失效的任务关联', detail: '关联任务已不存在；资料本身仍然保留，可安全解除这条失效关联。', repairable: true });

  const collections = [database.projects, database.tasks, database.knowledge, database.scenarios, database.activities, database.reports, database.revisions];
  const duplicates = collections.reduce((sum, values) => sum + duplicateCount(values.map((item) => item.id)), 0);
  if (duplicates) issues.push({ code: 'duplicate-ids', severity: 'error', count: duplicates, title: '存在重复数据标识', detail: '重复标识可能造成覆盖，需先导出备份再人工核对。', repairable: false });

  const invalidScores = database.projects.filter((item) => item.progress < 0 || item.progress > 100 || !Number.isFinite(item.progress)).length
    + database.scenarios.filter((item) => [item.dataReadiness, item.valueScore, item.feasibilityScore].some((value) => value < 0 || value > 100 || !Number.isFinite(value))).length;
  if (invalidScores) issues.push({ code: 'invalid-scores', severity: 'warning', count: invalidScores, title: '进度或评分超出范围', detail: '数值应位于 0–100，系统可以安全归一化。', repairable: true });

  const reversedReports = database.reports.filter((item) => item.rangeStart && item.rangeEnd && item.rangeStart > item.rangeEnd).length;
  if (reversedReports) issues.push({ code: 'reversed-report-ranges', severity: 'warning', count: reversedReports, title: '汇报日期范围前后颠倒', detail: '系统可以交换起止日期，不修改汇报正文。', repairable: true });

  const fingerprints = database.knowledge.map((item) => item.fingerprint).filter((value): value is string => Boolean(value));
  const duplicateEvidence = duplicateCount(fingerprints);
  if (duplicateEvidence) issues.push({ code: 'duplicate-evidence', severity: 'warning', count: duplicateEvidence, title: '证据库存在重复内容', detail: '已检测到相同内容指纹；为避免误删，不自动合并。', repairable: false });

  const entityIds = new Set([...database.projects, ...database.tasks, ...database.knowledge, ...database.scenarios, ...database.reports].map((item) => item.id));
  const orphanRevisions = database.revisions.filter((revision) => !entityIds.has(revision.entityId)).length;
  if (orphanRevisions) issues.push({ code: 'orphan-revisions', severity: 'info', count: orphanRevisions, title: '存在无法定位实体的历史快照', detail: '可能来自旧版永久删除；不会影响当前数据，建议在下次完整备份后人工核对。', repairable: false });

  if (database.settings.externalAiPolicy === 'approved-with-rules' && !database.settings.dataHandlingNotes.trim()) issues.push({ code: 'missing-data-policy', severity: 'warning', count: 1, title: '允许外部 AI 但未记录资料规则', detail: '建议补充可用资料、脱敏方式、保存位置和可见范围。', repairable: false });
  if (database.settings.aiMode === 'api' && !database.settings.apiModel.trim()) issues.push({ code: 'missing-model', severity: 'info', count: 1, title: '模型增强尚未填写生成模型', detail: '系统会安全回退本地方法。', repairable: false });
  if (database.settings.retrievalMode === 'hybrid' && !database.settings.embeddingModel.trim()) issues.push({ code: 'missing-embedding-model', severity: 'info', count: 1, title: '混合检索尚未填写向量模型', detail: '证据问答会回退本地关键词检索。', repairable: false });
  return issues;
}

function clamp(value: number): number { return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)); }

export function repairWorkspace(database: AppDatabase): { database: AppDatabase; repaired: number } {
  const projectIds = new Set(database.projects.map((project) => project.id));
  const taskIds = new Set(database.tasks.map((task) => task.id));
  let repaired = 0;
  const unlink = <T extends { projectId: string | null }>(item: T): T => {
    if (item.projectId && !projectIds.has(item.projectId)) { repaired += 1; return { ...item, projectId: null }; }
    return item;
  };
  const unlinkTask = <T extends { taskId: string | null }>(item: T): T => {
    if (item.taskId && !taskIds.has(item.taskId)) { repaired += 1; return { ...item, taskId: null }; }
    return item;
  };
  const projects = database.projects.map((item) => {
    const progress = clamp(item.progress);
    if (progress !== item.progress) repaired += 1;
    return { ...item, progress };
  });
  const scenarios = database.scenarios.map((original) => {
    const item = unlinkTask(unlink(original));
    const values = { dataReadiness: clamp(item.dataReadiness), valueScore: clamp(item.valueScore), feasibilityScore: clamp(item.feasibilityScore) };
    if (values.dataReadiness !== item.dataReadiness || values.valueScore !== item.valueScore || values.feasibilityScore !== item.feasibilityScore) repaired += 1;
    return { ...item, ...values };
  });
  const reports = database.reports.map((original) => {
    const item = unlinkTask(unlink(original));
    if (item.rangeStart && item.rangeEnd && item.rangeStart > item.rangeEnd) { repaired += 1; return { ...item, rangeStart: item.rangeEnd, rangeEnd: item.rangeStart }; }
    return item;
  });
  return { database: { ...database, projects, tasks: database.tasks.map(unlink), knowledge: database.knowledge.map((item) => unlinkTask(unlink(item))), scenarios, reports }, repaired };
}
