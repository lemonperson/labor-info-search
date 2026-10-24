/** Produce display text, never an HTML fragment. Consumers must use text nodes
 * (React string children/textContent), never innerHTML or executable contexts.
 * maxLength counts UTF-16 code units, matching string.length and shared schemas.
 */
export function toSafeDisplayText(input: string, maxLength: number): string {
  if (!Number.isSafeInteger(maxLength) || maxLength < 0) throw new RangeError('Invalid display text bound')
  if (maxLength === 0) return ''
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  const decoded = input.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, key: string) => {
    if (!key.startsWith('#')) return entities[key.toLowerCase()] ?? entity
    const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1))
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ''
  })
  const stripped = decoded
    .replace(/<!--[^]*?(?:-->|$)/g, ' ')
    .replace(/<(script|style)\b[^<>]*>[^]*?(?:<\/\1\s*>|$)/gi, ' ')
    .replace(/<[^<>]*>/g, ' ')
    .replace(/[<>]/g, '')
  const clean = Array.from(stripped).filter((character) => {
    const code = character.codePointAt(0)!
    return !((code < 32 && !/\s/u.test(character)) || (code >= 127 && code <= 159) ||
      code === 0x061c || code === 0x200e || code === 0x200f ||
      (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069))
  }).join('').replace(/\s+/gu, ' ').trim()
  let end = Math.min(maxLength, clean.length)
  // Do not leave the high half of an astral character at the truncation edge.
  if (end < clean.length && /[\uD800-\uDBFF]/u.test(clean[end - 1] ?? '')) end--
  return clean.slice(0, end).trimEnd()
}
