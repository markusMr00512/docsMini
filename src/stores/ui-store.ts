'use client'

import { create } from 'zustand'

/**
 * Lightweight client-side view router. The project exposes only the `/` route,
 * so navigation between auth / dashboard / editor is handled via local state.
 */
type View =
  | { name: 'auth' }
  | { name: 'dashboard' }
  | { name: 'editor'; documentId: string }

interface UiState {
  view: View
  goAuth: () => void
  goDashboard: () => void
  goEditor: (documentId: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  view: { name: 'auth' },
  goAuth: () => set({ view: { name: 'auth' } }),
  goDashboard: () => set({ view: { name: 'dashboard' } }),
  goEditor: (documentId: string) => set({ view: { name: 'editor', documentId } }),
}))
