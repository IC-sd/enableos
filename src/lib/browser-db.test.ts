import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { beforeAll, describe, expect, it } from 'vitest';

const memory = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, value); },
  removeItem: (key: string) => { memory.delete(key); },
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() { return memory.size; },
};

beforeAll(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: indexedDB, configurable: true });
  Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });
});

describe('normalized browser database', () => {
  it('persists entity tables and clears the recovery journal', async () => {
    const { loadDatabase, saveDatabase } = await import('./browser-db');
    const database = await loadDatabase();
    const task = { ...database.tasks[0], title: '增量持久化验证任务', updatedAt: new Date().toISOString() };
    await saveDatabase({ ...database, tasks: [task, ...database.tasks.slice(1)] });
    expect(localStorage.getItem('enableos-write-ahead')).toBeNull();

    const stored = await new Promise<{ title: string } | undefined>((resolve, reject) => {
      const request = indexedDB.open('enableos-workspace');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction('tasks', 'readonly');
        const get = transaction.objectStore('tasks').get(task.id);
        get.onerror = () => reject(get.error);
        get.onsuccess = () => resolve(get.result as { title: string } | undefined);
      };
    });
    expect(stored?.title).toBe('增量持久化验证任务');
  });

  it('upgrades legacy worklines without losing question and step alignment', async () => {
    const { normalizeDatabase } = await import('./browser-db');
    const normalized = normalizeDatabase({
      tasks: [{
        id: 'legacy-task', projectId: null, title: '旧任务', rawInput: '原话', summary: '', status: 'planned', priority: 'medium', source: '导入', dueDate: '',
        clarificationQuestions: ['问题一', '问题二'], clarificationAnswers: ['答案一'], steps: ['步骤一', '步骤二'], stepCompletion: [true], deliverables: [], createdAt: '', updatedAt: '', completedAt: '',
      } as never],
      knowledge: [{ id: 'legacy-evidence', projectId: null, title: '旧资料', type: 'document', category: '', content: '内容', summary: '', sourceName: '', tags: [], confidentiality: 'internal', createdAt: '', updatedAt: '' } as never],
      projects: [],
    });
    expect(normalized.tasks[0].clarificationAnswers).toEqual(['答案一', '']);
    expect(normalized.tasks[0].stepCompletion).toEqual([true, false]);
    expect(normalized.tasks[0].acceptanceCriteria).toEqual([]);
    expect(normalized.knowledge[0].taskId).toBeNull();
    expect(normalized.tasks[0].deletedAt).toBe('');
    expect(normalized.knowledge[0]).toMatchObject({ sourceFingerprint: '', sourceSize: 0, sourceModifiedAt: '', sourceMime: '', deletedAt: '' });
    expect(normalized.revisions).toEqual([]);
    expect(normalized.version).toBe(5);
  });
});
