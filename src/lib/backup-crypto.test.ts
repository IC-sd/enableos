import { describe, expect, it } from 'vitest';
import { decryptBackup, encryptBackup, isEncryptedBackup } from './backup-crypto';

describe('encrypted backup', () => {
  it('round-trips structured data without exposing plaintext', async () => {
    const original = { privateNote: '内部设备故障记录', count: 3 };
    const encrypted = await encryptBackup(original, 'correct horse battery staple');
    expect(isEncryptedBackup(encrypted)).toBe(true);
    expect(JSON.stringify(encrypted)).not.toContain(original.privateNote);
    await expect(decryptBackup(encrypted, 'correct horse battery staple')).resolves.toEqual(original);
  });

  it('rejects a wrong password', async () => {
    const encrypted = await encryptBackup({ ok: true }, 'long-enough-password');
    await expect(decryptBackup(encrypted, 'wrong-password')).rejects.toThrow('无法解密');
  });

  it('rejects unsafe KDF parameters before deriving a key', async () => {
    const encrypted = await encryptBackup({ ok: true }, 'long-enough-password');
    encrypted.kdf.iterations = 2_000_000_000;
    expect(isEncryptedBackup(encrypted)).toBe(false);
    await expect(decryptBackup(encrypted, 'long-enough-password')).rejects.toThrow('无法解密');
  });
});
