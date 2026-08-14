import { describe, expect, it, vi } from 'vitest';
import { buildAuditExport, verifyAuditExport } from './audit';
import { createDemoDatabase } from './browser-db';

describe('audit export', () => {
  it('creates a verifiable chain and detects changed content', async () => {
    vi.setSystemTime(new Date('2026-08-09T00:00:00Z'));
    const database = createDemoDatabase();
    const first = JSON.parse(await buildAuditExport(database));
    expect(first.integrity.eventCount).toBe(database.activities.length);
    expect(first.events[0].previousHash).toBe('0'.repeat(64));
    database.activities[0].description += 'changed';
    const changed = JSON.parse(await buildAuditExport(database));
    expect(changed.integrity.headHash).not.toBe(first.integrity.headHash);
    expect((await verifyAuditExport(JSON.stringify(first))).valid).toBe(true);
    first.events[0].description = 'tampered';
    expect((await verifyAuditExport(JSON.stringify(first))).valid).toBe(false);
    vi.useRealTimers();
  });
});
