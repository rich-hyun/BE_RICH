import { ASSET_KEYS, type AssetRecord, type ChartRange, type Goal } from './types'
import { addMonths, monthKey, monthsBetween, yearOf } from './date'

export function totalOf(r: Pick<AssetRecord, 'isa' | 'brokerage' | 'crypto' | 'gold' | 'cash'>): number {
  return ASSET_KEYS.reduce((s, k) => s + (r[k] || 0), 0)
}

export interface ComputedRecord extends AssetRecord {
  total: number
  prevTotal: number | null
  delta: number | null // 직전 기록 대비 증감액
  deltaRate: number | null // 직전 기록 대비 증감률 (비율)
  isMonthRepresentative: boolean // 해당 월의 마지막 기록인지
}

/** 실제 날짜 기준 오름차순 정렬 후 직전 기록 대비 증감 계산 (저장 순서와 무관) */
export function computeRecords(records: AssetRecord[]): ComputedRecord[] {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  const lastOfMonth = new Map<string, string>()
  for (const r of sorted) lastOfMonth.set(monthKey(r.date), r.date)
  let prev: number | null = null
  return sorted.map((r) => {
    const total = totalOf(r)
    const delta = prev == null ? null : total - prev
    const deltaRate = prev == null || prev === 0 ? null : (total - prev) / prev
    const out: ComputedRecord = {
      ...r,
      total,
      prevTotal: prev,
      delta,
      deltaRate,
      isMonthRepresentative: lastOfMonth.get(monthKey(r.date)) === r.date,
    }
    prev = total
    return out
  })
}

export interface MonthPoint {
  month: string // YYYY-MM
  date: string // 대표 기록일 (해당 월 마지막 기록)
  total: number
  record: ComputedRecord
  delta: number | null // 직전 '기록이 있는 월' 대비
  deltaRate: number | null
}

/** 월별 대표값 = 해당 월의 마지막 기록일 */
export function monthlyRepresentatives(computed: ComputedRecord[]): MonthPoint[] {
  const reps = computed.filter((r) => r.isMonthRepresentative)
  let prev: number | null = null
  return reps.map((r) => {
    const p: MonthPoint = {
      month: monthKey(r.date),
      date: r.date,
      total: r.total,
      record: r,
      delta: prev == null ? null : r.total - prev,
      deltaRate: prev == null || prev === 0 ? null : (r.total - prev) / prev,
    }
    prev = r.total
    return p
  })
}

export interface YearPoint {
  year: number
  date: string // 연말 기준 기록 (해당 연도 마지막 기록)
  total: number
  delta: number | null // 전년도 마지막 기록 대비
  deltaRate: number | null
  isPartial: boolean // 진행 중인 연도
}

export function yearlySummary(computed: ComputedRecord[], todayIso: string): YearPoint[] {
  const lastOfYear = new Map<number, ComputedRecord>()
  for (const r of computed) lastOfYear.set(yearOf(r.date), r)
  const years = [...lastOfYear.keys()].sort((a, b) => a - b)
  let prev: number | null = null
  return years.map((y) => {
    const r = lastOfYear.get(y)!
    const p: YearPoint = {
      year: y,
      date: r.date,
      total: r.total,
      delta: prev == null ? null : r.total - prev,
      deltaRate: prev == null || prev === 0 ? null : (r.total - prev) / prev,
      isPartial: y >= yearOf(todayIso),
    }
    prev = r.total
    return p
  })
}

export function rangeStart(range: ChartRange, lastIso: string): string | null {
  switch (range) {
    case '3m':
      return addMonths(lastIso, -3)
    case '6m':
      return addMonths(lastIso, -6)
    case '1y':
      return addMonths(lastIso, -12)
    case '3y':
      return addMonths(lastIso, -36)
    default:
      return null
  }
}

export interface Kpis {
  current: ComputedRecord
  monthDelta: number | null // 직전 월 대비 (월별 대표값 기준)
  monthDeltaRate: number | null
  prevMonth: MonthPoint | null
  sinceFirst: number
  sinceFirstRate: number | null
  first: ComputedRecord
  peak: ComputedRecord
  ytd: number | null // 현재 연도 증가액
  ytdBase: { date: string; total: number; kind: 'prevYearEnd' | 'firstOfYear' } | null
}

