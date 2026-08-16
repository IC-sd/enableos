import Dexie, { type EntityTable } from 'dexie';
import type {
  Activity,
  AppDatabase,
  AppSettings,
  EntityRevision,
  KnowledgeItem,
  Profile,
  Project,
  SavedReport,
  Scenario,
  Task,
} from '../../shared/models';
import { randomUUID } from './uuid';

interface Snapshot {
  id: 'workspace';
  database: AppDatabase;
  updatedAt: string;
}

interface WorkspaceMeta {
  key: 'workspace';
  version: number;
  profile: Profile;
  settings: AppSettings;
  updatedAt: string;
}

type StoreName = 'projects' | 'tasks' | 'knowledge' | 'scenarios' | 'activities' | 'reports' | 'revisions';
type EntityRecord = Project | Task | KnowledgeItem | Scenario | Activity | SavedReport | EntityRevision;

interface ChangeSet {
  token: string;
  meta: WorkspaceMeta | null;
  upserts: Record<StoreName, EntityRecord[]>;
  deletes: Record<StoreName, string[]>;
}

type WorkspaceDexie = Dexie & {
  snapshots: EntityTable<Snapshot, 'id'>;
  meta: EntityTable<WorkspaceMeta, 'key'>;
  projects: EntityTable<Project, 'id'>;
  tasks: EntityTable<Task, 'id'>;
  knowledge: EntityTable<KnowledgeItem, 'id'>;
  scenarios: EntityTable<Scenario, 'id'>;
  activities: EntityTable<Activity, 'id'>;
  reports: EntityTable<SavedReport, 'id'>;
  revisions: EntityTable<EntityRevision, 'id'>;
};

const db = new Dexie('enableos-workspace') as WorkspaceDexie;
db.version(1).stores({ snapshots: 'id, updatedAt' });
db.version(2).stores({
  snapshots: 'id, updatedAt',
  meta: 'key, updatedAt',
  projects: 'id, status, updatedAt',
  tasks: 'id, projectId, status, updatedAt',
  knowledge: 'id, projectId, type, evidenceKind, updatedAt',
  scenarios: 'id, projectId, status, updatedAt',
  activities: 'id, type, entityId, timestamp',
  reports: 'id, projectId, kind, createdAt',
});
db.version(3).stores({
  snapshots: 'id, updatedAt',
  meta: 'key, updatedAt',
  projects: 'id, status, updatedAt',
  tasks: 'id, projectId, status, updatedAt',
  knowledge: 'id, projectId, taskId, type, evidenceKind, updatedAt',
  scenarios: 'id, projectId, taskId, status, updatedAt',
  activities: 'id, type, entityId, timestamp',
  reports: 'id, projectId, taskId, kind, createdAt',
});
db.version(4).stores({
  snapshots: 'id, updatedAt',
  meta: 'key, updatedAt',
  projects: 'id, status, deletedAt, updatedAt',
  tasks: 'id, projectId, status, dueDate, deletedAt, updatedAt',
  knowledge: 'id, projectId, taskId, type, evidenceKind, deletedAt, updatedAt',
  scenarios: 'id, projectId, taskId, status, deletedAt, updatedAt',
  activities: 'id, type, entityId, timestamp',
  reports: 'id, projectId, taskId, kind, deletedAt, createdAt',
  revisions: 'id, entityType, entityId, action, createdAt',
});

const journalKey = 'enableos-write-ahead';
const storeNames: StoreName[] = ['projects', 'tasks', 'knowledge', 'scenarios', 'activities', 'reports', 'revisions'];
const fingerprints: Record<StoreName, Map<string, string>> = {
  projects: new Map(), tasks: new Map(), knowledge: new Map(), scenarios: new Map(), activities: new Map(), reports: new Map(), revisions: new Map(),
};
let metaFingerprint = '';
let saveQueue: Promise<void> = Promise.resolve();

function now(): string { return new Date().toISOString(); }
function fingerprint(value: unknown): string { return JSON.stringify(value); }

