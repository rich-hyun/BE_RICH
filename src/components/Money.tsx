import { useData } from '@/contexts/DataContext'
import { formatKRW, formatPct, trendClass } from '@/lib/format'
import type { DisplayUnit } from '@/lib/types'
import { cn } from '@/lib/utils'

export function useUnit(): DisplayUnit {
  return useData().settings.displayCurrency
}

/** 설정된 단위(원/만원/억원)로 금액 표시 */
export function Money({
  value,
  sign,
  trend,
  className,
  unit,
}: {
  value: number | null | undefined
  sign?: boolean
  trend?: boolean
  className?: string
  unit?: DisplayUnit
}) {
  const u = useUnit()
  return (
    <span className={cn('tabular', trend && trendClass(value), className)} title={value == null ? undefined : formatKRW(value, 'won', { sign })}>
      {formatKRW(value, unit ?? u, { sign })}
    </span>
  )
}

export function Pct({ value, sign, trend, className, digits }: { value: number | null | undefined; sign?: boolean; trend?: boolean; className?: string; digits?: number }) {
  return <span className={cn('tabular', trend && trendClass(value), className)}>{formatPct(value, { sign, digits })}</span>
}
