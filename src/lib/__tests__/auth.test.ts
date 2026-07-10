import { describe, it, expect, beforeEach, vi } from 'vitest'

// We test the pure crypto/JWT helpers directly. These functions have no DB
// dependency, so no mocking is required — only time (jwt expiry) is faked.

// The auth module reads secrets from process.env at import time; set them
// before importing so the test process uses deterministic values.
process.env.JWT_ACCESS_SECRET = 'test-access-secret'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'

const {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  newJti,
} = await import('@/lib/auth')

describe('password hashing (bcrypt)', () => {
  it('hashes a password and verifies it', () => {
    const hash = hashPassword('my-secret-123')
    expect(hash).not.toBe('my-secret-123')
    expect(hash.length).toBeGreaterThan(20)
    expect(verifyPassword('my-secret-123', hash)).toBe(true)
  })

  it('rejects a wrong password', () => {
    const hash = hashPassword('correct-password')
    expect(verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('produces a different hash for the same password (salt)', () => {
    const h1 = hashPassword('same')
    const h2 = hashPassword('same')
    expect(h1).not.toBe(h2) // different salts -> different hashes
    expect(verifyPassword('same', h1)).toBe(true)
    expect(verifyPassword('same', h2)).toBe(true)
  })
})

describe('access token (JWT, 15m)', () => {
  const user = { id: 'user-1', email: 'a@b.com', name: 'Ali' }

  it('signs and verifies an access token', () => {
    const token = signAccessToken(user)
    expect(typeof token).toBe('string')
    const payload = verifyAccessToken(token)
    expect(payload).not.toBeNull()
    expect(payload!.sub).toBe('user-1')
    expect(payload!.email).toBe('a@b.com')
    expect(payload!.name).toBe('Ali')
  })

  it('rejects a token signed with a different secret', () => {
    const token = signAccessToken(user)
    // Tamper: re-sign with the refresh secret, then try to verify as access.
    const tampered = signRefreshToken(user.id, 'jti-x') // uses refresh secret
    expect(verifyAccessToken(tampered)).toBeNull()
  })

  it('rejects a malformed token', () => {
    expect(verifyAccessToken('not.a.jwt')).toBeNull()
    expect(verifyAccessToken('')).toBeNull()
    expect(verifyAccessToken('random-string')).toBeNull()
  })

  it('rejects a tampered token (signature changed)', () => {
    const token = signAccessToken(user)
    // Flip the last character of the signature segment.
    const parts = token.split('.')
    const last = parts[2]
    const flipped = last.endsWith('A') ? last.slice(0, -1) + 'B' : last.slice(0, -1) + 'A'
    const tampered = `${parts[0]}.${parts[1]}.${flipped}`
    expect(verifyAccessToken(tampered)).toBeNull()
  })
})

describe('refresh token (JWT, rotating JTI)', () => {
  const userId = 'user-2'

  it('signs and verifies a refresh token with a JTI', () => {
    const jti = newJti()
    const token = signRefreshToken(userId, jti)
    const payload = verifyRefreshToken(token)
    expect(payload).not.toBeNull()
    expect(payload!.sub).toBe(userId)
    expect(payload!.jti).toBe(jti)
  })

  it('newJti produces unique UUIDs', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) ids.add(newJti())
    expect(ids.size).toBe(1000)
  })

  it('rejects a refresh token when verified as an access token', () => {
    const token = signRefreshToken(userId, newJti())
    expect(verifyAccessToken(token)).toBeNull()
  })

  it('rejects a refresh token signed with the access secret', () => {
    // signAccessToken uses the access secret; verifyRefreshToken uses refresh secret.
    const wrongToken = signAccessToken({ id: userId, email: 'x@y.com', name: null })
    expect(verifyRefreshToken(wrongToken)).toBeNull()
  })
})

describe('token expiry (time-based)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('access token expires after 15 minutes', () => {
    const user = { id: 'u', email: 'u@u.com', name: null }
    const token = signAccessToken(user)
    expect(verifyAccessToken(token)).not.toBeNull()

    // Advance just past 15 minutes.
    vi.advanceTimersByTime(16 * 60 * 1000)
    expect(verifyAccessToken(token)).toBeNull()
  })

  it('access token is still valid at 14 minutes', () => {
    const user = { id: 'u', email: 'u@u.com', name: null }
    const token = signAccessToken(user)
    vi.advanceTimersByTime(14 * 60 * 1000)
    expect(verifyAccessToken(token)).not.toBeNull()
  })
})
