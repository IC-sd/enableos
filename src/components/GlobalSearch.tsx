import { BookOpenText, BriefcaseBusiness, FileChartColumn, FlaskConical, ListChecks, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppDatabase } from '../../shared/models';
import type { NavigateHandler, ViewKey } from './Sidebar';

interface SearchResult {
  id: string;
  view: ViewKey;
  type: string;
  title: string;
  detail: string;
  icon: typeof Search;
}

export function GlobalSearch({ open, database, onClose, onNavigate }: { open: boolean; database: AppDatabase; onClose: () => void; onNavigate: NavigateHandler }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    setQuery('');
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', listener, true);
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', listener, true); previous?.focus(); };
  }, [open]);

  const allResults = useMemo<SearchResult[]>(() => [
    ...database.tasks.filter((item) => !item.deletedAt).map((item) => ({ id: item.id, view: 'inbox' as const, type: '任务', title: item.title, detail: item.summary || item.rawInput, icon: ListChecks })),
    ...database.projects.filter((item) => !item.deletedAt).map((item) => ({ id: item.id, view: 'projects' as const, type: '项目', title: item.title, detail: item.objective, icon: BriefcaseBusiness })),
    ...database.knowledge.filter((item) => !item.deletedAt).map((item) => ({ id: item.id, view: 'knowledge' as const, type: '证据', title: item.title, detail: item.summary || item.content, icon: BookOpenText })),
    ...database.scenarios.filter((item) => !item.deletedAt).map((item) => ({ id: item.id, view: 'scenarios' as const, type: '实验', title: item.title, detail: item.pain, icon: FlaskConical })),
    ...database.reports.filter((item) => !item.deletedAt).map((item) => ({ id: item.id, view: 'reports' as const, type: '汇报', title: item.title, detail: item.content, icon: FileChartColumn })),
  ], [database]);
  const results = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return allResults.slice(0, 8);
    return allResults.filter((item) => terms.every((term) => `${item.type} ${item.title} ${item.detail}`.toLowerCase().includes(term))).slice(0, 20);
  }, [allResults, query]);

  if (!open) return null;
  const choose = (result: SearchResult) => { onNavigate(result.view, result.id); onClose(); };
  return <div className="search-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} tabIndex={-1} className="global-search" role="dialog" aria-modal="true" aria-label="搜索工作空间"><div className="global-search-input"><Search size={20} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && results[0]) choose(results[0]); }} placeholder="搜索任务、项目、证据、实验或汇报……" /><kbd>Esc</kbd></div><div className="global-search-results">{results.length ? results.map((result) => { const Icon = result.icon; return <button key={`${result.view}-${result.id}`} onClick={() => choose(result)}><span className="search-result-icon"><Icon size={17} /></span><div><strong>{result.title}</strong><p>{result.detail.slice(0, 110) || '暂无摘要'}</p></div><em>{result.type}</em></button>; }) : <div className="search-empty">没有找到匹配内容</div>}</div><footer>Enter 打开首项 · 搜索仅在当前浏览器内进行</footer></section></div>;
}
