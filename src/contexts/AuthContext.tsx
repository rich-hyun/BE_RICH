import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import { ADMIN_EMAIL, ADMIN_UID, firebaseReady, getFirebase } from '@/lib/firebase'

type Status = 'loading' | 'signedOut' | 'admin' | 'forbidden'

interface AuthValue {
  status: Status
  user: User | null
  login: (password: string, remember: boolean, email?: string) => Promise<void>
  logout: () => Promise<void>
  forbiddenReason: string | null
}

const AuthContext = createContext<AuthValue | null>(null)

export function loginErrorMessage(e: unknown): string {
  const code = e instanceof FirebaseError ? e.code : ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return '비밀번호가 올바르지 않습니다.'
    case 'auth/too-many-requests':
      return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.'
    case 'auth/network-request-failed':
      return '네트워크 연결을 확인해 주세요.'
    case 'auth/user-disabled':
      return '비활성화된 계정입니다.'
    case 'auth/operation-not-allowed':
      return 'Firebase 콘솔에서 이메일/비밀번호 로그인이 활성화되어 있지 않습니다.'
    default:
      return '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.'
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [forbiddenReason, setForbiddenReason] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseReady) return
    const { auth } = getFirebase()
    return onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUser(null)
        setStatus((s) => (s === 'forbidden' ? s : 'signedOut'))
        return
      }
      const emailOk = !ADMIN_EMAIL || u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
      const uidOk = !ADMIN_UID || u.uid === ADMIN_UID
      if (!emailOk || !uidOk) {
        // 허용되지 않은 계정: 즉시 로그아웃 (서버 측 차단은 Firestore 규칙이 담당)
        setForbiddenReason('허용되지 않은 계정입니다. 관리자 계정으로만 접근할 수 있습니다.')
        setStatus('forbidden')
        setUser(null)
        void signOut(auth)
        return
      }
      setForbiddenReason(null)
      setUser(u)
      setStatus('admin')
    })
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      forbiddenReason,
      async login(password, remember, email) {
        const { auth } = getFirebase()
        setForbiddenReason(null)
        // 기본: 세션 유지(브라우저/탭을 닫으면 로그아웃). '로그인 유지' 선택 시에만 기기에 유지.
        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
        await signInWithEmailAndPassword(auth, ADMIN_EMAIL || (email ?? '').trim(), password)
      },
      async logout() {
        const { auth } = getFirebase()
        await signOut(auth)
      },
    }),
    [status, user, forbiddenReason],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
