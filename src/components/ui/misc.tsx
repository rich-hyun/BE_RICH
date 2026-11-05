import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'sm',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  className?: string
  size?: 'sm' | 'xs'
}) {
  return (
    <div className={cn('inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-0.5', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'whitespace-nowrap rounded-md font-semibold text-muted-foreground transition-colors',
            size === 'sm' ? 'h-8 px-3 text-xs' : 'h-7 px-2 text-[11px]',
            value === o.value && 'bg-card text-foreground shadow-sm',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-1 rounded-full bg-accent p-3 text-accent-foreground">
        <Icon className="size-6" />
      </div>
      <p className="font-bold">{title}</p>
      {description && <div className="max-w-md text-sm text-muted-foreground">{description}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Notice({
  children,
  tone = 'info',
  className,
}: {
  children: ReactNode
  tone?: 'info' | 'warning' | 'danger'
  className?: string
}) {
  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div
      className={cn(
        'flex gap-2 rounded-lg px-3 py-2.5 text-xs leading-relaxed',
        tone === 'info' && 'bg-muted text-muted-foreground',
        tone === 'warning' && 'bg-amber-500/10 text-amber-800 dark:text-amber-200',
        tone === 'danger' && 'bg-destructive/10 text-destructive',
        className,
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  error?: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
      aria-hidden
    />
  )
}
