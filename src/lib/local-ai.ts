import type { AppDatabase, ScenarioAnalysis, TaskAnalysis } from '../../shared/models';

function todayPlus(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dueDateFromText(text: string, urgent: boolean): string {
  const iso = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const chinese = text.match(/(?:截止|到|在)?\s*(\d{1,2})月(\d{1,2})日/);
  if (chinese) {
    const now = new Date();
    let year = now.getFullYear();
    const candidate = new Date(year, Number(chinese[1]) - 1, Number(chinese[2]));
    if (candidate.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - 86_400_000) year += 1;
    return `${year}-${chinese[1].padStart(2, '0')}-${chinese[2].padStart(2, '0')}`;
  }
  if (/今天|今日/.test(text)) return todayPlus(0);
  if (/后天/.test(text)) return todayPlus(2);
  if (/明天|明日/.test(text)) return todayPlus(1);
  if (/下周/.test(text)) return todayPlus(7);
  return todayPlus(urgent ? 3 : 7);
}

function compact(text: string, maximum = 120): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maximum ? `${normalized.slice(0, maximum)}…` : normalized;
}

export function localTaskAnalysis(rawInput: string): TaskAnalysis {
  const text = rawInput.trim();
  const isResearch = /调研|研究|对比|了解|看看|梳理/.test(text);
  const isPrototype = /demo|原型|搭建|agent|智能体|知识库|自动化/i.test(text);
  const isUrgent = /尽快|今天|明天|马上|紧急|下周/.test(text);
  const title = compact(text.replace(/[，。；：]/g, ' '), 28) || '待梳理的新任务';
  const questions = [
    '这项工作的最终使用者和验收人分别是谁？',
    '希望看到结论、可运行原型，还是可正式使用的版本？',
    '截止时间、可使用资料和保密边界是什么？',
  ];
  if (isPrototype) questions.push('成功如何判断，准备使用哪些真实样例测试？');
  const steps = isResearch
    ? ['确认目标和比较维度', '收集一手资料与实际约束', '用同一组任务验证', '记录结果与失败案例', '形成结论和下一步建议']
    : ['确认目标与交付形式', '整理输入资料和限制条件', '完成最小可验证结果', '用代表性案例测试', '整理证据并提交验收'];
  if (isPrototype) steps.splice(3, 0, '设计输入、知识来源、人工兜底与工作流');
  return {
    title,
    objective: `把“${compact(text, 72)}”转换为有明确边界、验证方式和交付物的工作任务。`,
    summary: '当前要求仍需要确认使用者、截止时间和验收标准。先完成最小验证，再决定是否扩大范围。',
    priority: isUrgent ? 'high' : 'medium',
    clarificationQuestions: questions,
    steps,
    deliverables: isPrototype ? ['场景说明', '可运行原型', '测试问题与结果', '演示说明和下一步建议'] : ['任务结论', '过程证据', '可提交成果'],
    risks: ['目标未确认就直接实现', '使用未经授权的内部资料', '只展示成功结果而未记录失败案例'],
    suggestedDueDate: dueDateFromText(text, isUrgent),
  };
}

export function localScenarioAnalysis(rawInput: string): ScenarioAnalysis {
  const text = rawInput.trim();
  return {
    title: compact(text.replace(/[，。；：]/g, ' '), 26) || '待验证的AI机会',
    pain: `业务描述可能包含重复处理、信息分散或依赖个人经验的问题：${compact(text, 100)}`,
    currentProcess: '待补充：谁在什么情况下开始、依次使用哪些资料或系统、哪里耗时或容易出错。',
    aiOpportunity: '优先验证信息提取、检索、分类、摘要或草稿生成；最终判断与高风险操作保留人工确认。',
    inputs: '历史样例、现行流程、标准文档、用户提问或业务记录。',
    outputs: '带来源的建议、结构化结果、待人工确认项和可追踪记录。',
    prototypePlan: ['访谈真实使用者', '收集脱敏样例', '定义基线与失败标准', '完成单一闭环原型', '盲测并记录错误类型'],
    successMetrics: ['单次处理时间变化', '结果完整率与来源正确率', '人工修改比例', '真实用户继续使用意愿'],
    risk: 'medium',
    valueScore: 65,
    feasibilityScore: 62,
    dataReadiness: 45,
  };
}

export interface ReportEvidencePacket {
  rangeStart: string;
  rangeEnd: string;
  completed: Array<{ ref: string; id: string; title: string; summary: string; completedAt: string }>;
  active: Array<{ ref: string; id: string; title: string; status: string; updatedAt: string }>;
  activities: Array<{ ref: string; id: string; title: string; description: string; timestamp: string }>;
  projects: Array<{ ref: string; id: string; title: string; nextAction: string; risks: string[]; updatedAt: string }>;
  scenarios: Array<{ ref: string; id: string; title: string; decision: string; decisionReason: string; updatedAt: string }>;
  evidence: Array<{ ref: string; id: string; title: string; summary: string; role: string; verified: boolean; updatedAt: string }>;
}

