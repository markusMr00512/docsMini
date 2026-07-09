import { db } from '@/lib/db'
import { getUserFromRequest } from '@/lib/auth'
import { json, unauthorized, notFound, validate, updateDocumentSchema } from '@/lib/api'

// Owner-only check (for PATCH/DELETE).
async function getOwnedDoc(req: Request, id: string) {
  const user = await getUserFromRequest(req)
  if (!user) return { user: null, doc: null, res: unauthorized() }
  const doc = await db.document.findUnique({ where: { id } })
  if (!doc || doc.ownerId !== user.id) {
    return { user, doc: null, res: notFound('سند یافت نشد') }
  }
  return { user, doc, res: null }
}

// GET /api/documents/:id — any authenticated user may open (shareable-link model).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUserFromRequest(req)
  if (!user) return unauthorized()
  const doc = await db.document.findUnique({ where: { id } })
  if (!doc) return notFound('سند یافت نشد')
  return json({ document: doc })
}

// PATCH /api/documents/:id
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { res } = await getOwnedDoc(req, id)
  if (res) return res
  const body = await req.json().catch(() => ({}))
  const parsed = validate(updateDocumentSchema, body)
  if (!parsed.ok) return parsed.response

  const updated = await db.document.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
    },
  })
  return json({ document: updated })
}

// DELETE /api/documents/:id
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { res } = await getOwnedDoc(req, id)
  if (res) return res
  await db.document.delete({ where: { id } })
  return json({ ok: true })
}
