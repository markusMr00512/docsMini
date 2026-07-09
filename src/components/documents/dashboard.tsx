'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, FileText, Trash2, Clock, Loader2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useUiStore } from '@/stores/ui-store'
import { toast } from 'sonner'

interface DocListItem {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
  versionCount: number
}

function relativeTime(iso: string) {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'همین حالا'
  if (min < 60) return `${toFa(min)} دقیقه پیش`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${toFa(hr)} ساعت پیش`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${toFa(day)} روز پیش`
  return d.toLocaleDateString('fa-IR')
}
function toFa(n: number) {
  return n.toLocaleString('fa-IR')
}
function preview(text: string) {
  const t = text.replace(/\n/g, ' ').trim()
  return t.length > 90 ? t.slice(0, 90) + '…' : t || 'بدون محتوا'
}

export function Dashboard() {
  const goEditor = useUiStore((s) => s.goEditor)
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get<{ documents: DocListItem[] }>('/api/documents'),
  })

  const createMutation = useMutation({
    mutationFn: (t: string) => api.post<{ document: DocListItem }>('/api/documents', { title: t }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      setOpen(false)
      setTitle('')
      toast.success('سند جدید ساخته شد')
      goEditor(res.document.id)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      toast.success('سند حذف شد')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  async function handleCreate() {
    const t = title.trim() || 'بدون عنوان'
    setCreating(true)
    try {
      await createMutation.mutateAsync(t)
    } finally {
      setCreating(false)
    }
  }

  const docs = data?.documents ?? []

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-6xl w-full px-4 py-8">
        <div className="flex items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-bold">اسناد من</h1>
            <p className="text-sm text-muted-foreground">
              سندهای همکارانه خود را مدیریت کنید.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4 ml-2" />
            سند جدید
          </Button>
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <Card className="border-dashed py-16 flex flex-col items-center justify-center gap-3 text-center">
            <div className="size-14 rounded-full bg-muted flex items-center justify-center">
              <FileText className="size-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">هنوز سندی ندارید</p>
              <p className="text-sm text-muted-foreground">
                اولین سند همکارانه خود را بسازید.
              </p>
            </div>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4 ml-2" />
              ساخت سند
            </Button>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {docs.map((doc) => (
              <Card
                key={doc.id}
                className="group p-4 hover:shadow-md transition-shadow cursor-pointer relative"
                onClick={() => goEditor(doc.id)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FileText className="size-5" />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteMutation.mutate(doc.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1"
                    aria-label="حذف سند"
                  >
                    {deleteMutation.isPending && deleteMutation.variables === doc.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                </div>
                <h3 className="font-semibold truncate mb-1">{doc.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                  {preview(doc.content)}
                </p>
                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {relativeTime(doc.updatedAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="size-3" />
                    {toFa(doc.versionCount)} نسخه
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>سند جدید</DialogTitle>
            <DialogDescription>یک عنوان برای سند خود وارد کنید.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً: یادداشت جلسه"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="size-4 animate-spin ml-2" />}
              ساخت سند
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="mt-auto border-t py-4 text-center text-xs text-muted-foreground">
        DocsMini · ویرایشگر همکارانه اسناد
      </footer>
    </div>
  )
}
