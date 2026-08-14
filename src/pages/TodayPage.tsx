import { CalendarCheck2, CalendarClock, Check, Clock3, Edit3, Play, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import type { Task } from '../../shared/models';
import type { NavigateHandler } from '../components/Sidebar';
import { EmptyState } from '../components/EmptyState';
import { useAppStore } from '../context/AppStore';
import { isActive } from '../lib/entity-history';
import { rescheduleTask, sortTasksForAction, taskDueBucket, transitionTask, type DueBucket } from '../lib/task-actions';
import { formatDate, today } from '../lib/utils';

const sections: Array<{ bucket: DueBucket; title: string; description: string }> = [
  { bucket: 'overdue', title: '已经逾期', description: '先决定今天完成、改期，还是重新确认优先级。' },
  { bucket: 'today', title: '今天到期', description: '今天需要给出推进结果的工作。' },
  { bucket: 'upcoming', title: '未来 7 天', description: '提前看到即将进入当前窗口的任务。' },
  { bucket: 'unscheduled', title: '尚未排期', description: '高优先任务不应长期停留在没有日期的状态。' },
  { bucket: 'later', title: '更晚', description: '已有日期，但暂不占用本周注意力。' },
];

function relativeDate(offset: number): string {
  const value = new Date(`${today()}T00:00:00`);
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function TodayPage({ onNavigate }: { onNavigate: NavigateHandler }) {
  const { database, mutate, notify } = useAppStore();
  const tasks = useMemo(() => sortTasksForAction(database?.tasks.filter(isActive) ?? []), [database?.tasks]);
  if (!database) return null;
  const openCount = tasks.filter((task) => task.status !== 'done').length;
  const overdueCount = tasks.filter((task) => taskDueBucket(task) === 'overdue').length;

  const schedule = (task: Task, date: string) => { mutate((current) => rescheduleTask(current, task.id, date)); notify(date ? `已改期到 ${formatDate(date)}` : '已清除截止日期', 'info'); };
  const transition = (task: Task, status: Task['status']) => { mutate((current) => transitionTask(current, task.id, status)); notify(status === 'done' ? '已完成并留痕' : status === 'doing' ? '已开始推进' : '已重新打开'); };

  return <div className="page today-page">
    <header className="page-header today-heading"><div><p className="eyebrow">Daily focus</p><h1>今天</h1><p>把截止日期真正变成工作优先级，而不是只显示在卡片角落。</p></div><div className="today-date"><CalendarCheck2 size={20} /><div><strong>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</strong><span>{overdueCount ? `${overdueCount} 项逾期需要处理` : '没有逾期任务'} · {openCount} 项开放</span></div></div></header>
    {!openCount ? <EmptyState icon={CalendarCheck2} title="开放任务已清空" description="完成的记录仍保留在任务总表和汇报证据中。" /> : <div className="today-sections">{sections.map((section) => {
      const grouped = tasks.filter((task) => taskDueBucket(task) === section.bucket);
      if (!grouped.length) return null;
      return <section className={`today-section ${section.bucket}`} key={section.bucket}><header><div><h2>{section.title}</h2><p>{section.description}</p></div><span>{grouped.length}</span></header><div className="today-task-list">{grouped.map((task) => <article key={task.id} className={task.status === 'doing' ? 'doing' : ''}><i className={`priority-marker ${task.priority}`} /><div className="today-task-main"><div><strong>{task.title}</strong><span>{database.projects.find((project) => project.id === task.projectId && isActive(project))?.title || task.source}</span></div><p>{task.summary || task.rawInput}</p><footer><span><CalendarClock size={13} />{task.dueDate ? formatDate(task.dueDate) : '未排期'}</span><span><Clock3 size={13} />{task.status === 'doing' ? '推进中' : '待推进'}</span></footer></div><div className="today-task-actions"><div className="date-shortcuts"><button onClick={() => schedule(task, relativeDate(0))}>今天</button><button onClick={() => schedule(task, relativeDate(1))}>明天</button><button onClick={() => schedule(task, relativeDate(7))}>+7 天</button>{task.dueDate ? <button onClick={() => schedule(task, '')}>清除</button> : null}</div><div>{task.status !== 'doing' ? <button className="secondary-button" onClick={() => transition(task, 'doing')}><Play size={14} />开始</button> : null}<button className="secondary-button" onClick={() => onNavigate('inbox', task.id)}><Edit3 size={14} />编辑</button>{task.status !== 'done' ? <button className="primary-button" onClick={() => transition(task, 'done')}><Check size={14} />完成</button> : <button className="secondary-button" onClick={() => transition(task, 'planned')}><RotateCcw size={14} />重开</button>}</div></div></article>)}</div></section>;
    })}</div>}
  </div>;
}

