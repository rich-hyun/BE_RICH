import type { AssetRecord, EtfComposition, Goal, Holding, Settings } from './types'
import { toAssetRecord, toComposition, toGoal, toHolding, toSettings } from './sanitize'

/**
 * 백업 파일 형식 (현재 v2)
 *
 *  v1 : { app, version:1, exportedAt, assetRecords, holdings, etfCompositions, goals, settings }   ← 평평한 구조
 *  v2 : { app, version:2, exportedAt, counts, checksum, data:{ assetRecords, holdings, etfCompositions, goals, settings, members } }
 *
 * 형식을 바꿀 때는 BACKUP_VERSION 을 올리고 MIGRATIONS 에 "이전 버전 → 다음 버전" 변환 함수를 추가하세요.
 * 그러면 아무리 오래된 백업 파일도 한 단계씩 변환되어 복원됩니다. (파일 내용은 절대 삭제하지 않고 변환만 합니다.)
 *
 * 보안: 백업에는 화면에 쓰이는 자산 데이터와 계정의 "아이디·수정권한"만 담깁니다.
 *       비밀번호, 인증 토큰, UID, Firebase 설정값은 어떤 경로로도 포함되지 않습니다.
 */
export const BACKUP_APP = 'be-rich'
export const BACKUP_VERSION = 2

export interface BackupMember {
  username: string
  canEdit: boolean
}

export interface BackupPayload {
  assetRecords: AssetRecord[]
  holdings: Holding[]
  etfCompositions: EtfComposition[]
  goals: Goal[]
  settings: Settings | null
  members: BackupMember[]
}

export interface BackupFile {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  counts: Record<string, number>
  checksum: { algorithm: 'SHA-256'; value: string }
  data: BackupPayload
}

export type CollectionKey = 'assetRecords' | 'holdings' | 'etfCompositions' | 'goals'
export const COLLECTION_LABELS: Record<CollectionKey, string> = {
  assetRecords: '월별 자산 기록',
  holdings: '보유 종목',
  etfCompositions: 'ETF 구성비',
  goals: '목표 자산',
}
const COLLECTIONS = Object.keys(COLLECTION_LABELS) as CollectionKey[]

export class BackupError extends Error {}

// ───────────── 민감정보 차단 ─────────────
const SECRET_KEY = /pass(word|wd)?|token|secret|api[-_]?key|credential|private[-_]?key|auth(?!or)|uid|session|refresh/i

/** 직렬화 직전 마지막 안전장치: 키 이름에 인증정보로 보이는 것이 있으면 내보내기를 중단합니다. (값이 아니라 "키"만 검사) */
export function assertNoSecrets(value: unknown, path = ''): void {
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoSecrets(v, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k)) throw new BackupError(`백업에 포함될 수 없는 항목(${path}.${k})이 발견되어 내보내기를 중단했습니다.`)
      assertNoSecrets(v, `${path}.${k}`)
    }
  }
}

// ───────────── 무결성 검사 ─────────────
async function sha256(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return ''
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function buildBackup(p: BackupPayload): Promise<BackupFile> {
  // 알려진 필드만 다시 복사해 의도하지 않은 필드가 섞이지 않게 함
  const data: BackupPayload = {
    assetRecords: p.assetRecords.map((r) => toAssetRecord(r.id, { ...r }) ?? r).map((r) => ({ ...r, id: r.date })),
    holdings: p.holdings.map((h) => toHolding(h.id, { ...h }) ?? h),
    etfCompositions: p.etfCompositions.map((c) => toComposition(c.id, { ...c }) ?? c),
    goals: p.goals.map((g) => toGoal(g.id, { ...g }) ?? g),
    settings: p.settings ? toSettings({ ...p.settings }) : null,
    members: p.members.map((m) => ({ username: m.username, canEdit: m.canEdit })),
  }
  assertNoSecrets(data)
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      assetRecords: data.assetRecords.length,
      holdings: data.holdings.length,
      etfCompositions: data.etfCompositions.length,
      goals: data.goals.length,
      members: data.members.length,
    },
    checksum: { algorithm: 'SHA-256', value: await sha256(JSON.stringify(data)) },
    data,
  }
}

