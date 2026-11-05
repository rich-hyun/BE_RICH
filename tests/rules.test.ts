// Firestore 보안 규칙 테스트 — Firestore 에뮬레이터에서 실행됩니다.
//   npm run test:rules
// (firestore.rules 의 "ADMIN_UID" 를 테스트용 UID로 치환한 규칙을 에뮬레이터에 올려 검증)
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, collection, getFirestore, setDoc, updateDoc, type Firestore } from 'firebase/firestore'

const PROJECT = 'demo-be-rich'
const ADMIN = 'test-admin-uid-123'
const OTHER = 'someone-else-uid-456'
const VIEWER = 'viewer-uid-789'
const EDITOR = 'editor-uid-321'
const HOST = '127.0.0.1'
const PORT = 8080

const apps: FirebaseApp[] = []
function client(uid: string | null): Firestore {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake' }, `app-${apps.length}-${uid}`)
  apps.push(app)
  const db = getFirestore(app)
  connectFirestoreEmulator(db, HOST, PORT, uid ? { mockUserToken: { user_id: uid, sub: uid } } : undefined)
  return db
}

const record = { date: '2026-04-27', isa: 1, brokerage: 2, crypto: 3, gold: 4, cash: 5, memo: '' }

async function denied(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ code: 'permission-denied' })
}

let admin: Firestore, other: Firestore, anon: Firestore, viewer: Firestore, editor: Firestore

beforeAll(async () => {
  // 규칙 업로드 (테스트용 UID)
  const { readFileSync } = await import('node:fs')
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').replaceAll('"ADMIN_UID"', JSON.stringify(ADMIN))
  const res = await fetch(`http://${HOST}:${PORT}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT',
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }),
  })
  if (!res.ok) throw new Error('규칙 업로드 실패: ' + (await res.text()))
  await fetch(`http://${HOST}:${PORT}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' })
  admin = client(ADMIN)
  other = client(OTHER)
  anon = client(null)
  viewer = client(VIEWER)
  editor = client(EDITOR)
  await setDoc(doc(admin, 'users', ADMIN, 'assetRecords', record.date), record)
})

afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)))
})

describe('관리자', () => {
  it('자신의 데이터 읽기/쓰기/삭제 가능', async () => {
    const snap = await getDoc(doc(admin, 'users', ADMIN, 'assetRecords', record.date))
    expect(snap.data()?.isa).toBe(1)
    await setDoc(doc(admin, 'users', ADMIN, 'goals', 'g1'), { targetYear: 2030, targetAmount: 300000000 })
    await setDoc(doc(admin, 'users', ADMIN, 'settings', 'general'), { displayCurrency: 'man' })
    await setDoc(doc(admin, 'users', ADMIN, 'holdings', 'h1'), { snapshotDate: '2026-11-05', name: 'SK하이닉스', marketValue: 100, accountType: 'brokerage', symbol: '000660', memo: '' })
    await setDoc(doc(admin, 'users', ADMIN, 'etfCompositions', 'e1'), { symbol: 'QQQ', asOfDate: '2026-10-31', source: 'x', industries: { 반도체: 25 }, holdings: [] })
    await deleteDoc(doc(admin, 'users', ADMIN, 'goals', 'g1'))
    expect((await getDocs(collection(admin, 'users', ADMIN, 'holdings'))).size).toBe(1)
  })
  it('잘못된 데이터는 거부 (문서ID≠날짜, 실수 금액)', async () => {
    await denied(setDoc(doc(admin, 'users', ADMIN, 'assetRecords', '2026-01-01'), record))
    await denied(setDoc(doc(admin, 'users', ADMIN, 'assetRecords', record.date), { ...record, isa: 1.5 }))
    await denied(setDoc(doc(admin, 'users', ADMIN, 'goals', 'bad'), { targetYear: 2030, targetAmount: -1 }))
  })
  it('다른 사용자 경로나 정의되지 않은 경로는 거부', async () => {
    await denied(setDoc(doc(admin, 'users', OTHER, 'assetRecords', record.date), record))
    await denied(setDoc(doc(admin, 'public', 'x'), { a: 1 }))
    await denied(getDoc(doc(admin, 'users', ADMIN)))
    await denied(setDoc(doc(admin, 'users', ADMIN, 'unknown', 'x'), { a: 1 }))
  })
})

