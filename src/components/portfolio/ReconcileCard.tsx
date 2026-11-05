import { Scale } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/misc'
import { Money } from '@/components/Money'
import { useData, firestoreErrorMessage } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { reconcile } from '@/lib/portfolio'
import type { Holding } from '@/lib/types'
import { formatKDate } from '@/lib/date'
import { useAuth } from '@/contexts/AuthContext'
import { formatKRW } from '@/lib/format'

const LABEL = { isa: 'ISA계좌', brokerage: '일반계좌' } as const

/** 페이지 1(계좌 잔액)과 페이지 3(보유 종목 합계) 비교 — 같은 기준일일 때만 */
export function ReconcileCard({ date, holdings }: { date: string; holdings: Holding[] }) {
  const { records, saveRecord } = useData()
  const { canEdit } = useAuth()
  const { confirm, toast } = useUi()
  const record = records.find((r) => r.date === date) ?? null
  const result = reconcile(holdings, record)

  const apply = async () => {
    if (!record || !result) return
    const isa = result.find((r) => r.account === 'isa')!.holdingsSum
    const brokerage = result.find((r) => r.account === 'brokerage')!.holdingsSum
    const ok = await confirm({
      title: '월별 자산 기록의 계좌 잔액을 덮어쓸까요?',
      description: (
        <span>
          {formatKDate(date)} 기록의 ISA계좌를 {formatKRW(record.isa)} → {formatKRW(isa)}, 일반계좌를 {formatKRW(record.brokerage)} → {formatKRW(brokerage)}로 바꿉니다.
          계좌 안의 예수금(현금)이 있다면 잔액이 실제보다 작아질 수 있습니다.
        </span>
      ),
      confirmText: '덮어쓰기',
      destructive: true,
    })
    if (!ok) return
    try {
      await saveRecord({ ...record, isa, brokerage }, record.id)
      toast('월별 자산 기록을 업데이트했습니다.')
    } catch (e) {
      toast(`저장 실패: ${firestoreErrorMessage(e)}`, 'error')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Scale className="size-4" /> 계좌 잔액 대조
        </CardTitle>
        <CardDescription>같은 기준일의 월별 자산 기록(계좌 잔액)과 보유 종목 평가금액 합계를 비교합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        {!result ? (
          <Notice>
            {formatKDate(date)}에 해당하는 월별 자산 기록이 없어 비교하지 않습니다. (기준일이 다르면 금액이 달라지는 것이 정상이므로 경고하지 않습니다)
          </Notice>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {result.map((r) => (
                <div key={r.account} className="rounded-xl border p-3 text-sm">
                  <p className="font-bold">{LABEL[r.account]}</p>
                  <dl className="mt-1.5 grid grid-cols-2 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">월별 기록 잔액</dt>
                    <dd className="text-right"><Money value={r.recordBalance} /></dd>
                    <dt className="text-muted-foreground">보유 종목 합계</dt>
                    <dd className="text-right"><Money value={r.holdingsSum} /></dd>
                    <dt className="font-semibold">{r.diff >= 0 ? '미분류·현금성 잔액' : '종목 합계 초과'}</dt>
                    <dd className={r.diff === 0 ? 'text-right font-semibold text-muted-foreground' : r.diff > 0 ? 'text-right font-semibold' : 'text-right font-semibold text-destructive'}>
                      <Money value={Math.abs(r.diff)} />
                    </dd>
                  </dl>
                </div>
              ))}
            </div>
            {result.some((r) => r.diff < 0) && (
              <Notice tone="warning">보유 종목 합계가 계좌 잔액보다 큽니다. 입력값이나 기준일을 확인해 주세요.</Notice>
            )}
            {canEdit && (
              <>
                <div>
                  <Button variant="outline" size="sm" onClick={apply}>
                    보유 종목 합계로 월별 기록의 계좌 잔액 덮어쓰기…
                  </Button>
                  <p className="mt-1 text-[11px] text-muted-foreground">직접 선택하지 않는 한 월별 자산 기록은 변경되지 않습니다.</p>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
