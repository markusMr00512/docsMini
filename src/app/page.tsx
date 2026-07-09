'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useUiStore } from '@/stores/ui-store'
import { AuthView } from '@/components/auth/auth-view'
import { Dashboard } from '@/components/documents/dashboard'
import { Editor } from '@/components/editor/editor'
import { FileText, Loader2 } from 'lucide-react'

export default function Page() {
  const status = useAuthStore((s) => s.status)
  const view = useUiStore((s) => s.view)

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="size-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
          <FileText className="size-6" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          در حال بارگذاری…
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <AuthView />
  }

  // authenticated
  if (view.name === 'editor') {
    return <Editor documentId={view.documentId} />
  }
  return <Dashboard />
}
