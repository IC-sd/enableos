import type { AppDatabase, Task, TaskStatus } from '../../shared/models';
import { prependRevision } from './entity-history';
import { activity, today } from './utils';

export function transitionTask(database: AppDatabase, taskId: string, status: TaskStatus, label?: string): AppDatabase {
  const task = database.tasks.find((item) => item.id === taskId);
  if (!task || task.status === status) return database;
  const changedAt = new Date().toISOString();
  const completedAt = status === 'done' ? changedAt : '';
  return {
    ...database,
    tasks: database.tasks.map((item) => item.id === taskId ? { ...item, status, completedAt, updatedAt: changedAt } : item),
    revisions: prependRevision(database, 'task', task, 'update'),
    activities: [activity('task', label ?? taskStatusAction(status), task.title, task.id), ...database.activities],
  };
}

export function rescheduleTask(database: AppDatabase, taskId: string, dueDate: string): AppDatabase {
  const task = database.tasks.find((item) => item.id === taskId);
  if (!task || task.dueDate === dueDate) return database;
  const changedAt = new Date().toISOString();
  return {
    ...database,
    tasks: database.tasks.map((item) => item.id === taskId ? { ...item, dueDate, updatedAt: changedAt } : item),
    revisions: prependRevision(database, 'task', task, 'update'),
    activities: [activity('task', '调整任务日期', dueDate ? `${task.title} · ${dueDate}` : `${task.title} · 清除日期`, task.id), ...database.activities],
  };
}

function taskStatusAction(status: TaskStatus): string {
  if (status === 'done') return '完成任务';
  if (status === 'doing') return '开始处理任务';
  if (status === 'planned') return '移回计划';
  return '移回待澄清';
}

export type DueBucket = 'overdue' | 'today' | 'upcoming' | 'later' | 'unscheduled' | 'done';

export function taskDueBucket(task: Task, referenceDate = today()): DueBucket {
  if (task.status === 'done') return 'done';
  if (!task.dueDate) return 'unscheduled';
  if (task.dueDate < referenceDate) return 'overdue';
  if (task.dueDate === referenceDate) return 'today';
  const end = new Date(`${referenceDate}T00:00:00`);
  end.setDate(end.getDate() + 7);
  const nextWeek = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return task.dueDate <= nextWeek ? 'upcoming' : 'later';
}

export function sortTasksForAction(tasks: Task[], referenceDate = today()): Task[] {
  const bucketRank: Record<DueBucket, number> = { overdue: 0, today: 1, upcoming: 2, unscheduled: 3, later: 4, done: 5 };
  const priorityRank = { high: 0, medium: 1, low: 2 } as const;
  return [...tasks].sort((a, b) => {
    const byBucket = bucketRank[taskDueBucket(a, referenceDate)] - bucketRank[taskDueBucket(b, referenceDate)];
    if (byBucket) return byBucket;
    return priorityRank[a.priority] - priorityRank[b.priority]
      || (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31')
      || b.updatedAt.localeCompare(a.updatedAt);
  });
}
