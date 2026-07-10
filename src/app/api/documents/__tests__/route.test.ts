import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockDb = {
  user: {
    findUnique: vi.fn(),
  },
  document: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}
vi.mock('@/lib/db', () => ({ db: mockDb }))

process.env.JWT_ACCESS_SECRET = 'test-access-secret'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'

const { GET, POST } = await import('@/app/api/documents/route')
const { signAccessToken } = await import('@/lib/auth')

function authReq(url: string, opts: { method?: string; body?: unknown } = {}): Request {
  const token = signAccessToken({ id: 'u1', email: 'a@b.com', name: 'Ali' })
  return new Request(url, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // getUserFromRequest looks up the user by JWT subject.
  mockDb.user.findUnique.mockImplementation(async (args: any) => ({
    id: args.where.id,
    email: 'a@b.com',
    name: 'Ali',
    avatarColor: '#0d9488',
    createdAt: new Date(),
  }))
})

describe('GET /api/documents', () => {
  it('lists the user documents, newest first, with version counts', async () => {
    mockDb.document.findMany.mockResolvedValue([
      {
        id: 'd1',
        title: 'یادداشت',
        content: 'متن',
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { versions: 3 },
      },
    ])
    const res = await GET(authReq('http://localhost/api/documents'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.documents).toHaveLength(1)
    expect(data.documents[0].versionCount).toBe(3)
    // _count should be stripped from the response.
    expect(data.documents[0]._count).toBeUndefined()

    // Query must filter by the authenticated user's id and order by updatedAt desc.
    const arg = mockDb.document.findMany.mock.calls[0][0]
    expect(arg.where.ownerId).toBe('u1')
    expect(arg.orderBy.updatedAt).toBe('desc')
  })

  it('returns 401 without auth', async () => {
    const req = new Request('http://localhost/api/documents')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns an empty list when the user has no documents', async () => {
    mockDb.document.findMany.mockResolvedValue([])
    const res = await GET(authReq('http://localhost/api/documents'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.documents).toEqual([])
  })
})

describe('POST /api/documents', () => {
  it('creates a document owned by the authenticated user', async () => {
    mockDb.document.create.mockImplementation(async (args: any) => ({
      id: 'd1',
      title: args.data.title,
      content: args.data.content,
      ownerId: args.data.ownerId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    const res = await POST(authReq('http://localhost/api/documents', { method: 'POST', body: { title: 'New', content: 'hello' } }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.document.title).toBe('New')
    expect(data.document.ownerId).toBe('u1')

    const arg = mockDb.document.create.mock.calls[0][0]
    expect(arg.data.ownerId).toBe('u1')
  })

  it('defaults title to "بدون عنوان" when none provided', async () => {
    mockDb.document.create.mockResolvedValue({ id: 'd1', title: 'بدون عنوان', content: '', ownerId: 'u1' })
    await POST(authReq('http://localhost/api/documents', { method: 'POST', body: {} }))
    const arg = mockDb.document.create.mock.calls[0][0]
    expect(arg.data.title).toBe('بدون عنوان')
  })

  it('returns 401 without auth', async () => {
    const req = new Request('http://localhost/api/documents', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('rejects an empty title', async () => {
    const res = await POST(authReq('http://localhost/api/documents', { method: 'POST', body: { title: '' } }))
    expect(res.status).toBe(400)
  })
})
