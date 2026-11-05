import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Field, Notice, Spinner } from '@/components/ui/misc'
import { AmountInput } from '@/components/AmountInput'
import { useData, firestoreErrorMessage } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import {
  ACCOUNT_LABELS,
  COUNTRIES,
  HOLDING_TYPE_LABELS,
  INDUSTRIES,
  MAX_INDUSTRY_LEN,
  UNCLASSIFIED,
  THEMES,
  isEtfType,
  type AccountType,
  type Country,
  type Holding,
  type HoldingAssetType,
  type Theme,
} from '@/lib/types'
import { formatAmountInput, parseAmount } from '@/lib/format'
import { isValidISODate } from '@/lib/date'
import { findComposition } from '@/lib/portfolio'

interface Form {
  snapshotDate: string
  accountType: AccountType
  name: string
  symbol: string
  assetType: HoldingAssetType
  country: Country
  marketValue: string
  costBasis: string
  quantity: string
  industry: string
  themes: Theme[]
  memo: string
}

const fromHolding = (h: Holding | null, date: string): Form => ({
  snapshotDate: h?.snapshotDate ?? date,
  accountType: h?.accountType ?? 'brokerage',
  name: h?.name ?? '',
  symbol: h?.symbol ?? '',
  assetType: h?.assetType ?? 'stock',
  country: h?.country ?? '한국',
  marketValue: h ? formatAmountInput(String(h.marketValue)) : '',
  costBasis: h?.costBasis != null ? formatAmountInput(String(h.costBasis)) : '',
  quantity: h?.quantity != null ? String(h.quantity) : '',
  industry: h?.industry ?? '',
  themes: h?.themes ?? [],
  memo: h?.memo ?? '',
})