// ───────────── 버전 마이그레이션 ─────────────
type Raw = Record<string, unknown>
/** MIGRATIONS[n] : 버전 n 파일을 버전 n+1 구조로 변환 */
const MIGRATIONS: Record<number, (o: Raw) => Raw> = {
  1: (o) => ({
    app: o.app,
    version: 2,
    exportedAt: o.exportedAt,
    data: {
      assetRecords: o.assetRecords,
      holdings: o.holdings,
      etfCompositions: o.etfCompositions,
      goals: o.goals,
      settings: o.settings,
      members: [], // v1 에는 계정 정보가 없었음
    },
  }),
}

export type Integrity = 'verified' | 'unverified' | 'mismatch'

export interface BackupData extends BackupPayload {
  exportedAt: string
}

export interface ParsedBackup {
  data: BackupData
  skipped: number
  warnings: string[]
  sourceVersion: number
  integrity: Integrity
}

const USERNAME = /^[a-z][a-z0-9_]{2,19}$/

export async function parseBackup(text: string): Promise<ParsedBackup> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('JSON 형식이 아닙니다. 이 앱에서 내려받은 백업 파일인지 확인해 주세요.')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BackupError('백업 파일 구조가 올바르지 않습니다.')
  let o = raw as Raw
  if (o.app !== BACKUP_APP) throw new BackupError('BE RICH 백업 파일이 아닙니다.')
  const sourceVersion = o.version
  if (typeof sourceVersion !== 'number' || !Number.isInteger(sourceVersion) || sourceVersion < 1)
    throw new BackupError('백업 파일의 버전 정보를 확인할 수 없습니다.')
  if (sourceVersion > BACKUP_VERSION)
    throw new BackupError(`이 파일은 더 새로운 형식(v${sourceVersion})입니다. 앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요. (현재 앱: v${BACKUP_VERSION})`)

  const warnings: string[] = []
  // 무결성(체크섬)은 변환 전 원본 구조에서만 검증 가능
  let integrity: Integrity = 'unverified'
  if (sourceVersion >= 2) {
    const cs = o.checksum as { value?: unknown } | undefined
    if (cs && typeof cs.value === 'string' && cs.value) {
      const actual = await sha256(JSON.stringify(o.data))
      if (!actual) warnings.push('이 환경에서는 무결성 검사를 할 수 없어 건너뜁니다.')
      else integrity = actual === cs.value ? 'verified' : 'mismatch'
    }
  } else {
    warnings.push(`v${sourceVersion} 형식의 오래된 백업 파일입니다. 최신 형식으로 변환해 복원합니다. (무결성 검사 정보 없음)`)
  }
  for (let v = sourceVersion; v < BACKUP_VERSION; v++) {
    const m = MIGRATIONS[v]
    if (!m) throw new BackupError(`v${v} 백업을 변환하는 방법을 찾을 수 없습니다.`)
    o = m(o)
  }

  const body = o.data
  if (!body || typeof body !== 'object') throw new BackupError('백업 파일에 데이터가 없습니다.')
  const b = body as Raw

  let skipped = 0
  const list = <T extends { id: string }>(v: unknown, fn: (id: string, d: Raw) => T | null, label: string): T[] => {
    if (v == null) return []
    if (!Array.isArray(v)) {
      warnings.push(`${label} 항목이 목록 형식이 아니어서 제외되었습니다.`)
      return []
    }
    const byId = new Map<string, T>()
    for (const item of v) {
      if (!item || typeof item !== 'object') {
        skipped++
        continue
      }
      const it = item as Raw
      const id = typeof it.id === 'string' && it.id ? it.id : ''
      const parsed = id ? fn(id, it) : null
      if (!parsed) {
        skipped++
        continue
      }
      if (byId.has(parsed.id)) warnings.push(`${label}: 파일 안에 같은 ID(${parsed.id})가 중복되어 뒤쪽 항목을 사용합니다.`)
      byId.set(parsed.id, parsed)
    }
    return [...byId.values()]
  }

  const members: BackupMember[] = []
  if (Array.isArray(b.members)) {
    for (const m of b.members) {
      const mm = m as Raw | null
      if (mm && typeof mm.username === 'string' && USERNAME.test(mm.username) && typeof mm.canEdit === 'boolean') members.push({ username: mm.username, canEdit: mm.canEdit })
      else skipped++
    }
  }

  const settingsRaw = b.settings
  const hasSettings = !!settingsRaw && typeof settingsRaw === 'object'
  if (!hasSettings) warnings.push('백업 파일에 설정 정보가 없습니다.')

  const data: BackupData = {
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
    assetRecords: list(b.assetRecords, toAssetRecord, COLLECTION_LABELS.assetRecords).map((r) => ({ ...r, id: r.date })),
    holdings: list(b.holdings, toHolding, COLLECTION_LABELS.holdings),
    etfCompositions: list(b.etfCompositions, toComposition, COLLECTION_LABELS.etfCompositions),
    goals: list(b.goals, toGoal, COLLECTION_LABELS.goals),
    settings: hasSettings ? toSettings(settingsRaw as Raw) : null,
    members,
  }
  return { data, skipped, warnings, sourceVersion, integrity }
}

