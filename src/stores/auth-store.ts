'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SafeUser } from '@/lib/auth'

interface AuthState {
  user: SafeUser | null
  accessToken: string | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
  setAuth: (user: SafeUser, token: string) => void
  setAccessToken: (token: string) => void
  logout: () => void
  setStatus: (s: AuthState['status']) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      status: 'loading',
      setAuth: (user, token) => set({ user, accessToken: token, status: 'authenticated' }),
      setAccessToken: (token) => set({ accessToken: token }),
      logout: () => set({ user: null, accessToken: null, status: 'unauthenticated' }),
      setStatus: (status) => set({ status }),
    }),
    {
      name: 'docsmini-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
    }
  )
)
