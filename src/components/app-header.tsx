'use client'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FileText, LogOut, LayoutDashboard, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useAuthStore } from '@/stores/auth-store'
import { useUiStore } from '@/stores/ui-store'
import { api } from '@/lib/api-client'
import { disconnectCollab } from '@/lib/socket-client'
import { toast } from 'sonner'

export function AppHeader({ rightSlot }: { rightSlot?: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const goAuth = useUiStore((s) => s.goAuth)
  const goDashboard = useUiStore((s) => s.goDashboard)
  const { theme, setTheme } = useTheme()

  async function handleLogout() {
    try {
      await api.post('/api/auth/logout')
    } catch {
      /* ignore */
    }
    disconnectCollab()
    logout()
    goAuth()
    toast.success('از حساب خارج شدید')
  }

  const initials = (user?.name || user?.email || 'U').slice(0, 2).toUpperCase()

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-3">
        <button
          onClick={goDashboard}
          className="flex items-center gap-2 font-bold text-primary"
        >
          <FileText className="size-5" />
          <span className="hidden sm:inline">DocsMini</span>
        </button>

        <div className="flex items-center gap-2">
          {rightSlot}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="تغییر تم"
          >
            <Sun className="size-4 dark:hidden" />
            <Moon className="size-4 hidden dark:block" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring">
                <Avatar
                  className="size-8 border-2"
                  style={{ borderColor: user?.avatarColor }}
                >
                  <AvatarFallback
                    className="text-xs font-bold text-white"
                    style={{ backgroundColor: user?.avatarColor }}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.name}</p>
                  <p className="text-xs leading-none text-muted-foreground" dir="ltr">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={goDashboard}>
                <LayoutDashboard className="size-4 ml-2" />
                داشبورد
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="size-4 ml-2" />
                خروج
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
