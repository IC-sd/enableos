import { CalendarRange, Copy, Download, FileChartColumn, LoaderCircle, Save, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SavedReport } from '../../shared/models';
import { EmptyState } from '../components/EmptyState';
import type { NavigateHandler } from '../components/Sidebar';
import { useAppStore } from '../context/AppStore';
import { desktop } from '../lib/bridge';
import { activity, endOfWeek, randomUUID, startOfWeek } from '../lib/utils';
import { buildReportEvidencePacket, validateReportEvidence } from '../lib/local-ai';
import { isActive, prependRevision } from '../lib/entity-history';
import { HistoryPanel } from '../components/HistoryPanel';

export function ReportsPage({ initialSelectedId, onNavigate }: { initialSelectedId?: string; onNavigate: NavigateHandler }) {
  const { database, mutate, notify } = useAppStore();
  const [rangeStart, setRangeStart] = useState(startOfWeek());
  const [rangeEnd, setRangeEnd] = useState(endOfWeek());
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [selectedReportId, setSelectedReportId] = useState(initialSelectedId || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!database || !initialSelectedId) return;
    const report = database.reports.find((item) => item.id === initialSelectedId && isActive(item));
    if (!report) return;
    setProjectId(report.projectId || '');
    setTaskId(report.taskId || '');
    setRangeStart(report.rangeStart);
    setRangeEnd(report.rangeEnd);
    setContent(report.content);
    setTitle(report.title);
    setSelectedReportId(report.id);
  }, [initialSelectedId]);
  if (!database) return null;

  const sourceForReport = () => {
    const selectedTask = database.tasks.find((item) => item.id === taskId && isActive(item));
    const effectiveProjectId = selectedTask?.projectId || projectId;
    const activeTasks = database.tasks.filter(isActive);
    const activeKnowledge = database.knowledge.filter(isActive);
    const activeScenarios = database.scenarios.filter(isActive);
    const scopedTasks = taskId ? activeTasks.filter((item) => item.id === taskId) : effectiveProjectId ? activeTasks.filter((item) => item.projectId === effectiveProjectId) : activeTasks;
    const scopedKnowledge = taskId
      ? activeKnowledge.filter((item) => item.taskId === taskId || (!item.taskId && effectiveProjectId && item.projectId === effectiveProjectId))
      : effectiveProjectId ? activeKnowledge.filter((item) => item.projectId === effectiveProjectId) : activeKnowledge;
    const scopedScenarios = taskId
      ? activeScenarios.filter((item) => item.taskId === taskId || (!item.taskId && effectiveProjectId && item.projectId === effectiveProjectId))
      : effectiveProjectId ? activeScenarios.filter((item) => item.projectId === effectiveProjectId) : activeScenarios;
    const linkedIds = new Set([
      effectiveProjectId,
      ...scopedTasks.map((item) => item.id),
      ...scopedKnowledge.map((item) => item.id),
      ...scopedScenarios.map((item) => item.id),
    ]);
    return effectiveProjectId || taskId ? {
      ...database,
      projects: database.projects.filter((item) => isActive(item) && item.id === effectiveProjectId),
      tasks: scopedTasks,
      knowledge: scopedKnowledge,
      scenarios: scopedScenarios,
      activities: database.activities.filter((item) => item.entityId && linkedIds.has(item.entityId)),
    } : database;
  };
  const reportValidation = content ? validateReportEvidence(content, buildReportEvidencePacket(sourceForReport(), rangeStart, rangeEnd)) : null;

  const generate = async () => {
    setBusy(true);
    try {
      const source = sourceForReport();
      const response = await desktop.ai.generateReport(source, rangeStart, rangeEnd);
      setContent(response.data);
      if (!title.trim()) {
        const task = database.tasks.find((item) => item.id === taskId);
        const project = database.projects.find((item) => item.id === projectId);
        setTitle(task ? `${task.title} · 工作线汇报` : project ? `${project.title} · 阶段汇报` : `工作周报 ${rangeStart}—${rangeEnd}`);
      }
      setSelectedReportId(''); notify(response.notice, 'info');
    } catch (error) { notify(error instanceof Error ? error.message : '生成失败', 'error'); }
    finally { setBusy(false); }
  };

  const save = () => {
    if (!content.trim()) return;
    const task = database.tasks.find((item) => item.id === taskId);
    const effectiveProjectId = task?.projectId || projectId;
    const project = database.projects.find((item) => item.id === effectiveProjectId);
    const createdAt = new Date().toISOString();
    const report: SavedReport = { id: randomUUID(), projectId: effectiveProjectId || null, taskId: taskId || null, kind: effectiveProjectId ? 'project' : 'weekly', title: title.trim() || (task ? `${task.title} · 工作线汇报` : project ? `${project.title} · 阶段汇报` : `工作周报 ${rangeStart}—${rangeEnd}`), rangeStart, rangeEnd, content, createdAt, updatedAt: createdAt, deletedAt: '' };
    mutate((current) => ({ ...current, reports: [report, ...current.reports], activities: [activity('report', '保存工作汇报', report.title, report.id), ...current.activities] }));
    setSelectedReportId(report.id); notify('新版本已保存');
  };

  const updateSaved = () => {
    const previous = database.reports.find((item) => item.id === selectedReportId && isActive(item));
    if (!previous || !content.trim() || !title.trim()) return;
    const updatedAt = new Date().toISOString();
    mutate((current) => ({ ...current, reports: current.reports.map((item) => item.id === previous.id ? { ...item, title: title.trim(), content, rangeStart, rangeEnd, projectId: projectId || null, taskId: taskId || null, updatedAt } : item), revisions: prependRevision(current, 'report', previous, 'update'), activities: [activity('report', '更新交付版本', title.trim(), previous.id), ...current.activities] }));
    notify('当前版本已更新，并保留修改前快照');
  };

  const removeReport = () => {
    const previous = database.reports.find((item) => item.id === selectedReportId && isActive(item));
    if (!previous || !window.confirm(`将交付“${previous.title}”移入回收站吗？`)) return;
    const deletedAt = new Date().toISOString();
    mutate((current) => ({ ...current, reports: current.reports.map((item) => item.id === previous.id ? { ...item, deletedAt, updatedAt: deletedAt } : item), revisions: prependRevision(current, 'report', previous, 'delete'), activities: [activity('report', '交付移入回收站', previous.title, previous.id), ...current.activities] }));
    setSelectedReportId(''); setContent(''); setTitle(''); notify('交付已移入回收站', 'info');
  };

  const copy = async () => {
    await navigator.clipboard.writeText(content); notify('已复制到剪贴板');
  };

  const exportMarkdown = async () => {
    const result = await desktop.files.exportMarkdown(`工作周报-${rangeStart}-${rangeEnd}.md`, content);
    if (!result.canceled) notify(`已导出到 ${result.path}`);
  };

  return <div className="page reports-page">
    <header className="page-header"><div><p className="eyebrow">Deliverables</p><h1>交付中心</h1><p>把过程记录整理成可提交、可复核的成果，不把“做过尝试”包装成“已经完成”。</p></div></header>
    <div className="report-layout">
      <section className="panel report-builder"><div className="panel-header"><div><p className="eyebrow">生成器</p><h2>从工作证据生成汇报</h2></div><CalendarRange size={19} /></div><label className="field"><span>项目范围</span><select value={projectId} onChange={(event) => { setProjectId(event.target.value); setTaskId(''); }}><option value="">全部工作（周报）</option>{database.projects.filter(isActive).map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label><label className="field"><span>具体工作线</span><select value={taskId} onChange={(event) => { const task = database.tasks.find((item) => item.id === event.target.value); setTaskId(event.target.value); if (task?.projectId) setProjectId(task.projectId); }}><option value="">整个项目/全部任务</option>{database.tasks.filter((task) => isActive(task) && (!projectId || task.projectId === projectId)).map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label><div className="date-range"><label className="field"><span>开始日期</span><input type="date" max={rangeEnd} value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} /></label><span>至</span><label className="field"><span>结束日期</span><input type="date" min={rangeStart} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} /></label></div><div className="report-source-summary"><div><strong>{sourceForReport().tasks.filter((task) => task.status === 'done').length}</strong><span>已完成任务</span></div><div><strong>{sourceForReport().knowledge.length}</strong><span>证据资料</span></div><div><strong>{sourceForReport().scenarios.length}</strong><span>验证场景</span></div></div><button className="primary-button full large" disabled={busy} onClick={() => void generate()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{busy ? '正在整理记录' : '生成本期汇报'}</button><p className="builder-hint">资料会以 [K#] 编号进入证据包，未被引用的结论不会被标记为可追溯。</p></section>
      <section className="panel report-editor"><div className="panel-header"><div><p className="eyebrow">预览与编辑</p><h2>{content ? selectedReportId ? '编辑已保存版本' : '新交付版本' : '等待生成'}</h2></div>{content ? <div className="inline-actions"><button className="icon-button" title="复制" onClick={() => void copy()}><Copy size={16} /></button><button className="icon-button" title="导出" onClick={() => void exportMarkdown()}><Download size={16} /></button></div> : null}</div>{content ? <><label className="field report-title-field"><span>交付标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="为这个版本起一个可辨认的名称" /></label><textarea className="report-textarea" value={content} onChange={(event) => setContent(event.target.value)} />{reportValidation ? <div className={`citation-status ${reportValidation.valid ? 'valid' : 'invalid'}`}><FileChartColumn size={14} /><span>{reportValidation.message}</span></div> : null}{selectedReportId ? <HistoryPanel database={database} entityType="report" entityId={selectedReportId} /> : null}<div className="report-actions">{selectedReportId ? <button className="danger-text-button" onClick={removeReport}><Trash2 size={16} />移入回收站</button> : null}<button className="secondary-button" onClick={() => void copy()}><Copy size={16} />复制</button><button className="secondary-button" onClick={() => void exportMarkdown()}><Download size={16} />导出Markdown</button>{selectedReportId ? <button className="secondary-button" onClick={updateSaved}><Save size={16} />更新当前版本</button> : null}<button className="primary-button" onClick={save}><Save size={16} />另存新版本</button></div></> : <EmptyState icon={FileChartColumn} title="先选择日期范围" description="系统会从任务、项目和活动记录中整理本期工作。" />}</section>
    </div>
    {database.reports.some(isActive) ? <section className="saved-reports"><div className="section-title"><div><p className="eyebrow">历史版本</p><h2>已保存的汇报</h2></div></div><div className="saved-report-list">{database.reports.filter(isActive).map((report) => <button className={report.id === selectedReportId ? 'active' : ''} key={report.id} onClick={() => { setProjectId(report.projectId || ''); setTaskId(report.taskId || ''); setRangeStart(report.rangeStart); setRangeEnd(report.rangeEnd); setContent(report.content); setTitle(report.title); setSelectedReportId(report.id); onNavigate('reports', report.id); }}><FileChartColumn size={18} /><div><strong>{report.title}</strong><span>{report.taskId ? '工作线汇报' : report.kind === 'project' ? '项目汇报' : report.kind === 'decision' ? '决策记录' : '工作周报'} · {report.content.slice(0, 80).replace(/[#\n]/g, ' ')}…</span></div></button>)}</div></section> : null}
  </div>;
}
