'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useUiStore } from '@/stores/ui-store'
import { api } from '@/lib/api-client'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      })
  )

  // On first mount, try to restore the session via /api/auth/refresh.
  const setStatus = useAuthStore((s) => s.setStatus)
  const setUser = useAuthStore((s) => s.setAuth)
  const logout = useAuthStore((s) => s.logout)
  const goDashboard = useUiStore((s) => s.goDashboard)
  const goAuth = useUiStore((s) => s.goAuth)
  const goEditor = useUiStore((s) => s.goEditor)

  // Read a deep-link target from the URL hash: `#doc=<id>` opens the editor
  // directly after auth resolves. Enables shareable document links.
  function consumeHashDoc(): string | null {
    if (typeof window === 'undefined') return null
    const m = window.location.hash.match(/doc=([a-zA-Z0-9_-]+)/)
    return m?.[1] ?? null
  }

  // Open a deep-linked doc if authenticated. Returns true if it handled it.
  function maybeOpenDeepLink(): boolean {
    const id = consumeHashDoc()
    if (id && useAuthStore.getState().status === 'authenticated') {
      goEditor(id)
      history.replaceState(null, '', window.location.pathname)
      return true
    }
    return false
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const deepDocId = consumeHashDoc()
      try {
        const data = await api.post<{ user: any; accessToken: string }>('/api/auth/refresh')
        if (!cancelled && data.user) {
          setUser(data.user, (data as any).accessToken)
          if (deepDocId) {
            goEditor(deepDocId)
            history.replaceState(null, '', window.location.pathname)
          } else {
            goDashboard()
          }
          return
        }
      } catch {
        // not authenticated
      }
      if (!cancelled) {
        logout()
        goAuth()
      }
    })()

    // Handle hash-only navigations (e.g. clicking a shared link while the app
    // is already open) which do NOT trigger a full reload / re-mount.
    function onHashChange() {
      maybeOpenDeepLink()
    }
    window.addEventListener('hashchange', onHashChange)
    return () => {
      cancelled = true
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  )
}
