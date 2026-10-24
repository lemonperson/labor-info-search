import { describe, expect, it } from 'vitest'
import { toSafeDisplayText } from '../../../src/main/security/text-safety'

describe('inert bounded display text', () => {
  it('removes markup and executable blocks while preserving Chinese', () => {
    expect(toSafeDisplayText('<p>劳动<b>信息</b></p><script>alert(1)</script><style>body{}</style><img src=x onerror=alert(2)>', 100)).toBe('劳动 信息')
  })
  it('decodes entities before removing encoded markup', () => {
    expect(toSafeDisplayText('&lt;script&gt;alert(1)&lt;/script&gt;中文&nbsp;&amp; &#x1F600;', 100)).toBe('中文 & 😀')
  })
  it('removes NUL, bidi overrides and isolates and normalizes whitespace', () => {
    expect(toSafeDisplayText('  中\0文\u202e测试\u202c\u2066信息\u2069\n\t 好  ', 100)).toBe('中文测试信息 好')
  })
  it.each([[3, '中文'], [4, '中文😀'], [5, '中文😀好'], [0, '']] as const)('bounds UTF-16 length at %i without splitting pairs', (bound, expected) => {
    expect(toSafeDisplayText('中文😀好', bound)).toBe(expected)
  })
  it.each([-1, 1.5, NaN, Infinity])('rejects an invalid bound %s', (bound) => {
    expect(() => toSafeDisplayText('中文', bound)).toThrow(RangeError)
  })
  it('removes remaining angle brackets from malformed markup', () => {
    expect(toSafeDisplayText('中文 <img onerror="x"', 100)).not.toMatch(/[<>]/)
  })
})

it('handles large runs of incomplete tags without quadratic scanning', () => {
  const start = performance.now()
  expect(toSafeDisplayText('<'.repeat(100_000) + '中文', 20)).toBe('中文')
  expect(performance.now() - start).toBeLessThan(1000)
})
