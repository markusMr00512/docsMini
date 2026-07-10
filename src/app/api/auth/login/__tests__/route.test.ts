import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockDb = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}
vi.mock('@/lib/db', () => ({ db: mockDb }))

process.env.JWT_ACCESS_SECRET = 'test-access-secret'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'

const { POST } = await import('@/app/api/auth/login/route')
const { hashPassword, verifyAccessToken, verifyRefreshToken } = await import('@/lib/auth')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/auth/login', () => {
  it('logs in a valid user and returns tokens', async () => {
    const pwHash = hashPassword('correct-pw')
    mockDb.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'ali@example.com',
      name: 'Ali',
      passwordHash: pwHash,
      avatarColor: '#0d9488',
    })
    mockDb.user.update.mockResolvedValue({})

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ali@example.com', password: 'correct-pw' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.user.email).toBe('ali@example.com')
    const payload = verifyAccessToken(data.accessToken)
    expect(payload?.sub).toBe('u1')

    // Refresh cookie set + JTI persisted.
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('docsmini_refresh=')
    const refreshPayload = verifyRefreshToken(setCookie.match(/docsmini_refresh=([^;]+)/)![1])
    expect(refreshPayload?.sub).toBe('u1')
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { refreshJti: refreshPayload!.jti },
    })
  })

  it('returns 400 for a wrong password', async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'A',
      passwordHash: hashPassword('correct'),
      avatarColor: '#000',
    })
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'wrong' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(mockDb.user.update).not.toHaveBeenCalled()
  })

  it('returns 400 for a non-existent user', async () => {
    mockDb.user.findUnique.mockResolvedValue(null)
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ghost@b.com', password: 'x' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 on invalid input (missing password)', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: '' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(mockDb.user.findUnique).not.toHaveBeenCalled()
  })
})
