import { ArrowRight, CheckCircle2, Download, Edit3, Gauge, Lightbulb, LoaderCircle, Plus, Save, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { EvaluationCase, ExperimentRun, Scenario, ScenarioDecision, ScenarioStatus } from '../../shared/models';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { useAppStore } from '../context/AppStore';
import { useConfirm } from '../context/ConfirmationContext';
import { desktop } from '../lib/bridge';
import { activity, buildWorkspaceContext, clampScore, randomUUID } from '../lib/utils';
import { isActive, prependRevision, restoreEntityRevision } from '../lib/entity-history';
import { HistoryPanel } from '../components/HistoryPanel';

const scenarioStatus: Record<ScenarioStatus, string> = { discovered: '待验证', validating: '验证中', prototype: '试行中', adopted: '已采用', archived: '已归档' };
const decisionNames: Record<ScenarioDecision, string> = { undecided: '尚未决定', iterate: '继续迭代', adopt: '采用', stop: '停止' };
type RunResultDraft = { actual: string; score: number; passed: boolean; notes: string };

export function ScenariosPage({ initialSelectedId }: { initialSelectedId?: string }) {
  const { database, mutate, notify } = useAppStore();
  const confirm = useConfirm();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId || null);
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [busy, setBusy] = useState(false);
  const [caseDraft, setCaseDraft] = useState({ title: '', input: '', expected: '', requirement: '', weight: 1 });
  const [runMeta, setRunMeta] = useState({ label: '', model: '', promptVersion: '', summary: '' });
  const [runResults, setRunResults] = useState<Record<string, RunResultDraft>>({});
  const [decisionReason, setDecisionReason] = useState('');
  const [scenarioDraft, setScenarioDraft] = useState<Scenario | null>(null);
  useEffect(() => {
    if (!database || !initialSelectedId) return;
    const scenario = database.scenarios.find((item) => item.id === initialSelectedId && isActive(item));
    if (scenario) openScenario(scenario);
  }, [initialSelectedId]);
  if (!database) return null;
  const selected = database.scenarios.find((scenario) => scenario.id === selectedId && isActive(scenario)) ?? null;
  const sorted = useMemo(() => database.scenarios.filter(isActive).sort((a, b) => {
    const scoreA = a.valueScore * 0.45 + a.feasibilityScore * 0.35 + a.dataReadiness * 0.2;
    const scoreB = b.valueScore * 0.45 + b.feasibilityScore * 0.35 + b.dataReadiness * 0.2;
    return scoreB - scoreA;
  }), [database.scenarios]);

  const openScenario = (scenario: Scenario) => {
    setSelectedId(scenario.id);
    setScenarioDraft({ ...scenario, prototypePlan: [...scenario.prototypePlan], successMetrics: [...scenario.successMetrics] });
    setDecisionReason(scenario.decisionReason);
    setRunMeta({ label: `第 ${scenario.runs.length + 1} 次评测`, model: database.settings.apiModel, promptVersion: '', summary: '' });
    setRunResults(Object.fromEntries(scenario.testCases.map((testCase) => [testCase.id, { actual: '', score: 0, passed: false, notes: '' }])));
  };

  const patchScenario = (id: string, patch: Partial<Scenario>, activityTitle?: string) => {
    mutate((current) => { const previous = current.scenarios.find((item) => item.id === id); if (!previous) return current; return ({
      ...current,
      scenarios: current.scenarios.map((scenario) => scenario.id === id ? { ...scenario, ...patch, updatedAt: new Date().toISOString() } : scenario),
      revisions: prependRevision(current, 'scenario', previous, 'update'),
      activities: activityTitle ? [activity('scenario', activityTitle, current.scenarios.find((item) => item.id === id)?.title || '', id), ...current.activities] : current.activities,
    }); });
  };

  const analyze = async () => {
    if (!description.trim() || busy) return;
    setBusy(true);
    try {
      const response = await desktop.ai.analyzeScenario(description, buildWorkspaceContext(database, description));
      const createdAt = new Date().toISOString();
      const result = response.data;
      const scenario: Scenario = {
        id: randomUUID(), projectId: projectId || null, taskId: taskId || null, title: result.title, department: department.trim(), pain: result.pain, currentProcess: result.currentProcess,
        aiOpportunity: result.aiOpportunity, inputs: result.inputs, outputs: result.outputs,
        dataReadiness: clampScore(result.dataReadiness), valueScore: clampScore(result.valueScore), feasibilityScore: clampScore(result.feasibilityScore),
        risk: result.risk, frequency: '待确认', status: 'discovered', hypothesis: `如果实施“${result.aiOpportunity}”，应能改善当前问题且不降低结果可靠性。`, baseline: '',
        prototypePlan: result.prototypePlan, successMetrics: result.successMetrics, testCases: [], runs: [], decision: 'undecided', decisionReason: '', createdAt, updatedAt: createdAt, deletedAt: '',
      };
      mutate((current) => ({ ...current, scenarios: [scenario, ...current.scenarios], activities: [activity('scenario', '记录待验证实验', scenario.title, scenario.id), ...current.activities] }));
      setDescription(''); setDepartment(''); setProjectId(''); setTaskId(''); setCreateOpen(false); openScenario(scenario); notify(response.notice, 'info');
    } catch (error) { notify(error instanceof Error ? error.message : '实验分析失败', 'error'); }
    finally { setBusy(false); }
  };

  const saveScenarioCore = () => {
    if (!selected || !scenarioDraft?.title.trim()) return;
    patchScenario(selected.id, {
      ...scenarioDraft,
      title: scenarioDraft.title.trim(), department: scenarioDraft.department.trim(), pain: scenarioDraft.pain.trim(), currentProcess: scenarioDraft.currentProcess.trim(), aiOpportunity: scenarioDraft.aiOpportunity.trim(), inputs: scenarioDraft.inputs.trim(), outputs: scenarioDraft.outputs.trim(), frequency: scenarioDraft.frequency.trim(), hypothesis: scenarioDraft.hypothesis.trim(), baseline: scenarioDraft.baseline.trim(),
      valueScore: clampScore(scenarioDraft.valueScore), feasibilityScore: clampScore(scenarioDraft.feasibilityScore), dataReadiness: clampScore(scenarioDraft.dataReadiness),
      prototypePlan: scenarioDraft.prototypePlan.map((item) => item.trim()).filter(Boolean), successMetrics: scenarioDraft.successMetrics.map((item) => item.trim()).filter(Boolean),
    }, '更新实验定义');
    notify('实验定义已保存');
  };

  const updateStatus = (status: ScenarioStatus) => {
    if (!selected) return;
    patchScenario(selected.id, { status }, `实验进入${scenarioStatus[status]}`);
    notify('实验状态已更新');
  };

  const addCase = () => {
    if (!selected || !caseDraft.title.trim() || !caseDraft.input.trim() || !caseDraft.expected.trim()) return;
    const testCase: EvaluationCase = { id: randomUUID(), ...caseDraft, title: caseDraft.title.trim(), input: caseDraft.input.trim(), expected: caseDraft.expected.trim(), requirement: caseDraft.requirement.trim(), weight: Math.max(.1, caseDraft.weight), createdAt: new Date().toISOString() };
    patchScenario(selected.id, { testCases: [...selected.testCases, testCase] }, '新增评测用例');
    setCaseDraft({ title: '', input: '', expected: '', requirement: '', weight: 1 });
    setRunResults((current) => ({ ...current, [testCase.id]: { actual: '', score: 0, passed: false, notes: '' } }));
    notify('评测用例已加入');
  };

  const removeCase = async (caseId: string) => {
    if (!selected) return;
    const testCase = selected.testCases.find((item) => item.id === caseId);
    if (!testCase || !await confirm({ title: '删除测试用例', message: `测试用例“${testCase.title}”将从当前实验中移除；修改前版本仍保留在历史快照中。`, confirmLabel: '删除用例', tone: 'danger' })) return;
    patchScenario(selected.id, { testCases: selected.testCases.filter((item) => item.id !== caseId) });
  };

  const recordRun = () => {
    if (!selected || !selected.testCases.length) return;
    const results = selected.testCases.map((testCase) => ({ caseId: testCase.id, ...(runResults[testCase.id] ?? { actual: '', score: 0, passed: false, notes: '' }), score: clampScore(runResults[testCase.id]?.score ?? 0) }));
    const totalWeight = selected.testCases.reduce((sum, item) => sum + item.weight, 0) || 1;
    const averageScore = Math.round(selected.testCases.reduce((sum, item) => sum + (results.find((result) => result.caseId === item.id)?.score ?? 0) * item.weight, 0) / totalWeight);
    const passRate = Math.round(results.filter((item) => item.passed).length / results.length * 100);
    const run: ExperimentRun = { id: randomUUID(), label: runMeta.label.trim() || `第 ${selected.runs.length + 1} 次评测`, model: runMeta.model.trim(), promptVersion: runMeta.promptVersion.trim(), results, averageScore, passRate, summary: runMeta.summary.trim(), createdAt: new Date().toISOString() };
    patchScenario(selected.id, { runs: [run, ...selected.runs], status: selected.status === 'discovered' ? 'validating' : selected.status }, '完成实验评测');
    setRunMeta({ label: `第 ${selected.runs.length + 2} 次评测`, model: database.settings.apiModel, promptVersion: '', summary: '' });
    setRunResults(Object.fromEntries(selected.testCases.map((item) => [item.id, { actual: '', score: 0, passed: false, notes: '' }])));
    notify(`评测已记录：平均 ${averageScore}，通过率 ${passRate}%`);
  };

  const saveDecision = (decision: ScenarioDecision) => {
    if (!selected) return;
    patchScenario(selected.id, { decision, decisionReason: decisionReason.trim(), status: decision === 'adopt' ? 'adopted' : selected.status }, `记录实验决策：${decisionNames[decision]}`);
    notify('决策和理由已保存');
  };

  const exportEvaluation = async () => {
    if (!selected) return;
    const pack = { format: 'enableos-evaluation-pack', version: 1, exportedAt: new Date().toISOString(), project: database.projects.find((item) => item.id === selected.projectId)?.title ?? null, scenario: selected };
    const result = await desktop.files.exportMarkdown(`${selected.title.replace(/[\\/:*?"<>|]/g, '-')}-评测包.json`, JSON.stringify(pack, null, 2));
    if (!result.canceled) notify('评测包已导出');
  };

  const remove = async () => {
    if (!selected || !await confirm({ title: '移入回收站', message: `实验“${selected.title}”会移入回收站，之后可以恢复。`, confirmLabel: '移入回收站', tone: 'danger' })) return;
    const deletedAt = new Date().toISOString();
    mutate((current) => ({ ...current, scenarios: current.scenarios.map((scenario) => scenario.id === selected.id ? { ...scenario, deletedAt, updatedAt: deletedAt } : scenario), revisions: prependRevision(current, 'scenario', selected, 'delete'), activities: [activity('scenario', '实验移入回收站', selected.title, selected.id), ...current.activities] })); setSelectedId(null); notify('实验已移入回收站', 'info');
  };

  return <div className="page scenarios-page">
    <header className="page-header"><div><p className="eyebrow">Experiments & decisions</p><h1>实验与决策</h1><p>任何流程、工具、学习方法或 AI 想法，都先用固定标准比较，再决定采用、迭代或停止。</p></div><button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={17} />记录待验证想法</button></header>
    <section className="scenario-guidance"><div className="guidance-icon"><Sparkles size={21} /></div><div><strong>实验链路</strong><p>问题或机会 → 当前基线 → 可检验假设 → 固定用例 → 多次运行 → 决策理由。没有测试结果，不把尝试写成有效成果。</p></div></section>
    {sorted.length ? <div className="scenario-grid">{sorted.map((scenario) => {
      const total = Math.round(scenario.valueScore * .45 + scenario.feasibilityScore * .35 + scenario.dataReadiness * .2);
      const latest = scenario.runs[0];
      return <button className="scenario-card" key={scenario.id} onClick={() => openScenario(scenario)}><div className="scenario-card-head"><span className={`scenario-status ${scenario.status}`}>{scenarioStatus[scenario.status]}</span><span className={`risk-label ${scenario.risk}`}><ShieldAlert size={13} />{scenario.risk === 'high' ? '高风险' : scenario.risk === 'medium' ? '中风险' : '低风险'}</span></div><h2>{scenario.title}</h2><p>{scenario.pain}</p><div className="scenario-score-row"><div><span>{latest ? '最近评测' : '综合建议'}</span><strong>{latest?.averageScore ?? total}</strong></div><div className="score-bars"><label>价值 <i><b style={{ width: `${scenario.valueScore}%` }} /></i></label><label>可行 <i><b style={{ width: `${scenario.feasibilityScore}%` }} /></i></label><label>条件 <i><b style={{ width: `${scenario.dataReadiness}%` }} /></i></label></div></div><footer><span>{scenario.testCases.length} 用例 · {scenario.runs.length} 次运行 · {decisionNames[scenario.decision]}</span><ArrowRight size={16} /></footer></button>;
    })}</div> : <EmptyState icon={Lightbulb} title="还没有实验" description="写下一个尚未证实的问题、想法或改进方案，再定义最小验证方式。" action={<button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={16} />记录第一个想法</button>} />}

    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="记录一个待验证想法" description="不需要先证明它正确，先保留问题、现状和想改变的部分。" size="large"><div className="form-grid"><label className="field span-2"><span>问题或想法</span><textarea autoFocus rows={8} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="例如：每周整理资料要重复复制粘贴，想尝试一个更省时但不会漏项的方法……" /></label><label className="field"><span>关联项目</span><select value={projectId} onChange={(event) => { setProjectId(event.target.value); setTaskId(''); }}><option value="">暂不关联</option>{database.projects.filter(isActive).map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label><label className="field"><span>关联任务</span><select value={taskId} onChange={(event) => { const nextTask = database.tasks.find((task) => task.id === event.target.value); setTaskId(event.target.value); if (nextTask?.projectId) setProjectId(nextTask.projectId); }}><option value="">项目级实验</option>{database.tasks.filter((task) => isActive(task) && (!projectId || task.projectId === projectId)).map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label><label className="field span-2"><span>适用场景 / 领域</span><input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="不知道可以留空" /></label></div><div className="analysis-note"><Gauge size={17} /><span>系统会生成实验卡和验证计划，不预设必须使用 AI、自动化或开发软件。</span></div><div className="modal-actions"><button className="secondary-button" onClick={() => setCreateOpen(false)}>取消</button><button className="primary-button" disabled={!description.trim() || busy} onClick={() => void analyze()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{busy ? '正在分析' : '生成实验卡'}</button></div></Modal>

    <Modal open={Boolean(selected)} onClose={() => setSelectedId(null)} title={selected?.title || ''} description={selected ? `${database.projects.find((item) => item.id === selected.projectId)?.title || '未关联项目'} · ${scenarioStatus[selected.status]}` : ''} size="large">{selected ? <div className="scenario-detail">
      <div className="scenario-score-summary"><Score label="预期价值" value={selected.valueScore} /><Score label="实施可行性" value={selected.feasibilityScore} /><Score label="条件准备度" value={selected.dataReadiness} /></div>
      {scenarioDraft ? <details className="experiment-form scenario-core-editor"><summary><Edit3 size={15} /> 编辑完整实验定义</summary><div className="form-grid"><label className="field span-2"><span>实验名称</span><input value={scenarioDraft.title} onChange={(event) => setScenarioDraft({ ...scenarioDraft, title: event.target.value })} /></label><label className="field"><span>关联项目</span><select value={scenarioDraft.projectId || ''} onChange={(event) => setScenarioDraft({ ...scenarioDraft, projectId: event.target.value || null, taskId: null })}><option value="">暂不关联</option>{database.projects.filter(isActive).map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label><label className="field"><span>关联任务</span><select value={scenarioDraft.taskId || ''} onChange={(event) => { const task = database.tasks.find((item) => item.id === event.target.value); setScenarioDraft({ ...scenarioDraft, taskId: event.target.value || null, projectId: task?.projectId || scenarioDraft.projectId }); }}><option value="">项目级实验</option>{database.tasks.filter((task) => isActive(task) && (!scenarioDraft.projectId || task.projectId === scenarioDraft.projectId)).map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label><label className="field"><span>适用场景 / 领域</span><input value={scenarioDraft.department} onChange={(event) => setScenarioDraft({ ...scenarioDraft, department: event.target.value })} /></label><label className="field"><span>发生频率</span><input value={scenarioDraft.frequency} onChange={(event) => setScenarioDraft({ ...scenarioDraft, frequency: event.target.value })} /></label><label className="field span-2"><span>真实问题</span><textarea rows={3} value={scenarioDraft.pain} onChange={(event) => setScenarioDraft({ ...scenarioDraft, pain: event.target.value })} /></label><label className="field span-2"><span>当前做法 / 基线</span><textarea rows={3} value={scenarioDraft.currentProcess} onChange={(event) => setScenarioDraft({ ...scenarioDraft, currentProcess: event.target.value })} /></label><label className="field span-2"><span>候选改变 / 解决思路</span><textarea rows={3} value={scenarioDraft.aiOpportunity} onChange={(event) => setScenarioDraft({ ...scenarioDraft, aiOpportunity: event.target.value })} /></label><label className="field"><span>输入</span><textarea rows={3} value={scenarioDraft.inputs} onChange={(event) => setScenarioDraft({ ...scenarioDraft, inputs: event.target.value })} /></label><label className="field"><span>输出</span><textarea rows={3} value={scenarioDraft.outputs} onChange={(event) => setScenarioDraft({ ...scenarioDraft, outputs: event.target.value })} /></label><label className="field"><span>预期价值 0—100</span><input type="number" min="0" max="100" value={scenarioDraft.valueScore} onChange={(event) => setScenarioDraft({ ...scenarioDraft, valueScore: Number(event.target.value) })} /></label><label className="field"><span>实施可行性 0—100</span><input type="number" min="0" max="100" value={scenarioDraft.feasibilityScore} onChange={(event) => setScenarioDraft({ ...scenarioDraft, feasibilityScore: Number(event.target.value) })} /></label><label className="field"><span>条件准备度 0—100</span><input type="number" min="0" max="100" value={scenarioDraft.dataReadiness} onChange={(event) => setScenarioDraft({ ...scenarioDraft, dataReadiness: Number(event.target.value) })} /></label><label className="field"><span>风险</span><select value={scenarioDraft.risk} onChange={(event) => setScenarioDraft({ ...scenarioDraft, risk: event.target.value as Scenario['risk'] })}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label><label className="field"><span>可检验假设</span><textarea rows={4} value={scenarioDraft.hypothesis} onChange={(event) => setScenarioDraft({ ...scenarioDraft, hypothesis: event.target.value })} /></label><label className="field"><span>量化基线</span><textarea rows={4} value={scenarioDraft.baseline} onChange={(event) => setScenarioDraft({ ...scenarioDraft, baseline: event.target.value })} /></label><label className="field"><span>最小试验计划（每行一项）</span><textarea rows={5} value={scenarioDraft.prototypePlan.join('\n')} onChange={(event) => setScenarioDraft({ ...scenarioDraft, prototypePlan: event.target.value.split('\n') })} /></label><label className="field"><span>成功指标（每行一项）</span><textarea rows={5} value={scenarioDraft.successMetrics.join('\n')} onChange={(event) => setScenarioDraft({ ...scenarioDraft, successMetrics: event.target.value.split('\n') })} /></label></div><button className="primary-button" onClick={saveScenarioCore}><Save size={15} />保存实验定义</button></details> : null}
      <div className="detail-columns"><section className="detail-block"><label>真实问题</label><p>{selected.pain}</p></section><section className="detail-block"><label>当前做法</label><p>{selected.currentProcess}</p></section></div>
      <section className="detail-block opportunity"><label>候选改变 / 解决思路</label><p>{selected.aiOpportunity}</p></section>
      <div className="detail-columns"><section className="detail-block"><label>可检验假设</label><p>{selected.hypothesis || '待补充'}</p></section><section className="detail-block"><label>现有基线</label><p>{selected.baseline || '待补充量化基线'}</p></section></div>

      <section className="evaluation-section"><div className="section-title compact"><div><p className="eyebrow">固定测试集</p><h2>评测用例（{selected.testCases.length}）</h2></div></div>
        {selected.testCases.map((testCase, index) => <div className="evaluation-case" key={testCase.id}><div><strong>{index + 1}. {testCase.title}</strong><p>输入：{testCase.input}</p><p>期望：{testCase.expected}</p>{testCase.requirement ? <small>判定要求：{testCase.requirement} · 权重 {testCase.weight}</small> : null}</div><button className="icon-button" aria-label="删除用例" onClick={() => void removeCase(testCase.id)}><Trash2 size={15} /></button></div>)}
        <details className="experiment-form"><summary>＋ 添加测试用例</summary><div className="form-grid"><label className="field"><span>用例名称</span><input value={caseDraft.title} onChange={(event) => setCaseDraft({ ...caseDraft, title: event.target.value })} /></label><label className="field"><span>权重</span><input type="number" min="0.1" step="0.1" value={caseDraft.weight} onChange={(event) => setCaseDraft({ ...caseDraft, weight: Number(event.target.value) || 1 })} /></label><label className="field span-2"><span>输入</span><textarea rows={3} value={caseDraft.input} onChange={(event) => setCaseDraft({ ...caseDraft, input: event.target.value })} /></label><label className="field span-2"><span>期望输出</span><textarea rows={3} value={caseDraft.expected} onChange={(event) => setCaseDraft({ ...caseDraft, expected: event.target.value })} /></label><label className="field span-2"><span>通过要求</span><input value={caseDraft.requirement} onChange={(event) => setCaseDraft({ ...caseDraft, requirement: event.target.value })} placeholder="优先写可直接判断的规则" /></label></div><button className="secondary-button" disabled={!caseDraft.title.trim() || !caseDraft.input.trim() || !caseDraft.expected.trim()} onClick={addCase}>加入测试集</button></details>
      </section>

      {selected.testCases.length ? <section className="evaluation-section"><div className="section-title compact"><div><p className="eyebrow">运行记录</p><h2>执行一次可比较评测</h2></div></div><details className="experiment-form"><summary>填写本次结果</summary><div className="form-grid"><label className="field"><span>运行名称</span><input value={runMeta.label} onChange={(event) => setRunMeta({ ...runMeta, label: event.target.value })} /></label><label className="field"><span>方法 / 工具</span><input value={runMeta.model} onChange={(event) => setRunMeta({ ...runMeta, model: event.target.value })} placeholder="人工流程、模板或软件都可以" /></label><label className="field span-2"><span>方案 / 流程版本</span><input value={runMeta.promptVersion} onChange={(event) => setRunMeta({ ...runMeta, promptVersion: event.target.value })} placeholder="例如 method-v2 / workflow-v1" /></label></div>{selected.testCases.map((testCase) => { const result = runResults[testCase.id] ?? { actual: '', score: 0, passed: false, notes: '' }; return <div className="run-case" key={testCase.id}><strong>{testCase.title}</strong><textarea rows={2} value={result.actual} onChange={(event) => setRunResults({ ...runResults, [testCase.id]: { ...result, actual: event.target.value } })} placeholder="实际输出或结果摘要" /><div><label className="field"><span>得分 0—100</span><input type="number" min="0" max="100" value={result.score} onChange={(event) => setRunResults({ ...runResults, [testCase.id]: { ...result, score: Number(event.target.value) } })} /></label><label className="check-field"><input type="checkbox" checked={result.passed} onChange={(event) => setRunResults({ ...runResults, [testCase.id]: { ...result, passed: event.target.checked } })} />满足通过要求</label></div><input value={result.notes} onChange={(event) => setRunResults({ ...runResults, [testCase.id]: { ...result, notes: event.target.value } })} placeholder="失败原因、异常或复核说明" /></div>; })}<label className="field"><span>本次总结</span><textarea rows={3} value={runMeta.summary} onChange={(event) => setRunMeta({ ...runMeta, summary: event.target.value })} /></label><button className="primary-button" onClick={recordRun}>保存本次评测</button></details>
        {selected.runs.map((run) => <div className="experiment-run" key={run.id}><div><strong>{run.label}</strong><span>{run.model || '未记录方法'} · {run.promptVersion || '未记录版本'}</span></div><div><b>{run.averageScore}</b><span>平均分</span></div><div><b>{run.passRate}%</b><span>通过率</span></div></div>)}
      </section> : null}

      <section className="decision-panel"><div><p className="eyebrow">Decision log</p><h2>实验决策：{decisionNames[selected.decision]}</h2></div><textarea rows={3} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="依据哪些结果决定继续、采用或停止？仍有哪些限制？" /><div className="inline-actions"><button className="secondary-button" onClick={() => saveDecision('iterate')}>继续迭代</button><button className="secondary-button" onClick={() => saveDecision('stop')}>停止</button><button className="primary-button" onClick={() => saveDecision('adopt')}>采用</button></div></section>
      <HistoryPanel database={database} entityType="scenario" entityId={selected.id} onRestore={(revisionId) => { mutate((current) => restoreEntityRevision(current, revisionId)); setSelectedId(null); setScenarioDraft(null); notify('已恢复所选实验版本'); }} />
      <footer className="modal-actions split"><button className="danger-text-button" onClick={() => void remove()}><Trash2 size={16} />移入回收站</button><div><button className="secondary-button" onClick={() => void exportEvaluation()}><Download size={16} />导出评测包</button>{selected.status === 'discovered' ? <button className="primary-button" onClick={() => updateStatus('validating')}><CheckCircle2 size={16} />开始验证</button> : null}{selected.status === 'validating' ? <button className="primary-button" onClick={() => updateStatus('prototype')}><Sparkles size={16} />进入试行</button> : null}<button className="secondary-button" onClick={() => updateStatus('archived')}>归档</button></div></footer>
    </div> : null}</Modal>
  </div>;
}

function Score({ label, value }: { label: string; value: number }) {
  return <div className="score-tile"><div className="score-ring" style={{ '--score': `${value * 3.6}deg` } as CSSProperties}><span>{value}</span></div><strong>{label}</strong></div>;
}
