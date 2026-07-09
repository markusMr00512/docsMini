'use client'

import { useAuthStore } from '@/stores/auth-store'

/**
 * Thin fetch wrapper that:
 *  - attaches the access token as Bearer,
 *  - transparently refreshes once on 401 (rotating refresh cookie),
 *  - throws an ApiError with the server's Persian message on failure.
 */
export class ApiError extends Error {
  status: number
  fields?: Record<string, string>
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

async function refreshToken(): Promise<string | null> {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.accessToken ?? null
}

export async function apiFetch<T>(
  input: string,
  init: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().accessToken
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const doFetch = () =>
    fetch(input, { ...init, headers, credentials: 'include' })

  let res = await doFetch()
  // Single transparent refresh on 401
  if (res.status === 401) {
    const newToken = await refreshToken()
    if (newToken) {
      useAuthStore.getState().setAccessToken(newToken)
      headers.set('Authorization', `Bearer ${newToken}`)
      res = await doFetch()
    } else {
      useAuthStore.getState().logout()
      throw new ApiError('نشست شما منقضی شده است', 401)
    }
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const message = data?.error ?? 'خطای ناشناخته رخ داد'
    throw new ApiError(message, res.status, data?.fields)
  }
  return data as T
}

export const api = {
  get: <T>(url: string) => apiFetch<T>(url),
  post: <T>(url: string, body?: unknown) =>
    apiFetch<T>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(url: string, body?: unknown) =>
    apiFetch<T>(url, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(url: string) => apiFetch<T>(url, { method: 'DELETE' }),
}
