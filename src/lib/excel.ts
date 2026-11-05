import * as XLSX from 'xlsx'
import { ASSET_KEYS, ASSET_LABELS, type AssetKey, type AssetRecord, type Goal, type Holding, ACCOUNT_LABELS, HOLDING_TYPE_LABELS } from './types'
import { parseFlexibleDate } from './date'
import { computeRecords, totalOf } from './assets'

// ───────────────────────── 가져오기 ─────────────────────────

type ColKey = 'date' | AssetKey | 'total' | 'delta' | 'rate' | 'memo'

const HEADER_MATCHERS: [ColKey, (h: string) => boolean][] = [
  ['date', (h) => /날짜|일자|기준일|^date$/i.test(h) && !/시리얼/.test(h)],
  ['isa', (h) => /isa/i.test(h)],
  ['brokerage', (h) => /일반/.test(h)],
  ['crypto', (h) => /암호|코인|crypto/i.test(h)],
  ['gold', (h) => /^금(\s|\(|$)|gold/i.test(h)],
  ['cash', (h) => /현금|예금/.test(h)],
  ['total', (h) => /총자산|합계|^total$/i.test(h)],
  ['rate', (h) => /증감률|증감율|변동률/.test(h)],
  ['delta', (h) => /증감|변동/.test(h) && !/률|율/.test(h)],
  ['memo', (h) => /메모|비고|memo|note/i.test(h)],
]

export type ImportStatus = 'new' | 'same' | 'conflict' | 'invalid' | 'duplicateInFile'

export interface ImportRow {
  rowNumber: number // 엑셀 행 번호 (1부터)
  rawDate: string
  date: string | null
  values: Record<AssetKey, number> | null
  memo: string
  computedTotal: number | null
  excelTotal: number | null
  excelDelta: number | null
  excelRate: number | null
  errors: string[] // 가져올 수 없는 문제
  warnings: string[] // 확인 필요 (가져오기는 가능)
  status: ImportStatus
  include: boolean
}

export interface ImportPreview {
  sheetName: string
  headerRow: number
  mappedColumns: Partial<Record<ColKey, string>>
  rows: ImportRow[]
  notChronological: boolean
  fileWarnings: string[]
}

function cellNumber(v: unknown): { value: number | null; bad: boolean } {
  if (v == null || v === '') return { value: null, bad: false }
  if (typeof v === 'number') return Number.isFinite(v) ? { value: v, bad: false } : { value: null, bad: true }
  const s = String(v).replace(/[,\s원₩]/g, '')
  if (s === '' || s === '-') return { value: null, bad: false }
  const n = Number(s.replace(/%$/, ''))
  if (!Number.isFinite(n)) return { value: null, bad: true }
  return { value: s.endsWith('%') ? n / 100 : n, bad: false }
}

export class ImportError extends Error {}

export function parseAssetWorkbook(data: ArrayBuffer, existing: AssetRecord[]): ImportPreview {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(data, { type: 'array', cellDates: false })
  } catch {
    throw new ImportError('엑셀/CSV 파일을 읽을 수 없습니다. 파일 형식을 확인해 주세요.')
  }
  const preferred = wb.SheetNames.find((n) => n.includes('월별자산입력')) ?? wb.SheetNames.find((n) => n.includes('자산'))
  const order = preferred ? [preferred, ...wb.SheetNames.filter((n) => n !== preferred)] : wb.SheetNames

  for (const sheetName of order) {
    const ws = wb.Sheets[sheetName]
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true })
    for (let hr = 0; hr < Math.min(grid.length, 15); hr++) {
      const header = (grid[hr] ?? []).map((c) => (c == null ? '' : String(c).trim()))
      const map: Partial<Record<ColKey, number>> = {}
      header.forEach((h, idx) => {
        if (!h) return
        for (const [key, test] of HEADER_MATCHERS) {
          if (map[key] == null && test(h)) {
            map[key] = idx
            break
          }
        }
      })
      const assetCols = ASSET_KEYS.filter((k) => map[k] != null).length
      if (map.date == null || assetCols < 2) continue
      return buildPreview(sheetName, hr, header, map, grid, existing)
    }
  }
  throw new ImportError('“날짜”와 자산 항목(ISA계좌, 일반계좌 등) 헤더가 있는 시트를 찾지 못했습니다.')
}

