import type { AssetRecord, EtfComposition, Goal, Holding, Settings } from './types'
import { toAssetRecord, toComposition, toGoal, toHolding, toSettings } from './sanitize'

export const BACKUP_APP = 'be-rich'
export const BACKUP_VERSION = 1

export interface BackupData {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  assetRecords: AssetRecord[]
  holdings: Holding[]
  etfCompositions: EtfComposition[]
  goals: Goal[]
  settings: Settings
}

export function buildBackup(d: Omit<BackupData, 'app' | 'version' | 'exportedAt'>): BackupData {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), ...d }
}

export class BackupError extends Error {}

export function parseBackup(text: string): { data: BackupData; skipped: number } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('JSON 형식이 아닙니다. 이 앱에서 내려받은 백업 파일인지 확인해 주세요.')
  }
  if (!raw || typeof raw !== 'object') throw new BackupError('백업 파일 구조가 올바르지 않습니다.')
  const o = raw as Record<string, unknown>
  if (o.app !== BACKUP_APP) throw new BackupError('BE RICH 백업 파일이 아닙니다.')
  if (typeof o.version !== 'number' || o.version > BACKUP_VERSION)
    throw new BackupError('지원하지 않는 백업 버전입니다. 앱을 최신 버전으로 업데이트해 주세요.')
  let skipped = 0
  const list = <T,>(v: unknown, fn: (id: string, d: Record<string, unknown>) => T | null): T[] => {
    if (!Array.isArray(v)) return []
    const out: T[] = []
    for (const item of v) {
      if (!item || typeof item !== 'object') {
        skipped++
        continue
      }
      const it = item as Record<string, unknown>
      const id = typeof it.id === 'string' && it.id ? it.id : ''
      const parsed = id ? fn(id, it) : null
      if (parsed) out.push(parsed)
      else skipped++
    }
    return out
  }
  const data: BackupData = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
    assetRecords: list(o.assetRecords, toAssetRecord).map((r) => ({ ...r, id: r.date })),
    holdings: list(o.holdings, toHolding),
    etfCompositions: list(o.etfCompositions, toComposition),
    goals: list(o.goals, toGoal),
    settings: toSettings(o.settings as Record<string, unknown> | undefined),
  }
  return { data, skipped }
}

export type RestoreMode = 'merge-keep' | 'merge-overwrite' | 'replace'

export interface RestoreDiff {
  collection: string
  label: string
  incoming: number
  newCount: number
  conflictCount: number // 같은 ID가 이미 존재
  existingCount: number
}

export function diffBackup(
  data: BackupData,
  current: { assetRecords: { id: string }[]; holdings: { id: string }[]; etfCompositions: { id: string }[]; goals: { id: string }[] },
): RestoreDiff[] {
  const mk = (collection: keyof typeof current, label: string, incoming: { id: string }[]): RestoreDiff => {
    const ids = new Set(current[collection].map((x) => x.id))
    const conflictCount = incoming.filter((x) => ids.has(x.id)).length
    return { collection, label, incoming: incoming.length, conflictCount, newCount: incoming.length - conflictCount, existingCount: ids.size }
  }
  return [
    mk('assetRecords', '월별 자산 기록', data.assetRecords),
    mk('holdings', '보유 종목', data.holdings),
    mk('etfCompositions', 'ETF 구성비', data.etfCompositions),
    mk('goals', '목표', data.goals),
  ]
}
