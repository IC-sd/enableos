import { describe, expect, it } from 'vitest';
import type { KnowledgeItem } from '../../shared/models';
import { buildEvidencePassages, evidenceContext, localEvidenceAnswer, rankEvidencePassages, retrieveEvidence, validateEvidenceAnswer } from './retrieval';

const base: Omit<KnowledgeItem, 'id' | 'title' | 'summary' | 'content'> = { projectId: null, taskId: null, type: 'document', evidenceKind: 'reference', verificationStatus: 'confirmed', category: '', sourceName: 'test.pdf', sourcePath: '', tags: [], confidentiality: 'internal', version: '', createdAt: '2026-01-01', updatedAt: '2026-01-01', sourceFingerprint: '', sourceSize: 0, sourceModifiedAt: '', sourceMime: '', deletedAt: '' };
const items: KnowledgeItem[] = [
  { ...base, id: '1', title: '设备故障处理流程', summary: '分级处理报警', content: '设备报警后先确认错误码，再查询维护手册并联系设备工程师。' },
  { ...base, id: '2', title: '食堂须知', summary: '午餐时间', content: '食堂十一点半开放。' },
];

describe('evidence retrieval', () => {
  it('ranks Chinese title and content matches above unrelated evidence', () => {
    const matches = retrieveEvidence('设备报警错误码怎么处理', items);
    expect(matches[0].item.id).toBe('1');
    expect(matches.some((match) => match.item.id === '2')).toBe(false);
  });

  it('builds explicit source labels for model context', () => {
    const context = evidenceContext(retrieveEvidence('错误码', items));
    expect(context).toContain('[E1] 设备故障处理流程');
    expect(context).toContain('来源：test.pdf');
    expect(context).toContain('核实：已确认');
    expect(context).toMatch(/位置：原文第 \d+–\d+ 字/);
  });

  it('states evidence insufficiency instead of inventing an answer', () => {
    expect(localEvidenceAnswer('年终奖是多少', [])).toContain('证据不足');
  });

  it('rejects missing and out-of-range model citations', () => {
    const matches = retrieveEvidence('错误码', items);
    expect(validateEvidenceAnswer('先查看错误码。', matches).valid).toBe(false);
    expect(validateEvidenceAnswer('结论来自[E9]。', matches).invalid).toEqual([9]);
    expect(validateEvidenceAnswer('先记录错误码[E1]。', matches).valid).toBe(true);
  });

  it('chunks long evidence and retrieves a hit near the end with a precise location', () => {
    const long = { ...base, id: '3', title: '维护记录', summary: '', content: `${'常规巡检内容。'.repeat(130)}\n\n特殊处置：发现真空泵温度异常时立即停机并复核冷却水。` };
    expect(buildEvidencePassages([long]).length).toBeGreaterThan(1);
    const match = retrieveEvidence('真空泵温度异常如何处理', [long])[0];
    expect(match.excerpt).toContain('立即停机');
    expect(match.location).toMatch(/原文第/);
  });

  it('keeps multiple passages for reranking but returns one best citation per source', () => {
    const repeated = { ...base, id: '4', title: '报警手册', summary: '', content: `${'报警后检查电源。'.repeat(100)}\n\n错误码 E42 需要检查通信线。` };
    expect(rankEvidencePassages('报警错误码', [repeated]).length).toBeGreaterThan(1);
    expect(retrieveEvidence('报警错误码', [repeated])).toHaveLength(1);
  });
});
