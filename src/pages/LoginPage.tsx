import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, Lock, TrendingUp, User } from 'lucide-react'
import { loginErrorMessage, useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/misc'

export function LoginPage() {
  const { login, forbiddenReason } = useAuth()
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!username.trim()) {
      setError('아이디를 입력해 주세요.')
      return
    }
    if (!password) {
      setError('비밀번호를 입력해 주세요.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await login(username, password, remember)
      setPassword('')
    } catch (err) {
      setError(loginErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border bg-card p-7 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="rounded-2xl bg-primary p-3 text-primary-foreground">
            <TrendingUp className="size-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">BE RICH</h1>
            <p className="mt-1 text-sm text-muted-foreground">개인 자산관리</p>
          </div>
        </div>

        <label htmlFor="username" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
          아이디
        </label>
        <div className="relative mb-4">
          <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="h-12 pl-9 text-base"
            disabled={busy}
          />
        </div>

        <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
          비밀번호
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            enterKeyHint="go"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 pl-9 pr-11 text-base"
            aria-invalid={!!error || undefined}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        {(error || forbiddenReason) && (
          <p role="alert" className="mt-2 text-sm font-medium text-destructive">
            {error ?? forbiddenReason}
          </p>
        )}

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          이 기기에서 로그인 유지
        </label>
        <p className="mt-1 pl-6 text-[11px] text-muted-foreground">
          체크하지 않으면 브라우저를 닫을 때 자동으로 로그아웃됩니다. 공용 기기에서는 체크하지 마세요.
        </p>

        <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? '확인 중…' : '로그인'}
        </Button>
      </form>
    </div>
  )
}
