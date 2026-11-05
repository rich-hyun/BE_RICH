import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { History } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/misc'
import { Money, Pct } from '@/components/Money'
import { axisProps, gridProps, PALETTE } from '@/components/charts'
import { useData } from '@/contexts/DataContext'
import { analyzePortfolio, snapshotTrend } from '@/lib/portfolio'
import { UNCLASSIFIED, isSemiIndustry, type Holding } from '@/lib/types'
import { formatKDate, formatKMonth, shortMonth } from '@/lib/date'
import { formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'


export function HistoryPanel({ current, previous }: { current: { date: string; holdings: Holding[] }; previous: { date: string; holdings: Holding[] } | null }) {
  const { holdings, compositions, settings } = useData()
  const trend = useMemo(() => snapshotTrend(holdings, compositions, settings.riskThresholds), [holdings, compositions, settings.riskThresholds])
  // 사용자가 입력한 업종 이름들 (분류 미확인은 맨 뒤)
  const IND_KEYS = [...new Set(trend.flatMap((t) => Object.keys(t.industries)))].sort((a, b) => (a === UNCLASSIFIED ? 1 : b === UNCLASSIFIED ? -1 : 0))
  const trendData = trend.map((t) => ({
    month: t.month,
    date: t.date,
    semi: t.semiconductorShare * 100,
    ...Object.fromEntries(IND_KEYS.map((k) => [k, (t.industries[k] ?? 0) * 100])),
  }))
  const usedInds = IND_KEYS.filter((k) => trend.some((t) => (t.industries[k] ?? 0) > 0))

  const compare = useMemo(() => {
    if (!previous) return null
    const a = analyzePortfolio(current.holdings, compositions, settings.riskThresholds)
    const b = analyzePortfolio(previous.holdings, compositions, settings.riskThresholds)
    const keys = new Set([...a.byHolding.map((x) => x.key), ...b.byHolding.map((x) => x.key)])
    const rows = [...keys].map((k) => {
      const x = a.byHolding.find((h) => h.key === k)
      const y = b.byHolding.find((h) => h.key === k)
      return { key: k, name: x?.name ?? y?.name ?? k, now: x?.share ?? 0, before: y?.share ?? 0, nowV: x?.value ?? 0, beforeV: y?.value ?? 0 }
    })
    rows.sort((p, q) => q.now - p.now || q.before - p.before)
    const semiNow = a.total ? a.themes.semiconductorTotal / a.total : 0
    const semiBefore = b.total ? b.themes.semiconductorTotal / b.total : 0
    return { rows, totalNow: a.total, totalBefore: b.total, semiNow, semiBefore }
  }, [current, previous, compositions, settings.riskThresholds])

  if (trend.length === 0) return <EmptyState icon={History} title="스냅샷이 없습니다" description="보유 종목을 입력하면 기준일별 스냅샷으로 저장됩니다." />

  return (
    <div className="flex flex-col gap-5">
      {compare && previous ? (
        <Card>
          <CardHeader>
            <CardTitle>직전 스냅샷 대비 비중 변화</CardTitle>
            <CardDescription>
              {formatKDate(previous.date)} → {formatKDate(current.date)} · 과거 스냅샷은 저장 당시의 평가금액을 그대로 사용합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="mb-3 flex flex-wrap gap-4 text-sm">
              <span>
                총 평가금액 <Money value={compare.totalBefore} /> → <Money value={compare.totalNow} className="font-bold" />
              </span>
              <span>
                반도체 노출 {formatPct(compare.semiBefore, { digits: 1 })} → <b>{formatPct(compare.semiNow, { digits: 1 })}</b>{' '}
                <Pct value={compare.semiNow - compare.semiBefore} sign trend digits={1} className="text-xs" />p
              </span>
            </div>
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-left font-semibold">종목</th>
                  <th className="py-2 text-right font-semibold">이전 비중</th>
                  <th className="py-2 text-right font-semibold">현재 비중</th>
                  <th className="py-2 text-right font-semibold">변화</th>
                </tr>
              </thead>
              <tbody>
                {compare.rows.map((r) => (
                  <tr key={r.key} className="border-b last:border-0">
                    <td className="py-2">{r.name}</td>
                    <td className="py-2 text-right tabular">{formatPct(r.before, { digits: 1 })}</td>
                    <td className="py-2 text-right font-semibold tabular">{formatPct(r.now, { digits: 1 })}</td>
                    <td className={cn('py-2 text-right')}>
                      <Pct value={r.now - r.before} sign trend digits={1} />p
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">비교할 이전 스냅샷이 없습니다. ‘새 스냅샷’으로 다음 달 구성을 기록하면 변화를 비교할 수 있습니다.</p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>월별 업종 비중 추이</CardTitle>
            <CardDescription>각 월의 마지막 스냅샷 기준</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="month" tickFormatter={shortMonth} {...axisProps} />
                <YAxis tickFormatter={(v) => `${v}%`} width={40} domain={[0, 100]} {...axisProps} />
                <Tooltip
                  formatter={(v) => `${Number(v).toFixed(1)}%`}
                  labelFormatter={(l) => formatKMonth(String(l))}
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {usedInds.map((k, i) => (
                  <Bar key={k} dataKey={k} stackId="a" fill={k === UNCLASSIFIED ? 'var(--chart-8)' : isSemiIndustry(k) ? 'var(--chart-4)' : PALETTE[i % 7]} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>월별 반도체 노출 비중</CardTitle>
            <CardDescription>업종 이름에 ‘반도체’가 들어간 비중 (직접 보유 + ETF 내부)</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="month" tickFormatter={shortMonth} {...axisProps} />
                <YAxis tickFormatter={(v) => `${v}%`} width={40} domain={[0, 'auto']} {...axisProps} />
                <Tooltip
                  formatter={(v) => `${Number(v).toFixed(1)}%`}
                  labelFormatter={(l) => formatKMonth(String(l))}
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                />
                <Line dataKey="semi" name="반도체 노출" stroke="var(--chart-4)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