// ───────────── 복원 미리보기 / 계획 ─────────────
export type RestoreMode = 'merge-keep' | 'merge-overwrite' | 'replace'

export interface CurrentData {
  assetRecords: AssetRecord[]
  holdings: Holding[]
  etfCompositions: EtfComposition[]
  goals: Goal[]
}

type AnyItem = AssetRecord | Holding | EtfComposition | Goal

export interface ItemDescription {
  title: string
  summary: string
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

export function describeItem(collection: CollectionKey, item: AnyItem): ItemDescription {
  switch (collection) {
    case 'assetRecords': {
      const r = item as AssetRecord
      return { title: r.date, summary: `총자산 ${won(r.isa + r.brokerage + r.crypto + r.gold + r.cash)}${r.memo ? ` · ${r.memo.slice(0, 20)}` : ''}` }
    }
    case 'holdings': {
      const h = item as Holding
      return { title: `${h.snapshotDate} ${h.name}`, summary: `${h.accountType === 'isa' ? 'ISA' : '일반'} · ${won(h.marketValue)}` }
    }
    case 'etfCompositions': {
      const c = item as EtfComposition
      return { title: `${c.symbol} ${c.asOfDate}`, summary: `업종 ${Object.keys(c.industries).length}개 · 구성종목 ${c.holdings.length}개` }
    }
    case 'goals': {
      const g = item as Goal
      return { title: `${g.targetYear}년 목표`, summary: won(g.targetAmount) }
    }
  }
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') {
    const e = Object.entries(v as Raw)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${e.map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}
/** 생성·수정 시각은 내용 비교에서 제외 */
const fingerprint = (item: AnyItem): string => {
  const { createdAt: _c, updatedAt: _u, ...rest } = item as AnyItem & { createdAt?: number; updatedAt?: number }
  void _c
  void _u
  return stable(rest)
}

/** ID 는 달라도 "같은 것"으로 보이는 항목을 찾는 키 (예: 같은 날짜·계좌·종목의 보유 종목) */
function naturalKey(collection: CollectionKey, item: AnyItem): string | null {
  switch (collection) {
    case 'holdings': {
      const h = item as Holding
      return `${h.snapshotDate}|${h.accountType}|${(h.symbol || h.name).trim().toLowerCase()}`
    }
    case 'etfCompositions': {
      const c = item as EtfComposition
      return `${c.symbol.trim().toLowerCase()}|${c.asOfDate}`
    }
    case 'goals':
      return String((item as Goal).targetYear)
    default:
      return null // 월별 기록은 ID 가 곧 날짜
  }
}

export interface ConflictItem {
  id: string
  title: string
  current: string
  incoming: string
}

export interface RestoreDiff {
  collection: CollectionKey
  label: string
  incoming: number
  newCount: number
  identicalCount: number
  conflictCount: number // 같은 ID 인데 내용이 다름
  existingCount: number
  conflicts: ConflictItem[]
  /** 다른 ID 인데 날짜·종목 등이 같아 중복으로 보이는 항목 */
  duplicates: ConflictItem[]
}

export function diffBackup(data: BackupPayload, current: CurrentData): RestoreDiff[] {
  return COLLECTIONS.map((collection) => {
    const incoming = data[collection] as AnyItem[]
    const existing = current[collection] as AnyItem[]
    const byId = new Map(existing.map((x) => [x.id, x]))
    const byKey = new Map<string, AnyItem>()
    for (const e of existing) {
      const k = naturalKey(collection, e)
      if (k) byKey.set(k, e)
    }
    let newCount = 0
    let identicalCount = 0
    const conflicts: ConflictItem[] = []
    const duplicates: ConflictItem[] = []
    for (const inc of incoming) {
      const cur = byId.get(inc.id)
      if (!cur) {
        newCount++
        const k = naturalKey(collection, inc)
        const twin = k ? byKey.get(k) : undefined
        if (twin) duplicates.push({ id: inc.id, title: describeItem(collection, inc).title, current: describeItem(collection, twin).summary, incoming: describeItem(collection, inc).summary })
      } else if (fingerprint(cur) === fingerprint(inc)) identicalCount++
      else conflicts.push({ id: inc.id, title: describeItem(collection, inc).title, current: describeItem(collection, cur).summary, incoming: describeItem(collection, inc).summary })
    }
    return {
      collection,
      label: COLLECTION_LABELS[collection],
      incoming: incoming.length,
      newCount,
      identicalCount,
      conflictCount: conflicts.length,
      existingCount: existing.length,
      conflicts,
      duplicates,
    }
  })
}

export interface RestorePlan {
  /** 기록할 항목. previous 가 있으면 덮어쓰기(이전 버전을 이력에 보존) */
  writes: { collection: CollectionKey; item: AnyItem; previous?: AnyItem }[]
  /** 삭제할 항목 (전체 덮어쓰기에서만) */
  deletes: { collection: CollectionKey; previous: AnyItem }[]
  /** 내용이 같아 건너뛴 항목 수 */
  unchanged: number
  /** '병합(기존 유지)'에서 현재 값을 유지한 충돌 항목 수 */
  kept: number
}

export function planRestore(data: BackupPayload, current: CurrentData, mode: RestoreMode): RestorePlan {
  const plan: RestorePlan = { writes: [], deletes: [], unchanged: 0, kept: 0 }
  for (const collection of COLLECTIONS) {
    const incoming = data[collection] as AnyItem[]
    const existing = current[collection] as AnyItem[]
    const byId = new Map(existing.map((x) => [x.id, x]))
    const incomingIds = new Set(incoming.map((x) => x.id))
    if (mode === 'replace') for (const e of existing) if (!incomingIds.has(e.id)) plan.deletes.push({ collection, previous: e })
    for (const item of incoming) {
      const cur = byId.get(item.id)
      if (!cur) plan.writes.push({ collection, item })
      else if (fingerprint(cur) === fingerprint(item)) plan.unchanged++
      else if (mode === 'merge-keep') plan.kept++
      else plan.writes.push({ collection, item, previous: cur })
    }
  }
  return plan
}
