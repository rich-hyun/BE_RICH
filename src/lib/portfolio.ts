import {
  ACCOUNT_LABELS,
  COUNTRIES,
  HOLDING_TYPE_LABELS,
  INDUSTRIES,
  UNCLASSIFIED,
  isEtfType,
  type EtfComposition,
  type Holding,
  type RiskThresholds,
} from './types'
import { monthKey } from './date'

export const BIG_TECH_SYMBOLS = new Set(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO'])

/** 종목코드 정규화: 대문자, 공백 제거, 한국 'A000660' → '000660', 거래소 접미사 제거, GOOG→GOOGL */
export function normSymbol(s: string | null | undefined): string {
  if (!s) return ''
  let x = s.trim().toUpperCase().replace(/\s+/g, '')
  x = x.replace(/\.(KS|KQ|KRX|US|O|N)$/, '')
  if (/^A\d{6}$/.test(x)) x = x.slice(1)
  if (x === 'GOOG') x = 'GOOGL'
  return x
}

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '')
export const holdingKey = (h: { symbol: string; name: string }) => normSymbol(h.symbol) || `name:${nameKey(h.name)}`

export interface CompositionMatch {
  composition: EtfComposition
  /** 스냅샷 기준일 이후의 구성비만 있어 대신 사용한 경우 */
  dateMismatch: boolean
}

/** 스냅샷 기준일 이전(포함) 최신 구성비 → 없으면 가장 오래된 구성비(불일치 표시) */
export function findComposition(symbol: string, compositions: EtfComposition[], date: string): CompositionMatch | null {
  const sym = normSymbol(symbol)
  if (!sym) return null
  const list = compositions.filter((c) => normSymbol(c.symbol) === sym).sort((a, b) => a.asOfDate.localeCompare(b.asOfDate))
  if (!list.length) return null
  const before = list.filter((c) => c.asOfDate <= date)
  if (before.length) return { composition: before[before.length - 1], dateMismatch: false }
  return { composition: list[0], dateMismatch: true }
}

export interface Slice {
  key: string
  name: string
  value: number
  share: number // 0~1
}

export interface CompanyExposure extends Slice {
  sources: { label: string; value: number }[]
}

export interface PortfolioAnalysis {
  total: number
  count: number
  byHolding: (Slice & { accounts: string[]; assetType: string })[]
  byAccount: Slice[]
  byCountry: Slice[]
  byAssetType: Slice[]
  industries: Slice[] // UNCLASSIFIED 포함, 합계 100%
  industryUnclassified: number // 원
  etfStatus: {
    holding: Holding
    match: CompositionMatch | null
    industryCoverage: number // 업종 비중 합계 (0~100)
    constituentCoverage: number // 구성종목 비중 합계 (0~100)
  }[]
  themes: {
    semiconductorDirectKR: number // 원
    semiconductorTotal: number // 업종 '반도체' 합계(직접+ETF)
    aiTheme: number // 확인된 범위(최소값)
    bigTech: number // 확인된 범위(최소값)
    lookThroughCoverage: number // ETF 평가금액 중 구성종목 데이터로 확인된 비율 0~1
    etfValue: number
  }
  concentration: {
    top1: (Slice & { accounts: string[] }) | null
    top3Share: number
    topCountry: Slice | null
    countryHHI: number // 0~1 (허핀달 지수)
  }
  companies: CompanyExposure[]
  overlaps: CompanyExposure[] // 2개 이상 출처(직접+ETF, ETF+ETF)에 포함된 기업
  warnings: string[]
}

function toSlices(map: Map<string, { name: string; value: number }>, total: number): Slice[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, name: v.name, value: v.value, share: total > 0 ? v.value / total : 0 }))
    .sort((a, b) => b.value - a.value)
}

function add(map: Map<string, { name: string; value: number }>, key: string, name: string, value: number) {
  const cur = map.get(key)
  if (cur) cur.value += value
  else map.set(key, { name, value })
}

