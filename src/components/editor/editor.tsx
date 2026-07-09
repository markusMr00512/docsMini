'use client'

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  ArrowRight,
  History,
  Loader2,
  Save,
  Share2,
  Users,
  CheckCircle2,
  CloudUpload,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import { useUiStore } from '@/stores/ui-store'
import { useAuthStore } from '@/stores/auth-store'
import {
  getCollabSocket,
  collab,
  type Collaborator,
} from '@/lib/socket-client'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

interface DocData {
  id: string
  title: string
  content: string
  updatedAt: string
}
interface VersionItem {
  id: string
  content: string
  title: string
  source: string
  createdAt: string
  author: { id: string; name: string | null; avatarColor: string }
}

type SaveStatus = 'idle' | 'saving' | 'saved'

function toFa(n: number) {
  return n.toLocaleString('fa-IR')
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('fa-IR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
const sourceLabel: Record<string, string> = {
  manual: 'دستی',
  autosave: 'خودکار',
  restore: 'بازیابی',
}

export function Editor({ documentId }: { documentId: string }) {
  const goDashboard = useUiStore((s) => s.goDashboard)
  const me = useAuthStore((s) => s.user)

  const [doc, setDoc] = useState<DocData | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)

  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [remoteCursors, setRemoteCursors] = useState<
    Record<string, { cursor: number; selectionEnd: number }>
  >({})

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [viewVersion, setViewVersion] = useState<VersionItem | null>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  // refs to avoid stale closures in socket handlers
  const contentRef = useRef('')
  const versionRef = useRef(0)
  const lastLocalEditAt = useRef(0)
  const applyingRemote = useRef(false)
  contentRef.current = content
  versionRef.current = version

  // ---- load document ----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const data = await api.get<{ document: DocData }>(`/api/documents/${documentId}`)
        if (cancelled) return
        setDoc(data.document)
        setTitle(data.document.title)
        setContent(data.document.content)
      } catch (e) {
        toast.error((e as Error).message)
        goDashboard()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [documentId, goDashboard])

  // ---- connect socket + join room ----
  useEffect(() => {
    if (loading || !doc) return
    const socket = getCollabSocket()
    if (!socket) return

    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    if (socket.connected) setConnected(true)
    // Safety net: if the connect event already fired before the listener was
    // attached, re-check after a short delay.
    const recheck = setTimeout(() => {
      if (socket.connected) setConnected(true)
    }, 1500)
    // Bulletproof: poll the real socket state so the badge always reflects
    // the truth regardless of event-listener timing (Strict Mode, reconnects).
    const poll = setInterval(() => {
      setConnected(socket.connected)
    }, 2000)

    // Join and use server state as source of truth
    collab.join(documentId).then((state) => {
      // A successful join implies the socket is connected.
      setConnected(true)
      setTitle(state.title)
      setContent(state.content)
      setVersion((v) => v)
    }).catch(() => {
      // fallback to REST state already loaded
    })

    const onPresence = (p: { documentId: string; collaborators: Collaborator[] }) => {
      if (p.documentId !== documentId) return
      // Filter out THIS socket's own entry (id is the socket id, not user id,
      // so two tabs of the same account each see the other as a collaborator).
      const selfId = socket.id
      setCollaborators(p.collaborators.filter((c) => c.id !== selfId))
      setRemoteCursors((prev) => {
        const next: typeof prev = {}
        for (const c of p.collaborators) {
          if (c.id !== selfId) next[c.id] = { cursor: c.cursor, selectionEnd: c.selectionEnd }
        }
        return next
      })
    }
    const onCursor = (p: {
      documentId: string
      userId: string
      name: string | null
      avatarColor: string
      cursor: number
      selectionEnd: number
    }) => {
      if (p.documentId !== documentId) return
      setRemoteCursors((prev) => ({ ...prev, [p.userId]: { cursor: p.cursor, selectionEnd: p.selectionEnd } }))
      setCollaborators((prev) => {
        const exists = prev.some((c) => c.id === p.userId)
        const newItem: Collaborator = {
          id: p.userId,
          name: p.name,
          avatarColor: p.avatarColor,
          cursor: p.cursor,
          selectionEnd: p.selectionEnd,
        }
        return exists ? prev.map((c) => (c.id === p.userId ? newItem : c)) : [...prev, newItem]
      })
    }
    const onPatch = (p: { documentId: string; title?: string; content: string; version: number; byUserId: string }) => {
      if (p.documentId !== documentId) return
      if (p.version > versionRef.current) {
        applyingRemote.current = true
        // preserve cursor by offset (clamped)
        const ta = textareaRef.current
        let selStart = ta?.selectionStart ?? 0
        let selEnd = ta?.selectionEnd ?? 0
        if (p.title !== undefined && p.title !== titleRef.current?.value) {
          setTitle(p.title)
        }
        setContent(p.content)
        setVersion(p.version)
        requestAnimationFrame(() => {
          if (ta) {
            const len = p.content.length
            ta.selectionStart = Math.min(selStart, len)
            ta.selectionEnd = Math.min(selEnd, len)
          }
          applyingRemote.current = false
        })
      }
    }
    const onVersionCreated = (p: { documentId: string; versionId: string; authorName: string | null; source: string }) => {
      if (p.documentId !== documentId) return
      // refresh version list lazily when panel open
      if (versionsOpen) refreshVersions()
    }

    collab.on('presence:update', onPresence)
    collab.on('cursor:update', onCursor)
    collab.on('doc:patch', onPatch)
    collab.on('version:created', onVersionCreated)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      collab.off('presence:update', onPresence)
      collab.off('cursor:update', onCursor)
      collab.off('doc:patch', onPatch)
      collab.off('version:created', onVersionCreated)
      collab.leave(documentId)
      clearTimeout(recheck)
      clearInterval(poll)
    }
  }, [loading, doc, documentId, me?.id])

  // ---- debounced broadcast of edits (last-write-wins) ----
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const broadcastEdit = useCallback(
    (nextContent: string, nextTitle?: string) => {
      lastLocalEditAt.current = Date.now()
      const newVersion = versionRef.current + 1
      setVersion(newVersion)
      if (editTimer.current) clearTimeout(editTimer.current)
      editTimer.current = setTimeout(() => {
        collab.sendEdit(documentId, {
          content: contentRef.current,
          title: nextTitle,
          version: newVersion,
        })
      }, 200)
    },
    [documentId]
  )

  const onContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setContent(val)
    setSaveStatus('saving')
    broadcastEdit(val)
    scheduleAutosave()
    emitCursor(e.target)
  }

  const onTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setTitle(val)
    setSaveStatus('saving')
    broadcastEdit(contentRef.current, val)
    scheduleAutosave()
  }

  // ---- cursor broadcast (throttled) ----
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emitCursor = (ta: HTMLTextAreaElement) => {
    if (cursorTimer.current) return // throttle within frame
    cursorTimer.current = setTimeout(() => {
      cursorTimer.current = null
    }, 80)
    collab.sendCursor(documentId, ta.selectionStart, ta.selectionEnd)
  }
  const onCursorActivity = () => {
    if (textareaRef.current) emitCursor(textareaRef.current)
  }

  // ---- auto-save (debounced 2.5s) ----
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleAutosave = () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(async () => {
      try {
        await api.post(`/api/documents/${documentId}/versions`, {
          content: contentRef.current,
          title: titleRef.current?.value ?? '',
          source: 'autosave',
        })
        collab.saveVersion(documentId, { content: contentRef.current, title: titleRef.current?.value ?? '', source: 'autosave' })
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        setSaveStatus('idle')
      }
    }, 2500)
  }

  // ---- manual save ----
  const manualSave = async () => {
    setSaveStatus('saving')
    try {
      await api.post(`/api/documents/${documentId}/versions`, {
        content: contentRef.current,
        title: titleRef.current?.value ?? '',
        source: 'manual',
      })
      collab.saveVersion(documentId, { content: contentRef.current, title: titleRef.current?.value ?? '', source: 'manual' })
      setSaveStatus('saved')
      toast.success('نسخه ذخیره شد')
      setTimeout(() => setSaveStatus('idle'), 2000)
      if (versionsOpen) refreshVersions()
    } catch (e) {
      toast.error((e as Error).message)
      setSaveStatus('idle')
    }
  }

  // ---- versions ----
  const refreshVersions = useCallback(async () => {
    try {
      const data = await api.get<{ versions: VersionItem[] }>(`/api/documents/${documentId}/versions`)
      setVersions(data.versions)
    } catch {
      /* ignore */
    }
  }, [documentId])

  useEffect(() => {
    if (versionsOpen) refreshVersions()
  }, [versionsOpen, refreshVersions])

  const restoreVersion = async (v: VersionItem) => {
    try {
      const data = await api.post<{ document: DocData; version: VersionItem }>(
        `/api/documents/${documentId}/versions/${v.id}`
      )
      setTitle(data.document.title)
      setContent(data.document.content)
      setVersion((x) => x + 1)
      collab.restoreVersion(documentId, v.id)
      toast.success('نسخه بازیابی شد')
      setViewVersion(null)
      refreshVersions()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // ---- remote caret positions via mirror overlay ----
  const [caretPixels, setCaretPixels] = useState<
    { id: string; name: string | null; color: string; x: number; y: number; selectionEnd: number }[]
  >([])
  useLayoutEffect(() => {
    if (!mirrorRef.current || !textareaRef.current) return
    const ta = textareaRef.current
    const mirror = mirrorRef.current
    // sync styles
    const cs = window.getComputedStyle(ta)
    mirror.style.font = cs.font
    mirror.style.lineHeight = cs.lineHeight
    mirror.style.letterSpacing = cs.letterSpacing
    mirror.style.padding = cs.padding
    mirror.style.width = `${ta.clientWidth}px`
    mirror.style.boxSizing = 'border-box'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.wordBreak = cs.wordBreak
    mirror.style.overflowWrap = cs.overflowWrap

    const carets: typeof caretPixels = []
    for (const [id, pos] of Object.entries(remoteCursors)) {
      const collabUser = collaborators.find((c) => c.id === id)
      if (!collabUser) continue
      const offset = Math.min(pos.cursor, content.length)
      const before = content.slice(0, offset)
      // build mirror with a marker span at offset
      mirror.textContent = ''
      const textNode = document.createTextNode(before)
      const marker = document.createElement('span')
      marker.textContent = '\u200b'
      mirror.appendChild(textNode)
      mirror.appendChild(marker)
      const mRect = marker.getBoundingClientRect()
      const cRect = mirror.getBoundingClientRect()
      carets.push({
        id,
        name: collabUser.name,
        color: collabUser.avatarColor,
        x: mRect.left - cRect.left,
        y: mRect.top - cRect.top,
        selectionEnd: pos.selectionEnd,
      })
    }
    mirror.textContent = ''
    setCaretPixels(carets)
  }, [remoteCursors, content, collaborators])

  // cleanup autosave on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      if (editTimer.current) clearTimeout(editTimer.current)
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppHeader />
        <div className="mx-auto max-w-4xl w-full px-4 py-8 space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  const collaboratorList = [...collaborators]

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        rightSlot={
          <div className="flex items-center gap-2">
            <SaveStatusBadge status={saveStatus} connected={connected} />
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const url = `${window.location.origin}/#doc=${documentId}`
                try {
                  await navigator.clipboard.writeText(url)
                  toast.success('لینک همکاری کپی شد')
                } catch {
                  toast.error('کپی لینک ناموفق بود')
                }
              }}
            >
              <Share2 className="size-4 ml-2" />
              <span className="hidden sm:inline">اشتراک‌گذاری</span>
            </Button>
            <Sheet open={versionsOpen} onOpenChange={setVersionsOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <History className="size-4 ml-2" />
                  <span className="hidden sm:inline">تاریخچه</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-full sm:max-w-md p-0">
                <SheetHeader className="px-4 py-3 border-b">
                  <SheetTitle className="flex items-center gap-2">
                    <History className="size-4" />
                    تاریخچه نسخه‌ها
                  </SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-3.5rem)]">
                  <div className="p-3 space-y-2">
                    {versions.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        هنوز نسخه‌ای ذخیره نشده است.
                      </p>
                    )}
                    {versions.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setViewVersion(v)}
                        className="w-full text-right rounded-lg border p-3 hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs text-muted-foreground">{fmtTime(v.createdAt)}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {sourceLabel[v.source] ?? v.source}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-5" style={{ borderColor: v.author.avatarColor }}>
                            <AvatarFallback
                              className="text-[10px] text-white"
                              style={{ backgroundColor: v.author.avatarColor }}
                            >
                              {(v.author.name || '?').slice(0, 1)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground">{v.author.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
            <Button size="sm" onClick={manualSave} disabled={saveStatus === 'saving'}>
              {saveStatus === 'saving' ? (
                <Loader2 className="size-4 animate-spin ml-1" />
              ) : (
                <Save className="size-4 ml-1" />
              )}
              <span className="hidden sm:inline">ذخیره</span>
            </Button>
          </div>
        }
      />

      {/* Presence bar */}
      <div className="border-b bg-muted/30">
        <div className="mx-auto max-w-4xl w-full px-4 py-2 flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={goDashboard} className="text-muted-foreground">
            <ArrowRight className="size-4 ml-1" />
            بازگشت
          </Button>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <div className="flex -space-x-2 space-x-reverse">
              {me && (
                <Avatar className="size-7 border-2 border-background" style={{ borderColor: me.avatarColor }}>
                  <AvatarFallback className="text-[10px] text-white" style={{ backgroundColor: me.avatarColor }}>
                    {(me.name || 'U').slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
              )}
              {collaboratorList.map((c) => (
                <Avatar
                  key={c.id}
                  className="size-7 border-2 border-background"
                  style={{ borderColor: c.avatarColor }}
                  title={c.name ?? 'کاربر'}
                >
                  <AvatarFallback className="text-[10px] text-white" style={{ backgroundColor: c.avatarColor }}>
                    {(c.name || '?').slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {toFa(collaboratorList.length + 1)} همکار
            </span>
          </div>
        </div>
      </div>

      {/* Editor surface */}
      <main className="flex-1 mx-auto max-w-4xl w-full px-4 py-6">
        <Input
          ref={titleRef}
          value={title}
          onChange={onTitleChange}
          placeholder="عنوان سند"
          className="text-2xl font-bold border-0 px-0 focus-visible:ring-0 mb-3 h-auto"
        />

        <div className="relative rounded-xl border bg-card overflow-hidden shadow-sm">
          {/* mirror overlay for remote carets */}
          <div
            ref={mirrorRef}
            aria-hidden
            className="absolute inset-0 pointer-events-none overflow-hidden text-transparent"
            style={{ padding: '1rem' }}
          />
          {/* remote caret markers */}
          <AnimatePresence>
            {caretPixels.map((c) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute pointer-events-none z-10"
                style={{
                  top: `calc(1rem + ${c.y}px)`,
                  left: `calc(1rem + ${c.x}px)`,
                }}
              >
                <div
                  className="w-0.5 h-5 animate-pulse"
                  style={{ backgroundColor: c.color }}
                />
                <div
                  className="absolute -top-5 -translate-x-1/2 whitespace-nowrap text-[10px] text-white px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: c.color }}
                >
                  {c.name ?? 'کاربر'}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={onContentChange}
            onKeyUp={onCursorActivity}
            onClick={onCursorActivity}
            onSelect={onCursorActivity}
            placeholder="نوشتن را اینجا شروع کنید…"
            className="relative z-20 w-full min-h-[60vh] resize-y bg-transparent px-4 py-4 outline-none text-base leading-8 scroll-thin"
            dir="rtl"
            spellCheck={false}
          />
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          {toFa(content.length)} کاراکتر · آخرین به‌روزرسانی{' '}
          {doc ? fmtTime(doc.updatedAt) : '—'}
        </p>
      </main>

      <footer className="mt-auto border-t py-4 text-center text-xs text-muted-foreground">
        DocsMini · ویرایشگر همکارانه لحظه‌ای
      </footer>

      {/* Version preview dialog */}
      <Dialog open={!!viewVersion} onOpenChange={(o) => !o && setViewVersion(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>پیش‌نمایش نسخه</DialogTitle>
          </DialogHeader>
          {viewVersion && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{fmtTime(viewVersion.createdAt)}</span>
                <Badge variant="secondary">{sourceLabel[viewVersion.source]}</Badge>
              </div>
              <Separator />
              <pre className="whitespace-pre-wrap text-sm bg-muted/40 rounded-lg p-3 max-h-[50vh] overflow-auto scroll-thin">
                {viewVersion.content || '— خالی —'}
              </pre>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewVersion(null)}>
              بستن
            </Button>
            <Button onClick={() => viewVersion && restoreVersion(viewVersion)}>
              بازیابی این نسخه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SaveStatusBadge({ status, connected }: { status: SaveStatus; connected: boolean }) {
  if (!connected) {
    return (
      <Badge variant="outline" className="text-muted-foreground gap-1">
        <WifiOff className="size-3" />
        <span className="hidden sm:inline">آفلاین</span>
      </Badge>
    )
  }
  if (status === 'saving') {
    return (
      <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1">
        <CloudUpload className="size-3 animate-pulse" />
        <span className="hidden sm:inline">در حال ذخیره…</span>
      </Badge>
    )
  }
  if (status === 'saved') {
    return (
      <Badge variant="outline" className="text-emerald-600 border-emerald-300 gap-1">
        <CheckCircle2 className="size-3" />
        <span className="hidden sm:inline">ذخیره شد</span>
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1">
      <Wifi className="size-3" />
      <span className="hidden sm:inline">متصل</span>
    </Badge>
  )
}
