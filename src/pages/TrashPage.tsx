import { ArchiveRestore, FileChartColumn, FlaskConical, FolderKanban, NotebookText, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RevisableEntityType } from '../../shared/models';
import { EmptyState } from '../components/EmptyState';
import { useAppStore } from '../context/AppStore';
import { entityCollection, entityTypeLabel, prependRevision } from '../lib/entity-history';
import { activity, formatFullDate } from '../lib/utils';

const typeIcon = { project: FolderKanban, task: NotebookText, knowledge: NotebookText, scenario: FlaskConical, report: FileChartColumn } as const;

export function TrashPage() {
  const { database, mutate, notify } = useAppStore();
  const [filter, setFilter] = useState<RevisableEntityType | 'all'>('all');
  const entries = useMemo(() => {
    if (!database) return [];
    return ([
      ...database.projects.filter((item) => item.deletedAt).map((entity) => ({ type: 'project' as const, entity })),
      ...database.tasks.filter((item) => item.deletedAt).map((entity) => ({ type: 'task' as const, entity })),
      ...database.knowledge.filter((item) => item.deletedAt).map((entity) => ({ type: 'knowledge' as const, entity })),
      ...database.scenarios.filter((item) => item.deletedAt).map((entity) => ({ type: 'scenario' as const, entity })),
      ...database.reports.filter((item) => item.deletedAt).map((entity) => ({ type: 'report' as const, entity })),
    ]).filter((item) => filter === 'all' || item.type === filter).sort((a, b) => b.entity.deletedAt.localeCompare(a.entity.deletedAt));
  }, [database, filter]);
  if (!database) return null;

  const restore = (type: RevisableEntityType, id: string) => {
    mutate((current) => {
      const collection = entityCollection[type];
      const entity = current[collection].find((item) => item.id === id);
      if (!entity) return current;
      return {
        ...current,
        [collection]: current[collection].map((item) => item.id === id ? { ...item, deletedAt: '', updatedAt: new Date().toISOString() } : item),
        revisions: prependRevision(current, type, entity, 'restore'),
        activities: [activity(type === 'knowledge' ? 'knowledge' : type, `恢复${entityTypeLabel[type]}`, entity.title, id), ...current.activities],
      };
    });
    notify('已恢复到原位置');
  };

  const removeForever = (type: RevisableEntityType, id: string, title: string) => {
    if (!window.confirm(`“${title}”将被永久删除，且无法从修改历史恢复。确定继续吗？`)) return;
    mutate((current) => {
      const collection = entityCollection[type];
      const next = { ...current, [collection]: current[collection].filter((item) => item.id !== id), revisions: current.revisions.filter((revision) => !(revision.entityType === type && revision.entityId === id)) };
      if (type === 'project') return { ...next, tasks: next.tasks.map((item) => item.projectId === id ? { ...item, projectId: null } : item), knowledge: next.knowledge.map((item) => item.projectId === id ? { ...item, projectId: null } : item), scenarios: next.scenarios.map((item) => item.projectId === id ? { ...item, projectId: null } : item), reports: next.reports.map((item) => item.projectId === id ? { ...item, projectId: null } : item) };
      if (type === 'task') return { ...next, knowledge: next.knowledge.map((item) => item.taskId === id ? { ...item, taskId: null } : item), scenarios: next.scenarios.map((item) => item.taskId === id ? { ...item, taskId: null } : item), reports: next.reports.map((item) => item.taskId === id ? { ...item, taskId: null } : item) };
      return next;
    });
    notify('已永久删除', 'info');
  };

  return <div className="page trash-page"><header className="page-header"><div><p className="eyebrow">Recovery</p><h1>回收站</h1><p>删除先进入这里。恢复会保留原有关联；只有在这里再次确认才会永久删除。</p></div></header><div className="toolbar"><div className="segmented-control">{([['all', '全部'], ['task', '任务'], ['project', '项目'], ['knowledge', '资料'], ['scenario', '试验'], ['report', '交付']] as const).map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div><span className="toolbar-count">{entries.length} 项</span></div>{entries.length ? <div className="trash-list">{entries.map(({ type, entity }) => { const Icon = typeIcon[type]; return <article key={`${type}-${entity.id}`}><div className="trash-entity-icon"><Icon size={18} /></div><div><span>{entityTypeLabel[type]}</span><h2>{entity.title}</h2><p>移入时间 {formatFullDate(entity.deletedAt)} · {database.revisions.filter((revision) => revision.entityType === type && revision.entityId === entity.id).length} 个历史快照</p></div><div><button className="secondary-button" onClick={() => restore(type, entity.id)}><ArchiveRestore size={15} />恢复</button><button className="danger-text-button" onClick={() => removeForever(type, entity.id, entity.title)}><Trash2 size={15} />永久删除</button></div></article>; })}</div> : <EmptyState icon={Trash2} title="回收站是空的" description="任务、项目、资料、试验和交付被删除后会先进入这里。" />}</div>;
}
