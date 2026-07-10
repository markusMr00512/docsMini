import { vi } from 'vitest'

/**
 * Shared Prisma mock for API route tests.
 *
 * Each test file calls `mockPrisma()` in a beforeEach to reset the stubs,
 * then overrides individual methods (e.g. `db.user.findUnique.mockResolvedValue(...)`).
 *
 * The mock is installed by mocking '@/lib/db' in the test file's
 * `vi.mock('@/lib/db', ...)` factory (see api route test files).
 */

type MockFn = ReturnType<typeof vi.fn>

export interface MockDb {
  user: {
    findUnique: MockFn
    findFirst: MockFn
    create: MockFn
    update: MockFn
    delete: MockFn
  }
  document: {
    findUnique: MockFn
    findMany: MockFn
    create: MockFn
    update: MockFn
    delete: MockFn
  }
  documentVersion: {
    findUnique: MockFn
    findFirst: MockFn
    findMany: MockFn
    create: MockFn
  }
  activeCollaborator: {
    upsert: MockFn
    deleteMany: MockFn
    updateMany: MockFn
    findMany: MockFn
  }
}

export function createMockDb(): MockDb {
  return {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    document: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    documentVersion: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    activeCollaborator: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
  }
}

/** Parse a JSON body from a Next.js Response. */
export async function readJson(res: Response): Promise<any> {
  return res.json()
}

/** Build a Request with a JSON body + optional auth header. */
export function jsonReq(
  url: string,
  opts: { method?: string; body?: unknown; auth?: string; cookie?: string } = {}
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.auth) headers['authorization'] = `Bearer ${opts.auth}`
  if (opts.cookie) headers['cookie'] = opts.cookie
  return new Request(url, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
}

// Set deterministic secrets so tokens signed in tests verify correctly.
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret'
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret'
