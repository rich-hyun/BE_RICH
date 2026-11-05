import { useMemo, useState } from 'react'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, FileSpreadsheet, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/misc'
import { Money, Pct } from '@/components/Money'
import { RecordFormDialog } from '@/components/records/RecordFormDialog'
import { ImportDialog } from '@/components/records/ImportDialog'
import { useData, firestoreErrorMessage } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { computeRecords, type ComputedRecord } from '@/lib/assets'
import { ASSET_KEYS, ASSET_LABELS, type AssetRecord } from '@/lib/types'
import { useAuth } from '@/contexts/AuthContext'
import { formatKDate, yearOf } from '@/lib/date'

export default function RecordsPage() {
  const { records, deleteRecord } = useData()
  const { canEdit } = useAuth()
  const { confirm, toast } = useUi()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AssetRecord | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [year, setYear] = useState('all')
  const [month, setMonth] = useState('all')
  const [desc, setDesc] = useState(true)

  const computed = useMemo(() => computeRecords(records), [records])
  const latest = computed[computed.length - 1] ?? null
  const years = useMemo(() => [...new Set(computed.map((r) => yearOf(r.date)))].sort((a, b) => b - a), [computed])

  const rows = useMemo(() => {
    const f = computed.filter((r) => (year === 'all' || String(yearOf(r.date)) === year) && (month === 'all' || r.date.slice(5, 7) === month))
    return desc ? [...f].reverse() : f
  }, [computed, year, month, desc])

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (r: AssetRecord) => {
    setEditing(r)
    setFormOpen(true)
  }
  const onDelete = async (r: ComputedRecord) => {
    const ok = await confirm({
      title: '기록을 삭제할까요?',
      description: `${formatKDate(r.date, true)} 기록(총자산 ${r.total.toLocaleString('ko-KR')}원)을 삭제합니다. 삭제 후 다음 기록의 증감액이 다시 계산됩니다.`,
      confirmText: '삭제',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteRecord(r.id)
      toast('삭제했습니다.')
    } catch (e) {
      toast(`삭제 실패: ${firestoreErrorMessage(e)}`, 'error')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">월별 자산 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">날짜별 계좌 잔액을 기록합니다. 같은 달에 여러 번 기록하면 마지막 기록일이 그 달의 대표값이 됩니다.</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet /> 엑셀 가져오기
              </Button>
              <Button onClick={openNew}>
                <Plus /> 기록 추가
              </Button>
            </>
          )}
        </div>
      </div>

      {latest && (
        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-[1.3fr_2fr]">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">최근 총자산 · {formatKDate(latest.date)}</p>
              <Money value={latest.total} className="mt-1 block text-3xl font-extrabold tracking-tight" />
              <p className="mt-1 text-sm">
                직전 기록 대비 <Money value={latest.delta} sign trend className="font-semibold" /> <Pct value={latest.deltaRate} sign trend className="text-xs" />
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {ASSET_KEYS.map((k) => (
                <div key={k} className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-[11px] font-semibold text-muted-foreground">{ASSET_LABELS[k]}</p>
                  <Money value={latest[k]} className="text-sm font-bold" />
                  <p className="text-[11px] text-muted-foreground">{latest.total ? ((latest[k] / latest.total) * 100).toFixed(1) : '0'}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <span className="mr-auto text-sm font-bold">기록 {rows.length}건</span>
          <Select value={year} onChange={(e) => setYear(e.target.value)} className="h-9 w-28" aria-label="연도 필터">
            <option value="all">전체 연도</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </Select>
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-24" aria-label="월 필터">
            <option value="all">전체 월</option>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
              <option key={m} value={m}>
                {Number(m)}월
              </option>
            ))}
          </Select>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setDesc((d) => !d)}>
            {desc ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />} {desc ? '최신순' : '오래된순'}
          </Button>
        </div>

        {computed.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Wallet}
              title="아직 자산 기록이 없습니다"
              description="첫 기록을 직접 입력하거나, 기존 ‘월별자산현황’ 엑셀 파일을 가져오세요."
              action={
                canEdit && <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setImportOpen(true)}>
                    <FileSpreadsheet /> 엑셀 가져오기
                  </Button>
                  <Button onClick={openNew}>
                    <Plus /> 기록 추가
                  </Button>
                </div>
              }
            />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">선택한 기간에 기록이 없습니다.</p>
        ) : (
          <>
            {/* PC 테이블 */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2.5 text-left font-semibold">날짜</th>
                    {ASSET_KEYS.map((k) => (
                      <th key={k} className="px-3 py-2.5 text-right font-semibold">
                        {ASSET_LABELS[k]}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-semibold">총자산</th>
                    <th className="px-3 py-2.5 text-right font-semibold">직전 대비</th>
                    <th className="px-3 py-2.5 text-left font-semibold">메모</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="font-semibold">{formatKDate(r.date, true)}</span>
                        {r.isMonthRepresentative && (
                          <Badge variant="secondary" className="ml-1.5" title="해당 월의 마지막 기록 (월별 대표값)">
                            월대표
                          </Badge>
                        )}
                      </td>
                      {ASSET_KEYS.map((k) => (
                        <td key={k} className="px-3 py-3 text-right">
                          <Money value={r[k]} />
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-bold">
                        <Money value={r.total} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <Money value={r.delta} sign trend className="block font-semibold" />
                        <Pct value={r.deltaRate} sign trend className="text-xs" />
                      </td>
                      <td className="max-w-48 truncate px-3 py-3 text-xs text-muted-foreground" title={r.memo}>
                        {r.memo}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex justify-end">
                          {canEdit && (
                            <>
                              <Button variant="ghost" size="icon" aria-label="수정" onClick={() => openEdit(r)}>
                                <Pencil />
                              </Button>
                              <Button variant="ghost" size="icon" aria-label="삭제" onClick={() => onDelete(r)}>
                                <Trash2 />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* 모바일 카드 */}
            <ul className="divide-y md:hidden">
              {rows.map((r) => (
                <li key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {formatKDate(r.date, true)}
                        {r.isMonthRepresentative && (
                          <Badge variant="secondary" className="ml-1.5">
                            월대표
                          </Badge>
                        )}
                      </p>
                      <Money value={r.total} className="text-lg font-extrabold" />
                      <p className="text-xs">
                        <Money value={r.delta} sign trend /> <Pct value={r.deltaRate} sign trend />
                      </p>
                    </div>
                    <div className="flex">
                      {canEdit && (
                        <>
                          <Button variant="ghost" size="icon" aria-label="수정" onClick={() => openEdit(r)}>
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="삭제" onClick={() => onDelete(r)}>
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
                    {ASSET_KEYS.map((k) => (
                      <div key={k} className="flex flex-col">
                        <span className="text-muted-foreground">{ASSET_LABELS[k]}</span>
                        <Money value={r[k]} className="font-medium" />
                      </div>
                    ))}
                  </div>
                  {r.memo && <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">{r.memo}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <RecordFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} prefill={editing ? null : latest} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}
