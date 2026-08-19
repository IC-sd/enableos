import { ArrowLeft, BookOpenText, BriefcaseBusiness, CalendarDays, Check, CirclePlus, Download, Edit3, FileChartColumn, FlaskConical, ListChecks, Plus, Save, Target, Trash2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { Project, ProjectStatus, Task } from '../../shared/models';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { useAppStore } from '../context/AppStore';
import { useConfirm } from '../context/ConfirmationContext';
import { desktop } from '../lib/bridge';
import { activity, formatDate, projectProgress, randomUUID } from '../lib/utils';
import { isActive, prependRevision, restoreEntityRevision } from '../lib/entity-history';
import { transitionTask } from '../lib/task-actions';
import { HistoryPanel } from '../components/HistoryPanel';

const statusText: Record<ProjectStatus, string> = { planning: '规划中', active: '进行中', blocked: '受阻', complete: '已完成' };

export function ProjectsPage({ initialSelectedId }: { initialSelectedId?: string }) {
  const { database, mutate, notify } = useAppStore();
  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId || null);
  const [createOpen, setCreateOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [projectDraft, setProjectDraft] = useState<Project | null>(null);
  const [draft, setDraft] = useState({ title: '', objective: '', department: '', dueDate: '' });
  const [taskDraft, setTaskDraft] = useState('');
  useEffect(() => { if (initialSelectedId) setSelectedId(initialSelectedId); }, [initialSelectedId]);
  if (!database) return null;
  const selected = database.projects.find((project) => project.id === selectedId && isActive(project)) ?? null;
  const relatedTasks = selected ? database.tasks.filter((task) => isActive(task) && task.projectId === selected.id) : [];
  const relatedKnowledge = selected ? database.knowledge.filter((item) => isActive(item) && item.projectId === selected.id) : [];
  const relatedScenarios = selected ? database.scenarios.filter((item) => isActive(item) && item.projectId === selected.id) : [];
  const relatedReports = selected ? database.reports.filter((item) => isActive(item) && item.projectId === selected.id) : [];
  const sortedProjects = useMemo(() => database.projects.filter(isActive).sort((a, b) => {
    const order: Record<ProjectStatus, number> = { active: 0, planning: 1, blocked: 2, complete: 3 };
    return order[a.status] - order[b.status] || b.updatedAt.localeCompare(a.updatedAt);
  }), [database.projects]);

  const createProject = () => {
    if (!draft.title.trim()) return;
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(), title: draft.title.trim(), objective: draft.objective.trim(), brief: '', status: 'planning', department: draft.department.trim(),
      progress: 0, dueDate: draft.dueDate, tags: [], deliverables: [], risks: [], nextAction: '确认目标、预期结果和第一步行动', createdAt: now, updatedAt: now, deletedAt: '',
    };
    mutate((current) => ({ ...current, projects: [project, ...current.projects], activities: [activity('project', '创建工作项目', project.title, project.id), ...current.activities] }));
    setDraft({ title: '', objective: '', department: '', dueDate: '' });
    setCreateOpen(false);
    setSelectedId(project.id);
    notify('项目已创建');
  };

  const saveProject = () => {
    if (!selected || !projectDraft?.title.trim()) return;
    const now = new Date().toISOString();
    mutate((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === selected.id ? { ...projectDraft, title: projectDraft.title.trim(), objective: projectDraft.objective.trim(), department: projectDraft.department.trim(), brief: projectDraft.brief.trim(), nextAction: projectDraft.nextAction.trim(), tags: projectDraft.tags.map((item) => item.trim()).filter(Boolean), deliverables: projectDraft.deliverables.map((item) => item.trim()).filter(Boolean), risks: projectDraft.risks.map((item) => item.trim()).filter(Boolean), updatedAt: now } : project),
      revisions: prependRevision(current, 'project', selected, 'update'),
      activities: [activity('project', '更新项目内容', projectDraft.title, selected.id), ...current.activities],
    }));
    setEditOpen(false); notify('项目修改已保存');
  };

  const addTask = () => {
    if (!selected || !taskDraft.trim()) return;
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(), projectId: selected.id, title: taskDraft.trim(), rawInput: taskDraft.trim(), summary: '', status: 'planned', priority: 'medium', source: '项目内创建', dueDate: '',
        clarificationQuestions: [], clarificationAnswers: [], steps: [], stepCompletion: [], deliverables: [], acceptanceCriteria: [], createdAt: now, updatedAt: now, completedAt: '', deletedAt: '',
    };
    mutate((current) => ({ ...current, tasks: [task, ...current.tasks], projects: current.projects.map((project) => project.id === selected.id ? { ...project, updatedAt: now } : project), activities: [activity('task', '添加项目任务', task.title, task.id), ...current.activities] }));
    setTaskDraft(''); setTaskOpen(false); notify('任务已加入项目');
  };

  const toggleTask = async (task: Task) => {
    const done = task.status !== 'done';
    if (done && !await confirm({ title: '确认完成任务', message: `“${task.title}”将标记为已完成，之后仍可重新打开。`, confirmLabel: '标记完成' })) return;
    mutate((current) => transitionTask(current, task.id, done ? 'done' : 'planned', done ? '完成项目任务' : '重新打开项目任务'));
    notify(done ? '已记录完成，可随时重新打开' : '已重新打开任务');
  };

  const removeProject = async () => {
    if (!selected || !await confirm({ title: '移入回收站', message: `项目“${selected.title}”会移入回收站；关联内容和归属保持不变，恢复后可继续使用。`, confirmLabel: '移入回收站', tone: 'danger' })) return;
    const deletedAt = new Date().toISOString();
    mutate((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === selected.id ? { ...project, deletedAt, updatedAt: deletedAt } : project),
      revisions: prependRevision(current, 'project', selected, 'delete'),
      activities: [activity('project', '项目移入回收站', selected.title, selected.id), ...current.activities],
    }));
    setSelectedId(null); notify('项目已移入回收站', 'info');
  };

  const exportDossier = async () => {
    if (!selected) return;
    const lines = [
      `# ${selected.title}`,
      '', `> 导出时间：${new Date().toLocaleString('zh-CN')}`, '',
      '## 目标', '', selected.objective || '待补充', '',
      '## 当前状态', '', `- 状态：${statusText[selected.status]}`, `- 进度：${projectProgress(selected, database.tasks)}%`, `- 下一步：${selected.nextAction || '待确认'}`, '',
      '## 任务', '', ...(relatedTasks.length ? relatedTasks.map((task) => `- [${task.status === 'done' ? 'x' : ' '}] ${task.title}（${task.priority}）`) : ['- 暂无']), '',
      '## 证据与决定', '', ...(relatedKnowledge.length ? relatedKnowledge.map((item) => `- ${item.verificationStatus === 'confirmed' ? '已确认' : '待核实'}｜${item.title}｜${item.summary}`) : ['- 暂无']), '',
      '## 实验与决策', '', ...(relatedScenarios.length ? relatedScenarios.map((item) => `- ${item.title}｜${item.testCases.length}个用例｜${item.runs.length}次运行｜决策：${item.decision}`) : ['- 暂无']), '',
      '## 已保存汇报', '', ...(relatedReports.length ? relatedReports.map((item) => `- ${item.title}（${item.rangeStart}—${item.rangeEnd}）`) : ['- 暂无']), '',
      '## 风险', '', ...(selected.risks.length ? selected.risks.map((item) => `- ${item}`) : ['- 暂无记录']), '',
      '---', '', '本档案由 EnableOS 根据本地真实记录生成，未自动补写不存在的成果。',
    ];
    const result = await desktop.files.exportMarkdown(`${selected.title.replace(/[\\/:*?"<>|]/g, '-')}-项目档案.md`, lines.join('\n'));
    if (!result.canceled) notify('完整项目档案已导出');
  };

  if (selected) {
    const progress = projectProgress(selected, database.tasks);
    return <div className="page project-detail-page">
      <button className="back-button" onClick={() => setSelectedId(null)}><ArrowLeft size={17} />返回项目列表</button>
      <header className="project-detail-hero">
        <div className="project-kicker"><span className={`status-label ${selected.status}`}>{statusText[selected.status]}</span>{selected.department ? <span>{selected.department}</span> : null}{selected.dueDate ? <span><CalendarDays size={14} />{formatDate(selected.dueDate)}</span> : null}</div>
        <div className="project-title-row"><div><h1>{selected.title}</h1><p>{selected.objective || '还没有填写项目目标。'}</p><div className="inline-actions"><button className="primary-button" onClick={() => { setProjectDraft({ ...selected, tags: [...selected.tags], deliverables: [...selected.deliverables], risks: [...selected.risks] }); setEditOpen(true); }}><Edit3 size={16} />编辑项目</button><button className="secondary-button" onClick={() => void exportDossier()}><Download size={16} />导出项目档案</button></div></div><div className="project-progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}><span>{progress}%</span></div></div>
      </header>
      <div className="project-detail-grid">
        <section className="panel project-main-panel">
          <div className="panel-header"><div><p className="eyebrow">任务清单</p><h2>把目标拆成下一步</h2></div><button className="secondary-button" onClick={() => setTaskOpen(true)}><CirclePlus size={16} />添加任务</button></div>
          <div className="project-task-list">
            {relatedTasks.length ? relatedTasks.map((task) => <article key={task.id} className={`project-task-row ${task.status === 'done' ? 'done' : ''}`}><button className="task-check" aria-label={task.status === 'done' ? `重新打开 ${task.title}` : `完成 ${task.title}`} title={task.status === 'done' ? '重新打开任务' : '标记完成'} onClick={() => void toggleTask(task)}>{task.status === 'done' ? <Check size={14} /> : null}</button><div><strong>{task.title}</strong><small>{task.status === 'doing' ? '进行中' : task.status === 'done' ? '已完成 · 点击左侧重新打开' : '已计划 · 点击左侧完成'}</small></div>{task.dueDate ? <em>{formatDate(task.dueDate)}</em> : null}</article>) : <EmptyState icon={ListChecks} title="还没有项目任务" description="添加第一步行动，让项目真正开始移动。" action={<button className="primary-button" onClick={() => setTaskOpen(true)}><Plus size={16} />添加第一项任务</button>} />}
          </div>
          <div className="project-evidence-grid"><article><BookOpenText size={18} /><div><strong>{relatedKnowledge.length}</strong><span>证据与决定</span></div><p>{relatedKnowledge.filter((item) => item.verificationStatus === 'confirmed').length} 项已确认</p></article><article><FlaskConical size={18} /><div><strong>{relatedScenarios.length}</strong><span>实验与决策</span></div><p>{relatedScenarios.reduce((sum, item) => sum + item.runs.length, 0)} 次评测运行</p></article><article><FileChartColumn size={18} /><div><strong>{relatedReports.length}</strong><span>汇报版本</span></div><p>均可追溯到本项目</p></article></div>
        </section>
        <aside className="project-side-stack">
          <section className="panel edit-panel"><div className="panel-header"><div><p className="eyebrow">项目控制</p><h2>当前状态</h2></div><button className="icon-button" aria-label="编辑项目" onClick={() => { setProjectDraft({ ...selected, tags: [...selected.tags], deliverables: [...selected.deliverables], risks: [...selected.risks] }); setEditOpen(true); }}><Edit3 size={16} /></button></div><div className="project-facts"><div><span>状态</span><strong>{statusText[selected.status]}</strong></div><div><span>下一步行动</span><p>{selected.nextAction || '待确认'}</p></div><div><span>目标日期</span><p>{selected.dueDate ? formatDate(selected.dueDate) : '未设置'}</p></div>{selected.tags.length ? <div><span>标签</span><p>{selected.tags.join(' · ')}</p></div> : null}</div></section>
          <section className="panel"><div className="panel-header"><div><p className="eyebrow">结果与风险</p><h2>项目边界</h2></div></div>
            <div className="boundary-block"><label>预期结果</label>{selected.deliverables.length ? <ul>{selected.deliverables.map((item) => <li key={item}>{item}</li>)}</ul> : <p>可从任务收件箱升级项目，自动带入建议结果。</p>}</div>
            <div className="boundary-block"><label>已知风险</label>{selected.risks.length ? <ul>{selected.risks.map((item) => <li key={item}>{item}</li>)}</ul> : <p>当前没有记录风险。</p>}</div>
            <HistoryPanel database={database} entityType="project" entityId={selected.id} onRestore={(revisionId) => { mutate((current) => restoreEntityRevision(current, revisionId)); notify('已恢复所选项目版本'); }} />
            <button className="danger-text-button" onClick={() => void removeProject()}><Trash2 size={16} />移入回收站</button>
          </section>
        </aside>
      </div>
      <Modal open={taskOpen} onClose={() => setTaskOpen(false)} title="添加下一步任务" size="small"><label className="field"><span>任务内容</span><textarea autoFocus rows={5} value={taskDraft} onChange={(event) => setTaskDraft(event.target.value)} placeholder="例如：整理下次讨论需要确认的问题" /></label><div className="modal-actions"><button className="secondary-button" onClick={() => setTaskOpen(false)}>取消</button><button className="primary-button" disabled={!taskDraft.trim()} onClick={addTask}>添加任务</button></div></Modal>
      <Modal open={editOpen && Boolean(projectDraft)} onClose={() => setEditOpen(false)} title="编辑项目" description="保存时会自动留下修改前快照。" size="large">{projectDraft ? <div className="project-edit-form"><div className="form-grid"><label className="field span-2"><span>项目名称</span><input autoFocus value={projectDraft.title} onChange={(event) => setProjectDraft({ ...projectDraft, title: event.target.value })} /></label><label className="field span-2"><span>目标</span><textarea rows={3} value={projectDraft.objective} onChange={(event) => setProjectDraft({ ...projectDraft, objective: event.target.value })} /></label><label className="field span-2"><span>背景与边界</span><textarea rows={3} value={projectDraft.brief} onChange={(event) => setProjectDraft({ ...projectDraft, brief: event.target.value })} /></label><label className="field"><span>状态</span><select value={projectDraft.status} onChange={(event) => setProjectDraft({ ...projectDraft, status: event.target.value as ProjectStatus })}><option value="planning">规划中</option><option value="active">进行中</option><option value="blocked">受阻</option><option value="complete">已完成</option></select></label><label className="field"><span>目标日期</span><input type="date" value={projectDraft.dueDate} onChange={(event) => setProjectDraft({ ...projectDraft, dueDate: event.target.value })} /></label><label className="field"><span>场景 / 领域</span><input value={projectDraft.department} onChange={(event) => setProjectDraft({ ...projectDraft, department: event.target.value })} /></label><label className="field"><span>标签（逗号分隔）</span><input value={projectDraft.tags.join(', ')} onChange={(event) => setProjectDraft({ ...projectDraft, tags: event.target.value.split(/[,，]/) })} /></label><label className="field span-2"><span>下一步行动</span><textarea rows={2} value={projectDraft.nextAction} onChange={(event) => setProjectDraft({ ...projectDraft, nextAction: event.target.value })} /></label><label className="field"><span>预期结果（每行一项）</span><textarea rows={5} value={projectDraft.deliverables.join('\n')} onChange={(event) => setProjectDraft({ ...projectDraft, deliverables: event.target.value.split('\n') })} /></label><label className="field"><span>已知风险（每行一项）</span><textarea rows={5} value={projectDraft.risks.join('\n')} onChange={(event) => setProjectDraft({ ...projectDraft, risks: event.target.value.split('\n') })} /></label></div><footer className="modal-actions"><button className="secondary-button" onClick={() => setEditOpen(false)}>取消</button><button className="primary-button" disabled={!projectDraft.title.trim()} onClick={saveProject}><Save size={15} />保存修改</button></footer></div> : null}</Modal>
    </div>;
  }

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">Projects</p><h1>工作项目</h1><p>把任务、资料、决定、测试和成果放在同一个上下文里。</p></div><button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={17} />新建项目</button></header>
    {sortedProjects.length ? <div className="projects-grid">{sortedProjects.map((project) => {
      const progress = projectProgress(project, database.tasks);
      const count = database.tasks.filter((task) => isActive(task) && task.projectId === project.id && task.status !== 'done').length;
      return <button className="project-card" key={project.id} onClick={() => setSelectedId(project.id)}><div className="project-card-top"><span className={`status-label ${project.status}`}>{statusText[project.status]}</span><em>{project.department || '未分组'}</em></div><h2>{project.title}</h2><p>{project.objective || '待补充项目目标'}</p><div className="project-next"><Target size={16} /><span>{project.nextAction || '确认下一步行动'}</span></div><div className="project-card-footer"><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><strong>{progress}%</strong><small>{count}项待办</small></div></button>;
    })}</div> : <EmptyState icon={BriefcaseBusiness} title="还没有工作项目" description="任务持续超过一天、需要多个步骤或长期跟踪时，就值得建立项目。" action={<button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={16} />创建第一个项目</button>} />}
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="新建工作项目" description="先写清目标即可，细节可以在执行中逐渐补充。">
      <div className="form-grid"><label className="field span-2"><span>项目名称</span><input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：完成个人作品集或建立阅读系统" /></label><label className="field span-2"><span>项目目标</span><textarea rows={4} value={draft.objective} onChange={(event) => setDraft({ ...draft, objective: event.target.value })} placeholder="完成后，希望产生什么可验证结果？" /></label><label className="field"><span>场景 / 领域</span><input value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} placeholder="可稍后填写" /></label><label className="field"><span>目标日期</span><input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} /></label></div>
      <div className="modal-actions"><button className="secondary-button" onClick={() => setCreateOpen(false)}>取消</button><button className="primary-button" disabled={!draft.title.trim()} onClick={createProject}>创建项目</button></div>
    </Modal>
  </div>;
}
