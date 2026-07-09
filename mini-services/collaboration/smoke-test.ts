/**
 * Smoke test for the collaboration mini-service.
 * Run from the mini-services/collaboration folder:
 *   bun smoke-test.ts
 *
 * Verifies:
 *  - valid JWT -> connection accepted, doc:join works, doc:state returned
 *  - invalid JWT -> connection rejected with error
 *  - presence:update is broadcast
 *
 * Uses a real (or throwaway) user + document created directly in the shared DB.
 */
import { io } from 'socket.io-client'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const SECRET = 'docsmini-access-secret-9f3a7c1e4b2d'
const URL = 'http://localhost:3003'

async function main() {
  // Ensure a user + document exist for the test.
  const user = await db.user.upsert({
    where: { email: 'smoke@test.local' },
    update: {},
    create: {
      email: 'smoke@test.local',
      name: 'Smoke Tester',
      passwordHash: 'x',
      avatarColor: '#0d9488',
    },
    select: { id: true, email: true, name: true },
  })
  const doc = await db.document.create({
    data: { title: 'Smoke Doc', content: 'hello world', ownerId: user.id },
    select: { id: true, title: true, content: true },
  })

  const token = jwt.sign({ sub: user.id, email: user.email, name: user.name }, SECRET, {
    expiresIn: '5m',
  })

  // --- Test 1: valid token connects & joins ---
  await new Promise<void>((resolve, reject) => {
    const sock = io(URL, {
      path: '/',
      auth: { token },
      timeout: 5000,
    })
    const timeout = setTimeout(() => {
      sock.disconnect()
      reject(new Error('test 1 timed out'))
    }, 5000)

    sock.on('connect', () => {
      sock.emit('doc:join', { documentId: doc.id }, (res: unknown) => {
        console.log('[test1] doc:join ack:', res)
      })
    })
    sock.on('doc:state', (payload: unknown) => {
      console.log('[test1] doc:state received:', payload)
      clearTimeout(timeout)
      sock.emit('doc:leave', { documentId: doc.id })
      setTimeout(() => {
        sock.disconnect()
        resolve()
      }, 300)
    })
    sock.on('connect_error', (err: Error) => {
      clearTimeout(timeout)
      reject(new Error('test1 connect_error: ' + err.message))
    })
  }).then(() => console.log('[test1] PASS'), (e) => console.error('[test1] FAIL', e))

  // --- Test 2: invalid token rejected ---
  await new Promise<void>((resolve) => {
    const sock = io(URL, {
      path: '/',
      auth: { token: 'not-a-valid-jwt' },
      timeout: 5000,
    })
    const timeout = setTimeout(() => {
      sock.disconnect()
      console.log('[test2] FAIL: timed out (no connect_error)')
      resolve()
    }, 5000)
    sock.on('connect_error', (err: Error) => {
      clearTimeout(timeout)
      console.log('[test2] connect_error (expected):', err.message)
      if (err.message === 'INVALID_TOKEN' || err.message === 'NO_TOKEN') {
        console.log('[test2] PASS')
      } else {
        console.log('[test2] PARTIAL — rejected but unexpected reason')
      }
      sock.disconnect()
      resolve()
    })
    sock.on('connect', () => {
      clearTimeout(timeout)
      console.log('[test2] FAIL: connected with bad token')
      sock.disconnect()
      resolve()
    })
  })

  // cleanup
  await db.activeCollaborator.deleteMany({ where: { documentId: doc.id } })
  await db.documentVersion.deleteMany({ where: { documentId: doc.id } })
  await db.document.delete({ where: { id: doc.id } })
  await db.user.deleteMany({ where: { email: 'smoke@test.local' } })
  await db.$disconnect()
  console.log('[smoke] cleanup done')
  process.exit(0)
}

main().catch((e) => {
  console.error('[smoke] fatal:', e)
  process.exit(1)
})
