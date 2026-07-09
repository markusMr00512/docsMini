import { db } from '@/lib/db'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  newJti,
  setRefreshCookie,
  clearRefreshCookie,
  type SafeUser,
} from '@/lib/auth'
import { json, unauthorized } from '@/lib/api'

/**
 * POST /api/auth/refresh
 * Rotating refresh-token flow:
 *   1. verify refresh JWT signature
 *   2. check the JTI matches the user's current refreshJti (single-use)
 *   3. if mismatch -> token reuse detected -> revoke family (clear refreshJti)
 *   4. issue new access + new refresh (new JTI stored)
 */
export async function POST(req: Request) {
  const cookie = req.headers.get('cookie') ?? ''
  const match = cookie.match(/(?:^|; )docsmini_refresh=([^;]+)/)
  const token = match?.[1]
  if (!token) return unauthorized('توکن بازیابی موجود نیست')

  const payload = verifyRefreshToken(token)
  if (!payload?.sub || !payload.jti) {
    const res = unauthorized('توکن بازیابی نامعتبر است')
    clearRefreshCookie(res)
    return res
  }

  const user = await db.user.findUnique({ where: { id: payload.sub } })
  if (!user) {
    const res = unauthorized('کاربر یافت نشد')
    clearRefreshCookie(res)
    return res
  }

  // Reuse detection: presented JTI must equal the stored current JTI.
  if (user.refreshJti !== payload.jti) {
    // Possible theft — revoke the entire family.
    await db.user.update({ where: { id: user.id }, data: { refreshJti: null } })
    const res = unauthorized('استفاده مجدد از توکن شناسایی شد؛ لطفاً دوباره وارد شوید')
    clearRefreshCookie(res)
    return res
  }

  // Rotate
  const jti = newJti()
  await db.user.update({ where: { id: user.id }, data: { refreshJti: jti } })
  const access = signAccessToken(user)
  const refresh = signRefreshToken(user.id, jti)

  const safe: SafeUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarColor: user.avatarColor,
  }
  const res = json({ user: safe, accessToken: access })
  setRefreshCookie(res, refresh)
  return res
}
