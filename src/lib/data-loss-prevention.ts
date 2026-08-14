export interface SensitiveFinding { type: string; label: string }

const detectors: Array<{ type: string; label: string; pattern: RegExp }> = [
  { type: 'private-key', label: '私钥', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
  { type: 'api-key', label: 'API 密钥', pattern: /\b(?:sk|rk|pk)-[a-z0-9_-]{16,}\b/i },
  { type: 'bearer-token', label: 'Bearer 令牌', pattern: /\bbearer\s+[a-z0-9._~+/-]{16,}/i },
  { type: 'password', label: '密码或口令', pattern: /(?:password|passwd|密码|口令)\s*[:=：]\s*[^\s,，;；]{4,}/i },
  { type: 'cn-id', label: '身份证号', pattern: /(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/ },
  { type: 'cn-phone', label: '手机号', pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/ },
];

export function scanSensitiveText(text: string): SensitiveFinding[] {
  return detectors.filter((detector) => detector.pattern.test(text)).map(({ type, label }) => ({ type, label }));
}

export function assertSafeForExternal(text: string): void {
  const findings = scanSensitiveText(text);
  if (findings.length) throw new Error(`检测到可能的${findings.map((finding) => finding.label).join('、')}，为避免误外发已停止请求；请脱敏后重试`);
}
