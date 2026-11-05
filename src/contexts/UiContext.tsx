import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, XCircle, Info } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ConfirmOptions {
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  destructive?: boolean
}

interface UiValue {
  toast: (message: string, tone?: ToastTone) => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

const UiContext = createContext<UiValue | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const seq = useRef(0)
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('be-rich-theme', theme)
    } catch {
      /* 저장 불가 환경 무시 */
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101113' : '#ffffff')
  }, [theme])

  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, tone, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3000)
  }, [])

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    [],
  )

  const close = (v: boolean) => {
    confirmState?.resolve(v)
    setConfirmState(null)
  }

  const value = useMemo(
    () => ({ toast, confirm, theme, toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }),
    [toast, confirm, theme],
  )

  return (
    <UiContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? XCircle : Info
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex max-w-md items-start gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900"
            >
              <Icon className={cn('mt-0.5 size-4 shrink-0', t.tone === 'success' && 'text-emerald-400 dark:text-emerald-600', t.tone === 'error' && 'text-red-400 dark:text-red-600')} />
              <span>{t.message}</span>
            </div>
          )
        })}
      </div>
      <Dialog open={!!confirmState} onOpenChange={(o) => !o && close(false)}>
        {confirmState && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirmState.title}</DialogTitle>
              {confirmState.description && <DialogDescription asChild><div>{confirmState.description}</div></DialogDescription>}
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                {confirmState.cancelText ?? '취소'}
              </Button>
              <Button variant={confirmState.destructive ? 'destructive' : 'default'} onClick={() => close(true)} autoFocus>
                {confirmState.confirmText ?? '확인'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </UiContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUi() {
  const ctx = useContext(UiContext)
  if (!ctx) throw new Error('useUi must be used within UiProvider')
  return ctx
}
