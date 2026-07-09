import { db } from '@/lib/db'
import { clearRefreshCookie } from '@/lib/auth'
import { json } from '@/lib/api'

// POST /api/auth/logout — revoke refresh family + clear cookie
export async function POST(req: Request) {
  const cookie = req.headers.get('cookie') ?? ''
  const match = cookie.match(/(?:^|; )docsmini_refresh=([^;]+)/)
  const token = match?.[1]
  if (token) {
    // Best-effort: extract user id and clear refreshJti so the token can't be reused.
    try {
      const parts = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString('utf8')
      ) as { sub?: string }
      if (parts.sub) {
        await db.user.update({ where: { id: parts.sub }, data: { refreshJti: null } })
      }
    } catch {
      // ignore malformed token
    }
  }
  const res = json({ ok: true })
  clearRefreshCookie(res)
  return res
}
