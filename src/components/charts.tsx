import type { ReactNode } from 'react'
import { formatKRW, formatPct } from '@/lib/format'
import type { DisplayUnit } from '@/lib/types'

export const isoToTs = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
export const tsToLabel = (ts: number) => {
  const d = new Date(ts)
  return `${String(d.getUTCFullYear()).slice(2)}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
export const tsToFull = (ts: number) => {
  const d = new Date(ts)
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`
}

export const axisProps = {
  tick: { fontSize: 11, fill: 'var(--muted-foreground)' },
  tickLine: false,
  axisLine: false,
} as const

export const gridProps = { stroke: 'var(--chart-grid)', vertical: false } as const

interface TooltipEntry {
  name?: string | number
  value?: number | string | (number | string)[]
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

/** 금액 단위를 반영하는 공통 툴팁 */
export function MoneyTooltip({
  active,
  payload,
  label,
  unit,
  labelFormatter,
  extra,
  percentKeys,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  unit: DisplayUnit
  labelFormatter?: (l: string | number, p?: Record<string, unknown>) => ReactNode
  extra?: (p: Record<string, unknown>) => ReactNode
  percentKeys?: string[]
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload ?? {}
  return (
    <div className="min-w-40 rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold">{labelFormatter ? labelFormatter(label ?? '', p) : label}</p>
      {payload
        .filter((e) => e.value != null)
        .map((e) => (
          <div key={String(e.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: e.color }} />
              {e.name}
            </span>
            <span className="tabular font-semibold">
              {percentKeys?.includes(String(e.dataKey)) ? formatPct(Number(e.value)) : formatKRW(Number(e.value), unit)}
            </span>
          </div>
        ))}
      {extra?.(p)}
    </div>
  )
}

export const PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
]
