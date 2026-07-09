import { db } from '@/lib/db'
import { getUserFromRequest } from '@/lib/auth'
import { json, unauthorized, notFound, validate, createVersionSchema } from '@/lib/api'

// Any authenticated user who can access the doc may read/create versions
// (shareable-link collaboration model). Only PATCH/DELETE of the doc itself
// require ownership (handled in the document route).
async function assertAccessible(req: Request, id: string) {
  const user = await getUserFromRequest(req)
  if (!user) return { user: null, doc: null, res: unauthorized() }
  const doc = await db.document.findUnique({ where: { id } })
  if (!doc) {
    return { user, doc: null, res: notFound('سند یافت نشد') }
  }
  return { user, doc, res: null }
}

// GET /api/documents/:id/versions — list version snapshots (newest first)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { res } = await assertAccessible(req, id)
  if (res) return res
  const versions = await db.documentVersion.findMany({
    where: { documentId: id },
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { id: true, name: true, avatarColor: true } },
    },
  })
  return json({ versions })
}

// POST /api/documents/:id/versions — create a version snapshot
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, doc, res } = await assertAccessible(req, id)
  if (res || !user || !doc) return res ?? unauthorized()
  const body = await req.json().catch(() => null)
  const parsed = validate(createVersionSchema, body)
  if (!parsed.ok) return parsed.response

  const version = await db.documentVersion.create({
    data: {
      documentId: id,
      authorId: user.id,
      content: parsed.data.content,
      title: parsed.data.title ?? doc.title,
      source: parsed.data.source,
    },
    include: {
      author: { select: { id: true, name: true, avatarColor: true } },
    },
  })
  return json({ version }, { status: 201 })
}
