import type { DesktopBridge } from '../../shared/bridge';
import type { AppDatabase, ScenarioAnalysis, TaskAnalysis } from '../../shared/models';
import { createDemoDatabase, loadDatabase, normalizeDatabase, saveDatabase } from './browser-db';
import { chooseAuditFile, chooseBackup, downloadText, importDocuments, verifySourceFile } from './document-import';
import { buildReportEvidencePacket, localReport, localScenarioAnalysis, localTaskAnalysis } from './local-ai';
import { decryptBackup, encryptBackup, isEncryptedBackup } from './backup-crypto';
import { verifyAuditExport } from './audit';
import { today } from './utils';
import { assertSafeForExternal } from './data-loss-prevention';

interface GatewayResponse {
  ok?: boolean; content?: string; error?: string; message?: string;
  vectors?: number[][]; model?: string; latencyMs?: number; protocol?: string; dimensions?: number;
}

async function gateway(path: string, init?: RequestInit): Promise<GatewayResponse> {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({})) as GatewayResponse;
  if (!response.ok) throw new Error(body.error || `网关返回 ${response.status}`);
  return body;
}

async function callModel(database: AppDatabase, system: string, user: string): Promise<string> {
  if (database.settings.externalAiPolicy !== 'approved-with-rules') throw new Error('公司外部 AI 使用边界尚未确认；资料未发送');
  assertSafeForExternal(`${system}\n${user}`);
  const body = await gateway('/api/ai', {
    method: 'POST',
    body: JSON.stringify({ endpoint: database.settings.apiEndpoint, model: database.settings.apiModel, protocol: database.settings.apiProtocol, system, user }),
  });
  if (!body.content) throw new Error('模型没有返回内容');
  return body.content;
}

function parseJson<T>(content: string): T {
  return JSON.parse(content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()) as T;
}

async function withModel<T>(fallback: T, system: string, user: string): Promise<{ data: T; mode: 'local' | 'api'; notice: string }> {
  const database = await loadDatabase();
  if (database.settings.aiMode !== 'api' || !database.settings.apiModel.trim()) {
    return { data: fallback, mode: 'local', notice: '使用内置方法完成；资料未发送到外部模型。' };
  }
  try {
    const result = parseJson<T>(await callModel(database, system, user));
    return { data: result, mode: 'api', notice: '已通过本机安全网关调用模型。' };
  } catch (error) {
    return { data: fallback, mode: 'local', notice: `模型不可用，已回退本地方法：${error instanceof Error ? error.message : '未知错误'}` };
  }
}

