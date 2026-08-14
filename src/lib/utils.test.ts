import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project, Task } from '../../shared/models';
import { buildCompanyContext, clampScore, endOfWeek, projectProgress, startOfWeek, today, truncate } from './utils';
import { createDemoDatabase } from './browser-db';

afterEach(() => vi.useRealTimers());

const project: Project = {
  id: 'p1', title: '测试项目', objective: '', brief: '', status: 'active', department: '', progress: 30,
  dueDate: '', tags: [], deliverables: [], risks: [], nextAction: '', createdAt: '', updatedAt: '', deletedAt: '',
};

const task = (id: string, status: Task['status']): Task => ({
  id, projectId: 'p1', title: id, rawInput: '', summary: '', status, priority: 'medium', source: '', dueDate: '',
  clarificationQuestions: [], clarificationAnswers: [], steps: [], stepCompletion: [], deliverables: [], acceptanceCriteria: [], createdAt: '', updatedAt: '', completedAt: '', deletedAt: '',
});

describe('workbench domain helpers', () => {
  it('derives project progress from related tasks', () => {
    expect(projectProgress(project, [task('a', 'done'), task('b', 'doing')])).toBe(50);
  });

  it('keeps manual progress when a project has no tasks', () => {
    expect(projectProgress(project, [])).toBe(30);
  });

  it('clamps scenario scores to a valid range', () => {
    expect(clampScore(130)).toBe(100);
    expect(clampScore(-5)).toBe(0);
  });

  it('truncates long context without losing short content', () => {
    expect(truncate('简短内容', 20)).toBe('简短内容');
    expect(truncate('这是一个很长的任务内容', 5)).toBe('这是一个很…');
  });

  it('keeps local calendar dates stable instead of shifting through UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 9, 1, 30));
    expect(today()).toBe('2026-08-09');
    expect(startOfWeek()).toBe('2026-08-03');
    expect(endOfWeek()).toBe('2026-08-09');
  });

  it('never includes sensitive evidence and requires explicit scope for internal evidence', () => {
    const database = createDemoDatabase();
    const template = database.knowledge[0];
    database.knowledge = [
      { ...template, id: 'public', title: '公开资料', confidentiality: 'public' },
      { ...template, id: 'internal', title: '内部资料', confidentiality: 'internal' },
      { ...template, id: 'sensitive', title: '敏感资料', confidentiality: 'sensitive' },
    ];
    database.settings.externalEvidenceScope = 'public-only';
    expect(buildCompanyContext(database)).toContain('公开资料');
    expect(buildCompanyContext(database)).not.toContain('内部资料');
    expect(buildCompanyContext(database)).not.toContain('敏感资料');
    database.settings.externalEvidenceScope = 'public-and-internal';
    expect(buildCompanyContext(database)).toContain('内部资料');
    expect(buildCompanyContext(database)).not.toContain('敏感资料');
    const scoped = buildCompanyContext(database, '公开文档');
    expect(scoped).toContain('公开资料');
    expect(scoped).not.toContain('内部资料');
  });
});