function buildPreview(
  sheetName: string,
  hr: number,
  header: string[],
  map: Partial<Record<ColKey, number>>,
  grid: unknown[][],
  existing: AssetRecord[],
): ImportPreview {
  const fileWarnings: string[] = []
  const missing = ASSET_KEYS.filter((k) => map[k] == null)
  if (missing.length) fileWarnings.push(`파일에 없는 항목은 0원으로 처리됩니다: ${missing.map((k) => ASSET_LABELS[k]).join(', ')}`)

  const rows: ImportRow[] = []
  for (let r = hr + 1; r < grid.length; r++) {
    const line = grid[r] ?? []
    const get = (k: ColKey) => (map[k] == null ? null : line[map[k]!])
    const rawDateV = get('date')
    const amountCells = ASSET_KEYS.map((k) => get(k))
    const hasAny = (rawDateV != null && String(rawDateV).trim() !== '') || amountCells.some((v) => v != null && v !== '')
    if (!hasAny) continue

    const errors: string[] = []
    const warnings: string[] = []
    const date = parseFlexibleDate(rawDateV)
    if (!date) errors.push(rawDateV == null || rawDateV === '' ? '날짜가 비어 있음' : '날짜 형식을 인식할 수 없음')

    const values = {} as Record<AssetKey, number>
    let bad = false
    for (const k of ASSET_KEYS) {
      if (map[k] == null) {
        values[k] = 0
        continue
      }
      const { value, bad: b } = cellNumber(get(k))
      if (b) {
        errors.push(`${ASSET_LABELS[k]} 값이 숫자가 아님`)
        bad = true
      } else if (value == null) {
        warnings.push(`${ASSET_LABELS[k]} 빈 칸 → 0원으로 가져옴`)
        values[k] = 0
      } else {
        if (!Number.isInteger(value)) warnings.push(`${ASSET_LABELS[k]} 소수점 → 원 단위 반올림`)
        values[k] = Math.round(value)
      }
    }
    const excelTotal = cellNumber(get('total')).value
    const excelDelta = cellNumber(get('delta')).value
    const excelRate = cellNumber(get('rate')).value
    const computedTotal = bad ? null : totalOf(values)
    if (computedTotal != null && excelTotal != null && Math.abs(Math.round(excelTotal) - computedTotal) > 0) {
      warnings.push(`엑셀 총자산(${Math.round(excelTotal).toLocaleString('ko-KR')})과 재계산 값 불일치`)
    }
    const memo = get('memo') == null ? '' : String(get('memo')).trim()
    rows.push({
      rowNumber: r + 1,
      rawDate: rawDateV == null ? '' : String(rawDateV),
      date,
      values: bad ? null : values,
      memo,
      computedTotal,
      excelTotal,
      excelDelta,
      excelRate,
      errors,
      warnings,
      status: errors.length ? 'invalid' : 'new',
      include: errors.length === 0,
    })
  }

  // 날짜 순서 확인 (엑셀 행 순서를 시간 순서로 가정하지 않음)
  const validDates = rows.filter((r) => r.date).map((r) => r.date!)
  const notChronological = validDates.some((d, i) => i > 0 && d < validDates[i - 1])
  if (notChronological) fileWarnings.push('엑셀 행 순서가 날짜 순서와 다릅니다. 실제 날짜 기준으로 정렬하여 증감을 다시 계산합니다.')

  // 파일 내 중복 날짜: 마지막 행만 유지
  const lastIdx = new Map<string, number>()
  rows.forEach((r, i) => r.date && r.status !== 'invalid' && lastIdx.set(r.date, i))
  rows.forEach((r, i) => {
    if (r.date && r.status !== 'invalid' && lastIdx.get(r.date) !== i) {
      r.status = 'duplicateInFile'
      r.include = false
      r.errors.push(`파일 내 같은 날짜 중복 (${rows[lastIdx.get(r.date)!].rowNumber}행을 사용)`)
    }
  })

  // 증감·증감률 검증: 날짜순 재계산 값과 엑셀 값 비교
  const candidates = rows.filter((r) => r.status === 'new' && r.values && r.date)
  const recomputed = computeRecords(
    candidates.map((r) => ({ id: r.date!, date: r.date!, memo: r.memo, ...r.values! })),
  )
  const byDate = new Map(recomputed.map((c) => [c.date, c]))
  for (const r of candidates) {
    const c = byDate.get(r.date!)!
    if (r.excelDelta != null && c.delta != null && Math.abs(r.excelDelta - c.delta) > 1) {
      r.warnings.push('엑셀 증감액이 날짜순 재계산 값과 다름 (재계산 값 사용)')
    } else if (r.excelRate != null && c.deltaRate != null && Math.abs(r.excelRate - c.deltaRate) > 1e-6) {
      r.warnings.push('엑셀 증감률이 날짜순 재계산 값과 다름 (재계산 값 사용)')
    }
  }

  // 기존 데이터와 비교 (재업로드 시 중복 생성 방지)
  const existingByDate = new Map(existing.map((e) => [e.date, e]))
  for (const r of candidates) {
    const e = existingByDate.get(r.date!)
    if (!e) continue
    const same = ASSET_KEYS.every((k) => e[k] === r.values![k]) && (e.memo || '') === r.memo
    if (same) {
      r.status = 'same'
      r.include = false
    } else {
      r.status = 'conflict'
      r.include = false
    }
  }

  const mappedColumns: Partial<Record<ColKey, string>> = {}
  for (const [k, idx] of Object.entries(map)) mappedColumns[k as ColKey] = header[idx as number]
  return { sheetName, headerRow: hr + 1, mappedColumns, rows, notChronological, fileWarnings }
}