export function buildReportEvidencePacket(database: AppDatabase, rangeStart: string, rangeEnd: string): ReportEvidencePacket {
  const start = new Date(`${rangeStart}T00:00:00`).getTime();
  const end = new Date(`${rangeEnd}T23:59:59`).getTime();
  const within = (value: string) => {
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time >= start && time <= end;
  };
  const completedTasks = (database.tasks || []).filter((task) => !task.deletedAt && task.status === 'done' && within(task.completedAt || task.updatedAt));
  const activeTasks = (database.tasks || []).filter((task) => !task.deletedAt && ['planned', 'doing'].includes(task.status) && within(task.updatedAt));
  const taskRefs = new Map([...completedTasks, ...activeTasks].map((task, index) => [task.id, `T${index + 1}`]));
  const relatedProjects = new Set([...completedTasks, ...activeTasks].map((task) => task.projectId).filter(Boolean));
  return {
    rangeStart, rangeEnd,
    completed: completedTasks.map((task) => ({ ref: taskRefs.get(task.id)!, id: task.id, title: task.title, summary: task.summary, completedAt: task.completedAt || task.updatedAt })),
    active: activeTasks.map((task) => ({ ref: taskRefs.get(task.id)!, id: task.id, title: task.title, status: task.status, updatedAt: task.updatedAt })),
    activities: (database.activities || []).filter((item) => within(item.timestamp)).slice(0, 80).map((item, index) => ({ ref: `A${index + 1}`, id: item.id, title: item.title, description: item.description, timestamp: item.timestamp })),
    projects: (database.projects || []).filter((project) => !project.deletedAt && (within(project.updatedAt) || relatedProjects.has(project.id))).map((project, index) => ({ ref: `P${index + 1}`, id: project.id, title: project.title, nextAction: project.nextAction, risks: project.risks, updatedAt: project.updatedAt })),
    scenarios: (database.scenarios || []).filter((scenario) => !scenario.deletedAt && within(scenario.updatedAt)).map((scenario, index) => ({ ref: `S${index + 1}`, id: scenario.id, title: scenario.title, decision: scenario.decision, decisionReason: scenario.decisionReason, updatedAt: scenario.updatedAt })),
    evidence: (database.knowledge || []).filter((item) => !item.deletedAt && within(item.updatedAt)).map((item, index) => ({ ref: `K${index + 1}`, id: item.id, title: item.title, summary: item.summary || item.content.slice(0, 180), role: item.evidenceKind, verified: item.verificationStatus === 'confirmed', updatedAt: item.updatedAt })),
  };
}

export function validateReportEvidence(content: string, packet: ReportEvidencePacket): { valid: boolean; message: string } {
  const available = new Set([...packet.completed, ...packet.active, ...packet.activities, ...packet.projects, ...packet.scenarios, ...packet.evidence].map((item) => item.ref));
  const cited = [...new Set([...content.matchAll(/\[([TAPSK]\d+)\]/g)].map((match) => match[1]))];
  const invalid = cited.filter((ref) => !available.has(ref));
  if (invalid.length) return { valid: false, message: `汇报包含无效来源：${invalid.map((ref) => `[${ref}]`).join('、')}。` };
  if (available.size && !cited.length) return { valid: false, message: '汇报未引用本期任务、活动、项目、实验或证据资料，暂不可追溯。' };
  return { valid: true, message: available.size ? `已校验 ${cited.length} 个工作记录引用。` : '本期没有可引用记录，汇报已明确保持为空。' };
}

export function localReport(database: AppDatabase, rangeStart: string, rangeEnd: string): string {
  const packet = buildReportEvidencePacket(database, rangeStart, rangeEnd);
  const sources = [...packet.completed, ...packet.active, ...packet.activities, ...packet.projects, ...packet.scenarios, ...packet.evidence];
  return [
    `# 工作汇报｜${rangeStart} 至 ${rangeEnd}`,
    '', '## 已交付',
    ...(packet.completed.length ? packet.completed.map((task, index) => `${index + 1}. ${task.title}${task.summary ? `：${task.summary}` : ''} [${task.ref}]`) : ['- 本期尚未标记已完成任务。']),
    '', '## 可核验进展',
    ...(packet.activities.length ? packet.activities.slice(0, 12).map((item) => `- ${item.title}：${item.description} [${item.ref}]`) : ['- 暂无已记录的关键活动。']),
    '', '## 关键依据',
    ...(packet.evidence.length ? packet.evidence.slice(0, 10).map((item) => `- ${item.title}：${item.summary}${item.verified ? '' : '（待核实）'} [${item.ref}]`) : ['- 本期暂无更新过的证据资料。']),
    '', '## 正在推进',
    ...(packet.active.length ? packet.active.slice(0, 8).map((task) => `- ${task.title}（${task.status === 'doing' ? '进行中' : '已计划'}）[${task.ref}]`) : ['- 本期暂无更新过的进行中任务。']),
    '', '## 下一步',
    ...(packet.projects.length ? packet.projects.map((project) => `- ${project.title}：${project.nextAction || '确认下一步行动'} [${project.ref}]`) : ['- 确认下一阶段优先事项。']),
    '', '## 风险与需要协助',
    ...(packet.projects.flatMap((project) => project.risks.map((risk) => ({ risk, ref: project.ref }))).length ? packet.projects.flatMap((project) => project.risks.map((risk) => ({ risk, ref: project.ref }))).slice(0, 6).map(({ risk, ref }) => `- ${risk} [${ref}]`) : ['- 暂无已记录风险。']),
    '', '## 记录索引',
    ...(sources.length ? sources.map((item) => `- [${item.ref}] ${item.title}`) : ['- 本期没有可引用记录。']),
  ].join('\n');
}
