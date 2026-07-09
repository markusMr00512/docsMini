/**
 * DocsMini collaboration mini-service
 * -----------------------------------
 * Standalone socket.io server for real-time document collaboration.
 *
 * - Hardcoded port 3003 (per project spec; Caddy gateway forwards /?XTransformPort=3003 here).
 * - Shares the parent Next.js app's Prisma SQLite DB (same DATABASE_URL).
 * - Verifies the access JWT sent in socket.handshake.auth.token using the same
 *   JWT_ACCESS_SECRET as the parent app, so tokens issued by the API are valid here.
 *
 * Frontend connection:
 *   io("/?XTransformPort=3003", { auth: { token: <accessToken> } })
 *
 * Event reference (see worklog for full payload shapes):
 *   Client -> Server:  doc:join, doc:leave, cursor:update, doc:edit, doc:save, version:restore
 *   Server -> Client:  doc:state, presence:update, cursor:update, doc:patch, version:created
 */

import { createServer } from 'http'
import { Server } from 'socket.io'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'docsmini-access-secret-9f3a7c1e4b2d'
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('[collab] FATAL: DATABASE_URL is not set. Check .env')
  process.exit(1)
}

// Hardcoded per task spec — do NOT use PORT env.
const PORT = 3003

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccessPayload extends JwtPayload {
  sub: string
  email: string
  name: string | null
}

interface SocketUser {
  id: string
  email: string
  name: string | null
}

interface PresenceUser {
  id: string
  name: string | null
  avatarColor: string
  cursor: number
  selectionEnd: number
}

type Ack = (res: unknown) => void

// ---------------------------------------------------------------------------
// Prisma
// ---------------------------------------------------------------------------

const db = new PrismaClient()

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/** Per-doc version counter (last-write-wins sync, increments on every edit/restore). */
const docVersions = new Map<string, number>()

/**
 * In-memory presence tracker keyed by documentId → socketId → user info.
 * Using sockets (not DB rows) as the presence unit means two tabs logged in
 * with the SAME account each show up as a distinct collaborator — which is
 * the simplest way for a single user to test real-time collaboration.
 */
const docPresence = new Map<string, Map<string, PresenceUser>>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roomName(documentId: string): string {
  return `doc:${documentId}`
}

/** Look up the authenticated user's display info once per connection. */
async function fetchUserInfo(userId: string): Promise<{ name: string | null; avatarColor: string } | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, avatarColor: true },
  })
  return u
}

/**
 * Build the collaborator list for a doc from the in-memory socket tracker and
 * broadcast `presence:update` to everyone in the room. Each connected socket
 * is one presence entry — so two tabs with the same account count as two.
 */
function broadcastPresence(documentId: string): void {
  const sockets = docPresence.get(documentId)
  const collaborators: PresenceUser[] = sockets ? Array.from(sockets.values()) : []
  io.to(roomName(documentId)).emit('presence:update', {
    documentId,
    collaborators,
  })
}

function nextVersion(documentId: string): number {
  const v = (docVersions.get(documentId) ?? 0) + 1
  docVersions.set(documentId, v)
  return v
}

// ---------------------------------------------------------------------------
// Socket.io server
// ---------------------------------------------------------------------------

const httpServer = createServer()
const io = new Server(httpServer, {
  // Path MUST be "/" so the Caddy gateway can forward /?XTransformPort=3003 to us.
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
})

// ---------------------------------------------------------------------------
// Auth middleware — verify access JWT on every new connection.
// ---------------------------------------------------------------------------

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined
  if (!token || typeof token !== 'string') {
    return next(new Error('NO_TOKEN'))
  }
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as AccessPayload
    if (!decoded?.sub) {
      return next(new Error('INVALID_TOKEN'))
    }
    const user: SocketUser = {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name ?? null,
    }
    socket.data.user = user
    socket.data.docIds = new Set<string>()
    next()
  } catch {
    return next(new Error('INVALID_TOKEN'))
  }
})

