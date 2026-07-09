import { db } from '@/lib/db'
import {
  signAccessToken,
  signRefreshToken,
  newJti,
  setRefreshCookie,
  verifyPassword,
  type SafeUser,
} from '@/lib/auth'
import { json, badRequest, validate, loginSchema } from '@/lib/api'

// POST /api/auth/login
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = validate(loginSchema, body)
  if (!parsed.ok) return parsed.response

  const { email, password } = parsed.data
  const user = await db.user.findUnique({ where: { email } })
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return badRequest('ایمیل یا رمز عبور نادرست است')
  }

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
