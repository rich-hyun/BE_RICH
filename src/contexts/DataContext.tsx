import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc, writeBatch, type DocumentData, type WriteBatch } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { createAuthAccount, getFirebase, usernameToEmail } from '@/lib/firebase'
import { useAuth } from './AuthContext'
import { DEFAULT_SETTINGS, type AssetRecord, type EtfComposition, type Goal, type Holding, type Settings } from '@/lib/types'
import { toAssetRecord, toComposition, toGoal, toHolding, toSettings } from '@/lib/sanitize'
import type { BackupData, RestoreMode } from '@/lib/backup'
import { chunk, newId } from '@/lib/utils'

type CollectionName = 'assetRecords' | 'holdings' | 'etfCompositions' | 'goals'

interface DataValue {
  loading: boolean
  error: string | null
  records: AssetRecord[]
  holdings: Holding[]
  compositions: EtfComposition[]
  goals: Goal[]
  settings: Settings
  // 월별 자산
  saveRecord: (r: Omit<AssetRecord, 'id'>, previousId?: string) => Promise<void>
  deleteRecord: (id: string) => Promise<void>
  importRecords: (rows: Omit<AssetRecord, 'id'>[]) => Promise<number>
  // 보유 종목
  saveHolding: (h: Omit<Holding, 'id'> & { id?: string }) => Promise<void>
  saveHoldings: (hs: (Omit<Holding, 'id'> & { id?: string })[]) => Promise<void>
  deleteHoldings: (ids: string[]) => Promise<void>
  // ETF 구성비
  saveComposition: (c: Omit<EtfComposition, 'id'> & { id?: string }) => Promise<void>
  deleteComposition: (id: string) => Promise<void>
  // 목표
  saveGoal: (g: Omit<Goal, 'id'> & { id?: string }) => Promise<void>
  deleteGoal: (id: string) => Promise<void>
  // 설정
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  // 백업
  restore: (data: BackupData, mode: RestoreMode, includeSettings: boolean) => Promise<void>
  // 계정 관리 (관리자 전용)
  members: Member[]
  createMember: (username: string, password: string) => Promise<void>
  setMemberCanEdit: (uid: string, canEdit: boolean) => Promise<void>
  removeMember: (uid: string) => Promise<void>
}

export interface Member {
  uid: string
  username: string
  canEdit: boolean
  createdAt: number
}

export const READ_ONLY_MESSAGE = '조회 전용 계정입니다. 수정하려면 관리자에게 수정 권한을 요청하세요.'
/** 화면 표시용 설정: 관리자가 아닌 계정은 공유 설정에 저장하지 않고 이 기기 화면에만 적용 */
const VIEW_PREF_KEYS: (keyof Settings)[] = ['displayCurrency', 'preferredChartRange']

const DataContext = createContext<DataValue | null>(null)

export function firestoreErrorMessage(e: unknown): string {
  const code = e instanceof FirebaseError ? e.code : ''
  if (code === 'permission-denied')
    return '권한이 없습니다. 조회 전용 계정이거나 Firestore 보안 규칙이 최신이 아닐 수 있습니다.'
  if (code === 'auth/email-already-in-use') return '이미 사용 중인 아이디입니다.'
  if (code === 'auth/weak-password') return '비밀번호는 6자 이상이어야 합니다.'
  if (code === 'auth/invalid-email') return '사용할 수 없는 아이디입니다.'
  if (code === 'unavailable') return '서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.'
  if (code === 'resource-exhausted') return 'Firebase 무료 사용 한도를 초과했습니다. 내일 다시 시도해 주세요.'
  return e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.'
}

/** Firestore는 undefined 값을 허용하지 않으므로 제거 */
function clean<T extends object>(o: T): DocumentData {
  const out: DocumentData = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || k === 'id') continue
    // -0은 Firestore에 실수(double)로 저장되어 정수 검증 규칙에 걸리므로 0으로 정규화
    out[k] = typeof v === 'number' && Object.is(v, -0) ? 0 : v
  }
  return out
}

const BATCH_LIMIT = 450

