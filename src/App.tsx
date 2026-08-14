import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, LockKeyhole, RefreshCw } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, type NavigateHandler, type ViewKey } from './components/Sidebar';
import { QuickCapture } from './components/QuickCapture';
import { GlobalSearch } from './components/GlobalSearch';
import { useAppStore } from './context/AppStore';
import { desktop } from './lib/bridge';
import { DashboardPage } from './pages/DashboardPage';

const InboxPage = lazy(() => import('./pages/InboxPage').then((module) => ({ default: module.InboxPage })));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage').then((module) => ({ default: module.KnowledgePage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((module) => ({ default: module.ProjectsPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const ScenariosPage = lazy(() => import('./pages/ScenariosPage').then((module) => ({ default: module.ScenariosPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const TodayPage = lazy(() => import('./pages/TodayPage').then((module) => ({ default: module.TodayPage })));
const TrashPage = lazy(() => import('./pages/TrashPage').then((module) => ({ default: module.TrashPage })));

export function App() {
  const { database, loading, loadError, toast, isReadOnly, takeControl, reloadFromDisk } = useAppStore();
  const validViews: ViewKey[] = ['dashboard', 'today', 'inbox', 'projects', 'knowledge', 'scenarios', 'reports', 'trash', 'settings'];
  const initialParts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const initialView = initialParts[0] as ViewKey;
  const [view, setView] = useState<ViewKey>(validViews.includes(initialView) ? initialView : 'dashboard');
  const [routeEntityId, setRouteEntityId] = useState(initialParts[1] ? decodeURIComponent(initialParts[1]) : '');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const navigate: NavigateHandler = useCallback((next, entityId) => {
    setView(next);
    setRouteEntityId(entityId || '');
    const hash = `#/${next}${entityId ? `/${encodeURIComponent(entityId)}` : ''}`;
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
  }, []);

  useEffect(() => {
    const listener = () => {
      const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
      const next = parts[0] as ViewKey;
      if (validViews.includes(next)) {
        setView(next);
        setRouteEntityId(parts[1] ? decodeURIComponent(parts[1]) : '');
      }
    };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);

  useEffect(() => desktop.window.onQuickCapture(() => setCaptureOpen(true)), []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCaptureOpen(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  if (loading) {
    return <div className="boot-screen"><div className="brand-mark"><span /><span /><span /></div><LoaderCircle className="spin" size={22} /><p>正在打开你的工作空间</p></div>;
  }
  if (!database) return <div className="recovery-screen"><div><p className="eyebrow">数据恢复</p><h1>无法打开本地工作空间</h1><p>浏览器数据没有被自动覆盖。请重新加载；如果仍然失败，可在清理站点数据前保留浏览器配置目录以便进一步恢复。</p><pre>{loadError || '未知错误'}</pre><button className="primary-button" onClick={() => window.location.reload()}>重新加载</button></div></div>;

  const page = (() => {
    switch (view) {
      case 'inbox': return <InboxPage onNavigate={navigate} initialSelectedId={routeEntityId} />;
      case 'today': return <TodayPage onNavigate={navigate} />;
      case 'projects': return <ProjectsPage initialSelectedId={routeEntityId} />;
      case 'knowledge': return <KnowledgePage initialSelectedId={routeEntityId} />;
      case 'scenarios': return <ScenariosPage initialSelectedId={routeEntityId} />;
      case 'reports': return <ReportsPage initialSelectedId={routeEntityId} onNavigate={navigate} />;
      case 'settings': return <SettingsPage />;
      case 'trash': return <TrashPage />;
      default: return <DashboardPage onNavigate={navigate} onQuickCapture={() => setCaptureOpen(true)} initialSelectedId={routeEntityId} />;
    }
  })();

  return (
    <div className="app-root">
      <TitleBar onSearch={() => setSearchOpen(true)} />
      {isReadOnly ? <div className="readonly-banner"><LockKeyhole size={15} /><span>另一个标签页正在编辑。当前页实时同步但不会写入，避免覆盖。</span><button onClick={() => void reloadFromDisk()}><RefreshCw size={13} />刷新</button><button onClick={takeControl}>在此页编辑</button></div> : null}
      <div className="app-body">
        <Sidebar database={database} view={view} onNavigate={navigate} onQuickCapture={() => setCaptureOpen(true)} />
        <main className="content-shell"><Suspense fallback={<div className="page-loading"><LoaderCircle className="spin" size={20} /><span>正在打开工作视图</span></div>}>{page}</Suspense></main>
      </div>
      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} onCreated={(taskId) => navigate('dashboard', taskId)} />
      <GlobalSearch open={searchOpen} database={database} onClose={() => setSearchOpen(false)} onNavigate={navigate} />
      {toast ? <div className={`toast toast-${toast.kind}`}><CheckCircle2 size={17} />{toast.message}</div> : null}
    </div>
  );
}
