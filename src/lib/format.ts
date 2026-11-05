import type { DisplayUnit } from './types'

const nf0 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2, minimumFractionDigits: 0 })

export function withCommas(n: number): string {
  return nf0.format(n)
}

/** 선택한 단위(원/만원/억원)로 금액 표시 */
export function formatKRW(value: number | null | undefined, unit: DisplayUnit = 'won', opts: { sign?: boolean } = {}): string {
  if (value == null || !Number.isFinite(value)) return '-'
  const sign = opts.sign ? (value > 0 ? '+' : value < 0 ? '-' : '') : value < 0 ? '-' : ''
  const abs = Math.abs(value)
  let body: string
  switch (unit) {
    case 'man':
      body = `${nf1.format(abs / 10_000)}만원`
      break
    case 'eok':
      body = `${nf2.format(abs / 100_000_000)}억원`
      break
    default:
      body = `${nf0.format(abs)}원`
  }
  return sign + body
}

/** 차트 축 등에 쓰는 짧은 표기: 1.2억, 8,600만 */
export function formatCompact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 100_000_000) return `${sign}${nf2.format(abs / 100_000_000)}억`
  if (abs >= 10_000) return `${sign}${nf0.format(abs / 10_000)}만`
  return `${sign}${nf0.format(abs)}`
}

export function formatPct(ratio: number | null | undefined, opts: { sign?: boolean; digits?: number } = {}): string {
  if (ratio == null || !Number.isFinite(ratio)) return '-'
  const v = ratio * 100
  const s = v.toFixed(opts.digits ?? 2)
  return (opts.sign && v > 0 ? '+' : '') + s + '%'
}

/** 입력 문자열 → 정수 원. 빈 값이면 null, 잘못된 값이면 NaN */
export function parseAmount(input: string): number | null {
  const s = input.replace(/[,\s원₩]/g, '')
  if (s === '') return null
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN
  return Math.round(Number(s))
}

/** 입력 중 천 단위 콤마 적용 (음수 허용 여부 선택) */
export function formatAmountInput(input: string, allowNegative = false): string {
  const neg = allowNegative && input.trim().startsWith('-')
  const digits = input.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '')
  if (digits === '') return neg ? '-' : ''
  return (neg ? '-' : '') + nf0.format(Number(digits))
}

export function trendClass(value: number | null | undefined): string {
  if (value == null || value === 0 || !Number.isFinite(value)) return 'text-muted-foreground'
  return value > 0 ? 'text-up' : 'text-down'
}
