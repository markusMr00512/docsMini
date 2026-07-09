import { NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Unified JSON helper so every API route returns consistent shapes and CORS
 * headers (the dev preview proxies cross-origin requests).
 */
export function json(body: unknown, init: { status?: number; headers?: HeadersInit } = {}) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  return NextResponse.json(body, { status: init.status ?? 200, headers })
}

export function unauthorized(message = 'احراز هویت ناموفق بود') {
  return json({ error: message }, { status: 401 })
}

export function badRequest(message: string, fields?: Record<string, string>) {
  return json({ error: message, fields }, { status: 400 })
}

export function notFound(message = 'مورد یافت نشد') {
  return json({ error: message }, { status: 404 })
}

/**
 * Run a zod schema against an unknown payload and return either the parsed
 * data or a 400 response carrying per-field errors (in Persian).
 */
export function validate<T>(
  schema: z.ZodType<T>,
  payload: unknown
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const result = schema.safeParse(payload)
  if (result.success) return { ok: true, data: result.data }
  const fields: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.')
    if (!fields[key]) fields[key] = issue.message
  }
  return {
    ok: false,
    response: badRequest('ورودی نامعتبر است', fields),
  }
}

// ---- Shared validation schemas (Persian messages) ----

export const registerSchema = z.object({
  name: z.string().min(2, 'نام باید حداقل ۲ کاراکتر باشد').max(80, 'نام خیلی طولانی است'),
  email: z.string().email('ایمیل معتبر نیست'),
  password: z.string().min(6, 'رمز عبور باید حداقل ۶ کاراکتر باشد').max(100),
})

export const loginSchema = z.object({
  email: z.string().email('ایمیل معتبر نیست'),
  password: z.string().min(1, 'رمز عبور الزامی است'),
})

export const createDocumentSchema = z.object({
  title: z.string().min(1, 'عنوان الزامی است').max(200).optional(),
  content: z.string().max(1_000_000).optional(),
})

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(1_000_000).optional(),
})

export const createVersionSchema = z.object({
  content: z.string().max(1_000_000),
  title: z.string().max(200).optional(),
  source: z.enum(['manual', 'autosave', 'restore']).default('manual'),
})
