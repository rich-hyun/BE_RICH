import { useMemo, useState } from 'react'
import { CopyPlus, Pencil, PieChart, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, Field, Notice, Spinner } from '@/components/ui/misc'
import { Money, Pct } from '@/components/Money'
import { HoldingFormDialog } from '@/components/portfolio/HoldingFormDialog'
import { AllocationPanel, ConcentrationPanel, IndustryPanel, ThemePanel } from '@/components/portfolio/AnalysisPanels'
import { HistoryPanel } from '@/components/portfolio/HistoryPanel'
import { CompositionsPanel } from '@/components/portfolio/CompositionsPanel'
import { ReconcileCard } from '@/components/portfolio/ReconcileCard'
import { useData, firestoreErrorMessage } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { analyzePortfolio, snapshotDates } from '@/lib/portfolio'
import { ACCOUNT_LABELS, HOLDING_TYPE_LABELS, type AccountType, type Holding } from '@/lib/types'
import { formatKDate, isValidISODate, todayKST } from '@/lib/date'

function NewSnapshotDialog({ open, onOpenChange, from, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; from: { date: string; holdings: Holding[] } | null; onCreated: (d: string) => void }) {
  const { holdings, saveHoldings } = useData()
  const { toast } = useUi()
  const [date, setDate] = useState(todayKST())
  const [copy, setCopy] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const exists = holdings.some((h) => h.snapshotDate === date)

  const create = async () => {
    if (busy) return
    if (!isValidISODate(date)) return setErr('날짜를 선택하세요.')
    if (exists) return setErr('이미 이 날짜의 스냅샷이 있습니다. 목록에서 선택해 수정하세요.')
    setErr('')
    if (copy && from && from.holdings.length) {
      setBusy(true)
      try {
        // 과거 스냅샷은 그대로 두고 새 문서로 복사 (평가금액은 새 기준일 값으로 수정 필요)
        await saveHoldings(
          from.holdings.map((h) => {
            const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = h
            void _id
            void _c
            void _u
            return { ...rest, snapshotDate: date }
          }),
        )
        toast(`${formatKDate(date)} 스냅샷을 만들었습니다. 평가금액을 새 기준일 값으로 수정하세요.`)
      } catch (e) {
        toast(`생성 실패: ${firestoreErrorMessage(e)}`, 'error')
        setBusy(false)
        return
      }
      setBusy(false)
    }
    onCreated(date)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 스냅샷 만들기</DialogTitle>
          <DialogDescription>월말 등 특정 기준일의 보유 종목 구성을 별도로 저장합니다. 기존 스냅샷은 변경되지 않습니다.</DialogDescription>
        </DialogHeader>
        <Field label="기준일" error={err}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {from && from.holdings.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} className="accent-[var(--primary)]" />
            {formatKDate(from.date)} 스냅샷의 종목 {from.holdings.length}개를 복사해서 시작
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={create} disabled={busy}>
            {busy && <Spinner />} 만들기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function PortfolioPage() {
  const { holdings, compositions, settings, deleteHoldings } = useData()
  const { confirm, toast } = useUi()
  const dates = useMemo(() => snapshotDates(holdings), [holdings])
  const [selected, setSelected] = useState<string | null>(null)
  // 선택한 기준일(새로 만든 빈 스냅샷 포함) → 없으면 최신 스냅샷 → 없으면 오늘
  const date = selected ?? dates[0] ?? todayKST()
  const current = useMemo(() => holdings.filter((h) => h.snapshotDate === date), [holdings, date])
  const prevDate = dates.find((d) => d < date) ?? null
  const previous = prevDate ? { date: prevDate, holdings: holdings.filter((h) => h.snapshotDate === prevDate) } : null
  const analysis = useMemo(() => analyzePortfolio(current, compositions, settings.riskThresholds), [current, compositions, settings.riskThresholds])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Holding | null>(null)
  const [snapOpen, setSnapOpen] = useState(false)
  const hasSample = current.some((h) => h.isSample)

  const deleteSnapshot = async () => {
    const ok = await confirm({
      title: `${formatKDate(date)} 스냅샷을 삭제할까요?`,
      description: `이 기준일의 보유 종목 ${current.length}개가 모두 삭제됩니다. 되돌릴 수 없습니다.`,
      confirmText: '삭제',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteHoldings(current.map((h) => h.id))
      setSelected(null)
      toast('스냅샷을 삭제했습니다.')
    } catch (e) {
      toast(`삭제 실패: ${firestoreErrorMessage(e)}`, 'error')
    }
  }

  const deleteOne = async (h: Holding) => {
    if (!(await confirm({ title: `‘${h.name}’을(를) 삭제할까요?`, description: `${formatKDate(h.snapshotDate)} 스냅샷에서만 삭제됩니다.`, confirmText: '삭제', destructive: true }))) return
    try {
      await deleteHoldings([h.id])
      toast('삭제했습니다.')
    } catch (e) {
      toast(`삭제 실패: ${firestoreErrorMessage(e)}`, 'error')
    }
  }

  const byAccount = (['brokerage', 'isa'] as AccountType[]).map((acc) => ({
    acc,
    items: current.filter((h) => h.accountType === acc).sort((a, b) => b.marketValue - a.marketValue),
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">보유 종목 · 산업 비중</h1>
          <p className="mt-1 text-sm text-muted-foreground">ETF 내부 구성까지 반영해 국가·업종·반도체/AI 노출과 집중도를 확인합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {dates.length > 0 && (
            <Select value={date} onChange={(e) => setSelected(e.target.value)} className="w-44" aria-label="스냅샷 기준일">
              {!dates.includes(date) && <option value={date}>{formatKDate(date)} (새 스냅샷)</option>}
              {dates.map((d) => (
                <option key={d} value={d}>
                  {formatKDate(d)} 스냅샷
                </option>
              ))}
            </Select>
          )}
          <Button variant="outline" onClick={() => setSnapOpen(true)}>
            <CopyPlus /> 새 스냅샷
          </Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
            <Plus /> 종목 추가
          </Button>
        </div>
      </div>

      {holdings.length === 0 && current.length === 0 ? (
        <EmptyState
          icon={PieChart}
          title="보유 종목이 없습니다"
          description="증권사 앱에서 확인한 종목별 평가금액을 입력하세요. 여러 종목을 한 번에 넣으려면 상단 ‘백업·내보내기 → JSON 복원’을 사용할 수 있습니다."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
                <Plus /> 종목 추가
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {hasSample && (
            <Notice tone="warning">
              이 스냅샷에는 <b>예시 데이터</b>가 포함되어 있습니다(‘예시’ 배지). 실제 보유 내역으로 수정하거나 삭제하세요. 예시 데이터는 월별 자산 기록에 반영되지 않습니다.
            </Notice>
          )}
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>{formatKDate(date)} 보유 종목</CardTitle>
                <CardDescription>
                  {current.length}개 종목 · 총 평가금액 <Money value={analysis.total} className="font-semibold text-foreground" />
                </CardDescription>
              </div>
              {current.length > 0 && (
                <Button variant="ghost" size="sm" onClick={deleteSnapshot}>
                  <Trash2 /> 스냅샷 삭제
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {current.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">이 기준일에 등록된 종목이 없습니다. ‘종목 추가’를 눌러 입력하세요.</p>}
              {byAccount
                .filter((g) => g.items.length)
                .map((g) => {
                  const sum = g.items.reduce((s, h) => s + h.marketValue, 0)
                  return (
                    <div key={g.acc}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-bold">{ACCOUNT_LABELS[g.acc]}</span>
                        <Money value={sum} className="font-semibold" />
                      </div>
                      <ul className="divide-y rounded-xl border">
                        {g.items.map((h) => {
                          const pnl = h.costBasis != null && h.costBasis > 0 ? (h.marketValue - h.costBasis) / h.costBasis : null
                          return (
                            <li key={h.id} className="flex items-center gap-3 px-3 py-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                                  {h.name}
                                  {h.isSample && <Badge variant="warning">예시</Badge>}
                                  {!h.symbol && h.assetType !== 'stock' && <Badge variant="destructive">코드 미입력</Badge>}
                                </p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {[h.symbol, HOLDING_TYPE_LABELS[h.assetType], h.country, h.industry, h.quantity != null ? `${h.quantity.toLocaleString('ko-KR')}주` : null].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                              <div className="text-right">
                                <Money value={h.marketValue} className="block text-sm font-bold" />
                                <span className="text-[11px] text-muted-foreground">
                                  <Pct value={analysis.total ? h.marketValue / analysis.total : 0} digits={1} />
                                  {pnl != null && (
                                    <>
                                      {' · 매입대비 '}
                                      <Pct value={pnl} sign trend digits={1} />
                                    </>
                                  )}
                                </span>
                              </div>
                              <div className="flex">
                                <Button variant="ghost" size="icon" aria-label="수정" onClick={() => { setEditing(h); setFormOpen(true) }}>
                                  <Pencil />
                                </Button>
                                <Button variant="ghost" size="icon" aria-label="삭제" onClick={() => deleteOne(h)}>
                                  <Trash2 />
                                </Button>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
            </CardContent>
          </Card>

          {current.length > 0 && <ReconcileCard date={date} holdings={current} />}

          <Tabs defaultValue="allocation">
            <TabsList>
              <TabsTrigger value="allocation">자산 배분</TabsTrigger>
              <TabsTrigger value="industry">업종 분석</TabsTrigger>
              <TabsTrigger value="theme">AI·반도체 테마</TabsTrigger>
              <TabsTrigger value="concentration">집중도</TabsTrigger>
              <TabsTrigger value="history">월별 기록</TabsTrigger>
              <TabsTrigger value="etf">ETF 구성비</TabsTrigger>
            </TabsList>
            {current.length === 0 ? (
              <>
                {['allocation', 'industry', 'theme', 'concentration'].map((v) => (
                  <TabsContent key={v} value={v}>
                    <p className="py-10 text-center text-sm text-muted-foreground">이 스냅샷에 종목이 없어 분석할 수 없습니다.</p>
                  </TabsContent>
                ))}
              </>
            ) : (
              <>
                <TabsContent value="allocation">
                  <AllocationPanel a={analysis} />
                </TabsContent>
                <TabsContent value="industry">
                  <IndustryPanel a={analysis} />
                </TabsContent>
                <TabsContent value="theme">
                  <ThemePanel a={analysis} />
                </TabsContent>
                <TabsContent value="concentration">
                  <ConcentrationPanel a={analysis} />
                </TabsContent>
              </>
            )}
            <TabsContent value="history">
              <HistoryPanel current={{ date, holdings: current }} previous={previous} />
            </TabsContent>
            <TabsContent value="etf">
              <CompositionsPanel />
            </TabsContent>
          </Tabs>
        </>
      )}

      <HoldingFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} snapshotDate={date} />
      <NewSnapshotDialog open={snapOpen} onOpenChange={setSnapOpen} from={current.length ? { date, holdings: current } : null} onCreated={(d) => setSelected(d)} />
    </div>
  )
}