export function DataProvider({ children }: { children: ReactNode }) {
  const { dataUid: uid, canEdit, isOwner } = useAuth()
  const [records, setRecords] = useState<AssetRecord[]>([])
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [compositions, setCompositions] = useState<EtfComposition[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [sharedSettings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [localPrefs, setLocalPrefs] = useState<Partial<Settings>>({})
  const settings = useMemo(() => ({ ...sharedSettings, ...localPrefs }), [sharedSettings, localPrefs])
  const [members, setMembers] = useState<Member[]>([])
  const [loaded, setLoaded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 로그아웃 시 메모리에 있던 데이터 즉시 제거
    setRecords([])
    setHoldings([])
    setCompositions([])
    setGoals([])
    setSettings(DEFAULT_SETTINGS)
    setLocalPrefs({})
    setMembers([])
    setLoaded(new Set())
    setError(null)
    if (!uid) return
    const { db } = getFirebase()
    const markLoaded = (k: string) => setLoaded((s) => (s.has(k) ? s : new Set(s).add(k)))
    const onErr = (e: unknown) => setError(firestoreErrorMessage(e))
    const sub = <T,>(name: CollectionName, conv: (id: string, d: DocumentData) => T | null, set: (v: T[]) => void) =>
      onSnapshot(
        collection(db, 'users', uid, name),
        (snap) => {
          const list: T[] = []
          snap.forEach((d) => {
            const v = conv(d.id, d.data())
            if (v) list.push(v)
          })
          set(list)
          markLoaded(name)
        },
        onErr,
      )
    const unsubs = [
      sub('assetRecords', toAssetRecord, setRecords),
      sub('holdings', toHolding, setHoldings),
      sub('etfCompositions', toComposition, setCompositions),
      sub('goals', toGoal, setGoals),
      onSnapshot(
        doc(db, 'users', uid, 'settings', 'general'),
        (snap) => {
          setSettings(toSettings(snap.exists() ? snap.data() : undefined))
          markLoaded('settings')
        },
        onErr,
      ),
    ]
    if (isOwner)
      unsubs.push(
        onSnapshot(
          collection(db, 'members'),
          (snap) => {
            const list: Member[] = []
            snap.forEach((d) => {
              const v = d.data()
              list.push({ uid: d.id, username: String(v.username ?? ''), canEdit: v.canEdit === true, createdAt: Number(v.createdAt) || 0 })
            })
            setMembers(list.sort((a, b) => a.createdAt - b.createdAt))
          },
          onErr,
        ),
      )
    return () => unsubs.forEach((u) => u())
  }, [uid, isOwner])

  const requireUid = useCallback(() => {
    if (!uid) throw new Error('로그인이 필요합니다.')
    // 화면에서 버튼을 숨기는 것과 별개로 쓰기 직전에 한 번 더 막음 (최종 차단은 Firestore 규칙)
    if (!canEdit) throw new Error(READ_ONLY_MESSAGE)
    return uid
  }, [uid, canEdit])

  const commitInChunks = useCallback(async (ops: ((b: WriteBatch) => void)[]) => {
    const { db } = getFirebase()
    for (const part of chunk(ops, BATCH_LIMIT)) {
      const b = writeBatch(db)
      part.forEach((op) => op(b))
      await b.commit()
    }
  }, [])

  const value = useMemo<DataValue>(() => {
    const ref = (name: CollectionName | 'settings', id: string) => doc(getFirebase().db, 'users', requireUid(), name, id)
    const now = () => Date.now()
    return {
      loading: !!uid && loaded.size < 5 && !error,
      error,
      records,
      holdings,
      compositions,
      goals,
      settings,

      async saveRecord(r, previousId) {
        const id = r.date
        const existing = records.find((x) => x.id === id) ?? (previousId ? records.find((x) => x.id === previousId) : undefined)
        const data = clean({ ...r, createdAt: existing?.createdAt ?? now(), updatedAt: now() })
        const { db } = getFirebase()
        const b = writeBatch(db)
        b.set(ref('assetRecords', id), data)
        // 날짜를 변경한 경우: 이전 날짜 문서를 삭제 (문서 ID = 날짜)
        if (previousId && previousId !== id) b.delete(ref('assetRecords', previousId))
        await b.commit()
      },
      async deleteRecord(id) {
        const { db } = getFirebase()
        const b = writeBatch(db)
        b.delete(ref('assetRecords', id))
        await b.commit()
      },
      async importRecords(rows) {
        const byId = new Map(records.map((x) => [x.id, x]))
        await commitInChunks(
          rows.map((r) => (b: WriteBatch) =>
            b.set(ref('assetRecords', r.date), clean({ ...r, createdAt: byId.get(r.date)?.createdAt ?? now(), updatedAt: now() })),
          ),
        )
        return rows.length
      },

      async saveHolding(h) {
        const id = h.id ?? newId('h_')
        const prev = holdings.find((x) => x.id === id)
        await setDoc(ref('holdings', id), clean({ ...h, createdAt: prev?.createdAt ?? now(), updatedAt: now() }))
      },
      async saveHoldings(hs) {
        await commitInChunks(
          hs.map((h) => (b: WriteBatch) => {
            const id = h.id ?? newId('h_')
            const prev = holdings.find((x) => x.id === id)
            b.set(ref('holdings', id), clean({ ...h, createdAt: prev?.createdAt ?? now(), updatedAt: now() }))
          }),
        )
      },
      async deleteHoldings(ids) {
        await commitInChunks(ids.map((id) => (b: WriteBatch) => b.delete(ref('holdings', id))))
      },

      async saveComposition(c) {
        const id = c.id ?? newId('etf_')
        await setDoc(ref('etfCompositions', id), clean({ ...c, updatedAt: now() }))
      },
      async deleteComposition(id) {
        await commitInChunks([(b) => b.delete(ref('etfCompositions', id))])
      },

      async saveGoal(g) {
        const id = g.id ?? newId('g_')
        const prev = goals.find((x) => x.id === id)
        await setDoc(ref('goals', id), clean({ ...g, createdAt: prev?.createdAt ?? now(), updatedAt: now() }))
      },
      async deleteGoal(id) {
        await commitInChunks([(b) => b.delete(ref('goals', id))])
      },

      async updateSettings(patch) {
        if (!isOwner) {
          // 관리자가 아닌 계정: 단위·기간 같은 화면 설정은 이 기기에만 적용하고, 나머지는 수정 권한이 있어야 저장
          const view = Object.fromEntries(Object.entries(patch).filter(([k]) => VIEW_PREF_KEYS.includes(k as keyof Settings)))
          const rest = Object.fromEntries(Object.entries(patch).filter(([k]) => !VIEW_PREF_KEYS.includes(k as keyof Settings)))
          setLocalPrefs((p) => ({ ...p, ...view }))
          if (Object.keys(rest).length === 0) return
          requireUid()
          setSettings((s) => ({ ...s, ...rest }))
          await setDoc(ref('settings', 'general'), clean(rest), { merge: true })
          return
        }
        const next = { ...sharedSettings, ...patch }
        setSettings(next) // 즉시 반영 (낙관적 업데이트)
        await setDoc(ref('settings', 'general'), clean(next), { merge: true })
      },

      async restore(data, mode, includeSettings) {
        const ops: ((b: WriteBatch) => void)[] = []
        const plan: [CollectionName, { id: string }[], { id: string }[]][] = [
          ['assetRecords', data.assetRecords, records],
          ['holdings', data.holdings, holdings],
          ['etfCompositions', data.etfCompositions, compositions],
          ['goals', data.goals, goals],
        ]
        for (const [name, incoming, existing] of plan) {
          const existingIds = new Set(existing.map((x) => x.id))
          const incomingIds = new Set(incoming.map((x) => x.id))
          if (mode === 'replace') {
            for (const e of existing) if (!incomingIds.has(e.id)) ops.push((b) => b.delete(ref(name, e.id)))
          }
          for (const item of incoming) {
            if (mode === 'merge-keep' && existingIds.has(item.id)) continue
            ops.push((b) => b.set(ref(name, item.id), clean(item)))
          }
        }
        if (includeSettings) ops.push((b) => b.set(ref('settings', 'general'), clean(data.settings)))
        await commitInChunks(ops)
      },

      members,
      async createMember(username, password) {
        if (!isOwner) throw new Error('관리자만 계정을 추가할 수 있습니다.')
        const id = username.trim().toLowerCase()
        const newUid = await createAuthAccount(usernameToEmail(id), password)
        try {
          // 처음 등록된 계정은 조회만 가능
          await setDoc(doc(getFirebase().db, 'members', newUid), { username: id, canEdit: false, createdAt: now(), updatedAt: now() })
        } catch (e) {
          throw new Error(`로그인 계정은 만들어졌지만 권한 등록에 실패했습니다 (${firestoreErrorMessage(e)}). Firestore 규칙을 배포한 뒤 Firebase 콘솔에서 해당 사용자를 삭제하고 다시 추가하세요.`, { cause: e })
        }
      },
      async setMemberCanEdit(memberUid, value) {
        if (!isOwner) throw new Error('관리자만 권한을 변경할 수 있습니다.')
        await updateDoc(doc(getFirebase().db, 'members', memberUid), { canEdit: value, updatedAt: now() })
      },
      async removeMember(memberUid) {
        if (!isOwner) throw new Error('관리자만 계정을 삭제할 수 있습니다.')
        await deleteDoc(doc(getFirebase().db, 'members', memberUid))
      },
    }
  }, [uid, loaded, error, records, holdings, compositions, goals, settings, sharedSettings, members, isOwner, requireUid, commitInChunks])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
