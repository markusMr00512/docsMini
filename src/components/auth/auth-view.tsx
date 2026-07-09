'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { FileText, Loader2, Sparkles } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useUiStore } from '@/stores/ui-store'
import { ApiError } from '@/lib/api-client'
import { toast } from 'sonner'

export function AuthView() {
  const setAuth = useAuthStore((s) => s.setAuth)
  const goDashboard = useUiStore((s) => s.goDashboard)
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)

  // shared fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrors({})
    try {
      const url = tab === 'login' ? '/api/auth/login' : '/api/auth/register'
      const payload =
        tab === 'login' ? { email, password } : { name, email, password }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.fields) setErrors(data.fields)
        throw new Error(data.error ?? 'خطا')
      }
      setAuth(data.user, data.accessToken)
      toast.success(tab === 'login' ? 'خوش آمدید!' : 'حساب کاربری شما ساخته شد')
      goDashboard()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 grid lg:grid-cols-2">
        {/* Hero / branding panel */}
        <section className="hidden lg:flex flex-col justify-between p-10 bg-primary text-primary-foreground relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]" />
          <div className="relative flex items-center gap-2 text-lg font-bold">
            <FileText className="size-7" />
            <span>DocsMini</span>
          </div>
          <div className="relative space-y-4 max-w-md">
            <h1 className="text-3xl font-extrabold leading-snug">
              ویرایشگر اسناد همکارانه و لحظه‌ای
            </h1>
            <p className="text-primary-foreground/80 leading-7">
              سندهایتان را به‌صورت زنده با دیگران ویرایش کنید، نسخه‌ها را ذخیره و
              بازیابی کنید و حضور همکارانتان را ببینید — همه با پشتیبانی کامل
              از فارسی و راست‌چین.
            </p>
            <ul className="space-y-2 text-sm text-primary-foreground/90">
              <li className="flex items-center gap-2">
                <Sparkles className="size-4" /> هم‌نویسی لحظه‌ای و نشانگرهای زنده
              </li>
              <li className="flex items-center gap-2">
                <Sparkles className="size-4" /> تاریخچه نسخه‌ها و بازیابی
              </li>
              <li className="flex items-center gap-2">
                <Sparkles className="size-4" /> ذخیره خودکار و امن با JWT
              </li>
            </ul>
          </div>
          <div className="relative text-xs text-primary-foreground/60">
            ساخته‌شده با Next.js 16، Prisma و Socket.io
          </div>
        </section>

        {/* Form panel */}
        <section className="flex items-center justify-center p-6 sm:p-10">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader className="text-center space-y-2">
              <div className="lg:hidden mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <FileText className="size-6" />
              </div>
              <CardTitle className="text-2xl">ورود به DocsMini</CardTitle>
              <CardDescription>
                برای ادامه، وارد حساب خود شوید یا حساب جدید بسازید.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'register')}>
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login">ورود</TabsTrigger>
                  <TabsTrigger value="register">ثبت‌نام</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={submit} className="space-y-4">
                    <Field
                      id="email"
                      label="ایمیل"
                      type="email"
                      value={email}
                      onChange={setEmail}
                      placeholder="you@example.com"
                      error={errors.email}
                      dir="ltr"
                    />
                    <Field
                      id="password"
                      label="رمز عبور"
                      type="password"
                      value={password}
                      onChange={setPassword}
                      placeholder="••••••••"
                      error={errors.password}
                      dir="ltr"
                    />
                    <SubmitButton loading={loading} label="ورود" />
                  </form>
                </TabsContent>

                <TabsContent value="register">
                  <form onSubmit={submit} className="space-y-4">
                    <Field
                      id="name"
                      label="نام"
                      value={name}
                      onChange={setName}
                      placeholder="نام شما"
                      error={errors.name}
                    />
                    <Field
                      id="email"
                      label="ایمیل"
                      type="email"
                      value={email}
                      onChange={setEmail}
                      placeholder="you@example.com"
                      error={errors.email}
                      dir="ltr"
                    />
                    <Field
                      id="password"
                      label="رمز عبور"
                      type="password"
                      value={password}
                      onChange={setPassword}
                      placeholder="حداقل ۶ کاراکتر"
                      error={errors.password}
                      dir="ltr"
                    />
                    <SubmitButton loading={loading} label="ساخت حساب" />
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  dir,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  error?: string
  dir?: 'ltr' | 'rtl'
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={dir}
        className={error ? 'border-destructive' : ''}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <Button type="submit" className="w-full" disabled={loading}>
      {loading && <Loader2 className="size-4 animate-spin ml-2" />}
      {label}
    </Button>
  )
}
