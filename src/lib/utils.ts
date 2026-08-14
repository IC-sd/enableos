import { randomUUID } from './uuid';
import type { Activity, AppDatabase, Project, Task } from '../../shared/models';
import { isActive } from './entity-history';

export { randomUUID };

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function formatDate(value: string, fallback = '未设置'): string {
  if (!value) return fallback;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(date);
}

export function formatFullDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function today(): string {
  return localDateString(new Date());
}

export function startOfWeek(): string {
  const now = new Date();
  const day = now.getDay() || 7;
  now.setDate(now.getDate() - day + 1);
  return localDateString(now);
}

export function endOfWeek(): string {
  const date = new Date(`${startOfWeek()}T00:00:00`);
  date.setDate(date.getDate() + 6);
  return localDateString(date);
}

export function activity(type: Activity['type'], title: string, description: string, entityId: string | null = null): Activity {
  return { id: randomUUID(), type, entityId, title, description, timestamp: new Date().toISOString() };
}

export function projectProgress(project: Project, tasks: Task[]): number {
  const related = tasks.filter((task) => task.projectId === project.id && isActive(task));
  if (!related.length) return project.progress;
  return Math.round((related.filter((task) => task.status === 'done').length / related.length) * 100);
}

function contextTerms(value: string): string[] {
  const normalized = value.toLowerCase();
  const words = normalized.match(/[a-z0-9][a-z0-9_-]+|[\u4e00-\u9fff]+/g) ?? [];
  const terms = words.flatMap((word) => {
    if (!/[\u4e00-\u9fff]/.test(word) || word.length <= 2) return [word];
    return [word, ...Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2))];
  });
  return [...new Set(terms.filter((term) => term.length > 1))];
}

export function buildCompanyContext(database: AppDatabase, query = ''): string {
  const allowedKnowledge = database.knowledge.filter((item) => isActive(item) && (item.confidentiality === 'public' || (database.settings.externalEvidenceScope === 'public-and-internal' && item.confidentiality === 'internal')));
  const terms = contextTerms(query);
  const rankedKnowledge = allowedKnowledge
    .map((item) => {
      const title = item.title.toLowerCase();
      const summary = item.summary.toLowerCase();
      const content = item.content.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 4 : 0) + (summary.includes(term) ? 2 : 0) + (content.includes(term) ? 1 : 0), 0);
      return { item, score };
    })
    .filter((entry) => !terms.length || entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt))
    .slice(0, terms.length ? 6 : 8);
  const knowledge = rankedKnowledge.map(({ item }) => `${item.title}：${item.summary || item.content.slice(0, 160)}`).join('\n');
  return [
    `公司：${database.profile.company || '尚未填写'}`,
    `岗位：${database.profile.role || '尚未填写'}`,
    `部门：${database.profile.department || '尚未填写'}`,
    `外部AI规则：${database.settings.externalAiPolicy === 'approved-with-rules' ? '按已确认规则允许' : database.settings.externalAiPolicy === 'forbidden' ? '禁止发送公司资料' : '尚未确认'}`,
    `可发送证据范围：${database.settings.externalEvidenceScope === 'public-and-internal' ? '公开和内部（敏感除外）' : '仅公开'}`,
    `批准工具：${database.settings.approvedTools || '尚未填写'}`,
    `资料处理规则：${database.settings.dataHandlingNotes || '尚未填写'}`,
    `导师预期：${database.settings.mentorExpectation || '尚未填写'}`,
    `汇报节奏：${database.settings.reportCadence || '尚未填写'}`,
    knowledge ? `与当前任务相关、且允许进入模型上下文的资料：\n${knowledge}` : '没有找到允许发送且与当前任务相关的资料。',
  ].join('\n');
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export function truncate(value: string, max = 80): string {
  const normalized = value.trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}