describe('로그인하지 않은 사용자', () => {
  it('읽기·쓰기 모두 거부', async () => {
    await denied(getDoc(doc(anon, 'users', ADMIN, 'assetRecords', record.date)))
    await denied(getDocs(collection(anon, 'users', ADMIN, 'assetRecords')))
    await denied(setDoc(doc(anon, 'users', ADMIN, 'assetRecords', '2026-05-01'), { ...record, date: '2026-05-01' }))
  })
})

describe('다른 Firebase 계정', () => {
  it('관리자 데이터 접근 거부', async () => {
    await denied(getDoc(doc(other, 'users', ADMIN, 'assetRecords', record.date)))
    await denied(getDocs(collection(other, 'users', ADMIN, 'holdings')))
    await denied(deleteDoc(doc(other, 'users', ADMIN, 'assetRecords', record.date)))
  })
  it('자기 UID 경로라도 관리자가 아니면 거부', async () => {
    await denied(setDoc(doc(other, 'users', OTHER, 'assetRecords', record.date), record))
    await denied(getDocs(collection(other, 'users', OTHER, 'assetRecords')))
  })
})

describe('관리자가 등록한 계정', () => {
  beforeAll(async () => {
    await setDoc(doc(admin, 'members', VIEWER), { username: 'chaewon', canEdit: false, createdAt: 1, updatedAt: 1 })
    await setDoc(doc(admin, 'members', EDITOR), { username: 'editor', canEdit: true, createdAt: 1, updatedAt: 1 })
  })
  it('조회 전용 계정: 관리자 데이터 읽기만 가능', async () => {
    expect((await getDoc(doc(viewer, 'users', ADMIN, 'assetRecords', record.date))).data()?.isa).toBe(1)
    await getDocs(collection(viewer, 'users', ADMIN, 'holdings'))
    await getDoc(doc(viewer, 'users', ADMIN, 'settings', 'general'))
    await denied(setDoc(doc(viewer, 'users', ADMIN, 'assetRecords', '2026-05-01'), { ...record, date: '2026-05-01' }))
    await denied(deleteDoc(doc(viewer, 'users', ADMIN, 'assetRecords', record.date)))
    await denied(setDoc(doc(viewer, 'users', ADMIN, 'settings', 'general'), { displayCurrency: 'won' }))
  })
  it('수정 권한 계정: 관리자 데이터 읽기·쓰기 가능, 자기 UID 경로는 거부', async () => {
    await setDoc(doc(editor, 'users', ADMIN, 'assetRecords', '2026-06-01'), { ...record, date: '2026-06-01' })
    await deleteDoc(doc(editor, 'users', ADMIN, 'assetRecords', '2026-06-01'))
    await denied(setDoc(doc(editor, 'users', ADMIN, 'assetRecords', '2026-01-01'), record)) // 검증 규칙은 동일하게 적용
    await denied(setDoc(doc(editor, 'users', EDITOR, 'assetRecords', record.date), record))
  })
  it('권한 부여·해제가 즉시 반영됨', async () => {
    await updateDoc(doc(admin, 'members', VIEWER), { canEdit: true })
    await setDoc(doc(viewer, 'users', ADMIN, 'goals', 'gv'), { targetYear: 2031, targetAmount: 1 })
    await updateDoc(doc(admin, 'members', VIEWER), { canEdit: false })
    await denied(deleteDoc(doc(viewer, 'users', ADMIN, 'goals', 'gv')))
  })
  it('계정 문서: 자기 것만 조회, 수정·생성은 관리자만', async () => {
    await getDoc(doc(viewer, 'members', VIEWER))
    await denied(getDoc(doc(viewer, 'members', EDITOR)))
    await denied(getDocs(collection(viewer, 'members')))
    await denied(updateDoc(doc(viewer, 'members', VIEWER), { canEdit: true }))
    await denied(setDoc(doc(other, 'members', OTHER), { username: 'hacker', canEdit: true }))
    await denied(setDoc(doc(editor, 'members', OTHER), { username: 'friend', canEdit: true }))
    await getDocs(collection(admin, 'members'))
  })
  it('계정 문서 형식 검증', async () => {
    await denied(setDoc(doc(admin, 'members', 'x1'), { username: 'Bad Name', canEdit: false }))
    await denied(setDoc(doc(admin, 'members', 'x2'), { username: 'okname', canEdit: 'yes' }))
    await denied(setDoc(doc(admin, 'members', 'x3'), { username: 'okname', canEdit: false, role: 'owner' }))
    await denied(setDoc(doc(admin, 'members', ADMIN), { username: 'jaehyun', canEdit: false }))
  })
  it('접근 권한 삭제 후에는 읽기 거부', async () => {
    await deleteDoc(doc(admin, 'members', VIEWER))
    await denied(getDoc(doc(viewer, 'users', ADMIN, 'assetRecords', record.date)))
  })
})

