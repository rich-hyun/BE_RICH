// 모든 날짜는 한국 시간(Asia/Seoul) 기준의 'YYYY-MM-DD' 문자열로 다룹니다.
// 문자열 날짜는 시간대 정보가 없어 저장·비교 시 시간대 오차가 생기지 않습니다.

const KST_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function todayKST(): string {
  return KST_FMT.format(new Date())
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false
  return d <= daysInMonth(y, m)
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function toISO(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export const yearOf = (iso: string) => Number(iso.slice(0, 4))
export const monthKey = (iso: string) => iso.slice(0, 7) // YYYY-MM

/** iso 날짜에서 n개월 이동 (말일 보정) */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

/** a → b 사이의 개월 수 (월 단위, b가 미래면 양수) */
export function monthsBetween(aIso: string, bIso: string): number {
  const [ay, am] = aIso.split('-').map(Number)
  const [by, bm] = bIso.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
export function formatKDate(iso: string, withWeekday = false): string {
  if (!isValidISODate(iso)) return iso
  const [y, m, d] = iso.split('-').map(Number)
  const base = `${y}. ${m}. ${d}.`
  if (!withWeekday) return base
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${base} (${WEEK[w]})`
}

export function formatKMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${y}년 ${m}월`
}

export function shortMonth(ym: string): string {
  return `${ym.slice(2, 4)}.${ym.slice(5, 7)}`
}

/** 엑셀 시리얼 → ISO (1900 날짜 체계, 시간대 무관) */
export function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 200000) return null
  const ms = Math.round((Math.floor(serial) - 25569) * 86400000)
  const dt = new Date(ms)
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

/**
 * 다양한 날짜 표기 → ISO. 실패 시 null.
 * 지원: '2026년 2월 24일 화요일', '2026-02-24', '2026.2.24', '2026/02/24', '20260224', 엑셀 시리얼, Date
 */
export function parseFlexibleDate(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    return KST_FMT.format(v)
  }
  if (typeof v === 'number') return excelSerialToISO(v)
  const s = String(v).trim()
  let m = s.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (!m) m = s.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?(?:\s|$|T|\()/)
  if (!m) m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) {
    const iso = toISO(Number(m[1]), Number(m[2]), Number(m[3]))
    return isValidISODate(iso) ? iso : null
  }
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToISO(Number(s))
  return null
}
