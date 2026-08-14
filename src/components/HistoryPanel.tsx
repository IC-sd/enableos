import { History, RotateCcw } from 'lucide-react';
import type { AppDatabase, RevisableEntityType } from '../../shared/models';
import { formatFullDate } from '../lib/utils';
import { entityTypeLabel, restoreEntityRevision, revisionsFor } from '../lib/entity-history';
import { useAppStore } from '../context/AppStore';

export function HistoryPanel({ database, entityType, entityId, onRestore }: { database: AppDatabase; entityType: RevisableEntityType; entityId: string; onRestore?: (revisionId: string) => void }) {
  const { mutate, notify } = useAppStore();
  const revisions = revisionsFor(database, entityType, entityId);
  const restore = (revisionId: string) => {
    if (onRestore) onRestore(revisionId);
    else { mutate((current) => restoreEntityRevision(current, revisionId)); notify(`已恢复所选${entityTypeLabel[entityType]}版本`); }
  };
  return <details className="history-panel"><summary><History size={15} />修改历史 <span>{revisions.length}</span></summary>{revisions.length ? <div className="history-list">{revisions.slice(0, 20).map((revision) => <article key={revision.id}><div><strong>{revision.action === 'delete' ? '移入回收站前' : revision.action === 'restore' ? '恢复前' : '修改前'}</strong><span>{formatFullDate(revision.createdAt)}</span></div><button className="text-button" onClick={() => restore(revision.id)}><RotateCcw size={13} />恢复此版本</button></article>)}</div> : <p className="history-empty">{entityTypeLabel[entityType]}还没有历史快照；下一次保存修改时会自动记录。</p>}</details>;
}
