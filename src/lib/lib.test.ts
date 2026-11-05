import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { computeKpis, computeRecords, goalProgress, monthlyRepresentatives, simulate, yearlySummary } from './assets'
import { addMonths, monthsBetween, parseFlexibleDate } from './date'
import { formatAmountInput, formatKRW, parseAmount } from './format'
import { parseAssetWorkbook } from './excel'
import { analyzePortfolio, findComposition, normSymbol, reconcile } from './portfolio'
import { BACKUP_VERSION, assertNoSecrets, buildBackup, diffBackup, parseBackup, planRestore } from './backup'
import { DEFAULT_SETTINGS, type AssetRecord, type EtfComposition, type Holding } from './types'

// ※ 모든 테스트 데이터는 임의로 만든 가짜 값입니다.
const rec = (date: string, isa: number, brokerage = 0, memo = ''): AssetRecord => ({ id: date, date, isa, brokerage, crypto: 0, gold: 0, cash: 0, memo })

describe('date', () => {
  it('parses Korean / ISO / serial formats', () => {
    expect(parseFlexibleDate('2026년 2월 24일 화요일')).toBe('2026-02-24')
    expect(parseFlexibleDate('2026-04-01')).toBe('2026-04-01')
    expect(parseFlexibleDate('2026.4.8')).toBe('2026-04-08')
    expect(parseFlexibleDate(46077)).toBe('2026-02-24')
    expect(parseFlexibleDate('2026년 2월 30일')).toBeNull()
    expect(parseFlexibleDate('hello')).toBeNull()
  })
  it('month math', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(monthsBetween('2026-11-05', '2027-12-31')).toBe(13)
  })
})

describe('format', () => {
  it('units', () => {
    expect(formatKRW(86114908, 'won')).toBe('86,114,908원')
    expect(formatKRW(86114908, 'man')).toBe('8,611.5만원')
    expect(formatKRW(150000000, 'eok')).toBe('1.5억원')
    expect(formatKRW(-2000, 'won', { sign: true })).toBe('-2,000원')
    expect(formatKRW(2000, 'won', { sign: true })).toBe('+2,000원')
  })
  it('amount input distinguishes empty and zero', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('0')).toBe(0)
    expect(parseAmount('1,234')).toBe(1234)
    expect(Number.isNaN(parseAmount('12a'))).toBe(true)
    expect(formatAmountInput('1234567')).toBe('1,234,567')
  })
})

describe('assets', () => {
  const records = [rec('2026-04-27', 300), rec('2026-02-24', 100), rec('2026-04-01', 200), rec('2027-01-10', 400)]
  it('sorts by real date and computes deltas', () => {
    const c = computeRecords(records)
    expect(c.map((r) => r.date)).toEqual(['2026-02-24', '2026-04-01', '2026-04-27', '2027-01-10'])
    expect(c[1].delta).toBe(100)
    expect(c[1].deltaRate).toBe(1)
    expect(c[0].delta).toBeNull()
  })
  it('month representative = last record of month', () => {
    const m = monthlyRepresentatives(computeRecords(records))
    expect(m.map((x) => x.date)).toEqual(['2026-02-24', '2026-04-27', '2027-01-10'])
    expect(m[1].delta).toBe(200)
  })
  it('yearly summary uses last record per year', () => {
    const y = yearlySummary(computeRecords(records), '2027-03-01')
    expect(y).toHaveLength(2)
    expect(y[0].total).toBe(300)
    expect(y[1].delta).toBe(100)
    expect(y[1].isPartial).toBe(true)
  })
  it('kpis', () => {
    const k = computeKpis(computeRecords(records), '2027-03-01')!
    expect(k.current.total).toBe(400)
    expect(k.monthDelta).toBe(100)
    expect(k.sinceFirst).toBe(300)
    expect(k.peak.total).toBe(400)
    expect(k.ytd).toBe(100) // 전년 마지막 기록(300) 대비
  })
  it('goal progress', () => {
    const g = goalProgress({ id: 'g', targetYear: 2027, targetAmount: 1000 }, 400, '2026-11-05')
    expect(g.rate).toBeCloseTo(0.4)
    expect(g.shortfall).toBe(600)
    expect(g.monthsLeft).toBe(13)
    expect(g.requiredMonthly).toBe(Math.ceil(600 / 13))
  })
  it('simulation with 0% equals contributions', () => {
    const s = simulate(1000, 100, 2, [{ key: 'z', annualRate: 0 }, { key: 'p', annualRate: 12 }])
    expect(s[s.length - 1].z).toBe(1000 + 2400)
    expect(s[s.length - 1].p).toBeGreaterThan(3400)
    expect(s).toHaveLength(3)
  })
})