describe('백업·변경 이력 (관리자 전용)', () => {
  const hist = { collection: 'assetRecords', docId: '2026-04-27', action: 'update', label: '2026-04-27', data: { date: '2026-04-27', isa: 1 }, savedAt: 1700000000000 }
  const EDITOR2 = 'editor-uid-654'
  let editor2: Firestore
  beforeAll(async () => {
    editor2 = client(EDITOR2)
    await setDoc(doc(admin, 'members', EDITOR2), { username: 'editor2', canEdit: true, createdAt: 1, updatedAt: 1 })
  })
  it('관리자: 이력 기록·조회·삭제 가능, 수정은 불가', async () => {
    await setDoc(doc(admin, 'users', ADMIN, 'history', 'h1'), hist)
    expect((await getDocs(collection(admin, 'users', ADMIN, 'history'))).size).toBeGreaterThan(0)
    await denied(updateDoc(doc(admin, 'users', ADMIN, 'history', 'h1'), { label: 'changed' }))
    await deleteDoc(doc(admin, 'users', ADMIN, 'history', 'h1'))
  })
  it('수정 권한 계정: 수정 시 이력 기록은 가능하지만 조회·삭제는 불가', async () => {
    await setDoc(doc(editor2, 'users', ADMIN, 'history', 'h2'), hist)
    await denied(getDoc(doc(editor2, 'users', ADMIN, 'history', 'h2')))
    await denied(getDocs(collection(editor2, 'users', ADMIN, 'history')))
    await denied(deleteDoc(doc(editor2, 'users', ADMIN, 'history', 'h2')))
  })
  it('조회 전용 계정·비로그인: 이력 접근 모두 거부', async () => {
    await setDoc(doc(admin, 'members', VIEWER), { username: 'chaewon', canEdit: false, createdAt: 1, updatedAt: 1 })
    await denied(getDocs(collection(viewer, 'users', ADMIN, 'history')))
    await denied(setDoc(doc(viewer, 'users', ADMIN, 'history', 'h3'), hist))
    await denied(getDocs(collection(anon, 'users', ADMIN, 'history')))
  })
  it('이력 형식 검증', async () => {
    await denied(setDoc(doc(admin, 'users', ADMIN, 'history', 'b1'), { ...hist, collection: 'members' }))
    await denied(setDoc(doc(admin, 'users', ADMIN, 'history', 'b2'), { ...hist, extra: 1 }))
    await denied(setDoc(doc(admin, 'users', ADMIN, 'history', 'b3'), { ...hist, savedAt: 1.5 }))
  })
  it('백업 메타: 관리자만 읽기·쓰기', async () => {
    await setDoc(doc(admin, 'users', ADMIN, 'meta', 'backup'), { lastBackupAt: 1700000000000 })
    expect((await getDoc(doc(admin, 'users', ADMIN, 'meta', 'backup'))).data()?.lastBackupAt).toBe(1700000000000)
    await denied(getDoc(doc(editor2, 'users', ADMIN, 'meta', 'backup')))
    await denied(setDoc(doc(editor2, 'users', ADMIN, 'meta', 'backup'), { lastBackupAt: 1 }))
    await denied(setDoc(doc(admin, 'users', ADMIN, 'meta', 'other'), { lastBackupAt: 1 }))
    await denied(setDoc(doc(admin, 'users', ADMIN, 'meta', 'backup'), { lastBackupAt: 1, token: 'x' }))
  })
})
