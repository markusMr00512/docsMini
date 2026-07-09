import { getUserFromRequest } from '@/lib/auth'
import { json, unauthorized } from '@/lib/api'

// GET /api/auth/me — return the current authenticated user
export async function GET(req: Request) {
  const user = await getUserFromRequest(req)
  if (!user) return unauthorized()
  return json({ user })
}