export function createDemoDatabase(): AppDatabase {
  const createdAt = now();
  const projectId = randomUUID();
  const taskId = randomUUID();
  return {
    version: 5,
    profile: { name: '', company: '', role: 'AI应用工程师实习生', department: 'AI赋能', onboardingDate: '' },
    settings: {
      theme: 'light', aiMode: 'local', apiProtocol: 'responses', apiEndpoint: 'https://api.openai.com/v1', apiModel: '',
      embeddingModel: '', retrievalMode: 'lexical', hasApiKey: false, compactMode: false,
      externalAiPolicy: 'unknown', externalEvidenceScope: 'public-only', approvedTools: '', dataHandlingNotes: '', reportCadence: '', mentorExpectation: '', policyConfirmedAt: '',
      lastBackupAt: '',
    },
    projects: [{
      id: projectId,
      title: '入职准备与业务理解',
      objective: '快速理解公司业务、确认导师预期，并找到第一个值得验证的AI赋能机会。',
      brief: '把要求、资料、判断、验证和交付放进同一条证据链。入职后可直接改成真实任务。',
      status: 'active', department: '个人', progress: 20, dueDate: '', tags: ['入职', '业务理解'],
      deliverables: ['公司业务地图', '首月目标确认', '候选机会清单'],
      risks: ['未接触真实业务前，不预设固定落地方向'],
      nextAction: '准备与导师确认首周目标的问题清单。', createdAt, updatedAt: createdAt, deletedAt: '',
    }],
    tasks: [{
      id: taskId, projectId, title: '确认首周目标与交付预期',
      rawInput: '入职后与导师确认：首周希望我了解什么，一个月后希望看到什么成果。',
      summary: '明确工作边界、优先部门、可访问资料和首月交付物。', status: 'planned', priority: 'high', source: '示例', dueDate: '',
      clarificationQuestions: ['首月更看重业务调研、平台验证还是可运行的Demo？', '可以优先接触哪些部门和资料？', '每周用什么形式同步进展？'],
      clarificationAnswers: ['', '', ''],
      steps: ['准备问题清单', '与导师沟通', '记录原话与决定', '更新首月计划'], stepCompletion: [false, false, false, false],
      deliverables: ['首月目标确认单'], acceptanceCriteria: ['导师确认目标、优先级和汇报节奏'], createdAt, updatedAt: createdAt, completedAt: '', deletedAt: '',
    }],
    knowledge: [{
      id: randomUUID(), projectId, taskId, title: 'AI机会验证框架', type: 'process', evidenceKind: 'reference', verificationStatus: 'confirmed', category: '方法',
      content: '依次确认真实用户、当前流程、高频痛点、可用数据、期望输出、错误成本、人工兜底和成功指标。先测基线，再做最小闭环，最后决定是否扩大。',
      summary: '用用户、流程、数据、风险、基线和指标判断一个AI机会是否值得做。', sourceName: 'EnableOS 内置方法', sourcePath: '', tags: ['AI机会', '需求分析'], confidentiality: 'public', version: '3.0', createdAt, updatedAt: createdAt,
      sourceFingerprint: '', sourceSize: 0, sourceModifiedAt: '', sourceMime: '', deletedAt: '',
    }],
    scenarios: [], reports: [], revisions: [],
    activities: [{ id: randomUUID(), type: 'system', entityId: null, title: '浏览器工作区已就绪', description: '数据保存在当前浏览器，可随时导出加密备份。', timestamp: createdAt }],
  };
}

