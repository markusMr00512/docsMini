import jwt, { JwtPayload } from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { db } from './db'
import { cookies } from 'next/headers'

/**
 * Auth core: stateless access tokens + rotating refresh-token family.
 *
 * Access token  -> short-lived (15m), carried in Authorization header.
 * Refresh token -> long-lived (7d), httpOnly cookie, single-use (rotating JTI).
 *
 * Rotation strategy: every refresh issues a new JTI and stores it on the user.
 * If a previously-issued (already-used) refresh token is presented again, we
 * treat it as token theft and revoke the family by clearing refreshJti.
 */

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me'
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me'

export const ACCESS_TTL = '15m'
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days
const REFRESH_TTL = `${REFRESH_TTL_SECONDS}s`

export const REFRESH_COOKIE = 'docsmini_refresh'

export interface AccessPayload extends JwtPayload {
  sub: string   // user id
  email: string
  name: string | null
}

export interface RefreshPayload extends JwtPayload {
  sub: string
  jti: string
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10)
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash)
}

export function signAccessToken(user: { id: string; email: string; name: string | null }): string {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, ACCESS_SECRET, {
    expiresIn: ACCESS_TTL,
  })
}

export function signRefreshToken(userId: string, jti: string): string {
  return jwt.sign({ sub: userId, jti }, REFRESH_SECRET, { expiresIn: REFRESH_TTL })
}

export function verifyAccessToken(token: string): AccessPayload | null {
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as AccessPayload
    return decoded
  } catch {
    return null
  }
}

export function verifyRefreshToken(token: string): RefreshPayload | null {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET) as RefreshPayload
    return decoded
  } catch {
    return null
  }
}

export function newJti(): string {
  return crypto.randomUUID()
}

/**
 * Resolve the authenticated user from an Authorization: Bearer <token> header.
 * Returns the user record (without passwordHash) or null.
 */
export async function getUserFromRequest(req: Request) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const payload = verifyAccessToken(token)
  if (!payload?.sub) return null
  const user = await db.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, avatarColor: true, createdAt: true },
  })
  return user
}

/**
 * Set the rotating refresh-token httpOnly cookie on a Response/Headers.
 */
export function setRefreshCookie(res: Response, token: string) {
  res.headers.append(
    'Set-Cookie',
    `${REFRESH_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${REFRESH_TTL_SECONDS}; SameSite=Lax${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  )
}

export function clearRefreshCookie(res: Response) {
  res.headers.append(
    'Set-Cookie',
    `${REFRESH_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  )
}

/**
 * Read the refresh cookie from a Next.js Request (API route) — server side.
 */
export function getRefreshTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get('cookie') ?? ''
  const match = cookie.match(new RegExp(`(?:^|; )${REFRESH_COOKIE}=([^;]+)`))
  return match ? match[1] : null
}

/**
 * Read the refresh cookie in a Server Component / Route Handler using next/headers.
 */
export async function getRefreshTokenFromCookies(): Promise<string | null> {
  const store = await cookies()
  return store.get(REFRESH_COOKIE)?.value ?? null
}

/**
 * Public user shape returned to the client (never leaks passwordHash).
 */
export type SafeUser = {
  id: string
  email: string
  name: string | null
  avatarColor: string
}
