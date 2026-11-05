import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Field, Notice, Spinner } from '@/components/ui/misc'
import { useData, firestoreErrorMessage } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { INDUSTRIES, MAX_INDUSTRY_LEN, QUALITY_LABELS, THEMES, UNCLASSIFIED, type CompositionQuality, type EtfComposition, type Industry, type Theme } from '@/lib/types'
import { COMPOSITION_TEMPLATES } from '@/lib/samples'
import { isValidISODate, todayKST } from '@/lib/date'
import { normSymbol } from '@/lib/portfolio'
import { cn } from '@/lib/utils'

interface Row {
  name: string
  symbol: string
  weight: string
  industry: Industry
  themes: Theme[]
}

interface IndRow {
  name: string
  pct: string
}

interface Form {
  symbol: string
  name: string
  asOfDate: string
  source: string
  quality: CompositionQuality
  industries: IndRow[]
  rows: Row[]
}

const emptyForm = (symbol = '', name = ''): Form => ({
  symbol,
  name,
  asOfDate: todayKST(),
  source: '',
  quality: 'manual',
  industries: [{ name: '', pct: '' }],
  rows: [],
})

const fromComp = (c: EtfComposition): Form => ({
  symbol: c.symbol,
  name: c.name,
  asOfDate: c.asOfDate,
  source: c.source,
  quality: c.quality,
  industries: Object.entries(c.industries).map(([name, v]) => ({ name, pct: String(v) })),
  rows: c.holdings.map((h) => ({ name: h.name, symbol: h.symbol, weight: String(h.weight), industry: h.industry ?? '', themes: h.themes })),
})

const num = (s: string) => (s.trim() === '' ? 0 : Number(s))

