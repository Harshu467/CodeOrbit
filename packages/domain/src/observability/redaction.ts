const SECRET_PATTERNS: readonly RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /(installation[_-]?token|access[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*["']?[^,\s"']+/gi,
];

export function redactSensitiveText(value: string): string {
  return SECRET_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, '[REDACTED]'), value);
}

export function redactLogFields(
  fields: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const sensitive = /authorization|token|secret|private.?key|excerpt|source.?content/i;
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      sensitive.test(key) ? '[REDACTED]' : typeof value === 'string' ? redactSensitiveText(value) : value,
    ]),
  );
}
