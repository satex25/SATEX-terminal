/**
 * Unit tests for the .env.local Alpaca-key parser. Covers the
 * security-critical behavior of the env→safeStorage migration: extract the
 * three keys, leave everything else intact.
 *
 * The full `migratePlaintextEnvLocalCreds` is integration-tested manually
 * because it depends on Electron's `app` + `safeStorage` runtime. The pure
 * parser carries the risk surface — wrong line-stripping could either leak
 * keys (not stripped) or destroy unrelated user config (over-stripped).
 */
import { describe, it, expect } from 'vitest'
import { parseEnvLocalForAlpacaKeys } from './credential-store'

describe('parseEnvLocalForAlpacaKeys', () => {
  it('extracts the three Alpaca keys when present alone', () => {
    const text = [
      'ALPACA_KEY_ID=AKABCDEFGHIJ',
      'ALPACA_SECRET_KEY=supersecret/abc+xyz',
      'ALPACA_FEED=iex',
    ].join('\n')
    const { found, residueText } = parseEnvLocalForAlpacaKeys(text)
    expect(found.keyId).toBe('AKABCDEFGHIJ')
    expect(found.secretKey).toBe('supersecret/abc+xyz')
    expect(found.feed).toBe('iex')
    expect(residueText).toBe('')
  })

  it('returns empty values when keys are absent — no false positives', () => {
    const text = 'SOME_OTHER_VAR=hello\n# comment\n'
    const { found, residueText } = parseEnvLocalForAlpacaKeys(text)
    expect(found.keyId).toBe('')
    expect(found.secretKey).toBe('')
    expect(found.feed).toBe('iex')          // default, not extracted
    // Trailing-newline preserved (split + rejoin on \n keeps the empty final element)
    expect(residueText).toBe('SOME_OTHER_VAR=hello\n# comment\n')
  })

  it('preserves unrelated keys when Alpaca lines are stripped', () => {
    const text = [
      'SATEX_LOG_LEVEL=debug',
      'ALPACA_KEY_ID=PKABCD',
      'ALPACA_SECRET_KEY=zzz',
      'MAX_OPEN_POSITIONS=5',
    ].join('\n')
    const { found, residueText } = parseEnvLocalForAlpacaKeys(text)
    expect(found.keyId).toBe('PKABCD')
    expect(found.secretKey).toBe('zzz')
    expect(residueText).toBe('SATEX_LOG_LEVEL=debug\nMAX_OPEN_POSITIONS=5')
  })

  it('preserves comment lines as residue', () => {
    const text = [
      '# Alpaca paper credentials',
      'ALPACA_KEY_ID=PK1',
      'ALPACA_SECRET_KEY=secret1',
      '# end of section',
    ].join('\n')
    const { residueText } = parseEnvLocalForAlpacaKeys(text)
    expect(residueText).toBe('# Alpaca paper credentials\n# end of section')
  })

  it('handles the export prefix (POSIX-style)', () => {
    const text = [
      'export ALPACA_KEY_ID=PKEXPORT',
      'export ALPACA_SECRET_KEY=secret_export',
    ].join('\n')
    const { found } = parseEnvLocalForAlpacaKeys(text)
    expect(found.keyId).toBe('PKEXPORT')
    expect(found.secretKey).toBe('secret_export')
  })

  it('strips matched single and double quotes around values', () => {
    const text = [
      'ALPACA_KEY_ID="PK_DBL"',
      "ALPACA_SECRET_KEY='secret_sgl'",
      'ALPACA_FEED="sip"',
    ].join('\n')
    const { found } = parseEnvLocalForAlpacaKeys(text)
    expect(found.keyId).toBe('PK_DBL')
    expect(found.secretKey).toBe('secret_sgl')
    expect(found.feed).toBe('sip')
  })

  it('defaults feed to iex when ALPACA_FEED has an unknown value', () => {
    const text = 'ALPACA_KEY_ID=PK\nALPACA_SECRET_KEY=ss\nALPACA_FEED=foo'
    const { found } = parseEnvLocalForAlpacaKeys(text)
    expect(found.feed).toBe('iex')
  })

  it('handles CRLF line endings (Windows-saved file)', () => {
    const text = 'ALPACA_KEY_ID=PKCRLF\r\nALPACA_SECRET_KEY=cr_secret\r\nUNRELATED=x\r\n'
    const { found, residueText } = parseEnvLocalForAlpacaKeys(text)
    expect(found.keyId).toBe('PKCRLF')
    expect(found.secretKey).toBe('cr_secret')
    // residueText keeps the UNRELATED line and the trailing empty line that
    // came after the final \r\n. We don't reintroduce \r — that's the
    // simplification noted in the function doc.
    expect(residueText).toBe('UNRELATED=x\n')
  })

  it('does not match keys with the same prefix (e.g., ALPACA_KEY_ID_BACKUP)', () => {
    const text = [
      'ALPACA_KEY_ID_BACKUP=should_stay',
      'ALPACA_KEY_ID=should_extract',
    ].join('\n')
    const { found, residueText } = parseEnvLocalForAlpacaKeys(text)
    expect(found.keyId).toBe('should_extract')
    expect(residueText).toBe('ALPACA_KEY_ID_BACKUP=should_stay')
  })

  it('leaves an = with empty value as found but blank', () => {
    const text = 'ALPACA_KEY_ID=\nALPACA_SECRET_KEY=\n'
    const { found } = parseEnvLocalForAlpacaKeys(text)
    expect(found.keyId).toBe('')
    expect(found.secretKey).toBe('')
  })

  it('ignores malformed lines without = sign', () => {
    const text = 'NOT_AN_ASSIGNMENT\nALPACA_KEY_ID=PK1\nALPACA_SECRET_KEY=ss'
    const { found, residueText } = parseEnvLocalForAlpacaKeys(text)
    expect(found.keyId).toBe('PK1')
    expect(residueText).toBe('NOT_AN_ASSIGNMENT')
  })
})
