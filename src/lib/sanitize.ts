// Firestore/백업 파일에서 읽은 값을 앱 타입으로 안전하게 변환합니다.
import {
  ASSET_KEYS,
  COUNTRIES,
  DEFAULT_SETTINGS,
  INDUSTRIES,
  THEMES,
  type AccountType,
  type AssetRecord,
  type CompositionQuality,
  type Country,
  type EtfComposition,
  type Goal,
  type Holding,
  type HoldingAssetType,
  type Industry,
  type Settings,
  type Theme,
} from './types'
import { isValidISODate } from './date'

type Raw = Record<string, unknown>

const int = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d)
const ts = (v: unknown): number | undefined => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && 'toMillis' in v && typeof (v as { toMillis: unknown }).toMillis === 'function')
    return (v as { toMillis: () => number }).toMillis()
  return undefined
}
const industry = (v: unknown): Industry | null => ((INDUSTRIES as readonly string[]).includes(v as string) ? (v as Industry) : null)
const themes = (v: unknown): Theme[] => (Array.isArray(v) ? v.filter((t): t is Theme => (THEMES as readonly string[]).includes(t)) : [])

export function toAssetRecord(id: string, d: Raw): AssetRecord | null {
  const date = str(d.date, id)
  if (!isValidISODate(date)) return null
  const r: AssetRecord = { id, date, memo: str(d.memo), isa: 0, brokerage: 0, crypto: 0, gold: 0, cash: 0, createdAt: ts(d.createdAt), updatedAt: ts(d.updatedAt) }
  for (const k of ASSET_KEYS) r[k] = int(d[k])
  return r
}

const ACCOUNT_TYPES: AccountType[] = ['brokerage', 'isa']
const HOLDING_TYPES: HoldingAssetType[] = ['stock', 'equityEtf', 'bondEtf', 'goldProduct', 'other']

export function toHolding(id: string, d: Raw): Holding | null {
  const snapshotDate = str(d.snapshotDate)
  if (!isValidISODate(snapshotDate)) return null
  return {
    id,
    snapshotDate,
    accountType: ACCOUNT_TYPES.includes(d.accountType as AccountType) ? (d.accountType as AccountType) : 'brokerage',
    symbol: str(d.symbol),
    name: str(d.name, '(이름 없음)'),
    assetType: HOLDING_TYPES.includes(d.assetType as HoldingAssetType) ? (d.assetType as HoldingAssetType) : 'other',
    country: (COUNTRIES as readonly string[]).includes(d.country as string) ? (d.country as Country) : '기타',
    marketValue: int(d.marketValue),
    costBasis: num(d.costBasis) == null ? null : Math.round(num(d.costBasis)!),
    quantity: num(d.quantity),
    industry: industry(d.industry),
    themes: themes(d.themes),
    memo: str(d.memo),
    isSample: d.isSample === true,
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
  }
}

const QUALITIES: CompositionQuality[] = ['official', 'manual', 'estimate', 'sample']

export function toComposition(id: string, d: Raw): EtfComposition | null {
  const symbol = str(d.symbol)
  if (!symbol) return null
  const inds: Partial<Record<Industry, number>> = {}
  if (d.industries && typeof d.industries === 'object') {
    for (const [k, v] of Object.entries(d.industries as Raw)) {
      const ind = industry(k)
      const n = num(v)
      if (ind && n != null && n > 0) inds[ind] = n
    }
  }
  const holdings = Array.isArray(d.holdings)
    ? (d.holdings as Raw[])
        .filter((h) => h && typeof h === 'object')
        .map((h) => ({ name: str(h.name), symbol: str(h.symbol), weight: num(h.weight) ?? 0, industry: industry(h.industry), themes: themes(h.themes) }))
        .filter((h) => h.name || h.symbol)
    : []
  return {
    id,
    symbol,
    name: str(d.name),
    asOfDate: isValidISODate(str(d.asOfDate)) ? str(d.asOfDate) : '1900-01-01',
    source: str(d.source),
    quality: QUALITIES.includes(d.quality as CompositionQuality) ? (d.quality as CompositionQuality) : 'manual',
    industries: inds,
    holdings,
    updatedAt: ts(d.updatedAt),
  }
}

export function toGoal(id: string, d: Raw): Goal | null {
  const targetYear = int(d.targetYear)
  const targetAmount = int(d.targetAmount)
  if (targetYear < 1900 || targetAmount <= 0) return null
  return { id, targetYear, targetAmount, memo: str(d.memo), createdAt: ts(d.createdAt), updatedAt: ts(d.updatedAt) }
}

export function toSettings(d: Raw | undefined): Settings {
  if (!d) return DEFAULT_SETTINGS
  const rt = (d.riskThresholds ?? {}) as Raw
  const sim = (d.simulation ?? {}) as Raw
  const unit = d.displayCurrency
  const range = d.preferredChartRange
  return {
    displayCurrency: unit === 'won' || unit === 'man' || unit === 'eok' ? unit : DEFAULT_SETTINGS.displayCurrency,
    preferredChartRange: ['3m', '6m', '1y', '3y', 'all'].includes(range as string) ? (range as Settings['preferredChartRange']) : 'all',
    riskThresholds: {
      singleHolding: num(rt.singleHolding) ?? DEFAULT_SETTINGS.riskThresholds.singleHolding,
      singleIndustry: num(rt.singleIndustry) ?? DEFAULT_SETTINGS.riskThresholds.singleIndustry,
      singleCountry: num(rt.singleCountry) ?? DEFAULT_SETTINGS.riskThresholds.singleCountry,
    },
    simulation: {
      conservative: num(sim.conservative) ?? 3,
      base: num(sim.base) ?? 5,
      aggressive: num(sim.aggressive) ?? 7,
    },
  }
}