export function normalizeDatabase(value: Partial<AppDatabase> | null | undefined): AppDatabase {
  const fallback = createDemoDatabase();
  const projects = Array.isArray(value?.projects) ? value.projects : [];
  const defaultProjectId = projects.length === 1 ? projects[0].id : null;
  const rawSettings = { ...fallback.settings, ...(value?.settings ?? {}) };
  const lastBackupAt = String(rawSettings.lastBackupAt || '');
  return {
    version: 5,
    profile: { ...fallback.profile, ...(value?.profile ?? {}) },
    settings: { ...rawSettings, lastBackupAt: lastBackupAt && !Number.isNaN(Date.parse(lastBackupAt)) ? lastBackupAt : '' },
    projects: projects.map((item) => ({ ...item, deletedAt: item.deletedAt ?? '' })),
    tasks: (Array.isArray(value?.tasks) ? value.tasks : []).map((item) => {
      const clarificationQuestions = Array.isArray(item.clarificationQuestions) ? item.clarificationQuestions : [];
      const answers = Array.isArray(item.clarificationAnswers) ? item.clarificationAnswers : [];
      const steps = Array.isArray(item.steps) ? item.steps : [];
      const completion = Array.isArray(item.stepCompletion) ? item.stepCompletion : [];
      return {
        ...item,
        projectId: item.projectId ?? null,
        clarificationQuestions,
        clarificationAnswers: clarificationQuestions.map((_, index) => String(answers[index] ?? '')),
        steps,
        stepCompletion: steps.map((_, index) => Boolean(completion[index])),
        deliverables: Array.isArray(item.deliverables) ? item.deliverables : [],
        acceptanceCriteria: Array.isArray(item.acceptanceCriteria) ? item.acceptanceCriteria : [],
        deletedAt: item.deletedAt ?? '',
      };
    }),
    knowledge: (Array.isArray(value?.knowledge) ? value.knowledge : []).map((item) => ({
      ...item,
      projectId: item.projectId ?? defaultProjectId,
      taskId: item.taskId ?? null,
      evidenceKind: item.evidenceKind ?? (item.type === 'meeting' ? 'meeting' : 'reference'),
      verificationStatus: item.verificationStatus ?? 'unverified',
      tags: Array.isArray(item.tags) ? item.tags : [],
      sourceFingerprint: item.sourceFingerprint ?? '',
      sourceSize: Number(item.sourceSize ?? 0),
      sourceModifiedAt: item.sourceModifiedAt ?? '',
      sourceMime: item.sourceMime ?? '',
      deletedAt: item.deletedAt ?? '',
    })),
    scenarios: (Array.isArray(value?.scenarios) ? value.scenarios : []).map((item) => ({
      ...item,
      projectId: item.projectId ?? null,
      taskId: item.taskId ?? null,
      hypothesis: item.hypothesis ?? '',
      baseline: item.baseline ?? '',
      testCases: Array.isArray(item.testCases) ? item.testCases : [],
      runs: Array.isArray(item.runs) ? item.runs : [],
      decision: item.decision ?? 'undecided',
      decisionReason: item.decisionReason ?? '',
      deletedAt: item.deletedAt ?? '',
    })),
    activities: (Array.isArray(value?.activities) ? value.activities : []).slice(0, 5000),
    reports: (Array.isArray(value?.reports) ? value.reports : []).map((item) => ({
      ...item,
      projectId: item.projectId ?? null,
      taskId: item.taskId ?? null,
      kind: item.kind ?? 'weekly',
      updatedAt: item.updatedAt ?? item.createdAt,
      deletedAt: item.deletedAt ?? '',
    })),
    revisions: (Array.isArray(value?.revisions) ? value.revisions : []).slice(0, 1500),
  };
}

function cacheDatabase(database: AppDatabase): void {
  const meta = { key: 'workspace', version: database.version, profile: database.profile, settings: database.settings };
  metaFingerprint = fingerprint(meta);
  for (const name of storeNames) {
    fingerprints[name].clear();
    for (const entity of database[name] as EntityRecord[]) fingerprints[name].set(entity.id, fingerprint(entity));
  }
}

function emptyRecord<T>(factory: () => T): Record<StoreName, T> {
  return Object.fromEntries(storeNames.map((name) => [name, factory()])) as Record<StoreName, T>;
}

function buildChangeSet(database: AppDatabase): ChangeSet {
  const token = `${now()}-${Math.random().toString(36).slice(2)}`;
  const meta: WorkspaceMeta = { key: 'workspace', version: database.version, profile: database.profile, settings: database.settings, updatedAt: token };
  const comparableMeta = { key: meta.key, version: meta.version, profile: meta.profile, settings: meta.settings };
  const changeSet: ChangeSet = {
    token,
    meta: fingerprint(comparableMeta) === metaFingerprint ? null : meta,
    upserts: emptyRecord(() => [] as EntityRecord[]),
    deletes: emptyRecord(() => [] as string[]),
  };
  for (const name of storeNames) {
    const currentIds = new Set<string>();
    for (const entity of database[name] as EntityRecord[]) {
      currentIds.add(entity.id);
      if (fingerprints[name].get(entity.id) !== fingerprint(entity)) changeSet.upserts[name].push(entity);
    }
    for (const id of fingerprints[name].keys()) if (!currentIds.has(id)) changeSet.deletes[name].push(id);
  }
  return changeSet;
}