export function HoldingFormDialog({
  open,
  onOpenChange,
  editing,
  snapshotDate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: Holding | null
  snapshotDate: string
}) {
  const { saveHolding, compositions, holdings } = useData()
  // 기본 추천 + 이미 사용한 업종 이름 (같은 이름으로 입력하도록 도와 합산이 정확해짐)
  const industrySuggestions = [
    ...new Set([
      ...holdings.map((h) => h.industry).filter((x): x is string => !!x),
      ...compositions.flatMap((c) => Object.keys(c.industries)),
      ...INDUSTRIES,
    ]),
  ]
  const { toast } = useUi()
  const [f, setF] = useState<Form>(() => fromHolding(editing, snapshotDate))
  const [err, setErr] = useState<Partial<Record<keyof Form, string>>>({})
  const [saving, setSaving] = useState(false)
  const [lastKey, setLastKey] = useState('')
  const key = `${open}-${editing?.id ?? 'new'}-${snapshotDate}`
  if (key !== lastKey) {
    setLastKey(key)
    if (open) {
      setF(fromHolding(editing, snapshotDate))
      setErr({})
    }
  }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }))
  const etf = isEtfType(f.assetType)
  const comp = etf && f.symbol ? findComposition(f.symbol, compositions, f.snapshotDate) : null
  const knownEtfs = [...new Map(holdings.filter((h) => isEtfType(h.assetType) && h.symbol).map((h) => [h.symbol, h.name])).entries()]

  const onSave = async () => {
    if (saving) return
    const e: typeof err = {}
    const mv = parseAmount(f.marketValue)
    const cb = parseAmount(f.costBasis)
    const qty = f.quantity.trim() === '' ? null : Number(f.quantity.replace(/,/g, ''))
    if (!isValidISODate(f.snapshotDate)) e.snapshotDate = '기준일을 선택하세요.'
    if (!f.name.trim()) e.name = '종목명을 입력하세요.'
    if (mv == null) e.marketValue = '평가금액을 입력하세요.'
    else if (Number.isNaN(mv) || mv < 0) e.marketValue = '0 이상의 금액을 입력하세요.'
    if (cb != null && (Number.isNaN(cb) || cb < 0)) e.costBasis = '0 이상의 금액을 입력하세요.'
    if (qty != null && (!Number.isFinite(qty) || qty < 0)) e.quantity = '0 이상의 숫자를 입력하세요.'
    if (f.industry.trim() === UNCLASSIFIED) e.industry = `‘${UNCLASSIFIED}’는 업종 이름으로 쓸 수 없습니다. 비워 두세요.`
    if (f.symbol && !/^[A-Za-z0-9.\-_ ]{1,20}$/.test(f.symbol.trim())) e.symbol = '영문·숫자 20자 이내로 입력하세요.'
    setErr(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      await saveHolding({
        id: editing?.id,
        snapshotDate: f.snapshotDate,
        accountType: f.accountType,
        name: f.name.trim(),
        symbol: f.symbol.trim().toUpperCase(),
        assetType: f.assetType,
        country: f.country,
        marketValue: mv!,
        costBasis: cb,
        quantity: qty,
        industry: f.industry.trim() || null,
        themes: etf ? [] : f.themes,
        memo: f.memo.trim(),
        // 예시 데이터를 사용자가 수정해 저장하면 더 이상 예시로 표시하지 않음
        isSample: false,
      })
      toast(editing ? '종목을 수정했습니다.' : '종목을 추가했습니다.')
      onOpenChange(false)
    } catch (ex) {
      toast(`저장 실패: ${firestoreErrorMessage(ex)} (입력 내용은 유지됩니다)`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? '보유 종목 수정' : '보유 종목 추가'}</DialogTitle>
          <DialogDescription>평가금액은 증권사 앱에서 확인한 금액을 직접 입력합니다. (자동 시세 조회는 지원하지 않습니다)</DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(ev) => {
            ev.preventDefault()
            void onSave()
          }}
        >
          <Field label="기준일 (스냅샷)" error={err.snapshotDate}>
            <Input type="date" value={f.snapshotDate} onChange={(e) => set('snapshotDate', e.target.value)} />
          </Field>
          <Field label="계좌 유형">
            <Select value={f.accountType} onChange={(e) => set('accountType', e.target.value as AccountType)}>
              {Object.entries(ACCOUNT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="종목명" error={err.name} className="col-span-2 sm:col-span-1">
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="예: SK하이닉스" list="known-etf-names" />
          </Field>
          <Field
            label="티커 / 종목코드"
            error={err.symbol}
            className="col-span-2 sm:col-span-1"
            hint={etf ? (f.symbol ? (comp ? `구성비 연결됨 (기준일 ${comp.composition.asOfDate})` : '등록된 구성비 없음 → ‘분류 미확인’') : 'ETF는 정확한 종목코드를 입력해야 구성비가 연결됩니다.') : undefined}
          >
            <Input value={f.symbol} onChange={(e) => set('symbol', e.target.value)} placeholder="예: 000660, 379800, QQQ" list="known-etf-symbols" />
            <datalist id="known-etf-symbols">
              {[...new Set(compositions.map((c) => c.symbol))].map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <datalist id="known-etf-names">
              {knownEtfs.map(([s, n]) => (
                <option key={s} value={n} />
              ))}
            </datalist>
          </Field>
          <Field label="자산 유형">
            <Select value={f.assetType} onChange={(e) => set('assetType', e.target.value as HoldingAssetType)}>
              {Object.entries(HOLDING_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={etf ? '투자 국가 (기초자산 기준)' : '투자 국가'}>
            <Select value={f.country} onChange={(e) => set('country', e.target.value as Country)}>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="평가금액" error={err.marketValue} className="col-span-2">
            <AmountInput value={f.marketValue} onChange={(v) => set('marketValue', v)} invalid={!!err.marketValue} />
          </Field>
          <Field label="매입금액 (선택)" error={err.costBasis}>
            <AmountInput value={f.costBasis} onChange={(v) => set('costBasis', v)} />
          </Field>
          <Field label="수량 (선택)" error={err.quantity}>
            <Input inputMode="decimal" value={f.quantity} onChange={(e) => set('quantity', e.target.value.replace(/[^\d.]/g, ''))} />
          </Field>
          <Field
            label="업종 (직접 입력)"
            className="col-span-2"
            error={err.industry}
            hint={
              etf
                ? comp
                  ? '이 ETF는 등록된 구성비의 업종 비중이 우선 적용됩니다. 여기 입력한 업종은 구성비가 없을 때만 쓰입니다.'
                  : '구성비가 없으므로 ETF 평가금액 전체가 이 업종으로 집계됩니다. 비워 두면 ‘분류 미확인’.'
                : '자유롭게 입력하세요. 같은 이름끼리 합산되어 전체 대비 %로 표시됩니다. 비워 두면 ‘분류 미확인’.'
            }
          >
            <Input value={f.industry} onChange={(e) => set('industry', e.target.value)} maxLength={MAX_INDUSTRY_LEN} placeholder="예: 반도체, 2차전지, 미국 대형주" list="holding-industry-suggestions" />
            <datalist id="holding-industry-suggestions">
              {industrySuggestions.map((i) => (
                <option key={i} value={i} />
              ))}
            </datalist>
          </Field>
          {!etf ? (
            <>
              <div className="col-span-2 flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">테마 (업종과 별도, 중복 선택 가능)</span>
                <div className="flex flex-wrap gap-3">
                  {THEMES.map((t) => (
                    <label key={t} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        className="accent-[var(--primary)]"
                        checked={f.themes.includes(t)}
                        onChange={(e) => set('themes', e.target.checked ? [...f.themes, t] : f.themes.filter((x) => x !== t))}
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <Notice className="col-span-2">ETF 내부 업종 비중을 정확히 반영하려면 ‘ETF 구성비’ 탭에 구성비를 등록하세요. 테마(AI·빅테크)도 구성비의 구성종목 기준으로 계산합니다.</Notice>
          )}
          <Field label="메모 (선택)" className="col-span-2">
            <Input value={f.memo} onChange={(e) => set('memo', e.target.value)} />
          </Field>
          <DialogFooter className="col-span-2">
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
