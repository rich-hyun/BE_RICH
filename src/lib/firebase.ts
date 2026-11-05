import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, inMemoryPersistence, initializeAuth, signOut, type Auth } from 'firebase/auth'
import { initializeFirestore, memoryLocalCache, type Firestore } from 'firebase/firestore'

/**
 * Firebase "웹 클라이언트 설정"은 비밀값이 아닙니다(브라우저에 항상 노출됨).
 * 데이터 보호는 Firebase Authentication + Firestore Security Rules가 담당합니다.
 * 서비스 계정 키, 비밀번호 등 진짜 비밀값은 절대 VITE_ 환경변수로 넣지 마세요(빌드 결과물에 포함됩니다).
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// measurementId(Google Analytics)는 개인 자산 사이트에 불필요하므로 의도적으로 사용하지 않습니다.

/** 로그인 화면에서 비밀번호만 입력하도록 고정하는 관리자 이메일 (비밀값 아님). 비워 두면 로그인 화면에 이메일 칸이 표시됩니다. */
export const ADMIN_EMAIL: string = (import.meta.env.VITE_ADMIN_EMAIL ?? '').trim()
/** 관리자(데이터 소유자) UID. 모든 계정은 이 UID 아래의 데이터를 공유합니다. 실제 권한 검사는 Firestore 규칙이 담당합니다. */
export const ADMIN_UID: string = (import.meta.env.VITE_ADMIN_UID ?? '').trim()
/** 로그인 화면에서 관리자 이메일 대신 입력하는 아이디 */
export const ADMIN_USERNAME: string = (import.meta.env.VITE_ADMIN_USERNAME ?? 'jaehyun').trim().toLowerCase()

/** 아이디 규칙: 영문 소문자로 시작, 영문 소문자·숫자·밑줄 3~20자 */
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/

/**
 * 아이디 → Firebase Auth 이메일.
 * 관리자 아이디는 기존 관리자 이메일로, 그 외 아이디는 이 프로젝트 도메인의 가상 이메일로 매핑합니다(메일은 발송되지 않음).
 * '@'가 들어간 값은 이메일로 그대로 사용합니다.
 */
export function usernameToEmail(input: string): string {
  const id = input.trim().toLowerCase()
  if (id.includes('@')) return id
  if (id === ADMIN_USERNAME && ADMIN_EMAIL) return ADMIN_EMAIL
  return `${id}@${config.authDomain}`
}

export const missingConfig: string[] = [
  ...Object.entries({
    VITE_FIREBASE_API_KEY: config.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: config.authDomain,
    VITE_FIREBASE_PROJECT_ID: config.projectId,
    VITE_FIREBASE_APP_ID: config.appId,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k),
]

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

/** 초기화 실패 시 오류 메시지 (화면에 안내 표시용) */
export let firebaseInitError: string | null = null

if (missingConfig.length === 0) {
  try {
    app = initializeApp(config)
    auth = getAuth(app)
    auth.languageCode = 'ko'
    // 메모리 캐시만 사용: 로그아웃 후 기기(IndexedDB)에 자산 데이터가 남지 않도록 디스크 캐시를 쓰지 않습니다.
    db = initializeFirestore(app, { localCache: memoryLocalCache() })
  } catch (e) {
    firebaseInitError = e instanceof Error ? e.message : String(e)
    console.error('[BE RICH] Firebase 초기화 실패', e)
  }
}

export const firebaseReady = missingConfig.length === 0 && !firebaseInitError

export function getFirebase() {
  if (!app || !auth || !db) throw new Error('Firebase 설정이 없습니다. .env.local 파일을 확인하세요.')
  return { app, auth, db }
}

/**
 * 관리자가 새 계정을 만들 때 사용. 별도 앱 인스턴스(메모리 세션)에서 생성하므로 관리자 로그인 상태는 유지됩니다.
 * 반환값: 새 계정의 UID
 */
export async function createAuthAccount(email: string, password: string): Promise<string> {
  const secondary = initializeApp(config, `account-creator-${Date.now()}`)
  try {
    const a = initializeAuth(secondary, { persistence: inMemoryPersistence })
    const cred = await createUserWithEmailAndPassword(a, email, password)
    await signOut(a).catch(() => {})
    return cred.user.uid
  } finally {
    await deleteApp(secondary).catch(() => {})
  }
}