// ---------------------------------------------------------------------------
// Connection lifecycle + event handlers
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  const user = socket.data.user as SocketUser
  const docIds = socket.data.docIds as Set<string>
  console.log(`[collab] connected: ${user.email} (socket ${socket.id})`)

  // ----- doc:join -----------------------------------------------------------
  socket.on(
    'doc:join',
    async (payload: { documentId?: string }, ack?: Ack) => {
      try {
        const documentId = payload?.documentId
        if (!documentId) {
          ack?.({ ok: false, error: 'MISSING_DOCUMENT_ID' })
          return
        }
        const doc = await db.document.findUnique({
          where: { id: documentId },
          select: { id: true, title: true, content: true },
        })
        if (!doc) {
          ack?.({ ok: false, error: 'DOCUMENT_NOT_FOUND' })
          return
        }

        socket.join(roomName(documentId))
        docIds.add(documentId)

        // Register this socket in the in-memory presence map.
        const info = await fetchUserInfo(user.id)
        const presenceEntry: PresenceUser = {
          id: socket.id, // unique per socket, so two tabs of the same user differ
          name: info?.name ?? user.email,
          avatarColor: info?.avatarColor ?? '#0d9488',
          cursor: 0,
          selectionEnd: 0,
        }
        if (!docPresence.has(documentId)) docPresence.set(documentId, new Map())
        docPresence.get(documentId)!.set(socket.id, presenceEntry)

        if (!docVersions.has(documentId)) docVersions.set(documentId, 0)

        // Broadcast presence to the whole room (joiner included).
        broadcastPresence(documentId)

        // Reply to the joiner with the canonical doc state.
        socket.emit('doc:state', {
          documentId: doc.id,
          title: doc.title,
          content: doc.content,
        })

        ack?.({ ok: true })
        console.log(`[collab] ${user.email} joined doc ${documentId}`)
      } catch (err) {
        console.error('[collab] doc:join error:', err)
        ack?.({ ok: false, error: 'INTERNAL' })
      }
    }
  )

  // ----- doc:leave ----------------------------------------------------------
  socket.on('doc:leave', async (payload: { documentId?: string }) => {
    try {
      const documentId = payload?.documentId
      if (!documentId) return
      socket.leave(roomName(documentId))
      docIds.delete(documentId)
      docPresence.get(documentId)?.delete(socket.id)
      if (docPresence.get(documentId)?.size === 0) docPresence.delete(documentId)
      broadcastPresence(documentId)
      console.log(`[collab] ${user.email} left doc ${documentId}`)
    } catch (err) {
      console.error('[collab] doc:leave error:', err)
    }
  })

  // ----- cursor:update ------------------------------------------------------
  socket.on(
    'cursor:update',
    async (payload: {
      documentId?: string
      cursor?: number
      selectionEnd?: number
    }) => {
      try {
        const documentId = payload?.documentId
        if (!documentId) return
        const cursor = Number.isFinite(payload?.cursor) ? (payload!.cursor as number) : 0
        const selectionEnd = Number.isFinite(payload?.selectionEnd)
          ? (payload!.selectionEnd as number)
          : cursor

        // Update the in-memory presence entry for this socket.
        const entry = docPresence.get(documentId)?.get(socket.id)
        if (entry) {
          entry.cursor = cursor
          entry.selectionEnd = selectionEnd
        }

        // Broadcast to room EXCEPT sender.
        socket.to(roomName(documentId)).emit('cursor:update', {
          documentId,
          userId: socket.id,
          name: entry?.name ?? user.name,
          avatarColor: entry?.avatarColor ?? '#0d9488',
          cursor,
          selectionEnd,
        })
      } catch (err) {
        console.error('[collab] cursor:update error:', err)
      }
    }
  )

  // ----- doc:edit -----------------------------------------------------------
  socket.on(
    'doc:edit',
    async (
      payload: {
        documentId?: string
        title?: string
        content?: string
        version?: number
      },
      ack?: Ack
    ) => {
      try {
        const documentId = payload?.documentId
        if (!documentId) {
          ack?.({ ok: false, error: 'MISSING_DOCUMENT_ID' })
          return
        }
        const exists = await db.document.findUnique({
          where: { id: documentId },
          select: { id: true },
        })
        if (!exists) {
          ack?.({ ok: false, error: 'DOCUMENT_NOT_FOUND' })
          return
        }

        // Last-write-wins persist.
        const data: { content: string; title?: string } = { content: payload?.content ?? '' }
        if (typeof payload?.title === 'string') data.title = payload.title
        await db.document.update({ where: { id: documentId }, data })

        const v = nextVersion(documentId)

        // Broadcast patch to room EXCEPT sender.
        socket.to(roomName(documentId)).emit('doc:patch', {
          documentId,
          title: typeof payload?.title === 'string' ? payload.title : undefined,
          content: payload?.content ?? '',
          version: v,
          byUserId: user.id,
        })

        ack?.({ ok: true, version: v })
        console.log(`[collab] ${user.email} edited doc ${documentId} (v${v})`)
      } catch (err) {
        console.error('[collab] doc:edit error:', err)
        ack?.({ ok: false, error: 'INTERNAL' })
      }
    }
  )

  // ----- doc:save -----------------------------------------------------------
  socket.on(
    'doc:save',
    async (
      payload: {
        documentId?: string
        content?: string
        title?: string
        source?: string
      },
      ack?: Ack
    ) => {
      try {
        const documentId = payload?.documentId
        if (!documentId) {
          ack?.({ ok: false, error: 'MISSING_DOCUMENT_ID' })
          return
        }
        const source = payload?.source && ['manual', 'autosave', 'restore'].includes(payload.source)
          ? payload.source
          : 'manual'

        const version = await db.documentVersion.create({
          data: {
            documentId,
            authorId: user.id,
            content: payload?.content ?? '',
            title: payload?.title ?? '',
            source,
          },
        })

        // Broadcast to the whole room (sender included — clients refresh version list).
        io.to(roomName(documentId)).emit('version:created', {
          documentId,
          versionId: version.id,
          authorId: user.id,
          authorName: user.name,
          source: version.source,
          createdAt: version.createdAt,
        })

        ack?.({ ok: true, versionId: version.id })
        console.log(`[collab] ${user.email} saved version ${version.id} (source=${source}) for doc ${documentId}`)
      } catch (err) {
        console.error('[collab] doc:save error:', err)
        ack?.({ ok: false, error: 'INTERNAL' })
      }
    }
  )

  // ----- version:restore ----------------------------------------------------
  socket.on(
    'version:restore',
    async (payload: { documentId?: string; versionId?: string }, ack?: Ack) => {
      try {
        const { documentId, versionId } = payload ?? {}
        if (!documentId || !versionId) {
          ack?.({ ok: false, error: 'MISSING_PARAMS' })
          return
        }
        const source = await db.documentVersion.findUnique({
          where: { id: versionId },
        })
        if (!source || source.documentId !== documentId) {
          ack?.({ ok: false, error: 'VERSION_NOT_FOUND' })
          return
        }

        // Apply the snapshot to the document.
        await db.document.update({
          where: { id: documentId },
          data: { content: source.content, title: source.title },
        })

        // Snapshot the restore as a NEW version (source = "restore").
        const newVersion = await db.documentVersion.create({
          data: {
            documentId,
            authorId: user.id,
            content: source.content,
            title: source.title,
            source: 'restore',
          },
        })

        const v = nextVersion(documentId)

        // Broadcast doc:patch to the whole room (restore replaces content for everyone,
        // including the user who triggered it).
        io.to(roomName(documentId)).emit('doc:patch', {
          documentId,
          title: source.title,
          content: source.content,
          version: v,
          byUserId: user.id,
        })

        io.to(roomName(documentId)).emit('version:created', {
          documentId,
          versionId: newVersion.id,
          authorId: user.id,
          authorName: user.name,
          source: newVersion.source,
          createdAt: newVersion.createdAt,
        })

        ack?.({ ok: true, versionId: newVersion.id })
        console.log(`[collab] ${user.email} restored doc ${documentId} from version ${versionId}`)
      } catch (err) {
        console.error('[collab] version:restore error:', err)
        ack?.({ ok: false, error: 'INTERNAL' })
      }
    }
  )

  // ----- disconnect ---------------------------------------------------------
  socket.on('disconnect', async (reason) => {
    console.log(`[collab] disconnected: ${user.email} (socket ${socket.id}, reason=${reason})`)
    try {
      const joined = Array.from(docIds)
      for (const docId of joined) {
        try {
          docPresence.get(docId)?.delete(socket.id)
          if (docPresence.get(docId)?.size === 0) docPresence.delete(docId)
          broadcastPresence(docId)
        } catch (e) {
          console.error(`[collab] disconnect cleanup error for doc ${docId}:`, e)
        }
      }
    } catch (err) {
      console.error('[collab] disconnect cleanup error:', err)
    }
  })

  socket.on('error', (err) => {
    console.error(`[collab] socket error (${socket.id}):`, err)
  })
})

// ---------------------------------------------------------------------------
// Heartbeat — every 30s, log a summary of active rooms. Presence cleanup is
// handled automatically by socket.io's disconnect event (ping/pong based), so
// no DB reaping is needed now that presence lives in memory.
// ---------------------------------------------------------------------------

setInterval(() => {
  let total = 0
  for (const [, sockets] of docPresence) total += sockets.size
  if (total > 0) {
    console.log(`[collab] heartbeat: ${total} active collaborator(s) across ${docPresence.size} doc(s)`)
  }
}, 30_000)

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log(`Collaboration service listening on :${PORT}`)
  console.log(`[collab] DATABASE_URL=${DATABASE_URL}`)
})

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string) {
  console.log(`[collab] received ${signal}, shutting down...`)
  try {
    await db.$disconnect()
  } catch {
    /* ignore */
  }
  httpServer.close(() => {
    console.log('[collab] server closed')
    process.exit(0)
  })
  // Force exit after 5s if close hangs.
  setTimeout(() => process.exit(0), 5_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Surface any uncaught errors so silent crashes are visible in the log.
process.on('uncaughtException', (err) => {
  console.error('[collab] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[collab] unhandledRejection:', reason)
})
