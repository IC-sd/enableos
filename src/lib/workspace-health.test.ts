import { describe, expect, it } from 'vitest';
import { createDemoDatabase } from './browser-db';
import { inspectWorkspace, repairWorkspace } from './workspace-health';

describe('workspace health', () => {
  it('detects and safely repairs orphan links, scores and date ranges', () => {
    const database = createDemoDatabase();
    database.tasks[0].projectId = 'missing';
    database.knowledge[0].taskId = 'missing-task';
    database.projects[0].progress = 130;
    database.reports.push({ id: 'r1', projectId: 'missing', taskId: null, kind: 'weekly', title: 'test', rangeStart: '2026-08-09', rangeEnd: '2026-08-01', content: '', createdAt: '2026-08-09', updatedAt: '2026-08-09', deletedAt: '' });
    expect(inspectWorkspace(database).map((issue) => issue.code)).toEqual(expect.arrayContaining(['orphan-project-links', 'orphan-task-links', 'invalid-scores', 'reversed-report-ranges']));
    const result = repairWorkspace(database);
    expect(result.repaired).toBeGreaterThanOrEqual(4);
    expect(result.database.tasks[0].projectId).toBeNull();
    expect(result.database.knowledge[0].taskId).toBeNull();
    expect(result.database.projects[0].progress).toBe(100);
    expect(result.database.reports[0].rangeStart).toBe('2026-08-01');
    expect(inspectWorkspace(result.database).some((issue) => issue.repairable)).toBe(false);
  });
});
