const SECRET_PATTERNS = [
  /mge_sk_[A-Za-z0-9_-]+/g,
  /(Authorization\s*:\s*Bearer\s+)[^\s,}]+/gi,
  /("Authorization"\s*:\s*"Bearer\s+)[^"]+(")/gi,
]

export function redactMgeSecrets(input: unknown): string {
  let text = typeof input === 'string' ? input : safeStringify(input)

  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (_match, prefix = '', suffix = '') => `${prefix}[REDACTED]${suffix}`)
  }

  return text
}

function safeStringify(input: unknown) {
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}
