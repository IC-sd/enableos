import { describe, expect, it } from 'vitest';
import { assertSafeForExternal, scanSensitiveText } from './data-loss-prevention';

describe('external data-loss prevention', () => {
  it('blocks common pasted secrets and personal identifiers', () => {
    expect(scanSensitiveText('password: correct-horse; 手机 13812345678').map((item) => item.type)).toEqual(expect.arrayContaining(['password', 'cn-phone']));
    expect(() => assertSafeForExternal('Authorization: Bearer abcdefghijklmnopqrstuvwxyz')).toThrow('停止请求');
    expect(() => assertSafeForExternal('普通设备故障记录，不包含个人信息')).not.toThrow();
  });
});
