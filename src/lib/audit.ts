import type { Activity, AppDatabase } from '../../shared/models';

function canonicalActivity(activity: Activity): string {
  return JSON.stringify({
    id: activity.id, type: activity.type, entityId: activity.entityId, title: activity.title,
    description: activity.description, timestamp: activity.timestamp,
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildAuditExport(database: AppDatabase): Promise<string> {
  const events = [...database.activities].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
  let previousHash = '0'.repeat(64);
  const chained = [];
  for (const event of events) {
    const hash = await sha256(`${previousHash}\n${canonicalActivity(event)}`);
    chained.push({ ...event, previousHash, hash });
    previousHash = hash;
  }
  return JSON.stringify({
    format: 'enableos-audit-v1',
    generatedAt: new Date().toISOString(),
    integrity: { algorithm: 'SHA-256 hash chain', eventCount: chained.length, headHash: previousHash },
    workspace: {
      company: database.profile.company, role: database.profile.role, schemaVersion: database.version,
      workBoundary: {
        externalAiPolicy: database.settings.externalAiPolicy,
        externalEvidenceScope: database.settings.externalEvidenceScope,
        approvedTools: database.settings.approvedTools,
        dataHandlingNotes: database.settings.dataHandlingNotes,
        mentorExpectation: database.settings.mentorExpectation,
        reportCadence: database.settings.reportCadence,
        confirmedAt: database.settings.policyConfirmedAt,
      },
      counts: { projects: database.projects.filter((item) => !item.deletedAt).length, tasks: database.tasks.filter((item) => !item.deletedAt).length, knowledge: database.knowledge.filter((item) => !item.deletedAt).length, scenarios: database.scenarios.filter((item) => !item.deletedAt).length, reports: database.reports.filter((item) => !item.deletedAt).length, trash: [...database.projects, ...database.tasks, ...database.knowledge, ...database.scenarios, ...database.reports].filter((item) => item.deletedAt).length, revisions: database.revisions.length },
    },
    events: chained,
  }, null, 2);
}

export async function verifyAuditExport(content: string): Promise<{ valid: boolean; eventCount: number; headHash: string; message: string }> {
  let parsed: { format?: string; integrity?: { eventCount?: number; headHash?: string }; events?: Array<Activity & { previousHash?: string; hash?: string }> };
  try { parsed = JSON.parse(content); } catch { return { valid: false, eventCount: 0, headHash: '', message: '文件不是有效的 JSON 审计记录。' }; }
  if (parsed.format !== 'enableos-audit-v1' || !Array.isArray(parsed.events)) return { valid: false, eventCount: 0, headHash: '', message: '文件格式不是 EnableOS 审计记录。' };
  let previousHash = '0'.repeat(64);
  for (let index = 0; index < parsed.events.length; index += 1) {
    const event = parsed.events[index];
    if (event.previousHash !== previousHash) return { valid: false, eventCount: index, headHash: previousHash, message: `第 ${index + 1} 条记录的前序哈希不匹配。` };
    const expected = await sha256(`${previousHash}\n${canonicalActivity(event)}`);
    if (event.hash !== expected) return { valid: false, eventCount: index, headHash: previousHash, message: `第 ${index + 1} 条记录内容或哈希已被修改。` };
    previousHash = expected;
  }
  if (parsed.integrity?.eventCount !== parsed.events.length || parsed.integrity?.headHash !== previousHash) return { valid: false, eventCount: parsed.events.length, headHash: previousHash, message: '文件汇总信息与事件链不一致。' };
  return { valid: true, eventCount: parsed.events.length, headHash: previousHash, message: `校验通过：${parsed.events.length} 条记录，哈希链完整。` };
}
