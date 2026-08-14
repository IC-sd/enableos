import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { beforeAll, describe, expect, it } from 'vitest';
import type { KnowledgeItem } from '../../shared/models';

beforeAll(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: indexedDB, configurable: true });
  Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true });
});

const base: Omit<KnowledgeItem, 'id' | 'title' | 'summary' | 'content'> = { projectId: null, taskId: null, type: 'document', evidenceKind: 'reference', verificationStatus: 'confirmed', category: '', sourceName: 'test', sourcePath: '', tags: [], confidentiality: 'internal', version: '', createdAt: '2026-01-01', updatedAt: '2026-01-01', sourceFingerprint: '', sourceSize: 0, sourceModifiedAt: '', sourceMime: '', deletedAt: '' };

describe('hybrid semantic retrieval', () => {
  it('finds a semantic-only match and reuses cached passage vectors', async () => {
    const { clearSemanticIndex, hybridRetrieveEvidence } = await import('./semantic-retrieval');
    await clearSemanticIndex();
    const items: KnowledgeItem[] = [
      { ...base, id: 'machine', title: '设备故障手册', summary: '', content: '报警后记录错误码并联系设备工程师。' },
      { ...base, id: 'meal', title: '食堂开放时间', summary: '', content: '午餐十一点半开放。' },
    ];
    let calls = 0;
    const embed = async (inputs: string[]) => {
      calls += 1;
      return { model: 'test-embed', vectors: inputs.map((text) => /机器停了|设备|报警|错误码/.test(text) ? [1, 0] : [0, 1]) };
    };
    const first = await hybridRetrieveEvidence('机器停了怎么办', items, embed, 'test-embed');
    expect(first[0].item.id).toBe('machine');
    expect(first[0].semanticScore).toBe(1);
    const afterFirst = calls;
    await hybridRetrieveEvidence('机器停了怎么办', items, embed, 'test-embed');
    expect(calls - afterFirst).toBe(1);
  });
});
