import { db } from '@/lib/db'
import { getUserFromRequest } from '@/lib/auth'
import { json, unauthorized, validate, createDocumentSchema } from '@/lib/api'

// GET /api/documents — list the current user's documents, newest first
export async function GET(req: Request) {
  const user = await getUserFromRequest(req)
  if (!user) return unauthorized()
  const docs = await db.document.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { versions: true } },
    },
  })
  return json({
    documents: docs.map((d) => ({
      ...d,
      versionCount: d._count.versions,
      _count: undefined,
    })),
  })
}

// POST /api/documents — create a new document
export async function POST(req: Request) {
  const user = await getUserFromRequest(req)
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const parsed = validate(createDocumentSchema, body)
  if (!parsed.ok) return parsed.response

  const doc = await db.document.create({
    data: {
      title: parsed.data.title ?? 'بدون عنوان',
      content: parsed.data.content ?? '',
      ownerId: user.id,
    },
  })
  return json({ document: doc }, { status: 201 })
}
