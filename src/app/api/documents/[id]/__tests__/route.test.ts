import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockDb = {
  user: {
    findUnique: vi.fn(),
  },
  document: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}
vi.mock('@/lib/db', () => ({ db: mockDb }))

process.env.JWT_ACCESS_SECRET = 'test-access-secret'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'

const { GET, PATCH, DELETE } = await import('@/app/api/documents/[id]/route')
const { signAccessToken } = await import('@/lib/auth')

function authReq(url: string, userId: string, opts: { method?: string; body?: unknown } = {}): Request {
  const token = signAccessToken({ id: userId, email: 'a@b.com', name: 'Ali' })
  return new Request(url, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  // getUserFromRequest always looks up the user by id from the JWT.
  // Return a generic user matching the JWT subject by default; tests can
  // override by re-mocking with a different id.
  mockDb.user.findUnique.mockImplementation(async (args: any) => ({
    id: args.where.id,
    email: 'a@b.com',
    name: 'Ali',
    avatarColor: '#0d9488',
    createdAt: new Date(),
  }))
})

describe('GET /api/documents/:id (shareable — any authenticated user)', () => {
  it('returns the document to any authenticated user', async () => {
    mockDb.document.findUnique.mockResolvedValue({
      id: 'd1', title: 'T', content: 'C', ownerId: 'owner-1',
    })
    // requester is 'u-other', not the owner — still allowed (shareable-link model).
    const res = await GET(authReq('http://localhost/api/documents/d1', 'u-other'), ctx('d1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.document.id).toBe('d1')
  })

  it('returns 404 when the document does not exist', async () => {
    mockDb.document.findUnique.mockResolvedValue(null)
    const res = await GET(authReq('http://localhost/api/documents/ghost', 'u1'), ctx('ghost'))
    expect(res.status).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const req = new Request('http://localhost/api/documents/d1')
    const res = await GET(req, ctx('d1'))
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/documents/:id (owner only)', () => {
  it('updates title and content for the owner', async () => {
    mockDb.document.findUnique.mockResolvedValue({ id: 'd1', ownerId: 'u1', title: 'old', content: 'old' })
    mockDb.document.update.mockResolvedValue({ id: 'd1', title: 'new', content: 'new', ownerId: 'u1' })
    const res = await PATCH(
      authReq('http://localhost/api/documents/d1', 'u1', { method: 'PATCH', body: { title: 'new', content: 'new' } }),
      ctx('d1')
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.document.title).toBe('new')
  })

  it('rejects a non-owner with 404', async () => {
    mockDb.document.findUnique.mockResolvedValue({ id: 'd1', ownerId: 'owner-1', title: 't', content: 'c' })
    const res = await PATCH(
      authReq('http://localhost/api/documents/d1', 'intruder', { method: 'PATCH', body: { title: 'hacked' } }),
      ctx('d1')
    )
    expect(res.status).toBe(404)
    expect(mockDb.document.update).not.toHaveBeenCalled()
  })

  it('returns 404 when the document does not exist', async () => {
    mockDb.document.findUnique.mockResolvedValue(null)
    const res = await PATCH(
      authReq('http://localhost/api/documents/ghost', 'u1', { method: 'PATCH', body: { title: 'x' } }),
      ctx('ghost')
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/documents/:id (owner only)', () => {
  it('deletes the document for the owner', async () => {
    mockDb.document.findUnique.mockResolvedValue({ id: 'd1', ownerId: 'u1' })
    mockDb.document.delete.mockResolvedValue({})
    const res = await DELETE(authReq('http://localhost/api/documents/d1', 'u1', { method: 'DELETE' }), ctx('d1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(mockDb.document.delete).toHaveBeenCalledWith({ where: { id: 'd1' } })
  })

  it('rejects a non-owner with 404', async () => {
    mockDb.document.findUnique.mockResolvedValue({ id: 'd1', ownerId: 'owner-1' })
    const res = await DELETE(authReq('http://localhost/api/documents/d1', 'intruder', { method: 'DELETE' }), ctx('d1'))
    expect(res.status).toBe(404)
    expect(mockDb.document.delete).not.toHaveBeenCalled()
  })
})
