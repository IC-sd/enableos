const encoder = new TextEncoder();
const decoder = new TextDecoder();
const iterations = 210_000;
const additionalData = encoder.encode('EnableOS encrypted backup v1');

export interface EncryptedBackup {
  format: 'enableos-encrypted-backup';
  version: 1;
  exportedAt: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

async function deriveKey(passphrase: string, salt: Uint8Array, rounds: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: ownedBuffer(salt), iterations: rounds, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function isEncryptedBackup(value: unknown): value is EncryptedBackup {
  if (!value || typeof value !== 'object') return false;
  const backup = value as Partial<EncryptedBackup>;
  return backup.format === 'enableos-encrypted-backup' && backup.version === 1
    && backup.kdf?.name === 'PBKDF2' && backup.kdf.hash === 'SHA-256'
    && Number.isInteger(backup.kdf.iterations) && backup.kdf.iterations >= 100_000 && backup.kdf.iterations <= 1_000_000
    && typeof backup.kdf.salt === 'string' && backup.kdf.salt.length >= 16 && backup.kdf.salt.length <= 128
    && backup.cipher?.name === 'AES-GCM' && typeof backup.cipher.iv === 'string' && backup.cipher.iv.length >= 12 && backup.cipher.iv.length <= 64
    && typeof backup.ciphertext === 'string' && backup.ciphertext.length > 0 && backup.ciphertext.length <= 140_000_000;
}

export async function encryptBackup(value: unknown, passphrase: string): Promise<EncryptedBackup> {
  if (passphrase.length < 8) throw new Error('备份密码至少需要8个字符');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ownedBuffer(iv), additionalData }, key, encoder.encode(JSON.stringify(value)));
  return {
    format: 'enableos-encrypted-backup', version: 1, exportedAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) }, ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptBackup<T>(backup: EncryptedBackup, passphrase: string): Promise<T> {
  try {
    if (!isEncryptedBackup(backup)) throw new Error('invalid backup envelope');
    const salt = base64ToBytes(backup.kdf.salt);
    const iv = base64ToBytes(backup.cipher.iv);
    const key = await deriveKey(passphrase, salt, backup.kdf.iterations);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ownedBuffer(iv), additionalData }, key, ownedBuffer(base64ToBytes(backup.ciphertext)));
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    throw new Error('无法解密备份：密码不正确或文件已损坏');
  }
}
