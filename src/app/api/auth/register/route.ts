import { db } from '@/lib/db'
import {
  hashPassword,
  signAccessToken,
  signRefreshToken,
  newJti,
  setRefreshCookie,
  verifyPassword,
  type SafeUser,
} from '@/lib/auth'
import { json, badRequest, validate, registerSchema } from '@/lib/api'

// POST /api/auth/register
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = validate(registerSchema, body)
  if (!parsed.ok) return parsed.response

  const { name, email, password } = parsed.data
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return badRequest('این ایمیل قبلاً ثبت شده است', { email: 'ایمیل تکراری است' })
  }

  const colors = ['#0d9488', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#ca8a04', '#16a34a']
  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(password),
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
    },
  })

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
  const res = json({ user: safe, accessToken: access }, { status: 201 })
  setRefreshCookie(res, refresh)
  return res
}
