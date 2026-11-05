import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, Notice } from '@/components/ui/misc'
import { AmountInput } from '@/components/AmountInput'
import { Money, useUnit } from '@/components/Money'
import { axisProps, gridProps, MoneyTooltip } from '@/components/charts'
import { useData } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { simulate } from '@/lib/assets'
import { useAuth } from '@/contexts/AuthContext'
import { formatAmountInput, formatCompact, parseAmount } from '@/lib/format'

const SCEN = [
  { key: 'conservative', label: '보수적', color: 'var(--chart-8)' },
  { key: 'base', label: '기준', color: 'var(--chart-1)' },
  { key: 'aggressive', label: '적극적', color: 'var(--chart-2)' },
] as const

export function SimulationSection({ currentTotal }: { currentTotal: number }) {
  const { settings, updateSettings } = useData()
  const { canEdit } = useAuth()
  const { toast } = useUi()
  const unit = useUnit()
  const saved = settings.simulation ?? { conservative: 3, base: 5, aggressive: 7 }
  // 사용자가 직접 수정하기 전까지는 최신 자산 기록을 따라감 (기록 추가·수정 시 자동 반영)
  const [initialOverride, setInitial] = useState<string | null>(null)
  const initial = initialOverride ?? formatAmountInput(String(currentTotal))
  const [monthly, setMonthly] = useState('1,000,000')
  const [years, setYears] = useState('10')
  const [rates, setRates] = useState<Record<string, string>>({
    conservative: String(saved.conservative),
    base: String(saved.base),
    aggressive: String(saved.aggressive),
  })

  const init = parseAmount(initial)
  const mon = parseAmount(monthly)
  const yrs = Number(years)
  const rateNums = Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, Number(v)]))
  const errors = {
    initial: init == null || Number.isNaN(init) || init < 0 ? '0 이상 금액' : '',
    monthly: mon == null || Number.isNaN(mon) || mon < 0 ? '0 이상 금액' : '',
    years: !Number.isFinite(yrs) || yrs < 1 || yrs > 50 ? '1~50년' : '',
    rates: Object.values(rateNums).some((r) => !Number.isFinite(r) || r < -20 || r > 30) ? '-20%~30% 범위' : '',
  }
  const valid = !Object.values(errors).some(Boolean)

  const data = useMemo(
    () => (valid ? simulate(init!, mon!, Math.round(yrs), SCEN.map((s) => ({ key: s.key, annualRate: rateNums[s.key] }))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valid, init, mon, yrs, rates.conservative, rates.base, rates.aggressive],
  )
  const last = data[data.length - 1]

  const saveRates = () =>
    updateSettings({ simulation: { conservative: rateNums.conservative, base: rateNums.base, aggressive: rateNums.aggressive } })
      .then(() => toast('수익률 가정을 저장했습니다.'))
      .catch(() => toast('저장 실패', 'error'))

  return (
    <Card>
      <CardHeader>
        <CardTitle>미래 자산 시뮬레이션</CardTitle>
        <CardDescription>월 복리, 매월 말 추가 투자 가정</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="초기 자산" error={errors.initial}>
            <AmountInput value={initial} onChange={setInitial} />
          </Field>
          <Field label="월 추가 투자금" error={errors.monthly}>
            <AmountInput value={monthly} onChange={setMonthly} />
          </Field>
          <Field label="투자 기간(년)" error={errors.years}>
            <Input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </Field>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={() => setInitial(null)}>
              현재 자산으로 초기화
            </Button>
          </div>
          {SCEN.map((s) => (
            <Field key={s.key} label={`${s.label} 연평균 수익률(%)`} error={errors.rates}>
              <Input inputMode="decimal" value={rates[s.key]} onChange={(e) => setRates({ ...rates, [s.key]: e.target.value.replace(/[^\d.-]/g, '') })} />
            </Field>
          ))}
          {canEdit && (
            <>
              <div className="flex items-end">
                <Button variant="ghost" className="w-full" onClick={saveRates} disabled={!valid}>
                  수익률 가정 저장
                </Button>
              </div>
            </>
          )}
        </div>

        {valid && last && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs font-semibold text-muted-foreground">총 납입 원금</p>
                <Money value={last.contributed} className="text-lg font-extrabold" />
              </div>
              {SCEN.map((s) => (
                <div key={s.key} className="rounded-xl border p-3">
                  <p className="text-xs font-semibold" style={{ color: s.color }}>
                    {s.label} (연 {rateNums[s.key]}%) · {Math.round(yrs)}년 후
                  </p>
                  <Money value={last[s.key]} className="text-lg font-extrabold" />
                </div>
              ))}
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="year" tickFormatter={(y) => `${y}년`} {...axisProps} />
                  <YAxis tickFormatter={formatCompact} width={56} {...axisProps} />
                  <Tooltip content={<MoneyTooltip unit={unit} labelFormatter={(l) => `${l}년 후`} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line dataKey="contributed" name="납입 원금" stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                  {SCEN.map((s) => (
                    <Line key={s.key} dataKey={s.key} name={`${s.label} ${rateNums[s.key]}%`} stroke={s.color} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
        <Notice tone="warning">
          시뮬레이션은 입력한 가정에 따른 계산값일 뿐이며, 실제 수익을 보장하지 않습니다. 세금·수수료·물가상승률은 반영하지 않았습니다.
        </Notice>
      </CardContent>
    </Card>
  )
}
