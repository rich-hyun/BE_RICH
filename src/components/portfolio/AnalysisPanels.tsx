import { Fragment, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Layers } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Notice } from '@/components/ui/misc'
import { Money, Pct, useUnit } from '@/components/Money'
import { axisProps, PALETTE } from '@/components/charts'
import { useData } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { formatKRW, formatPct } from '@/lib/format'
import type { PortfolioAnalysis, Slice } from '@/lib/portfolio'
import { QUALITY_LABELS, UNCLASSIFIED, isSemiIndustry } from '@/lib/types'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

function colorFor(s: Slice, i: number) {
  if (s.key === UNCLASSIFIED) return 'var(--chart-8)'
  return PALETTE[i % (PALETTE.length - 1)]
}

/** 도넛 + 범례 표 */
export function Donut({ title, desc, slices, maxItems = 7 }: { title: string; desc?: string; slices: Slice[]; maxItems?: number }) {
  const unit = useUnit()
  let shown = slices
  if (slices.length > maxItems) {
    const head = slices.slice(0, maxItems - 1)
    const rest = slices.slice(maxItems - 1)
    shown = [...head, { key: '__etc', name: '기타 종목', value: rest.reduce((s, x) => s + x.value, 0), share: rest.reduce((s, x) => s + x.share, 0) }]
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {desc && <CardDescription>{desc}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 sm:flex-row">
        <div className="size-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={shown} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="100%" paddingAngle={1} isAnimationActive={false} stroke="var(--card)">
                {shown.map((s, i) => (
                  <Cell key={s.key} fill={colorFor(s, i)} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
                      <p className="font-bold">{String(payload[0].name)}</p>
                      <p>
                        {formatKRW(Number(payload[0].value), unit)} · {formatPct((payload[0].payload as Slice).share, { digits: 1 })}
                      </p>
                    </div>
                  ) : null
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="w-full space-y-1.5 text-sm">
          {shown.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorFor(s, i) }} />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <Money value={s.value} className="text-xs text-muted-foreground" />
              <Pct value={s.share} digits={1} className="w-14 text-right font-semibold" />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function AllocationPanel({ a }: { a: PortfolioAnalysis }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Donut title="종목별 비중" desc="같은 종목은 계좌가 달라도 합산" slices={a.byHolding} />
      <Donut title="계좌별 비중" slices={a.byAccount} />
      <Donut title="국가별 비중" desc="ETF는 기초자산 투자 국가 기준" slices={a.byCountry} />
      <Donut title="자산 유형별 비중" slices={a.byAssetType} />
    </div>
  )
}

export function IndustryPanel({ a }: { a: PortfolioAnalysis }) {
  const unit = useUnit()
  const data = a.industries.map((s) => ({ ...s, pct: s.share * 100 }))
  const unclassifiedShare = a.total > 0 ? a.industryUnclassified / a.total : 0
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>업종별 노출 (ETF 내부 구성 반영)</CardTitle>
          <CardDescription>ETF는 구성비가 있으면 평가금액 × ETF 내 업종 비중, 없으면 직접 입력한 업종으로 계산 · 합계 100%</CardDescription>
        </CardHeader>
        <CardContent>
          {unclassifiedShare > 0.0001 && (
            <Notice tone="warning" className="mb-3">
              전체의 {formatPct(unclassifiedShare, { digits: 1 })}({formatKRW(a.industryUnclassified, unit)})가 ‘분류 미확인’입니다. 업종을 입력하지 않은 종목(또는 구성비 업종 합계가 100% 미만인 ETF)이 있어 정확한 업종 비중 계산이 불가능합니다. 종목 수정에서 업종을 입력하세요.
            </Notice>
          )}
          <div style={{ height: Math.max(200, data.length * 34) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${v}%`} {...axisProps} domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="name" width={110} {...axisProps} />
                <Tooltip
                  cursor={{ fill: 'var(--muted)' }}
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
                        <p className="font-bold">{String((payload[0].payload as Slice).name)}</p>
                        <p>
                          {formatKRW((payload[0].payload as Slice).value, unit)} · {formatPct((payload[0].payload as Slice).share, { digits: 1 })}
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: 'right', fontSize: 11, fill: 'var(--muted-foreground)', formatter: (v: unknown) => `${Number(v).toFixed(1)}%` }}>
                  {data.map((s, i) => (
                    <Cell key={s.key} fill={s.key === UNCLASSIFIED ? 'var(--chart-8)' : isSemiIndustry(s.key) ? 'var(--chart-4)' : PALETTE[i % 7]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <IndustryTable a={a} />
      <EtfStatusCard a={a} />
    </div>
  )
}

const VIA_LABEL = { direct: '직접 입력', etf: 'ETF 구성비', default: '' } as const

/** 업종별 전체 대비 % + 구성 종목 */
function IndustryTable({ a }: { a: PortfolioAnalysis }) {
  const [open, setOpen] = useState<string | null>(null)
  const sum = a.industries.reduce((s, x) => s + x.share, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>업종별 비중 표</CardTitle>
        <CardDescription>
          전체 평가금액 <Money value={a.total} className="font-semibold text-foreground" /> 대비 각 업종 비율 · 행을 누르면 어떤 종목에서 왔는지 보여줍니다
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 text-left font-semibold">업종</th>
              <th className="py-2 text-right font-semibold">금액</th>
              <th className="py-2 text-right font-semibold">전체 대비</th>
            </tr>
          </thead>
          <tbody>
            {a.industries.map((s, i) => (
              <Fragment key={s.key}>
                <tr className="cursor-pointer border-b hover:bg-muted/50" onClick={() => setOpen(open === s.key ? null : s.key)} aria-expanded={open === s.key}>
                  <td className="py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.key === UNCLASSIFIED ? 'var(--chart-8)' : isSemiIndustry(s.key) ? 'var(--chart-4)' : PALETTE[i % 7] }} />
                      <span className={s.key === UNCLASSIFIED ? 'text-muted-foreground' : 'font-semibold'}>{s.name}</span>
                      <span className="text-[11px] text-muted-foreground">{s.sources.length}개 종목</span>
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <Money value={s.value} />
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="inline-flex items-center gap-2">
                      <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:inline-block">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, s.share * 100)}%` }} />
                      </span>
                      <Pct value={s.share} digits={1} className="w-14 font-bold" />
                    </span>
                  </td>
                </tr>
                {open === s.key &&
                  s.sources.map((src) => (
                    <tr key={src.label} className="border-b bg-muted/30 text-xs">
                      <td className="py-1.5 pl-7">
                        {src.label}
                        {VIA_LABEL[src.via] && <span className="ml-1.5 text-muted-foreground">· {VIA_LABEL[src.via]}</span>}
                      </td>
                      <td className="py-1.5 text-right">
                        <Money value={src.value} />
                      </td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        <Pct value={a.total ? src.value / a.total : 0} digits={1} />
                      </td>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-xs text-muted-foreground">
              <td className="pt-2">합계</td>
              <td className="pt-2 text-right">
                <Money value={a.total} />
              </td>
              <td className="pt-2 text-right font-semibold">
                <Pct value={sum} digits={1} />
              </td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  )
}

function EtfStatusCard({ a }: { a: PortfolioAnalysis }) {
  if (!a.etfStatus.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>ETF 구성비 연결 상태</CardTitle>
        <CardDescription>구성비 데이터의 기준일·출처·성격을 함께 표시합니다.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 text-left font-semibold">ETF (계좌)</th>
              <th className="py-2 text-right font-semibold">평가금액</th>
              <th className="py-2 text-left font-semibold pl-4">구성비</th>
              <th className="py-2 text-right font-semibold">업종 입력률</th>
              <th className="py-2 text-right font-semibold">구성종목 입력률</th>
            </tr>
          </thead>
          <tbody>
            {a.etfStatus.map(({ holding: h, match, industryCoverage, constituentCoverage }) => (
              <tr key={h.id} className="border-b last:border-0">
                <td className="py-2">
                  <span className="font-semibold">{h.name}</span> <span className="text-xs text-muted-foreground">{h.symbol || '코드 미입력'} · {h.accountType === 'isa' ? 'ISA' : '일반'}</span>
                </td>
                <td className="py-2 text-right">
                  <Money value={h.marketValue} />
                </td>
                <td className="py-2 pl-4">
                  {match ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-1">
                        <Badge variant={match.composition.quality === 'official' ? 'success' : match.composition.quality === 'sample' ? 'warning' : 'secondary'}>
                          {QUALITY_LABELS[match.composition.quality]}
                        </Badge>
                        <span className="text-xs">기준일 {match.composition.asOfDate}</span>
                        {match.dateMismatch && <Badge variant="warning">스냅샷 이후 기준일</Badge>}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{match.composition.source}</span>
                    </div>
                  ) : (
                    <Badge variant="destructive">{h.assetType === 'bondEtf' || h.assetType === 'goldProduct' ? '미등록 → 업종 ‘기타’' : '분류 미확인'}</Badge>
                  )}
                </td>
                <td className="py-2 text-right tabular">{match ? `${industryCoverage.toFixed(1)}%` : '-'}</td>
                <td className="py-2 text-right tabular">{match ? `${constituentCoverage.toFixed(1)}%` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function Meter({ label, value, share, desc, tone }: { label: string; value: number; share: number; desc: string; tone?: 'semi' | 'ai' | 'tech' }) {
  const color = tone === 'semi' ? 'var(--chart-4)' : tone === 'ai' ? 'var(--chart-5)' : 'var(--chart-1)'
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <Pct value={share} digits={1} className="text-2xl font-extrabold" />
        <Money value={value} className="text-xs text-muted-foreground" />
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, share * 100)}%`, background: color }} />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  )
}

export function ThemePanel({ a }: { a: PortfolioAnalysis }) {
  const t = a.themes
  const s = (v: number) => (a.total > 0 ? v / a.total : 0)
  const partial = t.lookThroughCoverage < 0.999
  return (
    <div className="flex flex-col gap-5">
      <Notice>
        이 영역은 <b>테마 분석</b>으로, 위 업종 분석(합계 100%)과 별개입니다. 한 기업이 여러 테마에 동시에 속할 수 있으므로 테마 비중끼리 더하면 안 됩니다.
      </Notice>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Meter label="국내 반도체 직접투자" value={t.semiconductorDirectKR} share={s(t.semiconductorDirectKR)} tone="semi" desc="업종 이름에 ‘반도체’가 들어간 한국 개별주식(예: SK하이닉스, 삼성전자) 합계" />
        <Meter label="전체 반도체 노출 (ETF 포함)" value={t.semiconductorTotal} share={s(t.semiconductorTotal)} tone="semi" desc="업종 이름에 ‘반도체’가 들어간 직접 보유 + ETF 내부 비중 합산 (구성비 없는 ETF는 직접 입력한 업종 기준)" />
        <Meter label="AI 테마 노출 (확인된 범위)" value={t.aiTheme} share={s(t.aiTheme)} tone="ai" desc="AI 태그 개별주식 + ETF 구성종목 중 AI 태그 종목. 입력된 구성종목만 반영한 최소값" />
        <Meter label="미국 빅테크 노출 (확인된 범위)" value={t.bigTech} share={s(t.bigTech)} tone="tech" desc="AAPL·MSFT·NVDA·AMZN·GOOGL·META·TSLA·AVGO 또는 ‘미국 빅테크’ 태그. 입력된 구성종목 기준 최소값" />
      </div>
      {partial && (
        <Notice tone="warning">
          ETF 평가금액 중 구성종목 데이터로 확인된 비율은 {formatPct(t.lookThroughCoverage, { digits: 1 })}입니다. 나머지 구성종목은 알 수 없어 AI·빅테크 노출은 실제보다 낮게 계산될 수 있습니다.
        </Notice>
      )}
    </div>
  )
}

export function ConcentrationPanel({ a }: { a: PortfolioAnalysis }) {
  const { settings, updateSettings } = useData()
  const { canEdit } = useAuth()
  const { toast } = useUi()
  const [th, setTh] = useState({ ...settings.riskThresholds })
  const c = a.concentration
  const save = () => {
    const vals = Object.values(th)
    if (vals.some((v) => !Number.isFinite(v) || v <= 0 || v > 100)) return toast('경고 기준은 1~100 사이로 입력하세요.', 'error')
    updateSettings({ riskThresholds: th })
      .then(() => toast('경고 기준을 저장했습니다.'))
      .catch(() => toast('저장 실패', 'error'))
  }
  return (
    <div className="flex flex-col gap-5">
      {a.warnings.length > 0 ? (
        <div className="flex flex-col gap-2">
          {a.warnings.map((w) => (
            <div key={w} className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm font-medium text-amber-800 dark:text-amber-200">
              <AlertTriangle className="size-4 shrink-0" /> {w}
            </div>
          ))}
        </div>
      ) : (
        <Notice>설정한 경고 기준을 넘는 항목이 없습니다.</Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Meter label="최대 보유 종목" value={c.top1?.value ?? 0} share={c.top1?.share ?? 0} desc={c.top1 ? `${c.top1.name} (${c.top1.accounts.join('·')})` : '-'} />
        <Meter label="상위 3개 종목 합계" value={a.byHolding.slice(0, 3).reduce((s, x) => s + x.value, 0)} share={c.top3Share} desc={a.byHolding.slice(0, 3).map((x) => x.name).join(', ') || '-'} />
        <Meter label="최대 국가 편중" value={c.topCountry?.value ?? 0} share={c.topCountry?.share ?? 0} desc={`${c.topCountry?.name ?? '-'} · 국가 집중도(HHI) ${(c.countryHHI * 100).toFixed(0)}/100`} />
      </div>

      <OverlapCard a={a} />

      <Card>
        <CardHeader>
          <CardTitle>집중도 경고 기준 (사용자 설정)</CardTitle>
          <CardDescription>본인이 정한 참고용 기준입니다. 일반적인 위험 한도나 투자 권고가 아닙니다.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="단일 종목 (%)">
            <Input inputMode="decimal" value={th.singleHolding} onChange={(e) => setTh({ ...th, singleHolding: Number(e.target.value.replace(/[^\d.]/g, '')) })} />
          </Field>
          <Field label="단일 업종 (%)">
            <Input inputMode="decimal" value={th.singleIndustry} onChange={(e) => setTh({ ...th, singleIndustry: Number(e.target.value.replace(/[^\d.]/g, '')) })} />
          </Field>
          <Field label="단일 국가 (%)">
            <Input inputMode="decimal" value={th.singleCountry} onChange={(e) => setTh({ ...th, singleCountry: Number(e.target.value.replace(/[^\d.]/g, '')) })} />
          </Field>
          {canEdit && (
            <>
              <div className="flex items-end">
                <Button className="w-full" onClick={save}>
                  기준 저장
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function OverlapCard({ a }: { a: PortfolioAnalysis }) {
  const top = a.companies.slice(0, 15)
  return (
    <Card>
      <CardHeader>
        <CardTitle>기업별 합산 노출 · ETF 간 중복</CardTitle>
        <CardDescription>개별주식과 ETF 구성종목에 같은 기업이 있으면 합산합니다. ETF는 입력된 구성종목만 반영됩니다.</CardDescription>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <Layers className="size-6" />
            개별주식이나 ETF 구성종목 데이터가 없어 기업별 노출을 계산할 수 없습니다.
          </div>
        ) : (
          <ul className="flex flex-col divide-y">
            {top.map((c) => (
              <li key={c.key} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate font-semibold">{c.name}</span>
                  {c.sources.length >= 2 && <Badge variant="warning">중복 {c.sources.length}곳</Badge>}
                </div>
                <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground sm:max-w-[50%] sm:justify-end">
                  {c.sources.map((s) => (
                    <span key={s.label} className="rounded bg-muted px-1.5 py-0.5">
                      {s.label} <Money value={s.value} />
                    </span>
                  ))}
                </div>
                <div className={cn('flex shrink-0 items-baseline gap-2 sm:w-40 sm:justify-end')}>
                  <Money value={c.value} className="text-xs text-muted-foreground" />
                  <Pct value={c.share} digits={1} className="font-bold" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
