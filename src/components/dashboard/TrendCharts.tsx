import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Segmented } from '@/components/ui/misc'
import { Money, Pct, useUnit } from '@/components/Money'
import { axisProps, gridProps, isoToTs, MoneyTooltip, tsToFull, tsToLabel } from '@/components/charts'
import { useData } from '@/contexts/DataContext'
import { rangeStart, type ComputedRecord, type MonthPoint, type YearPoint } from '@/lib/assets'
import { ASSET_COLORS, ASSET_KEYS, ASSET_LABELS, type AssetKey, type ChartRange } from '@/lib/types'
import { formatCompact } from '@/lib/format'
import { formatKMonth, shortMonth } from '@/lib/date'
import { cn } from '@/lib/utils'

const RANGES: { value: ChartRange; label: string }[] = [
  { value: '3m', label: '3개월' },
  { value: '6m', label: '6개월' },
  { value: '1y', label: '1년' },
  { value: '3y', label: '3년' },
  { value: 'all', label: '전체' },
]

function useRanged(computed: ComputedRecord[], range: ChartRange) {
  return useMemo(() => {
    if (!computed.length) return []
    const start = rangeStart(range, computed[computed.length - 1].date)
    return computed.filter((r) => !start || r.date >= start).map((r) => ({ ...r, ts: isoToTs(r.date) }))
  }, [computed, range])
}

/** 그래프 A: 총자산 변화 */
export function TotalChart({ computed }: { computed: ComputedRecord[] }) {
  const { settings, updateSettings } = useData()
  const unit = useUnit()
  const range = settings.preferredChartRange
  const data = useRanged(computed, range)
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>총자산 변화</CardTitle>
          <CardDescription>모든 기록일 기준</CardDescription>
        </div>
        <Segmented value={range} onChange={(v) => void updateSettings({ preferredChartRange: v })} options={RANGES} />
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tsToLabel} {...axisProps} minTickGap={24} />
            <YAxis tickFormatter={formatCompact} width={56} domain={['auto', 'auto']} {...axisProps} />
            <Tooltip content={<MoneyTooltip unit={unit} labelFormatter={(l) => tsToFull(Number(l))} />} />
            <Line type="monotone" dataKey="total" name="총자산" stroke="var(--chart-1)" strokeWidth={2.5} dot={data.length < 40 ? { r: 3 } : false} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

/** 그래프 B: 자산 유형별 변화 (누적 영역) */
export function CompositionChart({ computed }: { computed: ComputedRecord[] }) {
  const unit = useUnit()
  const { settings } = useData()
  const data = useRanged(computed, settings.preferredChartRange)
  const [hidden, setHidden] = useState<Set<AssetKey>>(new Set())
  const toggle = (k: AssetKey) =>
    setHidden((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  return (
    <Card>
      <CardHeader>
        <CardTitle>자산 유형별 변화</CardTitle>
        <CardDescription>항목을 눌러 표시/숨김 · 기간은 총자산 그래프와 같음</CardDescription>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ASSET_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              aria-pressed={!hidden.has(k)}
              className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', hidden.has(k) && 'opacity-40')}
            >
              <span className="size-2.5 rounded-full" style={{ background: ASSET_COLORS[k] }} />
              {ASSET_LABELS[k]}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tsToLabel} {...axisProps} minTickGap={24} />
            <YAxis tickFormatter={formatCompact} width={56} {...axisProps} />
            <Tooltip content={<MoneyTooltip unit={unit} labelFormatter={(l) => tsToFull(Number(l))} />} />
            {ASSET_KEYS.filter((k) => !hidden.has(k)).map((k) => (
              <Area key={k} type="monotone" dataKey={k} name={ASSET_LABELS[k]} stackId="1" stroke={ASSET_COLORS[k]} fill={ASSET_COLORS[k]} fillOpacity={0.55} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

/** 그래프 C: 월별 자산 증감 (월 대표값 기준) */
export function MonthlyDeltaChart({ months }: { months: MonthPoint[] }) {
  const unit = useUnit()
  const data = months.filter((m) => m.delta != null).slice(-24)
  return (
    <Card>
      <CardHeader>
        <CardTitle>월별 자산 증감</CardTitle>
        <CardDescription>각 월의 마지막 기록(월 대표값) 기준, 직전 기록 월 대비 · 최근 24개월</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">2개월 이상의 기록이 필요합니다.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" tickFormatter={shortMonth} {...axisProps} />
              <YAxis tickFormatter={formatCompact} width={56} {...axisProps} />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Tooltip
                cursor={{ fill: 'var(--muted)' }}
                content={
                  <MoneyTooltip
                    unit={unit}
                    labelFormatter={(l) => formatKMonth(String(l))}
                    extra={(p) => (
                      <p className="mt-1 text-muted-foreground">
                        증감률 <Pct value={p.deltaRate as number} sign trend />
                      </p>
                    )}
                  />
                }
              />
              <Bar dataKey="delta" name="증감액" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.month} fill={(d.delta ?? 0) >= 0 ? 'var(--up)' : 'var(--down)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

/** 그래프 D: 연도별 자산 성장 (매년 마지막 기록 기준) */
export function YearlyChart({ years }: { years: YearPoint[] }) {
  const unit = useUnit()
  return (
    <Card>
      <CardHeader>
        <CardTitle>연도별 자산 성장</CardTitle>
        <CardDescription>매년 마지막 기록 기준 (진행 중인 연도는 현재까지)</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={years} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="year" {...axisProps} />
              <YAxis tickFormatter={formatCompact} width={56} {...axisProps} />
              <Tooltip cursor={{ fill: 'var(--muted)' }} content={<MoneyTooltip unit={unit} labelFormatter={(l) => `${l}년 말`} />} />
              <Bar dataKey="total" name="연말 자산" fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {years.map((y) => (
                  <Cell key={y.year} fillOpacity={y.isPartial ? 0.55 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="w-full self-start text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 text-left font-semibold">연도</th>
              <th className="py-2 text-right font-semibold">연말 자산</th>
              <th className="py-2 text-right font-semibold">증가액</th>
              <th className="py-2 text-right font-semibold">증가율</th>
            </tr>
          </thead>
          <tbody>
            {[...years].reverse().map((y) => (
              <tr key={y.year} className="border-b last:border-0">
                <td className="py-2 font-semibold">
                  {y.year}
                  {y.isPartial && <span className="ml-1 text-[11px] font-normal text-muted-foreground">(진행 중)</span>}
                </td>
                <td className="py-2 text-right">
                  <Money value={y.total} />
                </td>
                <td className="py-2 text-right">
                  <Money value={y.delta} sign trend />
                </td>
                <td className="py-2 text-right">
                  <Pct value={y.deltaRate} sign trend digits={1} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
