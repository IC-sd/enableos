import type {
  AppDatabase,
  EntityRevision,
  KnowledgeItem,
  Project,
  RevisableEntityType,
  RevisionAction,
  SavedReport,
  Scenario,
  Task,
} from '../../shared/models';
import { randomUUID } from './uuid';

export type RevisableEntity = Project | Task | KnowledgeItem | Scenario | SavedReport;

export const entityCollection = {
  project: 'projects',
  task: 'tasks',
  knowledge: 'knowledge',
  scenario: 'scenarios',
  report: 'reports',
} as const;

export const entityTypeLabel: Record<RevisableEntityType, string> = {
  project: '项目', task: '任务', knowledge: '资料', scenario: '试验', report: '交付',
};

export function isActive<T extends { deletedAt?: string }>(entity: T): boolean {
  return !entity.deletedAt;
}

export function createRevision(type: RevisableEntityType, entity: RevisableEntity, action: RevisionAction): EntityRevision {
  return {
    id: randomUUID(),
    entityType: type,
    entityId: entity.id,
    entityTitle: entity.title,
    action,
    snapshot: JSON.stringify(entity),
    createdAt: new Date().toISOString(),
  };
}

export function prependRevision(database: AppDatabase, type: RevisableEntityType, entity: RevisableEntity, action: RevisionAction): EntityRevision[] {
  return [createRevision(type, entity, action), ...database.revisions].slice(0, 1500);
}

export function parseRevisionSnapshot(revision: EntityRevision): RevisableEntity | null {
  try {
    const value = JSON.parse(revision.snapshot) as RevisableEntity;
    return value && typeof value.id === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function revisionsFor(database: AppDatabase, type: RevisableEntityType, id: string): EntityRevision[] {
  return database.revisions
    .filter((revision) => revision.entityType === type && revision.entityId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function restoreEntityRevision(database: AppDatabase, revisionId: string): AppDatabase {
  const revision = database.revisions.find((item) => item.id === revisionId);
  if (!revision) return database;
  const snapshot = parseRevisionSnapshot(revision);
  if (!snapshot) return database;
  const restored = { ...snapshot, deletedAt: '', updatedAt: new Date().toISOString() } as RevisableEntity;
  const collection = entityCollection[revision.entityType];
  const current = database[collection].find((item) => item.id === revision.entityId) as RevisableEntity | undefined;
  const revisions = current ? prependRevision(database, revision.entityType, current, 'update') : database.revisions;
  switch (revision.entityType) {
    case 'project': return { ...database, projects: database.projects.map((item) => item.id === revision.entityId ? restored as Project : item), revisions };
    case 'task': return { ...database, tasks: database.tasks.map((item) => item.id === revision.entityId ? restored as Task : item), revisions };
    case 'knowledge': return { ...database, knowledge: database.knowledge.map((item) => item.id === revision.entityId ? restored as KnowledgeItem : item), revisions };
    case 'scenario': return { ...database, scenarios: database.scenarios.map((item) => item.id === revision.entityId ? restored as Scenario : item), revisions };
    case 'report': return { ...database, reports: database.reports.map((item) => item.id === revision.entityId ? restored as SavedReport : item), revisions };
  }
}
