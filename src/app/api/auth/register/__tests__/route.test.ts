import { describe, it, expect, beforeEach, vi } from 'vitest'

// --- Mock Prisma before importing the route ---
const mockDb = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}
vi.mock('@/lib/db', () => ({ db: mockDb }))

process.env.JWT_ACCESS_SECRET = 'test-access-secret'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'

const { POST } = await import('@/app/api/auth/register/route')
const { verifyAccessToken, verifyRefreshToken } = await import('@/lib/auth')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/auth/register', () => {
  it('creates a user and returns 201 with access token + sets refresh cookie', async () => {
    mockDb.user.findUnique.mockResolvedValue(null) // no existing user
    mockDb.user.create.mockResolvedValue({
      id: 'u1',
      email: 'ali@example.com',
      name: 'Ali',
      passwordHash: 'hashed',
      avatarColor: '#0d9488',
    })
    mockDb.user.update.mockResolvedValue({})

    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ali', email: 'ali@example.com', password: 'secret123' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)

    const data = await res.json()
    expect(data.user).toMatchObject({ email: 'ali@example.com', name: 'Ali' })
    expect(data.accessToken).toMatch(/^eyJ/)

    // The access token should verify and carry the user id.
    const payload = verifyAccessToken(data.accessToken)
    expect(payload?.sub).toBe('u1')

    // Refresh cookie must be set, httpOnly.
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('docsmini_refresh=')
    expect(setCookie.toLowerCase()).toContain('httponly')

    // The refresh token's JTI should have been persisted on the user.
    const refreshCookie = setCookie.match(/docsmini_refresh=([^;]+)/)?.[1]
    const refreshPayload = verifyRefreshToken(refreshCookie!)
    expect(refreshPayload?.sub).toBe('u1')
    expect(refreshPayload?.jti).toBeTruthy()
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { refreshJti: refreshPayload!.jti },
    })
  })

  it('returns 400 when the email is already registered', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 'existing', email: 'ali@example.com' })

    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ali', email: 'ali@example.com', password: 'secret123' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeTruthy()
    expect(data.fields?.email).toBeTruthy() // per-field error
    expect(mockDb.user.create).not.toHaveBeenCalled()
  })

  it('returns 400 on invalid input (short password)', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ali', email: 'ali@example.com', password: '123' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.fields?.password).toBeTruthy()
  })

  it('returns 400 on invalid email', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ali', email: 'not-an-email', password: 'secret123' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.fields?.email).toBeTruthy()
  })

  it('hashes the password (never stores plaintext)', async () => {
    mockDb.user.findUnique.mockResolvedValue(null)
    mockDb.user.create.mockImplementation(async (args: any) => ({
      id: 'u1',
      email: args.data.email,
      name: args.data.name,
      passwordHash: args.data.passwordHash,
      avatarColor: args.data.avatarColor,
    }))
    mockDb.user.update.mockResolvedValue({})

    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ali', email: 'a@b.com', password: 'plaintext-secret' }),
    })
    await POST(req)

    const createCall = mockDb.user.create.mock.calls[0][0]
    expect(createCall.data.passwordHash).not.toBe('plaintext-secret')
    expect(createCall.data.passwordHash.length).toBeGreaterThan(20)
  })
})
