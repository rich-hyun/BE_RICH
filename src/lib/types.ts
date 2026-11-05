// 모든 금액은 KRW 정수(원) 단위로 저장합니다.

export const ASSET_KEYS = ['isa', 'brokerage', 'crypto', 'gold', 'cash'] as const
export type AssetKey = (typeof ASSET_KEYS)[number]

export const ASSET_LABELS: Record<AssetKey, string> = {
  isa: 'ISA계좌',
  brokerage: '일반계좌',
  crypto: '암호화폐',
  gold: '금',
  cash: '현금',
}

export const ASSET_COLORS: Record<AssetKey, string> = {
  isa: 'var(--chart-1)',
  brokerage: 'var(--chart-2)',
  crypto: 'var(--chart-3)',
  gold: 'var(--chart-4)',
  cash: 'var(--chart-5)',
}

/** users/{uid}/assetRecords/{YYYY-MM-DD} — 문서 ID가 날짜이므로 같은 날짜 중복이 생기지 않습니다. */
export interface AssetRecord {
  id: string
  date: string // YYYY-MM-DD (한국 날짜)
  isa: number
  brokerage: number
  crypto: number
  gold: number
  cash: number
  memo: string
  createdAt?: number // epoch ms
  updatedAt?: number
}

export type AccountType = 'brokerage' | 'isa'
export const ACCOUNT_LABELS: Record<AccountType, string> = { brokerage: '일반계좌', isa: 'ISA' }

export type HoldingAssetType = 'stock' | 'equityEtf' | 'bondEtf' | 'goldProduct' | 'other'
export const HOLDING_TYPE_LABELS: Record<HoldingAssetType, string> = {
  stock: '개별주식',
  equityEtf: '주식형 ETF',
  bondEtf: '채권형 ETF',
  goldProduct: '금 관련 투자상품',
  other: '기타',
}
export const isEtfType = (t: HoldingAssetType) => t === 'equityEtf' || t === 'bondEtf' || t === 'goldProduct'

export const COUNTRIES = ['한국', '미국', '기타'] as const
export type Country = (typeof COUNTRIES)[number]

/**
 * 업종은 사용자가 직접 입력합니다(자유 입력). 아래는 입력 추천용 기본 목록입니다.
 * 한 종목(또는 ETF 내 비중)은 하나의 업종에만 속하므로 업종 합계는 100%를 넘지 않습니다.
 * 반도체·AI '테마'는 별도로 분석합니다.
 */
export const INDUSTRIES = [
  '반도체',
  '소프트웨어',
  '클라우드·AI 인프라',
  '인터넷·플랫폼',
  '금융',
  '헬스케어',
  '산업재',
  '소비재',
  '에너지',
  '통신',
  '부동산',
  '기타',
] as const
export type Industry = string
export const MAX_INDUSTRY_LEN = 30
/** '반도체', '반도체 장비'처럼 이름에 '반도체'가 들어간 업종은 반도체 노출로 집계 */
export const isSemiIndustry = (name: string | null | undefined) => !!name && name.includes('반도체')
export const UNCLASSIFIED = '분류 미확인'

/** 업종과 독립적인 테마 태그 (중복 가능, 합계 개념 없음) */
export const THEMES = ['AI', '반도체', '미국 빅테크'] as const
export type Theme = (typeof THEMES)[number]

/** users/{uid}/holdings/{holdingId} — snapshotDate 별로 보유 종목을 따로 저장(스냅샷) */
export interface Holding {
  id: string
  snapshotDate: string // YYYY-MM-DD
  accountType: AccountType
  symbol: string // 티커/종목코드 (ETF 구성비 연결 키)
  name: string
  assetType: HoldingAssetType
  country: Country
  marketValue: number // 평가금액(원, 정수)
  costBasis: number | null // 매입금액
  quantity: number | null
  industry: Industry | null // 직접 지정 업종 (ETF는 구성비가 없을 때만 사용)
  themes: Theme[] // 개별주식 테마
  memo: string
  isSample?: boolean // 예시 데이터 표시용
  createdAt?: number
  updatedAt?: number
}

export type CompositionQuality = 'official' | 'manual' | 'estimate' | 'sample'
export const QUALITY_LABELS: Record<CompositionQuality, string> = {
  official: '운용사 공시 데이터',
  manual: '사용자 직접 입력',
  estimate: '추정치',
  sample: '예시(추정) – 확인 필요',
}

export interface EtfConstituent {
  name: string
  symbol: string
  weight: number // ETF 내 비중 %
  industry: Industry | null
  themes: Theme[]
}

/** users/{uid}/etfCompositions/{id} — 같은 종목코드에 여러 기준일 버전을 둘 수 있습니다. */
export interface EtfComposition {
  id: string
  symbol: string
  name: string
  asOfDate: string // 구성비 기준일
  source: string // 출처 (운용사 홈페이지 등)
  quality: CompositionQuality
  industries: Record<string, number> // 업종명 → ETF 내 비중 %
  holdings: EtfConstituent[] // 주요 구성종목 (일부만 있어도 됨)
  updatedAt?: number
}

export interface Goal {
  id: string
  targetYear: number
  targetAmount: number
  memo?: string
  createdAt?: number
  updatedAt?: number
}

export type DisplayUnit = 'won' | 'man' | 'eok'
export type ChartRange = '3m' | '6m' | '1y' | '3y' | 'all'

export interface RiskThresholds {
  singleHolding: number // %
  singleIndustry: number
  singleCountry: number
}

/** users/{uid}/settings/general */
export interface Settings {
  displayCurrency: DisplayUnit
  riskThresholds: RiskThresholds
  preferredChartRange: ChartRange
  simulation?: { conservative: number; base: number; aggressive: number }
}

export const DEFAULT_SETTINGS: Settings = {
  displayCurrency: 'man',
  riskThresholds: { singleHolding: 25, singleIndustry: 40, singleCountry: 80 },
  preferredChartRange: 'all',
  simulation: { conservative: 3, base: 5, aggressive: 7 },
}
