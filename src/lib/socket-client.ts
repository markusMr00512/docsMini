'use client'

import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Socket.io client for the collaboration mini-service.
 *
 * Connection target — two modes:
 *
 *  1. LOCALHOST (default for self-hosting):
 *     Set NEXT_PUBLIC_COLLAB_URL in .env, e.g.
 *         NEXT_PUBLIC_COLLAB_URL=http://localhost:3003
 *     The browser connects directly to the collab service. Requires the
 *     service to have CORS enabled (it does: origin '*' in dev).
 *
 *  2. SANDBOX / GATEWAY (no env var):
 *     Connects to "/?XTransformPort=3003" so a Caddy-style gateway can
 *     route the request to port 3003. Used in the Z.ai preview environment.
 *
 * To check which mode is active, run in the browser console:
 *     window.__collabTarget
 */

let socket: Socket | null = null
type DocHandler = (payload: any) => void

export interface Collaborator {
  id: string
  name: string | null
  avatarColor: string
  cursor: number
  selectionEnd: number
}

function getCollabTarget(): { url: string; options: Record<string, unknown> } {
  const directUrl = process.env.NEXT_PUBLIC_COLLAB_URL
  if (directUrl) {
    // Direct connection to the collab service (localhost / self-hosted).
    return {
      url: directUrl,
      options: {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
      },
    }
  }
  // Sandbox / gateway mode — Caddy routes ?XTransformPort=3003 → :3003.
  return {
    url: '/?XTransformPort=3003',
    options: {
      transports: ['websocket', 'polling'],
    },
  }
}

export function getCollabSocket(): Socket | null {
  const token = useAuthStore.getState().accessToken
  if (!token) return null

  // Reuse any existing socket bound to the same token (whether it is still
  // connecting or already connected). Destroying a *connecting* socket on
  // re-entry (e.g. React Strict Mode double-invoke) orphans the reference the
  // caller captured, so its poll/listeners would track a dead socket.
  if (socket) {
    if ((socket as any).auth?.token === token) return socket
    // token changed (e.g. after refresh) -> recreate
    try {
      socket.removeAllListeners()
      socket.disconnect()
    } catch {
      /* ignore */
    }
    socket = null
  }

  const target = getCollabTarget()
  socket = io(target.url, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    ...target.options,
  })

  socket.on('connect_error', (err) => {
    console.warn('[collab] connect_error', err.message)
  })

  // Expose for debugging (dev only)
  if (typeof window !== 'undefined') {
    ;(window as any).__collabSocket = socket
    ;(window as any).__collabTarget = target.url
  }

  return socket
}

export function disconnectCollab() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

// ---- Typed helpers bound to the current socket ----

export const collab = {
  join(documentId: string): Promise<{ documentId: string; title: string; content: string }> {
    return new Promise((resolve, reject) => {
      const s = getCollabSocket()
      if (!s) return reject(new Error('بدون اتصال'))
      s.emit('doc:join', { documentId }, (ack: { ok: boolean; error?: string }) => {
        if (!ack.ok) reject(new Error(ack.error ?? 'اتصال ناموفق'))
      })
      s.once('doc:state', (state) => resolve(state))
    })
  },
  leave(documentId: string) {
    const s = getCollabSocket()
    s?.emit('doc:leave', { documentId })
  },
  sendEdit(documentId: string, payload: { title?: string; content: string; version: number }) {
    const s = getCollabSocket()
    s?.emit('doc:edit', { documentId, ...payload })
  },
  sendCursor(documentId: string, cursor: number, selectionEnd: number) {
    const s = getCollabSocket()
    s?.emit('cursor:update', { documentId, cursor, selectionEnd })
  },
  saveVersion(documentId: string, payload: { content: string; title: string; source?: string }) {
    const s = getCollabSocket()
    s?.emit('doc:save', { documentId, ...payload, source: payload.source ?? 'manual' })
  },
  restoreVersion(documentId: string, versionId: string) {
    const s = getCollabSocket()
    s?.emit('version:restore', { documentId, versionId })
  },
  on(event: string, handler: DocHandler) {
    const s = getCollabSocket()
    s?.on(event, handler)
  },
  off(event: string, handler: DocHandler) {
    const s = getCollabSocket()
    s?.off(event, handler)
  },
}
