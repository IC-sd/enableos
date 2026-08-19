import { Archive, ArrowRight, BriefcaseBusiness, Check, CircleDashed, Inbox, Play, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Project, Task, TaskStatus } from '../../shared/models';
import type { NavigateHandler } from '../components/Sidebar';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { useAppStore } from '../context/AppStore';
import { useConfirm } from '../context/ConfirmationContext';
import { activity, formatDate, randomUUID } from '../lib/utils';
import { isActive, prependRevision, restoreEntityRevision } from '../lib/entity-history';
import { HistoryPanel } from '../components/HistoryPanel';

const statusLabels: Record<TaskStatus, string> = { inbox: '待梳理', planned: '已计划', doing: '进行中', done: '已完成' };

function editableCopy(task: Task): Task {
  return {
    ...task,
    clarificationQuestions: [...task.clarificationQuestions],
    clarificationAnswers: [...task.clarificationAnswers],
    steps: [...task.steps],
    stepCompletion: [...task.stepCompletion],
    deliverables: [...task.deliverables],
    acceptanceCriteria: [...task.acceptanceCriteria],
  };
}

export function InboxPage({ onNavigate, initialSelectedId }: { onNavigate: NavigateHandler; initialSelectedId?: string }) {
  const { database, mutate, notify } = useAppStore();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<TaskStatus | 'open' | 'all'>('open');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId || null);
  const [editTask, setEditTask] = useState<Task | null>(null);

  useEffect(() => {
    if (!database || !initialSelectedId) return;
    const task = database.tasks.find((item) => item.id === initialSelectedId && isActive(item));
    if (task) { setSelectedId(task.id); setEditTask(editableCopy(task)); }
  }, [database, initialSelectedId]);

  if (!database) return null;
  const selected = database.tasks.find((task) => task.id === selectedId && isActive(task)) ?? null;
  const tasks = useMemo(() => database.tasks.filter((task) => {
    if (!isActive(task)) return false;
    if (filter === 'all') return true;
    if (filter === 'open') return task.status !== 'done';
    return task.status === filter;
  }), [database.tasks, filter]);

  const openTask = (task: Task) => { setSelectedId(task.id); setEditTask(editableCopy(task)); };
  const closeTask = () => { setSelectedId(null); setEditTask(null); };

  const updateTask = (id: string, patch: Partial<Task>, log?: string) => {
    const now = new Date().toISOString();
    mutate((current) => {
      const previous = current.tasks.find((task) => task.id === id);
      if (!previous) return current;
      return ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== id) return task;
        const completedAt = patch.completedAt !== undefined ? patch.completedAt : patch.status === 'done' ? now : task.completedAt;
        return { ...task, ...patch, updatedAt: now, completedAt };
      }),
      revisions: prependRevision(current, 'task', previous, 'update'),
      activities: log ? [activity('task', log, current.tasks.find((task) => task.id === id)?.title || '', id), ...current.activities] : current.activities,
    }); });
  };

  const saveTask = () => {
    if (!editTask?.title.trim()) return;
    const clarifications = editTask.clarificationQuestions
      .map((question, index) => ({ question: question.trim(), answer: (editTask.clarificationAnswers[index] || '').trim() }))
      .filter((item) => item.question);
    const actions = editTask.steps
      .map((step, index) => ({ step: step.trim(), done: Boolean(editTask.stepCompletion[index]) }))
      .filter((item) => item.step);
    updateTask(editTask.id, {
      ...editTask,
      title: editTask.title.trim(),
      summary: editTask.summary.trim(),
      clarificationQuestions: clarifications.map((item) => item.question),
      clarificationAnswers: clarifications.map((item) => item.answer),
      steps: actions.map((item) => item.step),
      stepCompletion: actions.map((item) => item.done),
      deliverables: editTask.deliverables.map((item) => item.trim()).filter(Boolean),
      acceptanceCriteria: editTask.acceptanceCriteria.map((item) => item.trim()).filter(Boolean),
    }, '更新任务内容');
    notify('任务修改已保存');
    closeTask();
  };

  const convertToProject = (task: Task) => {
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(), title: task.title, objective: task.summary || task.rawInput, brief: task.rawInput,
      status: 'active', department: '', progress: 0, dueDate: task.dueDate, tags: [], deliverables: task.deliverables,
      risks: [], nextAction: task.steps.find((_, index) => !task.stepCompletion[index]) || task.steps[0] || '确认下一步行动', createdAt: now, updatedAt: now, deletedAt: '',
    };
    mutate((current) => ({
      ...current,
      projects: [project, ...current.projects],
      tasks: current.tasks.map((item) => item.id === task.id ? { ...item, projectId: project.id, status: 'planned', updatedAt: now } : item),
      activities: [activity('project', '由任务创建项目', project.title, project.id), ...current.activities],
    }));
    notify('已创建工作项目');
    closeTask();
    onNavigate('projects', project.id);
  };

  const removeTask = async (task: Task) => {
    if (!await confirm({ title: '移入回收站', message: `任务“${task.title}”会移入回收站；关联资料仍会保留，可随时恢复。`, confirmLabel: '移入回收站', tone: 'danger' })) return;
    const deletedAt = new Date().toISOString();
    mutate((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? { ...item, deletedAt, updatedAt: deletedAt } : item),
      revisions: prependRevision(current, 'task', task, 'delete'),
      activities: [activity('task', '任务移入回收站', task.title, task.id), ...current.activities],
    }));
    closeTask();
    notify('任务已移入回收站，关联资产仍保留', 'info');
  };

  const completeTask = async (task: Task) => {
    if (!await confirm({ title: '确认完成任务', message: `“${task.title}”将标记为已完成并进入汇报记录，之后仍可重新打开。`, confirmLabel: '标记完成' })) return;
    updateTask(task.id, { status: 'done' }, '完成任务');
    notify('已记录完成，可随时重新打开');
    closeTask();
  };

  const updateQuestion = (index: number, field: 'question' | 'answer', value: string) => {
    if (!editTask) return;
    if (field === 'question') {
      const next = [...editTask.clarificationQuestions]; next[index] = value; setEditTask({ ...editTask, clarificationQuestions: next });
    } else {
      const next = [...editTask.clarificationAnswers]; next[index] = value; setEditTask({ ...editTask, clarificationAnswers: next });
    }
  };

  const removeQuestion = (index: number) => {
    if (!editTask) return;
    setEditTask({ ...editTask, clarificationQuestions: editTask.clarificationQuestions.filter((_, itemIndex) => itemIndex !== index), clarificationAnswers: editTask.clarificationAnswers.filter((_, itemIndex) => itemIndex !== index) });
  };

  const updateStep = (index: number, patch: { title?: string; done?: boolean }) => {
    if (!editTask) return;
    const steps = [...editTask.steps]; const completion = [...editTask.stepCompletion];
    if (patch.title !== undefined) steps[index] = patch.title;
    if (patch.done !== undefined) completion[index] = patch.done;
    setEditTask({ ...editTask, steps, stepCompletion: completion });
  };

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">任务记录</p><h1>任务收件箱</h1><p>保留原话，也允许你持续修正理解、补充答案和更新推进状态。</p></div></header>
    <div className="toolbar"><div className="segmented-control">{([['open', '未完成'], ['inbox', '待梳理'], ['doing', '进行中'], ['done', '已完成'], ['all', '全部']] as const).map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div><span className="toolbar-count">{tasks.length} 项</span></div>

    {tasks.length ? <div className="task-board">{tasks.map((task) => <button className="task-card" key={task.id} onClick={() => openTask(task)}><div className={`task-status-icon ${task.status}`}>{task.status === 'done' ? <Check size={16} /> : task.status === 'doing' ? <Play size={14} /> : <CircleDashed size={16} />}</div><div className="task-card-main"><div className="task-card-heading"><h3>{task.title}</h3><span className={`priority-pill ${task.priority}`}>{task.priority === 'high' ? '高优先' : task.priority === 'medium' ? '中优先' : '低优先'}</span></div><p>{task.summary || task.rawInput}</p><div className="task-meta"><span>{task.source}</span><span>{statusLabels[task.status]}</span>{task.dueDate ? <span>{formatDate(task.dueDate)}前</span> : null}{task.projectId ? <span>已关联项目</span> : null}<span>{task.stepCompletion.filter(Boolean).length}/{task.steps.length} 步</span></div></div><ArrowRight size={17} className="row-arrow" /></button>)}</div> : <EmptyState icon={Inbox} title="这里暂时很安静" description="用“快速记录”保存他人请求、会议事项、个人计划或临时想法。" />}

    <Modal open={Boolean(selected && editTask)} onClose={closeTask} title={selected?.title || ''} description={selected ? `来源：${selected.source} · ${statusLabels[selected.status]}` : ''} size="large">
      {selected && editTask ? <div className="task-editor">
        <section className="detail-block raw-quote"><label>原始输入（完整保留）</label><blockquote>{selected.rawInput}</blockquote></section>
        <div className="form-grid task-core-fields">
          <label className="field span-2"><span>任务标题</span><input value={editTask.title} onChange={(event) => setEditTask({ ...editTask, title: event.target.value })} /></label>
          <label className="field span-2"><span>当前理解</span><textarea rows={3} value={editTask.summary} onChange={(event) => setEditTask({ ...editTask, summary: event.target.value })} /></label>
          <label className="field"><span>优先级</span><select value={editTask.priority} onChange={(event) => setEditTask({ ...editTask, priority: event.target.value as Task['priority'] })}><option value="high">高优先</option><option value="medium">中优先</option><option value="low">低优先</option></select></label>
          <label className="field"><span>截止日期</span><input type="date" value={editTask.dueDate} onChange={(event) => setEditTask({ ...editTask, dueDate: event.target.value })} /></label>
          <label className="field"><span>来源</span><input value={editTask.source} onChange={(event) => setEditTask({ ...editTask, source: event.target.value })} /></label>
          <label className="field"><span>关联项目</span><select value={editTask.projectId || ''} onChange={(event) => setEditTask({ ...editTask, projectId: event.target.value || null })}><option value="">暂不关联</option>{database.projects.filter(isActive).map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label>
        </div>

        <section className="editor-section"><div className="editor-section-head"><div><p className="eyebrow">澄清记录</p><h2>问题与真实答案</h2></div><button className="secondary-button" onClick={() => setEditTask({ ...editTask, clarificationQuestions: [...editTask.clarificationQuestions, ''], clarificationAnswers: [...editTask.clarificationAnswers, ''] })}><Plus size={14} />增加问题</button></div><div className="clarification-editor-list">{editTask.clarificationQuestions.map((question, index) => <article key={index}><span>{String(index + 1).padStart(2, '0')}</span><div><input aria-label={`澄清问题 ${index + 1}`} value={question} onChange={(event) => updateQuestion(index, 'question', event.target.value)} /><textarea aria-label={`澄清答案 ${index + 1}`} rows={2} value={editTask.clarificationAnswers[index] || ''} onChange={(event) => updateQuestion(index, 'answer', event.target.value)} placeholder="记录相关人的原话或自己的明确决定；没有答案可以留空" /></div><button className="icon-button" aria-label={`删除澄清问题 ${index + 1}`} onClick={() => removeQuestion(index)}><X size={14} /></button></article>)}</div></section>

        <section className="editor-section"><div className="editor-section-head"><div><p className="eyebrow">行动路径</p><h2>逐步推进</h2></div><button className="secondary-button" onClick={() => setEditTask({ ...editTask, steps: [...editTask.steps, ''], stepCompletion: [...editTask.stepCompletion, false] })}><Plus size={14} />增加步骤</button></div><div className="step-editor-list">{editTask.steps.map((step, index) => <article key={index} className={editTask.stepCompletion[index] ? 'done' : ''}><label><input type="checkbox" checked={Boolean(editTask.stepCompletion[index])} onChange={(event) => updateStep(index, { done: event.target.checked })} /><span>{index + 1}</span></label><input aria-label={`行动步骤 ${index + 1}`} value={step} onChange={(event) => updateStep(index, { title: event.target.value })} /><button className="icon-button" aria-label={`删除步骤 ${index + 1}`} onClick={() => setEditTask({ ...editTask, steps: editTask.steps.filter((_, itemIndex) => itemIndex !== index), stepCompletion: editTask.stepCompletion.filter((_, itemIndex) => itemIndex !== index) })}><X size={14} /></button></article>)}</div></section>

        <div className="detail-columns"><label className="field"><span>预期结果（每行一项）</span><textarea rows={5} value={editTask.deliverables.join('\n')} onChange={(event) => setEditTask({ ...editTask, deliverables: event.target.value.split('\n') })} /></label><label className="field"><span>完成标准（每行一项）</span><textarea rows={5} value={editTask.acceptanceCriteria.join('\n')} onChange={(event) => setEditTask({ ...editTask, acceptanceCriteria: event.target.value.split('\n') })} placeholder="例如：目标使用者确认可用；10条测试全部通过" /></label></div>

        <HistoryPanel database={database} entityType="task" entityId={selected.id} onRestore={(revisionId) => { mutate((current) => restoreEntityRevision(current, revisionId)); closeTask(); notify('已恢复所选任务版本'); }} />
        <footer className="modal-actions split"><button className="danger-text-button" onClick={() => void removeTask(selected)}><Trash2 size={16} />移入回收站</button><div>{selected.status === 'done' ? <button className="secondary-button" onClick={() => { updateTask(selected.id, { status: 'planned', completedAt: '' }, '重新打开任务'); notify('已撤销完成，任务回到计划中'); closeTask(); }}><RotateCcw size={16} />重新打开</button> : <button className="secondary-button" onClick={() => { const next = selected.status === 'doing' ? 'planned' : 'doing'; updateTask(selected.id, { status: next }, next === 'doing' ? '开始处理任务' : '暂停任务'); notify(next === 'doing' ? '已开始处理' : '已移回计划'); closeTask(); }}><Play size={16} />{selected.status === 'doing' ? '移回计划' : '开始处理'}</button>}{!selected.projectId ? <button className="secondary-button" onClick={() => convertToProject(editTask)}><BriefcaseBusiness size={16} />新建项目</button> : null}{selected.status !== 'done' ? <button className="secondary-button" onClick={() => void completeTask(selected)}><Check size={16} />标记完成</button> : null}<button className="primary-button" onClick={saveTask}><Save size={16} />保存修改</button></div></footer>
      </div> : null}
    </Modal>
  </div>;
}
