import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockDb = {
  user: {
    findUnique: vi.fn(),
  },
}
vi.mock('@/lib/db', () => ({ db: mockDb }))

process.env.JWT_ACCESS_SECRET = 'test-access-secret'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'

const { GET } = await import('@/app/api/auth/me/route')
const { signAccessToken } = await import('@/lib/auth')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/auth/me', () => {
  it('returns the authenticated user', async () => {
    const token = signAccessToken({ id: 'u1', email: 'a@b.com', name: 'Ali' })
    mockDb.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'Ali',
      avatarColor: '#0d9488',
      createdAt: new Date(),
    })
    const req = new Request('http://localhost/api/auth/me', {
      headers: { authorization: `Bearer ${token}` },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.user.id).toBe('u1')
    expect(data.user.email).toBe('a@b.com')
    // passwordHash must never be selected/returned
    expect(data.user.passwordHash).toBeUndefined()
  })

  it('returns 401 when no Authorization header is present', async () => {
    const req = new Request('http://localhost/api/auth/me')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    const req = new Request('http://localhost/api/auth/me', {
      headers: { authorization: 'Bearer not-a-jwt' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when the user no longer exists', async () => {
    const token = signAccessToken({ id: 'ghost', email: 'g@b.com', name: null })
    mockDb.user.findUnique.mockResolvedValue(null)
    const req = new Request('http://localhost/api/auth/me', {
      headers: { authorization: `Bearer ${token}` },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})
