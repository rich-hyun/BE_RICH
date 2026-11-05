// Firestore 보안 규칙 테스트 — Firestore 에뮬레이터에서 실행됩니다.
//   npm run test:rules
// (firestore.rules 의 "ADMIN_UID" 를 테스트용 UID로 치환한 규칙을 에뮬레이터에 올려 검증)
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, collection, getFirestore, setDoc, type Firestore } from 'firebase/firestore'

const PROJECT = 'demo-be-rich'
const ADMIN = 'test-admin-uid-123'
const OTHER = 'someone-else-uid-456'
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

let admin: Firestore, other: Firestore, anon: Firestore

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
