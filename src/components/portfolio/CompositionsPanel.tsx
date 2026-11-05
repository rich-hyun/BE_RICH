import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, Boxes } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/misc'
import { CompositionDialog } from '@/components/portfolio/CompositionDialog'
import { useData, firestoreErrorMessage } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { normSymbol } from '@/lib/portfolio'
import { useAuth } from '@/contexts/AuthContext'
import { QUALITY_LABELS, isEtfType, type EtfComposition } from '@/lib/types'

export function CompositionsPanel() {
  const { compositions, holdings, deleteComposition } = useData()
  const { canEdit } = useAuth()
  const { confirm, toast } = useUi()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<EtfComposition | null>(null)
  const [preset, setPreset] = useState<{ symbol: string; name: string } | null>(null)

  const grouped = useMemo(() => {
    const m = new Map<string, EtfComposition[]>()
    for (const c of compositions) {
      const k = normSymbol(c.symbol)
      m.set(k, [...(m.get(k) ?? []), c])
    }
    for (const list of m.values()) list.sort((a, b) => b.asOfDate.localeCompare(a.asOfDate))
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [compositions])

  const etfHoldings = holdings.filter((h) => isEtfType(h.assetType))
  const missingSymbol = [...new Set(etfHoldings.filter((h) => !h.symbol).map((h) => h.name))]
  const unregistered = [...new Map(etfHoldings.filter((h) => h.symbol && !grouped.some(([k]) => k === normSymbol(h.symbol))).map((h) => [normSymbol(h.symbol), h])).values()]

  const openNew = (p?: { symbol: string; name: string }) => {
    setEditing(null)
    setPreset(p ?? null)
    setOpen(true)
  }

  const onDelete = async (c: EtfComposition) => {
    if (!(await confirm({ title: '구성비를 삭제할까요?', description: `${c.symbol} · ${c.asOfDate} 기준 구성비. 이 구성비를 쓰던 스냅샷 분석은 다른 기준일 데이터로 대체되거나 ‘분류 미확인’이 됩니다.`, confirmText: '삭제', destructive: true }))) return
    try {
      await deleteComposition(c.id)
      toast('삭제했습니다.')
    } catch (e) {
      toast(`삭제 실패: ${firestoreErrorMessage(e)}`, 'error')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {missingSymbol.length > 0 && (
        <Notice tone="warning">
          종목코드가 없는 ETF: <b>{missingSymbol.join(', ')}</b>. 보유 종목을 수정해 정확한 종목코드를 입력해야 ETF 구성비를 연결할 수 있습니다.
        </Notice>
      )}
      {canEdit && unregistered.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>구성비가 등록되지 않은 보유 ETF</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {unregistered.map((h) => (
              <Button key={h.id} variant="outline" size="sm" onClick={() => openNew({ symbol: h.symbol, name: h.name })}>
                <Plus /> {h.name} ({h.symbol})
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>ETF 구성비 데이터</CardTitle>
            <CardDescription>운용사 공개 자료를 직접 입력합니다. 같은 ETF에 여러 기준일 버전을 둘 수 있습니다.</CardDescription>
          </div>
          {canEdit && (
            <>
              <Button size="sm" onClick={() => openNew()}>
                <Plus /> 구성비 등록
              </Button>
            </>
          )}
        </CardHeader>
        <CardContent>
          {grouped.length === 0 ? (
            <EmptyState icon={Boxes} title="등록된 ETF 구성비가 없습니다" description="ETF의 업종 비중을 등록하면 ‘나스닥100 = 전부 IT’ 같은 왜곡 없이 실제 업종 노출을 계산합니다." />
          ) : (
            <ul className="flex flex-col divide-y">
              {grouped.flatMap(([, list]) =>
                list.map((c, i) => {
                  const indSum = Object.values(c.industries).reduce((s, v) => s + (v ?? 0), 0)
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                          {c.name || c.symbol} <span className="text-xs font-normal text-muted-foreground">{c.symbol}</span>
                          {i === 0 && <Badge variant="secondary">최신</Badge>}
                          <Badge variant={c.quality === 'official' ? 'success' : c.quality === 'sample' ? 'warning' : 'outline'}>{QUALITY_LABELS[c.quality]}</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          기준일 {c.asOfDate} · 업종 {indSum.toFixed(1)}% 입력 · 구성종목 {c.holdings.length}개 · 출처: {c.source || '미기재'}
                        </p>
                      </div>
                      {canEdit && (
                        <>
                          <Button variant="ghost" size="icon" aria-label="수정" onClick={() => { setEditing(c); setPreset(null); setOpen(true) }}>
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="삭제" onClick={() => onDelete(c)}>
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </li>
                  )
                }),
              )}
            </ul>
          )}
        </CardContent>
      </Card>
      <CompositionDialog open={open} onOpenChange={setOpen} editing={editing} preset={preset} />
    </div>
  )
}
