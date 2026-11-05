import { useMemo, useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckCircle2, Flag, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, Field, Notice, Spinner } from '@/components/ui/misc'
import { AmountInput } from '@/components/AmountInput'
import { Money, Pct, useUnit } from '@/components/Money'
import { axisProps, gridProps, isoToTs, MoneyTooltip, tsToFull } from '@/components/charts'
import { useData, firestoreErrorMessage } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { goalProgress, type MonthPoint } from '@/lib/assets'
import type { Goal } from '@/lib/types'
import { formatAmountInput, formatCompact, parseAmount } from '@/lib/format'

function GoalDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Goal | null }) {
  const { goals, saveGoal } = useData()
  const { toast } = useUi()
  const [year, setYear] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [err, setErr] = useState<{ year?: string; amount?: string }>({})
  const [saving, setSaving] = useState(false)
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setYear(editing ? String(editing.targetYear) : '')
      setAmount(editing ? formatAmountInput(String(editing.targetAmount)) : '')
      setMemo(editing?.memo ?? '')
      setErr({})
    }
  }

  const onSave = async () => {
    if (saving) return
    const y = Number(year)
    const a = parseAmount(amount)
    const e: typeof err = {}
    if (!Number.isInteger(y) || y < 2000 || y > 2100) e.year = '2000~2100 사이 연도를 입력하세요.'
    else if (goals.some((g) => g.targetYear === y && g.id !== editing?.id)) e.year = '이미 같은 연도의 목표가 있습니다. 기존 목표를 수정하세요.'
    if (a == null || Number.isNaN(a) || a <= 0) e.amount = '0보다 큰 금액을 입력하세요.'
    setErr(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      await saveGoal({ id: editing?.id, targetYear: y, targetAmount: a!, memo: memo.trim() })
      toast('목표를 저장했습니다.')
      onOpenChange(false)
    } catch (ex) {
      toast(`저장 실패: ${firestoreErrorMessage(ex)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? '목표 수정' : '목표 추가'}</DialogTitle>
          <DialogDescription>목표 연도 12월 31일까지 달성할 총자산을 입력하세요.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(ev) => {
            ev.preventDefault()
            void onSave()
          }}
        >
          <Field label="목표 연도" htmlFor="g-year" error={err.year}>
            <Input id="g-year" inputMode="numeric" placeholder="예: 2027" value={year} onChange={(ev) => setYear(ev.target.value.replace(/\D/g, '').slice(0, 4))} />
          </Field>
          <Field label="목표 자산" htmlFor="g-amt" error={err.amount} hint={amount ? `= ${formatCompact(parseAmount(amount) || 0)}원` : '예: 150,000,000'}>
            <AmountInput id="g-amt" value={amount} onChange={setAmount} invalid={!!err.amount} />
          </Field>
          <Field label="메모 (선택)" htmlFor="g-memo">
            <Input id="g-memo" value={memo} onChange={(ev) => setMemo(ev.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner />} 저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function GoalsSection({ months, current, today }: { months: MonthPoint[]; current: number | null; today: string }) {
  const { goals, deleteGoal } = useData()
  const { confirm, toast } = useUi()
  const unit = useUnit()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const sorted = useMemo(() => [...goals].sort((a, b) => a.targetYear - b.targetYear), [goals])
  const progress = sorted.map((g) => goalProgress(g, current ?? 0, today))

  const chartData = useMemo(() => {
    const actual = months.map((m) => ({ ts: isoToTs(m.date), actual: m.total }))
    const last = months[months.length - 1]
    const future = sorted.filter((g) => !last || `${g.targetYear}-12-31` > last.date)
    const path = last ? [{ ts: isoToTs(last.date), path: last.total }, ...future.map((g) => ({ ts: isoToTs(`${g.targetYear}-12-31`), path: g.targetAmount }))] : []
    const targets = sorted.map((g) => ({ ts: isoToTs(`${g.targetYear}-12-31`), target: g.targetAmount, year: g.targetYear }))
    return { actual, path, targets }
  }, [months, sorted])

  const onDelete = async (g: Goal) => {
    if (!(await confirm({ title: `${g.targetYear}년 목표를 삭제할까요?`, confirmText: '삭제', destructive: true }))) return
    try {
      await deleteGoal(g.id)
      toast('삭제했습니다.')
    } catch (e) {
      toast(`삭제 실패: ${firestoreErrorMessage(e)}`, 'error')
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>자산 목표</CardTitle>
          <CardDescription>필요 저축액은 수익률 0%를 가정한 단순 계산입니다.</CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
        >
          <Plus /> 목표 추가
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sorted.length === 0 ? (
          <EmptyState icon={Target} title="설정된 목표가 없습니다" description="예: 2027년 1억 5,000만 원, 2030년 3억 원처럼 연도별 목표를 추가해 보세요." />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {progress.map((p) => (
                <div key={p.goal.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="flex items-center gap-1.5 text-sm font-bold">
                        <Flag className="size-3.5" /> {p.goal.targetYear}년 목표
                        {p.achieved ? (
                          <Badge variant="success">
                            <CheckCircle2 className="size-3" /> 달성
                          </Badge>
                        ) : p.expired ? (
                          <Badge variant="destructive">기한 경과</Badge>
                        ) : (
                          <Badge variant="secondary">진행 중</Badge>
                        )}
                      </p>
                      <Money value={p.goal.targetAmount} className="text-lg font-extrabold" />
                    </div>
                    <div className="flex">
                      <Button variant="ghost" size="icon" aria-label="수정" onClick={() => { setEditing(p.goal); setOpen(true) }}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="삭제" onClick={() => onDelete(p.goal)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={p.achieved ? 'h-full bg-emerald-500' : 'h-full bg-primary'} style={{ width: `${Math.min(100, p.rate * 100)}%` }} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs">
                    <dt className="text-muted-foreground">달성률</dt>
                    <dd className="text-right font-semibold"><Pct value={p.rate} digits={1} /></dd>
                    <dt className="text-muted-foreground">부족 금액</dt>
                    <dd className="text-right font-semibold"><Money value={p.shortfall} /></dd>
                    <dt className="text-muted-foreground">남은 개월</dt>
                    <dd className="text-right font-semibold">{p.monthsLeft}개월</dd>
                    <dt className="text-muted-foreground">월평균 필요 저축</dt>
                    <dd className="text-right font-semibold">
                      {p.achieved ? '-' : p.requiredMonthly == null ? '기한 경과' : <Money value={p.requiredMonthly} />}
                    </dd>
                  </dl>
                  {p.goal.memo && <p className="mt-2 text-[11px] text-muted-foreground">{p.goal.memo}</p>}
                </div>
              ))}
            </div>
            {current == null && <Notice>자산 기록이 없어 달성률을 0%로 표시합니다.</Notice>}
            <div>
              <p className="mb-2 text-sm font-bold">실제 자산 vs 목표 경로</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t) => String(new Date(t).getUTCFullYear())} {...axisProps} allowDuplicatedCategory={false} minTickGap={30} />
                    <YAxis tickFormatter={formatCompact} width={56} {...axisProps} />
                    <Tooltip content={<MoneyTooltip unit={unit} labelFormatter={(l) => tsToFull(Number(l))} />} />
                    <Line data={chartData.actual} dataKey="actual" name="실제 자산(월대표)" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                    <Line data={chartData.path} dataKey="path" name="목표 경로" stroke="var(--chart-3)" strokeDasharray="6 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Scatter data={chartData.targets} dataKey="target" name="목표" fill="var(--chart-4)" isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-muted-foreground">목표 경로는 최근 기록에서 각 목표(목표 연도 말)까지 직선으로 연결한 참고선입니다.</p>
            </div>
          </>
        )}
      </CardContent>
      <GoalDialog open={open} onOpenChange={setOpen} editing={editing} />
    </Card>
  )
}
