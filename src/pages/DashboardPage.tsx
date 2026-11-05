import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { LineChart } from 'lucide-react'
import { EmptyState, Notice } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { CompositionChart, MonthlyDeltaChart, TotalChart, YearlyChart } from '@/components/dashboard/TrendCharts'
import { GoalsSection } from '@/components/dashboard/GoalsSection'
import { SimulationSection } from '@/components/dashboard/SimulationSection'
import { useData } from '@/contexts/DataContext'
import { activeGoal, computeKpis, computeRecords, goalProgress, monthlyRepresentatives, yearlySummary } from '@/lib/assets'
import { todayKST, yearOf } from '@/lib/date'

export default function DashboardPage() {
  const { records, goals } = useData()
  const today = todayKST()
  const computed = useMemo(() => computeRecords(records), [records])
  const months = useMemo(() => monthlyRepresentatives(computed), [computed])
  const years = useMemo(() => yearlySummary(computed, today), [computed, today])
  const kpis = useMemo(() => computeKpis(computed, today), [computed, today])
  const goal = activeGoal(goals, today)
  const gp = goal && kpis ? goalProgress(goal, kpis.current.total, today) : null

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">자산 추이 · 목표 분석</h1>
        <p className="mt-1 text-sm text-muted-foreground">월별·연도별 자산 변화와 목표 달성 상황을 확인합니다.</p>
      </div>

      {!kpis ? (
        <EmptyState
          icon={LineChart}
          title="분석할 자산 기록이 없습니다"
          description="월별 자산 관리 페이지에서 기록을 추가하면 이곳에 추이와 KPI가 표시됩니다."
          action={
            <Button asChild>
              <Link to="/records">기록하러 가기</Link>
            </Button>
          }
        />
      ) : (
        <>
          <KpiGrid kpis={kpis} goal={gp} thisYear={yearOf(today)} />
          <Notice>
            여기서 표시하는 증가액·증가율은 <b>평가자산의 변화</b>로, 저축·입출금·계좌 간 이동이 모두 포함됩니다. 투자 수익률(순수 운용 성과)과는 다릅니다.
          </Notice>
          <TotalChart computed={computed} />
          <div className="grid gap-5 lg:grid-cols-2">
            <CompositionChart computed={computed} />
            <MonthlyDeltaChart months={months} />
          </div>
          <YearlyChart years={years} />
        </>
      )}
      <GoalsSection months={months} current={kpis?.current.total ?? null} today={today} />
      <SimulationSection currentTotal={kpis?.current.total ?? 0} />
    </div>
  )
}
