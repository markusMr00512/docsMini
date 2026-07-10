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

const { POST } = await import('@/app/api/auth/refresh/route')
const { signRefreshToken, verifyAccessToken } = await import('@/lib/auth')

function makeReq(refreshCookie?: string): Request {
  const headers: Record<string, string> = {}
  if (refreshCookie) headers['cookie'] = `docsmini_refresh=${refreshCookie}`
  return new Request('http://localhost/api/auth/refresh', { method: 'POST', headers })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/auth/refresh — rotating refresh-token family', () => {
  it('rotates: issues new access + new refresh (new JTI), invalidates old JTI', async () => {
    const oldJti = 'jti-old'
    const token = signRefreshToken('u1', oldJti)
    mockDb.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'A',
      refreshJti: oldJti, // stored JTI matches the presented token
      avatarColor: '#000',
    })
    mockDb.user.update.mockResolvedValue({})

    const res = await POST(makeReq(token))
    expect(res.status).toBe(200)

    const data = await res.json()
    const accessPayload = verifyAccessToken(data.accessToken)
    expect(accessPayload?.sub).toBe('u1')

    // New refresh cookie set with a DIFFERENT JTI.
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('docsmini_refresh=')
    // The update call stores the new JTI.
    const updateArg = mockDb.user.update.mock.calls[0][0]
    expect(updateArg.data.refreshJti).not.toBe(oldJti)
  })

  it('detects reuse: mismatched JTI revokes the family (clears refreshJti)', async () => {
    const presentedJti = 'jti-already-used'
    const token = signRefreshToken('u1', presentedJti)
    mockDb.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'A',
      refreshJti: 'jti-new', // the stored JTI is different -> presented token was already rotated
      avatarColor: '#000',
    })
    mockDb.user.update.mockResolvedValue({})

    const res = await POST(makeReq(token))
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBeTruthy()

    // Family revoked: refreshJti cleared.
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { refreshJti: null },
    })
    // Cookie cleared.
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('docsmini_refresh=;')
    expect(setCookie.toLowerCase()).toMatch(/max-age=0/)
  })

  it('returns 401 when no refresh cookie is present', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
    expect(mockDb.user.findUnique).not.toHaveBeenCalled()
  })

  it('returns 401 when the refresh token is malformed', async () => {
    const res = await POST(makeReq('garbage.token.here'))
    expect(res.status).toBe(401)
    expect(mockDb.user.findUnique).not.toHaveBeenCalled()
  })

  it('returns 401 when the user no longer exists', async () => {
    const token = signRefreshToken('ghost', 'jti')
    mockDb.user.findUnique.mockResolvedValue(null)
    const res = await POST(makeReq(token))
    expect(res.status).toBe(401)
  })
})