export function CompositionDialog({
  open,
  onOpenChange,
  editing,
  preset,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: EtfComposition | null
  preset?: { symbol: string; name: string } | null
}) {
  const { saveComposition, compositions } = useData()
  const { toast, confirm } = useUi()
  const [f, setF] = useState<Form>(emptyForm())
  const [err, setErr] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [lastKey, setLastKey] = useState('')
  const key = `${open}-${editing?.id ?? 'new'}-${preset?.symbol ?? ''}`
  if (key !== lastKey) {
    setLastKey(key)
    if (open) {
      setF(editing ? fromComp(editing) : emptyForm(preset?.symbol ?? '', preset?.name ?? ''))
      setErr([])
    }
  }

  const indSum = f.industries.reduce((s, r) => s + (Number.isFinite(num(r.pct)) ? num(r.pct) : 0), 0)
  const setInd = (i: number, patch: Partial<IndRow>) => setF((s) => ({ ...s, industries: s.industries.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  const conSum = f.rows.reduce((s, r) => s + (Number.isFinite(num(r.weight)) ? num(r.weight) : 0), 0)

  const applyTemplate = async (k: string) => {
    const t = COMPOSITION_TEMPLATES.find((x) => x.key === k)
    if (!t) return
    if (f.rows.length || f.industries.some((r) => r.name || r.pct)) {
      if (!(await confirm({ title: '템플릿으로 덮어쓸까요?', description: '입력 중인 업종 비중과 구성종목이 템플릿 값으로 바뀝니다.' }))) return
    }
    setF((s) => ({
      ...s,
      name: s.name || t.name,
      source: t.source,
      quality: 'sample',
      industries: Object.entries(t.industries).map(([name, b]) => ({ name, pct: String(b) })),
      rows: t.holdings.map((h) => ({ name: h.name, symbol: h.symbol, weight: String(h.weight), industry: h.industry ?? '', themes: h.themes })),
    }))
  }

  const setRow = (i: number, patch: Partial<Row>) => setF((s) => ({ ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))

  const onSave = async () => {
    if (saving) return
    const e: string[] = []
    const sym = f.symbol.trim().toUpperCase()
    if (!sym) e.push('ETF 종목코드를 입력하세요.')
    if (!isValidISODate(f.asOfDate)) e.push('구성비 기준일을 입력하세요.')
    if (!f.source.trim()) e.push('출처를 입력하세요. (예: 운용사 홈페이지 PDF, 2026-10-31 기준)')
    const seen = new Set<string>()
    f.industries.forEach((r, idx) => {
      const name = r.name.trim()
      if (!name && !r.pct.trim()) return
      const v = num(r.pct)
      if (!name) e.push(`업종 ${idx + 1}행: 업종 이름을 입력하세요.`)
      else if (name === UNCLASSIFIED) e.push(`‘${UNCLASSIFIED}’는 업종 이름으로 쓸 수 없습니다. 비워 두면 자동으로 계산됩니다.`)
      else if (seen.has(name)) e.push(`업종 ‘${name}’이(가) 두 번 입력되었습니다. 한 줄로 합쳐 주세요.`)
      if (!Number.isFinite(v) || v <= 0 || v > 100) e.push(`업종 ‘${name || idx + 1}’ 비중은 0보다 크고 100 이하여야 합니다.`)
      seen.add(name)
    })
    if (indSum > 100.0001) e.push(`업종 비중 합계가 100%를 넘습니다 (${indSum.toFixed(2)}%). 업종은 서로 겹치지 않게 입력하세요.`)
    f.rows.forEach((r, idx) => {
      const w = num(r.weight)
      if (!r.name.trim() && !r.symbol.trim()) e.push(`구성종목 ${idx + 1}행: 이름 또는 코드를 입력하세요.`)
      if (!Number.isFinite(w) || w <= 0 || w > 100) e.push(`구성종목 ${idx + 1}행: 비중은 0~100 사이여야 합니다.`)
    })
    if (conSum > 100.0001) e.push(`구성종목 비중 합계가 100%를 넘습니다 (${conSum.toFixed(2)}%).`)
    const dupVersion = compositions.find((c) => c.id !== editing?.id && normSymbol(c.symbol) === normSymbol(sym) && c.asOfDate === f.asOfDate)
    if (dupVersion) e.push('같은 종목코드·같은 기준일의 구성비가 이미 있습니다. 기존 항목을 수정하세요.')
    setErr(e)
    if (e.length) return
    setSaving(true)
    try {
      const industries: Record<string, number> = {}
      for (const r of f.industries) {
        const name = r.name.trim().slice(0, MAX_INDUSTRY_LEN)
        if (name && num(r.pct) > 0) industries[name] = num(r.pct)
      }
      await saveComposition({
        id: editing?.id,
        symbol: sym,
        name: f.name.trim(),
        asOfDate: f.asOfDate,
        source: f.source.trim(),
        quality: f.quality,
        industries,
        holdings: f.rows.map((r) => ({ name: r.name.trim(), symbol: r.symbol.trim().toUpperCase(), weight: num(r.weight), industry: r.industry.trim() || null, themes: r.themes })),
      })
      toast('ETF 구성비를 저장했습니다.')
      onOpenChange(false)
    } catch (ex) {
      toast(`저장 실패: ${firestoreErrorMessage(ex)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{editing ? 'ETF 구성비 수정' : 'ETF 구성비 등록'}</DialogTitle>
          <DialogDescription>운용사가 공개한 업종 비중과 주요 구성종목을 입력하세요. 같은 ETF라도 기준일별로 따로 저장되어 과거 스냅샷 분석이 바뀌지 않습니다.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="ETF 종목코드 (보유 종목과 동일)">
            <Input value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} placeholder="예: 379800" />
          </Field>
          <Field label="ETF 이름">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="구성비 기준일">
            <Input type="date" value={f.asOfDate} onChange={(e) => setF({ ...f, asOfDate: e.target.value })} />
          </Field>
          <Field label="데이터 성격">
            <Select value={f.quality} onChange={(e) => setF({ ...f, quality: e.target.value as CompositionQuality })}>
              {Object.entries(QUALITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="출처" className="col-span-2 lg:col-span-3">
            <Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="예: OO자산운용 홈페이지 구성종목(PDF) 2026-10-31" />
          </Field>
          <Field label="예시 템플릿으로 채우기">
            <Select value="" onChange={(e) => void applyTemplate(e.target.value)}>
              <option value="">선택…</option>
              {COMPOSITION_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {f.quality === 'sample' && (
          <Notice tone="warning">예시 템플릿은 지수의 대략적인 근사치이며 운용사 공시 데이터가 아닙니다. 분석 화면에 ‘예시(추정)’로 표시됩니다. 실제 값으로 교체해 주세요.</Notice>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold">업종 비중 (%)</p>
            <span className={cn('text-xs font-semibold tabular', indSum > 100.0001 ? 'text-destructive' : 'text-muted-foreground')}>
              합계 {indSum.toFixed(2)}% · 미입력 {Math.max(0, 100 - indSum).toFixed(2)}%는 ‘분류 미확인’
            </span>
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            업종 이름은 자유롭게 입력하세요 (예: 반도체, 소프트웨어, 2차전지). 이름에 ‘반도체’가 들어가면 반도체 노출에 합산됩니다.
          </p>
          <div className="flex flex-col gap-2">
            {f.industries.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input className="h-9 flex-1" placeholder="업종 이름" maxLength={MAX_INDUSTRY_LEN} list="industry-suggestions" value={r.name} onChange={(e) => setInd(i, { name: e.target.value })} />
                <div className="relative w-28">
                  <Input inputMode="decimal" className="h-9 pr-7 text-right tabular" placeholder="0" value={r.pct} onChange={(e) => setInd(i, { pct: e.target.value.replace(/[^\d.]/g, '') })} />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
                <Button variant="ghost" size="icon" aria-label="업종 삭제" onClick={() => setF({ ...f, industries: f.industries.filter((_, j) => j !== i) })}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setF({ ...f, industries: [...f.industries, { name: '', pct: '' }] })}>
            <Plus /> 업종 추가
          </Button>
          <datalist id="industry-suggestions">
            {INDUSTRIES.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold">주요 구성종목 (중복 노출·테마 분석용, 일부만 입력해도 됨)</p>
            <span className={cn('text-xs font-semibold tabular', conSum > 100.0001 ? 'text-destructive' : 'text-muted-foreground')}>합계 {conSum.toFixed(2)}%</span>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">종목명</th>
                  <th className="p-2 text-left">코드</th>
                  <th className="p-2 text-right">비중(%)</th>
                  <th className="p-2 text-left">업종</th>
                  <th className="p-2 text-left">테마</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {f.rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1.5">
                      <Input className="h-8 text-xs" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} />
                    </td>
                    <td className="p-1.5">
                      <Input className="h-8 w-24 text-xs" value={r.symbol} onChange={(e) => setRow(i, { symbol: e.target.value })} />
                    </td>
                    <td className="p-1.5">
                      <Input className="h-8 w-20 text-right text-xs" inputMode="decimal" value={r.weight} onChange={(e) => setRow(i, { weight: e.target.value.replace(/[^\d.]/g, '') })} />
                    </td>
                    <td className="p-1.5">
                      <Input className="h-8 w-32 text-xs" placeholder="업종" maxLength={MAX_INDUSTRY_LEN} list="industry-suggestions" value={r.industry} onChange={(e) => setRow(i, { industry: e.target.value })} />
                    </td>
                    <td className="p-1.5">
                      <div className="flex gap-2 whitespace-nowrap">
                        {THEMES.map((t) => (
                          <label key={t} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              className="accent-[var(--primary)]"
                              checked={r.themes.includes(t)}
                              onChange={(e) => setRow(i, { themes: e.target.checked ? [...r.themes, t] : r.themes.filter((x) => x !== t) })}
                            />
                            {t}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="p-1.5">
                      <Button variant="ghost" size="icon" aria-label="행 삭제" onClick={() => setF({ ...f, rows: f.rows.filter((_, j) => j !== i) })}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setF({ ...f, rows: [...f.rows, { name: '', symbol: '', weight: '', industry: '', themes: [] }] })}>
            <Plus /> 구성종목 추가
          </Button>
        </div>

        {err.length > 0 && (
          <Notice tone="danger">
            <ul className="list-disc pl-4">
              {err.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </Notice>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Spinner />} 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