// ───────────────────────── 내보내기 ─────────────────────────

function recordsSheet(records: AssetRecord[]) {
  const computed = computeRecords(records)
  const aoa: (string | number | null)[][] = [
    ['날짜', 'ISA계좌', '일반계좌', '암호화폐', '금', '현금', '총자산', '직전기록대비증감', '직전기록대비증감률', '월대표값', '메모'],
    ...computed.map((r) => [
      r.date,
      r.isa,
      r.brokerage,
      r.crypto,
      r.gold,
      r.cash,
      r.total,
      r.delta,
      r.deltaRate == null ? null : Number(r.deltaRate.toFixed(6)),
      r.isMonthRepresentative ? 'Y' : '',
      r.memo,
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 12 }, ...Array(7).fill({ wch: 14 }), { wch: 10 }, { wch: 8 }, { wch: 40 }]
  for (let i = 0; i < computed.length; i++) {
    for (let c = 1; c <= 7; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c })]
      if (cell && typeof cell.v === 'number') cell.z = '#,##0'
    }
    const rc = ws[XLSX.utils.encode_cell({ r: i + 1, c: 8 })]
    if (rc && typeof rc.v === 'number') rc.z = '0.00%'
  }
  return ws
}

export function exportWorkbook(data: { records: AssetRecord[]; holdings: Holding[]; goals: Goal[] }): Blob {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, recordsSheet(data.records), '월별자산입력')
  const h = [...data.holdings].sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate) || b.marketValue - a.marketValue)
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      h.map((x) => ({
        기준일: x.snapshotDate,
        계좌: ACCOUNT_LABELS[x.accountType],
        종목명: x.name,
        종목코드: x.symbol,
        자산유형: HOLDING_TYPE_LABELS[x.assetType],
        국가: x.country,
        평가금액: x.marketValue,
        매입금액: x.costBasis,
        수량: x.quantity,
        업종: x.industry ?? '',
        테마: x.themes.join(', '),
        메모: x.memo,
        예시데이터: x.isSample ? 'Y' : '',
      })),
    ),
    '보유종목',
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      [...data.goals].sort((a, b) => a.targetYear - b.targetYear).map((g) => ({ 목표연도: g.targetYear, 목표자산: g.targetAmount, 메모: g.memo ?? '' })),
    ),
    '목표',
  )
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function exportRecordsCsv(records: AssetRecord[]): Blob {
  const csv = XLSX.utils.sheet_to_csv(recordsSheet(records), { rawNumbers: true })
  return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
}