export function computeKpis(computed: ComputedRecord[], todayIso: string): Kpis | null {
  if (computed.length === 0) return null
  const current = computed[computed.length - 1]
  const first = computed[0]
  const months = monthlyRepresentatives(computed)
  const lastMonth = months[months.length - 1]
  const prevMonth = months.length >= 2 ? months[months.length - 2] : null
  const peak = computed.reduce((a, b) => (b.total > a.total ? b : a))
  const thisYear = yearOf(todayIso)
  const prevYearEnd = [...computed].reverse().find((r) => yearOf(r.date) < thisYear)
  const firstOfYear = computed.find((r) => yearOf(r.date) === thisYear)
  let ytdBase: Kpis['ytdBase'] = null
  if (prevYearEnd) ytdBase = { date: prevYearEnd.date, total: prevYearEnd.total, kind: 'prevYearEnd' }
  else if (firstOfYear) ytdBase = { date: firstOfYear.date, total: firstOfYear.total, kind: 'firstOfYear' }
  const ytd = ytdBase && yearOf(current.date) === thisYear ? current.total - ytdBase.total : null
  return {
    current,
    monthDelta: prevMonth ? lastMonth.total - prevMonth.total : null,
    monthDeltaRate: prevMonth && prevMonth.total !== 0 ? (lastMonth.total - prevMonth.total) / prevMonth.total : null,
    prevMonth,
    sinceFirst: current.total - first.total,
    sinceFirstRate: first.total !== 0 ? (current.total - first.total) / first.total : null,
    first,
    peak,
    ytd,
    ytdBase,
  }
}

export interface GoalProgress {
  goal: Goal
  current: number
  rate: number // 달성률 (0~)
  shortfall: number // 부족 금액 (달성 시 0)
  monthsLeft: number // 목표 연도 12월까지 남은 개월 수 (이번 달 제외)
  requiredMonthly: number | null // 월평균 필요 추가 저축액 (수익률 0% 가정)
  achieved: boolean
  expired: boolean
}

export function goalProgress(goal: Goal, current: number, todayIso: string): GoalProgress {
  const deadline = `${goal.targetYear}-12-31`
  const monthsLeft = Math.max(0, monthsBetween(todayIso, deadline))
  const shortfall = Math.max(0, goal.targetAmount - current)
  const achieved = current >= goal.targetAmount
  const expired = !achieved && todayIso > deadline
  return {
    goal,
    current,
    rate: goal.targetAmount > 0 ? current / goal.targetAmount : 0,
    shortfall,
    monthsLeft,
    requiredMonthly: achieved ? 0 : monthsLeft > 0 ? Math.ceil(shortfall / monthsLeft) : null,
    achieved,
    expired,
  }
}

/** 지금 추적해야 할 목표: 아직 지나지 않은 목표 중 가장 가까운 연도 */
export function activeGoal(goals: Goal[], todayIso: string): Goal | null {
  const y = yearOf(todayIso)
  const upcoming = goals.filter((g) => g.targetYear >= y).sort((a, b) => a.targetYear - b.targetYear)
  return upcoming[0] ?? null
}

export interface SimPoint {
  year: number // 경과 연수
  contributed: number // 초기 자산 + 누적 추가 투자금
  [scenario: string]: number
}

/**
 * 월 복리 시뮬레이션. 매월 말 추가 투자금 납입.
 * 월 수익률 = (1 + 연수익률)^(1/12) - 1
 */
export function simulate(
  initial: number,
  monthly: number,
  years: number,
  scenarios: { key: string; annualRate: number }[],
): SimPoint[] {
  const months = Math.round(years * 12)
  const values = scenarios.map(() => initial)
  const rates = scenarios.map((s) => Math.pow(1 + s.annualRate / 100, 1 / 12) - 1)
  const out: SimPoint[] = []
  const push = (m: number) => {
    const p: SimPoint = { year: m / 12, contributed: Math.round(initial + monthly * m) }
    scenarios.forEach((s, i) => (p[s.key] = Math.round(values[i])))
    out.push(p)
  }
  push(0)
  for (let m = 1; m <= months; m++) {
    for (let i = 0; i < values.length; i++) values[i] = values[i] * (1 + rates[i]) + monthly
    if (m % 12 === 0 || m === months) push(m)
  }
  return out
}
