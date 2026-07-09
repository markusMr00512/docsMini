import { db } from '@/lib/db'
import { getUserFromRequest } from '@/lib/auth'
import { json, unauthorized, notFound } from '@/lib/api'

// Any authenticated user who can access the doc may view/restore versions.
async function assertAccessible(req: Request, id: string) {
  const user = await getUserFromRequest(req)
  if (!user) return { user: null, doc: null, res: unauthorized() }
  const doc = await db.document.findUnique({ where: { id } })
  if (!doc) {
    return { user, doc: null, res: notFound('سند یافت نشد') }
  }
  return { user, doc, res: null }
}

// GET /api/documents/:id/versions/:versionId — fetch a single snapshot
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params
  const { res } = await assertAccessible(req, id)
  if (res) return res
  const version = await db.documentVersion.findFirst({
    where: { id: versionId, documentId: id },
    include: { author: { select: { id: true, name: true, avatarColor: true } } },
  })
  if (!version) return notFound('نسخه یافت نشد')
  return json({ version })
}

// POST /api/documents/:id/versions/:versionId — restore document to this version
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params
  const { user, doc, res } = await assertAccessible(req, id)
  if (res || !user || !doc) return res ?? unauthorized()
  const version = await db.documentVersion.findFirst({
    where: { id: versionId, documentId: id },
  })
  if (!version) return notFound('نسخه یافت نشد')

  // Restore the document content/title...
  const updated = await db.document.update({
    where: { id },
    data: { content: version.content, title: version.title },
  })
  // ...and record the restoration as a new version snapshot (source=restore).
  const restoreVersion = await db.documentVersion.create({
    data: {
      documentId: id,
      authorId: user.id,
      content: version.content,
      title: version.title,
      source: 'restore',
    },
    include: { author: { select: { id: true, name: true, avatarColor: true } } },
  })
  return json({ document: updated, version: restoreVersion })
}