describe('excel import', () => {
  const makeBook = () => {
    const aoa = [
      ['📌 안내 문구'],
      ['날짜', 'ISA계좌', '일반계좌', '암호화폐', '금', '현금', '총자산', '전월대비증감', '전월대비증감률'],
      ['2026년 4월 1일 수요일', 200, 0, 0, 0, 0, 200, 100, 1],
      ['2026년 2월 24일 화요일', 100, 0, 0, 0, 0, 100, null, null],
      ['2026년 4월 8일 수요일', 300, 0, 0, 0, 0, 999, 100, 0.5],
      ['잘못된날짜', 1, 0, 0, 0, 0, 1, null, null],
      ['2026년 4월 8일 수요일', 310, 0, 0, 0, 0, 310, null, null],
      [null, null, null, null, null, null, '', '', ''],
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '월별자산입력')
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  }
  it('finds header, validates, flags issues', () => {
    const p = parseAssetWorkbook(makeBook(), [rec('2026-02-24', 100)])
    expect(p.headerRow).toBe(2)
    expect(p.notChronological).toBe(true)
    expect(p.rows).toHaveLength(5)
    const byRow = Object.fromEntries(p.rows.map((r) => [r.rowNumber, r]))
    expect(byRow[4].status).toBe('same') // 기존과 동일 → 재업로드 중복 방지
    expect(byRow[5].status).toBe('duplicateInFile')
    expect(byRow[6].status).toBe('invalid')
    expect(byRow[7].status).toBe('new')
    expect(byRow[3].status).toBe('new')
    expect(byRow[5].warnings.some((w) => w.includes('총자산'))).toBe(true)
  })
})

