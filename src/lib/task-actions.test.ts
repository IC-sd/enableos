import { describe, expect, it } from 'vitest';
import { createDemoDatabase } from './browser-db';
import { restoreEntityRevision } from './entity-history';
import { rescheduleTask, sortTasksForAction, taskDueBucket, transitionTask } from './task-actions';

describe('safe task actions and history', () => {
  it('records a revision when status changes and can restore it', () => {
    const database = createDemoDatabase();
    const id = database.tasks[0].id;
    const completed = transitionTask(database, id, 'done');
    expect(completed.tasks[0].status).toBe('done');
    expect(completed.tasks[0].completedAt).not.toBe('');
    expect(completed.revisions[0]).toMatchObject({ entityType: 'task', entityId: id, action: 'update' });
    const restored = restoreEntityRevision(completed, completed.revisions[0].id);
    expect(restored.tasks[0].status).toBe('planned');
    expect(restored.revisions.length).toBe(2);
  });

  it('classifies and sorts overdue work before unscheduled work', () => {
    const database = createDemoDatabase();
    const base = database.tasks[0];
    const overdue = { ...base, id: 'overdue', dueDate: '2026-08-10', priority: 'low' as const };
    const current = { ...base, id: 'today', dueDate: '2026-08-11', priority: 'medium' as const };
    const unscheduled = { ...base, id: 'none', dueDate: '', priority: 'high' as const };
    expect(taskDueBucket(overdue, '2026-08-11')).toBe('overdue');
    expect(taskDueBucket(current, '2026-08-11')).toBe('today');
    expect(sortTasksForAction([unscheduled, current, overdue], '2026-08-11').map((item) => item.id)).toEqual(['overdue', 'today', 'none']);
  });

  it('records date changes without losing the task', () => {
    const database = createDemoDatabase();
    const id = database.tasks[0].id;
    const changed = rescheduleTask(database, id, '2026-08-18');
    expect(changed.tasks.find((item) => item.id === id)?.dueDate).toBe('2026-08-18');
    expect(changed.revisions).toHaveLength(1);
  });
});
