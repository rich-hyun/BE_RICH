import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
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
/** UI에서 다른 계정을 즉시 차단하기 위한 값. 실제 보안은 Firestore 규칙의 UID 검사가 담당합니다. */
export const ADMIN_UID: string = (import.meta.env.VITE_ADMIN_UID ?? '').trim()

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

export const firebaseReady = missingConfig.length === 0

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

if (firebaseReady) {
  app = initializeApp(config)
  auth = getAuth(app)
  auth.languageCode = 'ko'
  // 메모리 캐시만 사용: 로그아웃 후 기기(IndexedDB)에 자산 데이터가 남지 않도록 디스크 캐시를 쓰지 않습니다.
  db = initializeFirestore(app, { localCache: memoryLocalCache() })
}

export function getFirebase() {
  if (!app || !auth || !db) throw new Error('Firebase 설정이 없습니다. .env.local 파일을 확인하세요.')
  return { app, auth, db }
}
