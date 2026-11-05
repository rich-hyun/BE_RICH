import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Field, Spinner } from '@/components/ui/misc'
import { AmountInput } from '@/components/AmountInput'
import { Money } from '@/components/Money'
import { useData, firestoreErrorMessage } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { ASSET_KEYS, ASSET_LABELS, type AssetKey, type AssetRecord } from '@/lib/types'
import { formatAmountInput, parseAmount } from '@/lib/format'
import { formatKDate, isValidISODate, todayKST } from '@/lib/date'

type FormState = { date: string; memo: string } & Record<AssetKey, string>

const toForm = (r?: AssetRecord | null, prefill?: AssetRecord | null): FormState => {
  const src = r ?? prefill
  const f = { date: r?.date ?? todayKST(), memo: r?.memo ?? '' } as FormState
  for (const k of ASSET_KEYS) f[k] = src ? formatAmountInput(String(src[k]), true) : ''
  return f
}

export function RecordFormDialog({
  open,
  onOpenChange,
  editing,
  prefill,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: AssetRecord | null
  prefill: AssetRecord | null // 새 기록 작성 시 직전 기록 값을 미리 채움
}) {
  const { records, saveRecord } = useData()
  const { toast, confirm } = useUi()
  const [form, setForm] = useState<FormState>(() => toForm(editing, prefill))
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    if (open) {
      setForm(toForm(editing, prefill))
      setErrors({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id])

  const parsed = Object.fromEntries(ASSET_KEYS.map((k) => [k, parseAmount(form[k])])) as Record<AssetKey, number | null>
  const allValid = ASSET_KEYS.every((k) => parsed[k] != null && !Number.isNaN(parsed[k]))
  const total = ASSET_KEYS.reduce((s, k) => s + (parsed[k] != null && !Number.isNaN(parsed[k]) ? parsed[k]! : 0), 0)

  const validate = () => {
    const e: typeof errors = {}
    if (!isValidISODate(form.date)) e.date = '올바른 날짜를 선택하세요.'
    for (const k of ASSET_KEYS) {
      const v = parsed[k]
      if (v == null) e[k] = '비어 있습니다. 보유하지 않으면 0을 입력하세요.'
      else if (Number.isNaN(v)) e[k] = '숫자만 입력하세요.'
      else if (Math.abs(v) > 1e14) e[k] = '금액이 너무 큽니다.'
      else if (k !== 'cash' && v < 0) e[k] = '음수는 현금 항목에만 입력할 수 있습니다.'
    }
    if (form.memo.length > 1000) e.memo = '메모는 1,000자 이내로 입력하세요.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const onSave = async () => {
    if (savingRef.current) return // 중복 저장 방지
    if (!validate()) return
    const dup = records.find((r) => r.date === form.date && r.id !== editing?.id)
    if (dup) {
      const ok = await confirm({
        title: '같은 날짜의 기록이 있습니다',
        description: `${formatKDate(form.date, true)} 기록을 지금 입력한 내용으로 덮어쓸까요?`,
        confirmText: '덮어쓰기',
        destructive: true,
      })
      if (!ok) return
    }
    savingRef.current = true
    setSaving(true)
    try {
      await saveRecord(
        {
          date: form.date,
          memo: form.memo.trim(),
          ...(Object.fromEntries(ASSET_KEYS.map((k) => [k, parsed[k]!])) as Record<AssetKey, number>),
        },
        editing?.id,
      )
      toast(editing ? '기록을 수정했습니다.' : '기록을 저장했습니다.')
      onOpenChange(false)
    } catch (e) {
      // 실패 시 입력 내용은 그대로 유지
      toast(`저장 실패: ${firestoreErrorMessage(e)} (입력 내용은 유지됩니다)`, 'error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? '자산 기록 수정' : '자산 기록 추가'}</DialogTitle>
          <DialogDescription>
            {editing ? '과거 기록을 수정하면 증감액·증감률이 자동으로 다시 계산됩니다.' : prefill ? '직전 기록 값이 미리 채워져 있습니다. 바뀐 금액만 수정하세요.' : '각 항목의 평가금액을 원 단위로 입력하세요.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void onSave()
          }}
        >
          <Field label="기준일" htmlFor="date" error={errors.date} className="col-span-2">
            <Input id="date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-invalid={!!errors.date || undefined} />
          </Field>
          {ASSET_KEYS.map((k) => (
            <Field key={k} label={ASSET_LABELS[k]} htmlFor={`f-${k}`} error={errors[k]} className={k === 'cash' ? 'col-span-2 sm:col-span-1' : 'col-span-2 sm:col-span-1'}>
              <AmountInput id={`f-${k}`} value={form[k]} allowNegative={k === 'cash'} invalid={!!errors[k]} onChange={(v) => setForm({ ...form, [k]: v })} placeholder="0" />
            </Field>
          ))}
          <div className="col-span-2 flex items-center justify-between rounded-lg bg-accent px-4 py-3 sm:col-span-1 sm:flex-col sm:items-start sm:justify-center sm:py-2">
            <span className="text-xs font-semibold text-accent-foreground">총자산 (자동 계산)</span>
            <Money value={total} unit="won" className="text-lg font-extrabold" />
          </div>
          {!allValid && Object.keys(errors).length === 0 && (
            <p className="col-span-2 text-[11px] text-muted-foreground">빈 칸은 저장할 수 없습니다. 보유하지 않은 항목은 0을 입력하세요.</p>
          )}
          <Field label="메모 (선택)" htmlFor="memo" error={errors.memo} className="col-span-2">
            <Textarea id="memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="예: 보너스 입금, ISA 추가 납입 300만원" />
          </Field>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner />} {saving ? '저장 중…' : '저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
