import {
  ArrowRight,
  BookOpenText,
  Check,
  CheckCircle2,
  CircleDashed,
  FileChartColumn,
  FlaskConical,
  Link2,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { TaskStatus } from '../../shared/models';
import type { NavigateHandler } from '../components/Sidebar';
import { useAppStore } from '../context/AppStore';
import { useConfirm } from '../context/ConfirmationContext';
import { activity, formatDate, formatFullDate } from '../lib/utils';
import { isActive, prependRevision } from '../lib/entity-history';
import { sortTasksForAction, transitionTask } from '../lib/task-actions';

const statusText: Record<TaskStatus, string> = {
  inbox: '待澄清',
  planned: '已计划',
  doing: '推进中',
  done: '已完成',
};

export function DashboardPage({ onNavigate, onQuickCapture, initialSelectedId }: { onNavigate: NavigateHandler; onQuickCapture: () => void; initialSelectedId?: string }) {
  const { database, mutate, notify } = useAppStore();
  const confirm = useConfirm();
  const orderedTasks = useMemo(() => {
    if (!database) return [];
    return sortTasksForAction(database.tasks.filter(isActive));
  }, [database]);
  const [selectedId, setSelectedId] = useState(initialSelectedId || '');

  useEffect(() => {
    if (initialSelectedId && orderedTasks.some((task) => task.id === initialSelectedId)) setSelectedId(initialSelectedId);
  }, [initialSelectedId, orderedTasks]);

  useEffect(() => {
    if (!orderedTasks.length) {
      setSelectedId('');
      return;
    }
    if (!orderedTasks.some((task) => task.id === selectedId)) setSelectedId(orderedTasks[0].id);
  }, [orderedTasks, selectedId]);

  if (!database) return null;
  const selectedTask = orderedTasks.find((task) => task.id === selectedId) ?? null;
  const linkedProject = selectedTask?.projectId ? database.projects.find((project) => project.id === selectedTask.projectId && isActive(project)) ?? null : null;
  const relatedKnowledge = selectedTask ? database.knowledge.filter((item) => isActive(item) && (item.taskId === selectedTask.id || (!item.taskId && selectedTask.projectId && item.projectId === selectedTask.projectId))) : [];
  const relatedScenarios = selectedTask ? database.scenarios.filter((item) => isActive(item) && (item.taskId === selectedTask.id || (!item.taskId && selectedTask.projectId && item.projectId === selectedTask.projectId))) : [];
  const relatedReports = selectedTask ? database.reports.filter((item) => isActive(item) && (item.taskId === selectedTask.id || (!item.taskId && selectedTask.projectId && item.projectId === selectedTask.projectId))) : [];
  const evidenceCount = relatedKnowledge.length;
  const flowCoverage = selectedTask ? [
    Boolean(selectedTask.rawInput),
    selectedTask.clarificationQuestions.length > 0,
    selectedTask.steps.length > 0,
    evidenceCount + relatedScenarios.length > 0,
    selectedTask.deliverables.length + relatedReports.length > 0,
  ].filter(Boolean).length : 0;

  const updateStatus = (status: TaskStatus) => {
    if (!selectedTask || selectedTask.status === status) return;
    mutate((current) => transitionTask(current, selectedTask.id, status, status === 'done' ? '完成任务' : '推进任务'));
    notify(status === 'done' ? '这项任务已完成并留痕' : '已切换到推进状态');
  };

  const completeSelectedTask = async () => {
    if (!selectedTask) return;
    const accepted = await confirm({ title: '确认完成任务', message: `“${selectedTask.title}”将标记为已完成并进入汇报记录，之后仍可重新打开。`, confirmLabel: '完成并留痕' });
    if (accepted) updateStatus('done');
  };

  const toggleStep = (index: number) => {
    if (!selectedTask) return;
    const completion = [...selectedTask.stepCompletion];
    completion[index] = !completion[index];
    const now = new Date().toISOString();
    mutate((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === selectedTask.id ? { ...task, stepCompletion: completion, updatedAt: now } : task), revisions: prependRevision(current, 'task', selectedTask, 'update'), activities: [activity('task', completion[index] ? '完成行动步骤' : '重新打开行动步骤', selectedTask.steps[index], selectedTask.id), ...current.activities] }));
  };

  return (
    <div className="workline-page">
      <header className="workline-intro">
        <div className="intro-register">
          <span>今日 / {new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date())}</span>
          <i />
          <span>{orderedTasks.filter((task) => task.status !== 'done').length} 项开放任务</span>
        </div>
        <div className="intro-heading">
          <div>
            <p className="eyebrow">任务工作台</p>
            <h1>从一个输入，推进到可验证结果。</h1>
            <p>按“原始输入 → 澄清 → 行动 → 依据 → 输出”推进，每一步都能修改、复核和追溯。</p>
          </div>
          <button className="signal-button" onClick={onQuickCapture}><Plus size={18} />记录新任务</button>
        </div>
      </header>

      <div className="workline-desk">
        <aside className="thread-index" aria-label="任务目录">
          <div className="thread-index-head">
            <div><span>全部任务</span><strong>任务目录</strong></div>
            <button onClick={onQuickCapture} aria-label="新建任务"><Plus size={16} /></button>
          </div>
          <div className="thread-index-ruler" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <div className="thread-list">
            {orderedTasks.map((task, index) => (
              <button
                key={task.id}
                className={`thread-row ${task.id === selectedId ? 'active' : ''} ${task.status === 'done' ? 'complete' : ''}`}
                onClick={() => { setSelectedId(task.id); onNavigate('dashboard', task.id); }}
              >
                <span className="thread-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="thread-copy">
                  <strong>{task.title}</strong>
                  <small>{task.source} · {statusText[task.status]}</small>
                </span>
                <i className={`thread-priority ${task.priority}`} title={`${task.priority} priority`} />
              </button>
            ))}
            {!orderedTasks.length ? <div className="thread-empty"><CircleDashed size={20} /><strong>目录还是空的</strong><span>先记下第一个真实事项。</span></div> : null}
          </div>
          <button className="index-all-button" onClick={() => onNavigate('inbox')}>打开任务总表 <ArrowRight size={14} /></button>
        </aside>

        <main className="workline-canvas">
          {selectedTask ? (
            <>
              <header className="canvas-heading">
                <div className="canvas-kicker">
                  <span className={`status-stamp ${selectedTask.status}`}>{statusText[selectedTask.status]}</span>
                  <span>记录于 {formatFullDate(selectedTask.createdAt)}</span>
                  {selectedTask.dueDate ? <span>期限 {formatDate(selectedTask.dueDate)}</span> : null}
                </div>
                <h2>{selectedTask.title}</h2>
                <p>{selectedTask.summary || '这项任务还没有形成摘要，原始输入仍完整保留在下方。'}</p>
                <div className="canvas-actions">
                  {selectedTask.status !== 'doing' && selectedTask.status !== 'done' ? <button className="primary-button" onClick={() => updateStatus('doing')}><Play size={15} />开始推进</button> : null}
                  {selectedTask.status !== 'done' ? <button className="secondary-button" onClick={() => void completeSelectedTask()}><Check size={15} />完成并留痕</button> : <><span className="completion-seal"><CheckCircle2 size={16} />已形成完成记录</span><button className="secondary-button" onClick={() => updateStatus('planned')}><RotateCcw size={15} />重新打开</button></>}
                  <button className="text-button" onClick={() => onNavigate('inbox', selectedTask.id)}>编辑任务内容 <ArrowRight size={14} /></button>
                </div>
                <div className="workline-summary" aria-label="当前任务进度摘要">
                  <div><span>澄清</span><strong>{selectedTask.clarificationAnswers.filter(Boolean).length}/{selectedTask.clarificationQuestions.length}</strong><small>已回答</small></div>
                  <div><span>行动</span><strong>{selectedTask.stepCompletion.filter(Boolean).length}/{selectedTask.steps.length}</strong><small>已完成</small></div>
                  <div><span>依据</span><strong>{relatedKnowledge.length + relatedScenarios.length}</strong><small>证据与实验</small></div>
                  <div><span>输出</span><strong>{selectedTask.deliverables.length + relatedReports.length}</strong><small>预期与版本</small></div>
                </div>
              </header>

              <div className="flow-spine" aria-label="工作推进底稿">
                <article className="flow-entry origin-entry">
                  <div className="flow-marker"><span>01</span></div>
                  <div className="flow-sheet">
                    <div className="sheet-label"><strong>1. 原始输入</strong><span>保留来源，避免摘要覆盖原意</span></div>
                    <blockquote>{selectedTask.rawInput}</blockquote>
                    <footer><span>来源：{selectedTask.source}</span><span>原始内容永久保留，不被摘要覆盖</span></footer>
                  </div>
                </article>

                <article className="flow-entry">
                  <div className="flow-marker"><span>02</span></div>
                  <div className="flow-sheet">
                    <div className="sheet-label"><strong>2. 待确认问题</strong><span>记录真实答案，再继续推进</span></div>
                    {selectedTask.clarificationQuestions.length ? (
                      <ol className="question-ledger">{selectedTask.clarificationQuestions.map((item, index) => <li key={`${item}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><p>{item}</p>{selectedTask.clarificationAnswers[index] ? <small>{selectedTask.clarificationAnswers[index]}</small> : <small className="unanswered">尚未记录答案</small>}</div></li>)}</ol>
                    ) : <p className="sheet-placeholder">当前没有待确认问题。若任务边界发生变化，可在任务总表中重新整理。</p>}
                  </div>
                </article>

                <article className="flow-entry">
                  <div className="flow-marker"><span>03</span></div>
                  <div className="flow-sheet plan-sheet">
                    <div className="sheet-label"><strong>3. 执行步骤</strong><span>点击序号即可完成或重新打开</span></div>
                    {selectedTask.steps.length ? (
                      <ol className="action-ledger">{selectedTask.steps.map((item, index) => <li key={`${item}-${index}`} className={selectedTask.stepCompletion[index] ? 'done' : ''}><button aria-label={`${selectedTask.stepCompletion[index] ? '重新打开' : '完成'}步骤 ${index + 1}`} onClick={() => toggleStep(index)}>{selectedTask.stepCompletion[index] ? <Check size={13} /> : index + 1}</button><p>{item}</p></li>)}</ol>
                    ) : <p className="sheet-placeholder">尚未拆解行动步骤。</p>}
                  </div>
                </article>

                <article className="flow-entry">
                  <div className="flow-marker"><span>04</span></div>
                  <div className="flow-sheet evidence-sheet">
                    <div className="sheet-label"><strong>4. 依据与验证</strong><span>事实资料和实验结果直接关联本任务</span></div>
                    {relatedKnowledge.length || relatedScenarios.length ? (
                      <div className="evidence-ledger">
                        {relatedKnowledge.slice(0, 3).map((item) => <button key={item.id} onClick={() => onNavigate('knowledge', item.id)}><BookOpenText size={15} /><span><strong>{item.title}</strong><small>{item.taskId === selectedTask.id ? '本任务' : '项目上下文'} · {item.verificationStatus === 'confirmed' ? '已确认' : '待核验'}</small></span><ArrowRight size={14} /></button>)}
                        {relatedScenarios.slice(0, 2).map((item) => <button key={item.id} onClick={() => onNavigate('scenarios', item.id)}><FlaskConical size={15} /><span><strong>{item.title}</strong><small>{item.taskId === selectedTask.id ? '本任务' : '项目上下文'} · 价值 {item.valueScore}/100</small></span><ArrowRight size={14} /></button>)}
                      </div>
                    ) : (
                      <button className="sheet-callout" onClick={() => onNavigate(selectedTask.projectId ? 'knowledge' : 'inbox', selectedTask.projectId ? undefined : selectedTask.id)}><Link2 size={17} /><span><strong>这项任务还没有可追溯依据</strong><small>{selectedTask.projectId ? '去证据库补充资料、事实或决定' : '先在任务编辑中关联项目，再沉淀证据和实验'}</small></span><ArrowRight size={15} /></button>
                    )}
                  </div>
                </article>

                <article className="flow-entry final-entry">
                  <div className="flow-marker"><span>05</span></div>
                  <div className="flow-sheet delivery-sheet">
                    <div className="sheet-label"><strong>5. 输出与完成标准</strong><span>先定义完成标准，再形成汇报版本</span></div>
                    <div className="deliverable-strip">
                      {selectedTask.deliverables.length ? selectedTask.deliverables.map((item, index) => <span key={`${item}-${index}`}><b>{String(index + 1).padStart(2, '0')}</b>{item}</span>) : <span><b>—</b>尚未定义预期结果</span>}
                    </div>
                    <div className="acceptance-block">
                      <strong>完成标准</strong>
                      {selectedTask.acceptanceCriteria.length ? <ul>{selectedTask.acceptanceCriteria.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>尚未定义。建议写成“谁确认、什么结果、达到什么条件”。</p>}
                    </div>
                    {relatedReports.length ? <div className="linked-report"><FileChartColumn size={16} /><span><strong>{relatedReports[0].title}</strong><small>已有 {relatedReports.length} 个可追溯版本</small></span></div> : null}
                    <button className="text-button" onClick={() => onNavigate('reports')}>打开汇报编辑器 <ArrowRight size={14} /></button>
                  </div>
                </article>
              </div>
            </>
          ) : (
            <div className="blank-workline">
              <span>NO. 000</span>
              <h2>先把一个真实事项放上桌面。</h2>
              <p>不需要先想清楚它属于哪个模块。写下原始输入后，系统会保留来源，并整理待确认问题、行动路径和预期结果。</p>
              <button className="signal-button" onClick={onQuickCapture}><Plus size={18} />记录第一个事项</button>
            </div>
          )}
        </main>

        <aside className="workline-context" aria-label="当前任务上下文">
          <div className="context-head"><span>当前任务</span><i /></div>
          <section className="context-section">
            <p className="context-label">闭环覆盖</p>
            <div className="coverage-score"><strong>{flowCoverage}</strong><span>/ 5</span></div>
            <div className="coverage-rule">{[0, 1, 2, 3, 4].map((index) => <i key={index} className={index < flowCoverage ? 'filled' : ''} />)}</div>
            <small>输入、澄清、行动、依据、输出</small>
          </section>

          <section className="context-section">
            <p className="context-label">所属上下文</p>
            {linkedProject ? <button className="context-project" onClick={() => onNavigate('projects', linkedProject.id)}><Target size={16} /><span><strong>{linkedProject.title}</strong><small>{linkedProject.nextAction || linkedProject.objective}</small></span><ArrowRight size={14} /></button> : <button className="context-project unlinked" onClick={() => onNavigate('inbox', selectedTask?.id)}><Link2 size={16} /><span><strong>尚未关联项目</strong><small>可在任务编辑中选择已有项目</small></span><ArrowRight size={14} /></button>}
          </section>

          <section className="context-section context-counts">
            <p className="context-label">关联记录</p>
            <button onClick={() => onNavigate('knowledge', relatedKnowledge[0]?.id)}><span>证据</span><strong>{relatedKnowledge.length}</strong></button>
            <button onClick={() => onNavigate('scenarios', relatedScenarios[0]?.id)}><span>实验</span><strong>{relatedScenarios.length}</strong></button>
            <button onClick={() => onNavigate('reports', relatedReports[0]?.id)}><span>汇报版本</span><strong>{relatedReports.length}</strong></button>
          </section>

          <section className="context-section boundary-note">
            {database.settings.aiMode === 'api' ? <Sparkles size={16} /> : <ShieldCheck size={16} />}
            <div><strong>{database.settings.aiMode === 'api' ? '模型增强 · 有边界' : '本地整理模式'}</strong><p>{database.settings.aiMode === 'api' ? '外部模型仅在已确认规则下工作；敏感证据不会发送。' : '当前基础分析在本机完成，资料默认留在浏览器。'}</p></div>
          </section>
        </aside>
      </div>
    </div>
  );
}