function hasChanges(changeSet: ChangeSet): boolean {
  return Boolean(changeSet.meta) || storeNames.some((name) => changeSet.upserts[name].length > 0 || changeSet.deletes[name].length > 0);
}

async function applyChangeSet(changeSet: ChangeSet): Promise<void> {
  await db.transaction('rw', [db.meta, db.projects, db.tasks, db.knowledge, db.scenarios, db.activities, db.reports, db.revisions], async () => {
    if (changeSet.meta) await db.meta.put(changeSet.meta);
    for (const name of storeNames) {
      const table = db.table(name);
      if (changeSet.upserts[name].length) await table.bulkPut(changeSet.upserts[name]);
      if (changeSet.deletes[name].length) await table.bulkDelete(changeSet.deletes[name]);
    }
  });
}

async function replaceAll(database: AppDatabase): Promise<void> {
  const meta: WorkspaceMeta = { key: 'workspace', version: database.version, profile: database.profile, settings: database.settings, updatedAt: now() };
  await db.transaction('rw', [db.meta, db.projects, db.tasks, db.knowledge, db.scenarios, db.activities, db.reports, db.revisions], async () => {
    await db.meta.put(meta);
    for (const name of storeNames) {
      const table = db.table(name);
      await table.clear();
      const records = database[name] as EntityRecord[];
      if (records.length) await table.bulkPut(records);
    }
  });
  cacheDatabase(database);
}

async function readNormalized(): Promise<AppDatabase | null> {
  const meta = await db.meta.get('workspace');
  if (!meta) return null;
  const [projects, tasks, knowledge, scenarios, activities, reports, revisions] = await Promise.all([
    db.projects.toArray(), db.tasks.toArray(), db.knowledge.toArray(), db.scenarios.toArray(), db.activities.toArray(), db.reports.toArray(), db.revisions.toArray(),
  ]);
  const normalized = normalizeDatabase({ version: meta.version, profile: meta.profile, settings: meta.settings, projects, tasks, knowledge, scenarios, activities, reports, revisions });
  if (meta.version !== normalized.version) await replaceAll(normalized);
  return normalized;
}

export async function loadDatabase(): Promise<AppDatabase> {
  const journal = localStorage.getItem(journalKey);
  if (journal) {
    const pending = JSON.parse(journal) as ChangeSet | { token: string; database: AppDatabase };
    if ('database' in pending) await replaceAll(normalizeDatabase(pending.database));
    else await applyChangeSet(pending);
    localStorage.removeItem(journalKey);
  }

  const normalized = await readNormalized();
  if (normalized) {
    cacheDatabase(normalized);
    return normalized;
  }

  const snapshot = await db.snapshots.get('workspace');
  const legacy = localStorage.getItem('enableos-browser-preview');
  const database = snapshot
      ? normalizeDatabase(snapshot.database)
    : legacy
      ? normalizeDatabase(JSON.parse(legacy) as AppDatabase)
      : createDemoDatabase();
  await replaceAll(database);
  if (legacy) localStorage.removeItem('enableos-browser-preview');
  return database;
}

export function saveDatabase(database: AppDatabase): Promise<void> {
  const normalized = normalizeDatabase(database);
  saveQueue = saveQueue.catch(() => undefined).then(async () => {
    const changeSet = buildChangeSet(normalized);
    if (!hasChanges(changeSet)) return;
    try {
      localStorage.setItem(journalKey, JSON.stringify(changeSet));
    } catch {
      // IndexedDB remains the source of truth if a single imported record exceeds localStorage quota.
    }
    await applyChangeSet(changeSet);
    cacheDatabase(normalized);
    const current = localStorage.getItem(journalKey);
    if (current && (JSON.parse(current) as { token?: string }).token === changeSet.token) localStorage.removeItem(journalKey);
  });
  return saveQueue;
}
