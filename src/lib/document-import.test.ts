import { describe, expect, it } from 'vitest';
import { contentFingerprint } from './document-import';

describe('document import identity', () => {
  it('normalizes line endings and Unicode before fingerprinting content', async () => {
    const left = await contentFingerprint('ＡI 赋能  \r\n第二行');
    const right = await contentFingerprint('AI 赋能\n第二行');
    expect(left).toBe(right);
    expect(await contentFingerprint('不同内容')).not.toBe(left);
  });
});
