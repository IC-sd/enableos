import {
  BookOpenText,
  BriefcaseBusiness,
  CalendarCheck2,
  FileChartColumn,
  Inbox,
  ListTree,
  Plus,
  Settings,
  TestTubes,
  Trash2,
} from 'lucide-react';
import type { AppDatabase } from '../../shared/models';

export type ViewKey = 'dashboard' | 'today' | 'inbox' | 'projects' | 'knowledge' | 'scenarios' | 'reports' | 'trash' | 'settings';
export type NavigateHandler = (key: ViewKey, entityId?: string) => void;

const navigation = [
  { key: 'dashboard' as const, label: '工作台', short: '台', icon: ListTree },
  { key: 'today' as const, label: '今天', short: '今', icon: CalendarCheck2 },
  { key: 'inbox' as const, label: '任务', short: '任', icon: Inbox },
  { key: 'projects' as const, label: '项目', short: '项', icon: BriefcaseBusiness },
  { key: 'knowledge' as const, label: '资料', short: '据', icon: BookOpenText },
  { key: 'scenarios' as const, label: '试验', short: '试', icon: TestTubes },
  { key: 'reports' as const, label: '汇报', short: '报', icon: FileChartColumn },
];

export function Sidebar({ database, view, onNavigate, onQuickCapture }: { database: AppDatabase; view: ViewKey; onNavigate: NavigateHandler; onQuickCapture: () => void }) {
  const inboxCount = database.tasks.filter((task) => !task.deletedAt && task.status === 'inbox').length;
  const trashCount = database.projects.filter((item) => item.deletedAt).length + database.tasks.filter((item) => item.deletedAt).length + database.knowledge.filter((item) => item.deletedAt).length + database.scenarios.filter((item) => item.deletedAt).length + database.reports.filter((item) => item.deletedAt).length;
  return (
    <aside className="sidebar rail-navigation">
      <button className="rail-brand" onClick={() => onNavigate('dashboard')} aria-label="EnableOS 工作台">
        <span>E</span><i>/</i>
      </button>

      <button className="rail-capture" onClick={onQuickCapture} aria-label="记录新任务"><Plus size={20} /><span>新建</span></button>

      <nav className="navigation" aria-label="主要视图">
        {navigation.map(({ key, label, icon: Icon }) => {
          const badge = key === 'inbox' ? inboxCount : 0;
          return (
            <button key={key} className={view === key ? 'active' : ''} onClick={() => onNavigate(key)} aria-label={label} title={label}>
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {badge > 0 ? <em>{badge}</em> : null}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />
      <button className={`rail-settings ${view === 'trash' ? 'active' : ''}`} onClick={() => onNavigate('trash')} aria-label="回收站" title="回收站"><Trash2 size={19} /><span>回收站</span>{trashCount ? <em>{trashCount}</em> : null}</button>
      <button className={`rail-settings ${view === 'settings' ? 'active' : ''}`} onClick={() => onNavigate('settings')} aria-label="设置" title="设置"><Settings size={19} /><span>设置</span></button>
      <div className="rail-local" title="资料默认保存在当前浏览器"><i />LOCAL</div>
    </aside>
  );
}