describe('portfolio', () => {
  const H = (p: Partial<Holding>): Holding => ({
    id: Math.random().toString(),
    snapshotDate: '2026-11-05',
    accountType: 'brokerage',
    symbol: '',
    name: 'x',
    assetType: 'stock',
    country: '한국',
    marketValue: 0,
    costBasis: null,
    quantity: null,
    industry: null,
    themes: [],
    memo: '',
    ...p,
  })
  const comp: EtfComposition = {
    id: 'c1',
    symbol: 'NDXETF',
    name: 'ndx',
    asOfDate: '2026-10-31',
    source: 'test',
    quality: 'manual',
    industries: { 반도체: 30, 소프트웨어: 50 },
    holdings: [{ name: 'NVIDIA', symbol: 'NVDA', weight: 10, industry: '반도체', themes: ['AI'] }],
  }
  const holdings = [
    H({ name: 'SK하이닉스', symbol: '000660', marketValue: 400, industry: '반도체', themes: ['AI'] }),
    H({ name: 'NDX', symbol: 'ndxetf', assetType: 'equityEtf', country: '미국', marketValue: 500 }),
    H({ name: 'NDX', symbol: 'NDXETF', assetType: 'equityEtf', country: '미국', marketValue: 100, accountType: 'isa' }),
    H({ name: 'S&P', symbol: '', assetType: 'equityEtf', country: '미국', marketValue: 100 }),
  ]
  it('ETF look-through industries sum to 100% and do not misclassify whole ETF', () => {
    const a = analyzePortfolio(holdings, [comp], DEFAULT_SETTINGS.riskThresholds)
    expect(a.total).toBe(1100)
    const ind = Object.fromEntries(a.industries.map((s) => [s.key, s.value]))
    expect(ind['반도체']).toBeCloseTo(400 + 600 * 0.3)
    expect(ind['소프트웨어']).toBeCloseTo(300)
    expect(ind['분류 미확인']).toBeCloseTo(600 * 0.2 + 100)
    expect(a.industries.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
    expect(a.themes.semiconductorDirectKR).toBe(400)
    expect(a.themes.aiTheme).toBeCloseTo(400 + 60)
    expect(a.themes.bigTech).toBeCloseTo(60)
    expect(a.byHolding[0].value).toBe(600) // 같은 ETF 계좌 합산
    expect(a.warnings.length).toBeGreaterThan(0)
  })
  it('user-written industries: custom names, ETF direct industry fallback, % of total', () => {
    const hs = [
      H({ name: 'A', symbol: 'A1', marketValue: 300, industry: '2차전지' }),
      H({ name: 'B', symbol: 'B1', marketValue: 100, industry: '반도체 장비' }),
      H({ name: 'ETF', symbol: 'NOCOMP', assetType: 'equityEtf', country: '미국', marketValue: 500, industry: '미국 대형주' }),
      H({ name: 'ETF2', symbol: 'NDXETF', assetType: 'equityEtf', country: '미국', marketValue: 100, industry: '무시됨' }),
    ]
    const a = analyzePortfolio(hs, [comp], DEFAULT_SETTINGS.riskThresholds)
    const share = Object.fromEntries(a.industries.map((s) => [s.key, s.share]))
    expect(share['2차전지']).toBeCloseTo(0.3)
    expect(share['미국 대형주']).toBeCloseTo(0.5) // 구성비 없는 ETF → 직접 입력 업종
    expect(share['무시됨']).toBeUndefined() // 구성비 있는 ETF는 구성비 우선
    expect(share['소프트웨어']).toBeCloseTo(0.05)
    expect(a.industries.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
    expect(a.themes.semiconductorTotal).toBeCloseTo(100 + 30) // '반도체 장비' + ETF 내 반도체 30%
    expect(a.industries.find((s) => s.key === '2차전지')!.sources[0].label).toContain('A')
  })
  it('composition version by snapshot date', () => {
    const older = { ...comp, id: 'old', asOfDate: '2026-01-01' }
    expect(findComposition('NDXETF', [comp, older], '2026-06-01')?.composition.id).toBe('old')
    expect(findComposition('NDXETF', [comp], '2026-06-01')?.dateMismatch).toBe(true)
    expect(normSymbol('A000660')).toBe('000660')
  })
  it('reconcile only when same date record exists', () => {
    expect(reconcile(holdings, null)).toBeNull()
    const r = reconcile(holdings, { isa: 150, brokerage: 1000 })!
    expect(r.find((x) => x.account === 'isa')!.diff).toBe(50)
  })
})

describe('backup', () => {
  const payload = () => ({
    assetRecords: [rec('2026-01-01', 5)],
    holdings: [],
    etfCompositions: [],
    goals: [{ id: 'g', targetYear: 2030, targetAmount: 3 }],
    settings: DEFAULT_SETTINGS,
    members: [{ username: 'chaewon', canEdit: false }],
  })

  it('round trips v2 with checksum and rejects foreign files', async () => {
    const b = await buildBackup(payload())
    expect(b.version).toBe(BACKUP_VERSION)
    const { data, skipped, integrity } = await parseBackup(JSON.stringify(b, null, 2))
    expect(skipped).toBe(0)
    expect(integrity).toBe('verified')
    expect(data.assetRecords[0].isa).toBe(5)
    expect(data.goals).toHaveLength(1)
    expect(data.members).toEqual([{ username: 'chaewon', canEdit: false }])
    await expect(parseBackup('{"app":"other"}')).rejects.toThrow()
    await expect(parseBackup('not json')).rejects.toThrow()
  })

  it('detects tampering and future versions', async () => {
    const b = await buildBackup(payload())
    b.data.assetRecords[0].isa = 999
    expect((await parseBackup(JSON.stringify(b))).integrity).toBe('mismatch')
    await expect(parseBackup(JSON.stringify({ app: 'be-rich', version: 99 }))).rejects.toThrow(/최신/)
  })

  it('migrates an old v1 (flat) backup', async () => {
    const v1 = { app: 'be-rich', version: 1, exportedAt: '2026-01-01T00:00:00Z', assetRecords: [rec('2026-01-01', 7)], holdings: [], etfCompositions: [], goals: [], settings: DEFAULT_SETTINGS }
    const r = await parseBackup(JSON.stringify(v1))
    expect(r.sourceVersion).toBe(1)
    expect(r.data.assetRecords[0].isa).toBe(7)
    expect(r.data.members).toEqual([])
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('never contains credentials', async () => {
    const dirty = { ...payload(), members: [{ username: 'chaewon', canEdit: true, password: 'x', uid: 'abc' } as never] }
    const text = JSON.stringify(await buildBackup(dirty))
    expect(text).not.toMatch(/password|token|uid/i)
    expect(() => assertNoSecrets({ a: { idToken: 'x' } })).toThrow()
  })

  it('diff separates new / identical / conflict and plans restore modes', async () => {
    const incoming = { ...payload(), assetRecords: [rec('2026-01-01', 5), rec('2026-02-01', 9), rec('2026-03-01', 1)] }
    const current = { assetRecords: [{ ...rec('2026-01-01', 5), updatedAt: 123 }, rec('2026-02-01', 1), rec('2025-12-01', 4)], holdings: [], etfCompositions: [], goals: [] }
    const d = diffBackup({ ...incoming }, current)[0]
    expect([d.newCount, d.identicalCount, d.conflictCount]).toEqual([1, 1, 1])
    const keep = planRestore(incoming, current, 'merge-keep')
    expect(keep.writes.filter((w) => w.collection === 'assetRecords').map((w) => w.item.id)).toEqual(['2026-03-01'])
    expect(keep.kept).toBe(1)
    const over = planRestore(incoming, current, 'merge-overwrite')
    expect(over.writes.filter((w) => w.previous)).toHaveLength(1)
    expect(over.deletes).toHaveLength(0)
    const rep = planRestore(incoming, current, 'replace')
    expect(rep.deletes.map((x) => x.previous.id)).toEqual(['2025-12-01'])
  })
})