export function analyzePortfolio(
  holdings: Holding[],
  compositions: EtfComposition[],
  thresholds: RiskThresholds,
): PortfolioAnalysis {
  const total = holdings.reduce((s, h) => s + h.marketValue, 0)
  const byHolding = new Map<string, { name: string; value: number; accounts: Set<string>; assetType: string }>()
  const byAccount = new Map<string, { name: string; value: number }>()
  const byCountry = new Map<string, { name: string; value: number }>()
  const byType = new Map<string, { name: string; value: number }>()
  const industries = new Map<string, { name: string; value: number }>()
  const companies = new Map<string, { name: string; value: number; sources: Map<string, number> }>()
  const etfStatus: PortfolioAnalysis['etfStatus'] = []
  let semisDirectKR = 0
  let ai = 0
  let bigTech = 0
  let etfValue = 0
  let etfCovered = 0

  const addCompany = (key: string, name: string, value: number, source: string) => {
    const c = companies.get(key) ?? { name, value: 0, sources: new Map<string, number>() }
    c.value += value
    c.sources.set(source, (c.sources.get(source) ?? 0) + value)
    companies.set(key, c)
  }

  for (const h of holdings) {
    const v = h.marketValue
    const hk = holdingKey(h)
    const hc = byHolding.get(hk) ?? { name: h.name, value: 0, accounts: new Set<string>(), assetType: HOLDING_TYPE_LABELS[h.assetType] }
    hc.value += v
    hc.accounts.add(ACCOUNT_LABELS[h.accountType])
    byHolding.set(hk, hc)
    add(byAccount, h.accountType, ACCOUNT_LABELS[h.accountType], v)
    const country = (COUNTRIES as readonly string[]).includes(h.country) ? h.country : '기타'
    add(byCountry, country, country, v)
    add(byType, h.assetType, HOLDING_TYPE_LABELS[h.assetType], v)

    if (isEtfType(h.assetType)) {
      etfValue += v
      const match = findComposition(h.symbol, compositions, h.snapshotDate)
      let indSum = 0
      let conSum = 0
      if (match) {
        const comp = match.composition
        for (const ind of INDUSTRIES) {
          const w = comp.industries[ind] ?? 0
          if (w > 0) {
            add(industries, ind, ind, (v * w) / 100)
            indSum += w
          }
        }
        if (indSum > 100) indSum = 100 // 방어: 입력 검증에서 100% 초과를 막지만 혹시 모를 경우
        const rest = 100 - indSum
        if (rest > 1e-9) add(industries, UNCLASSIFIED, UNCLASSIFIED, (v * rest) / 100)
        const label = `${h.name} (${ACCOUNT_LABELS[h.accountType]})`
        for (const c of comp.holdings) {
          if (!(c.weight > 0)) continue
          const amt = (v * c.weight) / 100
          conSum += c.weight
          const key = normSymbol(c.symbol) || `name:${nameKey(c.name)}`
          addCompany(key, c.name, amt, label)
          if (c.themes.includes('AI')) ai += amt
          if (c.themes.includes('미국 빅테크') || BIG_TECH_SYMBOLS.has(normSymbol(c.symbol))) bigTech += amt
        }
        conSum = Math.min(conSum, 100)
        etfCovered += (v * conSum) / 100
      } else if (h.assetType === 'bondEtf' || h.assetType === 'goldProduct') {
        add(industries, '기타', '기타', v)
      } else {
        add(industries, UNCLASSIFIED, UNCLASSIFIED, v)
      }
      etfStatus.push({ holding: h, match, industryCoverage: indSum, constituentCoverage: conSum })
    } else {
      const ind = h.industry ?? UNCLASSIFIED
      add(industries, ind, ind, v)
      if (h.industry === '반도체' && h.country === '한국' && h.assetType === 'stock') semisDirectKR += v
      if (h.assetType === 'stock') {
        addCompany(hk, h.name, v, '직접 보유')
        if (h.themes.includes('AI')) ai += v
        if (h.themes.includes('미국 빅테크') || BIG_TECH_SYMBOLS.has(normSymbol(h.symbol))) bigTech += v
      }
    }
  }

  const holdingSlices = [...byHolding.entries()]
    .map(([key, x]) => ({
      key,
      name: x.name,
      value: x.value,
      share: total > 0 ? x.value / total : 0,
      accounts: [...x.accounts],
      assetType: x.assetType,
    }))
    .sort((a, b) => b.value - a.value)
  const countrySlices = toSlices(byCountry, total)
  const industrySlices = toSlices(industries, total)
  const companySlices: CompanyExposure[] = [...companies.entries()]
    .map(([key, c]) => ({
      key,
      name: c.name,
      value: c.value,
      share: total > 0 ? c.value / total : 0,
      sources: [...c.sources.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value)

  const warnings: string[] = []
  const top1 = holdingSlices[0] ?? null
  if (top1 && top1.share * 100 > thresholds.singleHolding)
    warnings.push(`단일 종목 '${top1.name}' 비중 ${(top1.share * 100).toFixed(1)}% — 설정한 기준 ${thresholds.singleHolding}% 초과`)
  const topIndustry = industrySlices.find((s) => s.key !== UNCLASSIFIED)
  if (topIndustry && topIndustry.share * 100 > thresholds.singleIndustry)
    warnings.push(`단일 업종 '${topIndustry.name}' 비중 ${(topIndustry.share * 100).toFixed(1)}% — 설정한 기준 ${thresholds.singleIndustry}% 초과`)
  const topCountry = countrySlices[0] ?? null
  if (topCountry && topCountry.share * 100 > thresholds.singleCountry)
    warnings.push(`단일 국가 '${topCountry.name}' 비중 ${(topCountry.share * 100).toFixed(1)}% — 설정한 기준 ${thresholds.singleCountry}% 초과`)

  return {
    total,
    count: holdings.length,
    byHolding: holdingSlices,
    byAccount: toSlices(byAccount, total),
    byCountry: countrySlices,
    byAssetType: toSlices(byType, total),
    industries: industrySlices,
    industryUnclassified: industries.get(UNCLASSIFIED)?.value ?? 0,
    etfStatus,
    themes: {
      semiconductorDirectKR: semisDirectKR,
      semiconductorTotal: industries.get('반도체')?.value ?? 0,
      aiTheme: ai,
      bigTech,
      lookThroughCoverage: etfValue > 0 ? etfCovered / etfValue : 1,
      etfValue,
    },
    concentration: {
      top1,
      top3Share: holdingSlices.slice(0, 3).reduce((s, x) => s + x.share, 0),
      topCountry,
      countryHHI: countrySlices.reduce((s, x) => s + x.share * x.share, 0),
    },
    companies: companySlices,
    overlaps: companySlices.filter((c) => c.sources.length >= 2),
    warnings,
  }
}

/** 보유 종목 스냅샷 날짜 목록 (최신순) */
export function snapshotDates(holdings: Holding[]): string[] {
  return [...new Set(holdings.map((h) => h.snapshotDate))].sort((a, b) => b.localeCompare(a))
}

export interface SnapshotTrendPoint {
  month: string
  date: string
  total: number
  semiconductorShare: number
  unclassifiedShare: number
  industries: Record<string, number> // 업종별 비중 0~1
}

/** 월별 포트폴리오 추이: 각 월의 마지막 스냅샷 기준 */
export function snapshotTrend(holdings: Holding[], compositions: EtfComposition[], thresholds: RiskThresholds): SnapshotTrendPoint[] {
  const dates = snapshotDates(holdings).reverse()
  const lastOfMonth = new Map<string, string>()
  for (const d of dates) lastOfMonth.set(monthKey(d), d)
  return [...lastOfMonth.entries()].map(([month, date]) => {
    const a = analyzePortfolio(
      holdings.filter((h) => h.snapshotDate === date),
      compositions,
      thresholds,
    )
    const industries: Record<string, number> = {}
    for (const s of a.industries) industries[s.key] = s.share
    return {
      month,
      date,
      total: a.total,
      semiconductorShare: a.total > 0 ? a.themes.semiconductorTotal / a.total : 0,
      unclassifiedShare: a.total > 0 ? a.industryUnclassified / a.total : 0,
      industries,
    }
  })
}

export interface ReconcileResult {
  account: 'isa' | 'brokerage'
  recordBalance: number
  holdingsSum: number
  diff: number // 잔액 - 종목합계 (양수 = 미분류/현금성 잔액)
}

export function reconcile(
  holdings: Holding[],
  record: { isa: number; brokerage: number } | null,
): ReconcileResult[] | null {
  if (!record) return null
  return (['isa', 'brokerage'] as const).map((account) => {
    const holdingsSum = holdings.filter((h) => h.accountType === account).reduce((s, h) => s + h.marketValue, 0)
    return { account, recordBalance: record[account], holdingsSum, diff: record[account] - holdingsSum }
  })
}
