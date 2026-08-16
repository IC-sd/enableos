import { describe, expect, it } from 'vitest';
import type { AppDatabase } from '../../shared/models';
import { buildReportEvidencePacket, localReport, localScenarioAnalysis, localTaskAnalysis, validateReportEvidence } from './local-ai';

describe('local AI fallbacks', () => {
  it('turns an urgent prototype request into an executable task', () => {
    const result = localTaskAnalysis('明天尽快搭建一个知识库 Agent 原型');
    expect(result.priority).toBe('high');
    expect(result.steps).toContain('设计输入、知识来源、人工兜底与工作流');
    expect(result.deliverables).toContain('测试用例与结果');
    expect(result.clarificationQuestions.length).toBeGreaterThan(3);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const expected = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    expect(result.suggestedDueDate).toBe(expected);
  });

  it('keeps scenario analysis focused on validation and human review', () => {
    const result = localScenarioAnalysis('售后每天重复整理故障描述');
    expect(result.prototypePlan.join('')).toContain('基线');
    expect(result.aiOpportunity).toContain('人工确认');
    expect(result.successMetrics.length).toBeGreaterThanOrEqual(4);
  });

  it('does not force an AI solution onto an ordinary personal problem', () => {
    const result = localScenarioAnalysis('每周整理阅读笔记总要重复分类');
    expect(result.aiOpportunity).toContain('流程调整、模板、工具、自动化或 AI');
    expect(result.prototypePlan).toContain('记录当前基线');
    expect(result.outputs).toContain('下一步决策');
  });

  it('only reports recorded work', () => {
    const database = {
      tasks: [{ title: '已完成验证', summary: '记录了三类失败', status: 'done', completedAt: '2026-08-08T10:00:00.000Z', updatedAt: '2026-08-08T10:00:00.000Z' }],
      knowledge: [{ id: 'k1', title: '复核规则', summary: '结果需要人工抽样复核', content: '', evidenceKind: 'reference', verificationStatus: 'confirmed', updatedAt: '2026-08-08T11:00:00.000Z' }],
      activities: [], projects: [],
    } as unknown as AppDatabase;
    const report = localReport(database, '2026-08-04', '2026-08-10');
    expect(report).toContain('已完成验证');
    expect(report).toContain('记录了三类失败');
    expect(report).not.toContain('显著提升');
    expect(report).toContain('[T1]');
    expect(report).toContain('[K1]');
    expect(validateReportEvidence(report, buildReportEvidencePacket(database, '2026-08-04', '2026-08-10')).valid).toBe(true);
  });
});
