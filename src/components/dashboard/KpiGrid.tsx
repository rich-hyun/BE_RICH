import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Money, Pct } from '@/components/Money'
import type { GoalProgress, Kpis } from '@/lib/assets'
import { formatKDate } from '@/lib/date'
import { cn } from '@/lib/utils'

function Kpi({ label, children, sub, className }: { label: string; children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <Card className={cn('flex flex-col gap-1 p-4', className)}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="text-xl font-extrabold tracking-tight sm:text-[22px]">{children}</div>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </Card>
  )
}

export function KpiGrid({ kpis, goal, thisYear }: { kpis: Kpis; goal: GoalProgress | null; thisYear: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="현재 총자산" className="col-span-2 bg-primary text-primary-foreground lg:col-span-1 [&_p]:text-primary-foreground/80" sub={`${formatKDate(kpis.current.date)} 기준`}>
        <Money value={kpis.current.total} />
      </Kpi>
      <Kpi label="직전 월 대비 증감액" sub={kpis.prevMonth ? `${formatKDate(kpis.prevMonth.date)} 월대표값 대비` : '비교할 이전 월 기록 없음'}>
        <Money value={kpis.monthDelta} sign trend />
      </Kpi>
      <Kpi label="직전 월 대비 증감률" sub="월별 대표값(월 마지막 기록) 기준">
        <Pct value={kpis.monthDeltaRate} sign trend />
      </Kpi>
      <Kpi label="역대 최고 자산" sub={`${formatKDate(kpis.peak.date)} 기록`}>
        <Money value={kpis.peak.total} />
      </Kpi>
      <Kpi label="최초 기록 대비 증가액" sub={`최초 기록 ${formatKDate(kpis.first.date)}`}>
        <Money value={kpis.sinceFirst} sign trend />
      </Kpi>
      <Kpi label="최초 기록 대비 자산증가율" sub="저축·입출금 포함 (투자수익률 아님)">
        <Pct value={kpis.sinceFirstRate} sign trend />
      </Kpi>
      <Kpi
        label={`${thisYear}년 자산 증가액`}
        sub={
          kpis.ytdBase
            ? kpis.ytdBase.kind === 'prevYearEnd'
              ? `전년 마지막 기록(${formatKDate(kpis.ytdBase.date)}) 대비`
              : `올해 첫 기록(${formatKDate(kpis.ytdBase.date)}) 대비`
            : '올해 기록 없음'
        }
      >
        <Money value={kpis.ytd} sign trend />
      </Kpi>
      <Kpi label="목표 자산 달성률" sub={goal ? `${goal.goal.targetYear}년 목표 ${goal.goal.targetAmount.toLocaleString('ko-KR')}원` : '목표를 추가하세요'}>
        {goal ? (
          <div className="flex flex-col gap-1.5">
            <Pct value={goal.rate} digits={1} className={goal.achieved ? 'text-emerald-600 dark:text-emerald-400' : ''} />
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, goal.rate * 100)}%` }} />
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </Kpi>
    </div>
  )
}