export const desktop: DesktopBridge = {
  data: {
    load: loadDatabase,
    save: async (database) => { await saveDatabase(database); return { ok: true }; },
    resetDemo: async () => { const database = createDemoDatabase(); await saveDatabase(database); return database; },
  },
  ai: {
    analyzeTask: async (rawInput, context) => withModel<TaskAnalysis>(
      localTaskAnalysis(rawInput),
      '你是企业AI赋能工作的高级项目教练。把模糊要求整理为可执行任务。严格返回有效JSON，不使用Markdown。',
      `公司上下文：${context}\n原始要求：${rawInput}\nJSON结构：{"title":"","objective":"","summary":"","priority":"low|medium|high","clarificationQuestions":[],"steps":[],"deliverables":[],"risks":[],"suggestedDueDate":"YYYY-MM-DD"}`,
    ),
    analyzeScenario: async (rawInput, context) => withModel<ScenarioAnalysis>(
      localScenarioAnalysis(rawInput),
      '你是企业AI机会验证负责人。判断真实痛点、基线、AI边界、最小实验和成功指标。避免为了使用AI而使用AI。严格返回有效JSON。',
      `公司上下文：${context}\n业务描述：${rawInput}\nJSON结构：{"title":"","pain":"","currentProcess":"","aiOpportunity":"","inputs":"","outputs":"","prototypePlan":[],"successMetrics":[],"risk":"low|medium|high","valueScore":0,"feasibilityScore":0,"dataReadiness":0}`,
    ),
    generateReport: async (database, rangeStart, rangeEnd) => {
      const fallback = localReport(database, rangeStart, rangeEnd);
      if (database.settings.aiMode !== 'api' || !database.settings.apiModel.trim()) return { data: fallback, mode: 'local', notice: '根据真实记录在本地生成。' };
      try {
        const content = await callModel(database, '你是严谨的工作汇报助手。只能依据输入记录总结，不得编造成果或数据。输出清晰中文Markdown，区分已完成、在做、关键依据、风险和待确认。每个成果、进展、数字、依据、风险和下一步都必须引用输入中的记录编号，例如[T1]、[A2]或[K1]；不要引用不存在的编号。', JSON.stringify(buildReportEvidencePacket(database, rangeStart, rangeEnd)));
        return { data: content, mode: 'api', notice: '已通过本机安全网关生成。' };
      } catch (error) {
        return { data: fallback, mode: 'local', notice: `模型不可用，已回退本地生成：${error instanceof Error ? error.message : '未知错误'}` };
      }
    },
    ask: async ({ instruction, context }) => {
      const database = await loadDatabase();
      const fallback = `当前资料不足以直接下结论。建议先明确“${instruction.slice(0, 100)}”涉及的事实来源、适用范围和待确认项，再形成可验证答案。`;
      if (database.settings.aiMode !== 'api' || !database.settings.apiModel.trim()) return { data: fallback, mode: 'local', notice: '当前为本地模式。' };
      try {
        const content = await callModel(database, '你是企业工作资料助手。只能依据给定上下文回答；区分事实、推断和建议；每个事实结论必须引用对应证据编号，例如[E1]；不得编造不存在的来源；缺少信息时明确说明。', `上下文：\n${context}\n\n问题：${instruction}`);
        return { data: content, mode: 'api', notice: '已通过本机安全网关调用模型。' };
      } catch (error) {
        return { data: fallback, mode: 'local', notice: `模型不可用，已回退本地建议：${error instanceof Error ? error.message : '未知错误'}` };
      }
    },
    embed: async (inputs) => {
      const database = await loadDatabase();
      if (database.settings.aiMode !== 'api' || !database.settings.embeddingModel.trim()) throw new Error('请先开启模型增强并填写向量模型');
      if (database.settings.externalAiPolicy !== 'approved-with-rules') throw new Error('公司外部 AI 使用边界尚未确认');
      assertSafeForExternal(inputs.join('\n'));
      const body = await gateway('/api/embeddings', {
        method: 'POST',
        body: JSON.stringify({ endpoint: database.settings.apiEndpoint, embeddingModel: database.settings.embeddingModel, input: inputs }),
      });
      if (!body.vectors || !body.model) throw new Error('向量服务没有返回有效结果');
      return { vectors: body.vectors, model: body.model };
    },
    testConnection: async () => {
      const database = await loadDatabase();
      try {
        const result = await gateway('/api/test', { method: 'POST', body: JSON.stringify({ endpoint: database.settings.apiEndpoint, model: database.settings.apiModel, protocol: database.settings.apiProtocol }) });
        let message = `生成模型成功 · ${result.protocol || database.settings.apiProtocol} · ${result.latencyMs ?? 0}ms`;
        let latencyMs = result.latencyMs ?? 0;
        if (database.settings.retrievalMode === 'hybrid' && database.settings.embeddingModel.trim()) {
          const embedding = await gateway('/api/embeddings', { method: 'POST', body: JSON.stringify({ endpoint: database.settings.apiEndpoint, embeddingModel: database.settings.embeddingModel, input: ['EnableOS 连接诊断'] }) });
          latencyMs += embedding.latencyMs ?? 0;
          message += `；向量模型成功 · ${embedding.dimensions ?? 0}维 · ${embedding.latencyMs ?? 0}ms`;
        }
        return { ok: true, message, latencyMs, protocol: result.protocol };
      } catch (error) { return { ok: false, message: error instanceof Error ? error.message : '连接失败' }; }
    },
  },
  files: {
    importDocuments,
    exportBackup: async (database, passphrase) => {
      if (passphrase.length < 8) throw new Error('备份密码至少需要8个字符');
      const name = `enableos-backup-${today()}.enableos`;
      const encrypted = await encryptBackup({ format: 'enableos-backup', exportedAt: new Date().toISOString(), database }, passphrase);
      downloadText(name, JSON.stringify(encrypted), 'application/octet-stream');
      return { canceled: false, path: `浏览器下载/${name}` };
    },
    selectBackup: async () => {
      const file = await chooseBackup();
      if (!file) return { canceled: true, encrypted: false, payload: null };
      const parsed = JSON.parse(await file.text()) as AppDatabase | { database?: AppDatabase } | unknown;
      return { canceled: false, encrypted: isEncryptedBackup(parsed), payload: parsed };
    },
    decodeBackup: async (payload, passphrase = '') => {
      const decoded = isEncryptedBackup(payload)
        ? await decryptBackup<AppDatabase | { database?: AppDatabase }>(payload, passphrase)
        : payload;
      const container = decoded as AppDatabase | { database?: AppDatabase };
      const database = 'database' in container && container.database ? container.database : container as AppDatabase;
      if (!Array.isArray(database.projects) || !Array.isArray(database.tasks)) throw new Error('不是有效的 EnableOS 备份');
      return normalizeDatabase(database);
    },
    verifySourceFile,
    exportMarkdown: async (suggestedName, content) => { downloadText(suggestedName, content, 'text/markdown;charset=utf-8'); return { canceled: false, path: `浏览器下载/${suggestedName}` }; },
    verifyAuditFile: async () => {
      const file = await chooseAuditFile();
      if (!file) return { canceled: true, valid: false, message: '' };
      const result = await verifyAuditExport(await file.text());
      return { canceled: false, valid: result.valid, message: result.message };
    },
  },
  credentials: {
    setApiKey: async (apiKey) => {
      try {
        const database = await loadDatabase();
        const result = await gateway('/api/session-key', { method: 'POST', body: JSON.stringify({ apiKey, endpoint: database.settings.apiEndpoint }) });
        return { ok: true, message: result.message || '密钥已送入本机网关。' };
      } catch (error) { return { ok: false, message: error instanceof Error ? error.message : '保存失败' }; }
    },
    clearApiKey: async () => { await gateway('/api/session-key', { method: 'DELETE' }); return { ok: true }; },
  },
  window: {
    minimize: async () => undefined, toggleMaximize: async () => false, close: async () => undefined,
    isMaximized: async () => false, onQuickCapture: () => () => undefined,
  },
  app: { getInfo: async () => ({ version: '3.2.0', platform: 'Web · PWA', dataPath: '当前浏览器的 IndexedDB（enableos-workspace）' }) },
};
