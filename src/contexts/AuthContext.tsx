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
import { doc, onSnapshot } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { ADMIN_EMAIL, ADMIN_UID, ADMIN_USERNAME, firebaseReady, getFirebase, usernameToEmail } from '@/lib/firebase'

/** signedIn: 관리자 또는 관리자가 등록한 계정으로 로그인됨 */
type Status = 'loading' | 'signedOut' | 'signedIn' | 'forbidden'
/** owner: 관리자(jaehyun) · editor: 수정 권한 있음 · viewer: 조회만 가능 */
export type Role = 'owner' | 'editor' | 'viewer'

interface AuthValue {
  status: Status
  user: User | null
  role: Role | null
  username: string | null
  isOwner: boolean
  canEdit: boolean
  /** 모든 계정이 공유하는 데이터의 소유자 UID (관리자 UID) */
  dataUid: string | null
  login: (username: string, password: string, remember: boolean) => Promise<void>
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
      return '아이디 또는 비밀번호가 올바르지 않습니다.'
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

function isOwnerUser(u: User): boolean {
  if (ADMIN_UID) return u.uid === ADMIN_UID
  return !!ADMIN_EMAIL && u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [forbiddenReason, setForbiddenReason] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseReady) return
    const { auth, db } = getFirebase()
    let unsubMember: (() => void) | null = null

    const forbid = (reason: string) => {
      setForbiddenReason(reason)
      setStatus('forbidden')
      setUser(null)
      setRole(null)
      setUsername(null)
      void signOut(auth)
    }

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      unsubMember?.()
      unsubMember = null
      if (!u) {
        setUser(null)
        setRole(null)
        setUsername(null)
        setStatus((s) => (s === 'forbidden' ? s : 'signedOut'))
        return
      }
      if (isOwnerUser(u)) {
        setForbiddenReason(null)
        setUser(u)
        setRole('owner')
        setUsername(ADMIN_USERNAME)
        setStatus('signedIn')
        return
      }
      if (!ADMIN_UID) {
        forbid('관리자 UID 설정(VITE_ADMIN_UID)이 없어 등록 계정으로 로그인할 수 없습니다.')
        return
      }
      // 관리자가 등록한 계정인지 확인하고, 권한 변경을 실시간으로 반영
      unsubMember = onSnapshot(
        doc(db, 'members', u.uid),
        (snap) => {
          if (!snap.exists()) {
            forbid('등록되지 않았거나 접근 권한이 해제된 계정입니다. 관리자에게 문의하세요.')
            return
          }
          const d = snap.data()
          setForbiddenReason(null)
          setUser(u)
          setRole(d.canEdit === true ? 'editor' : 'viewer')
          setUsername(typeof d.username === 'string' ? d.username : null)
          setStatus('signedIn')
        },
        () => forbid('계정 정보를 확인할 수 없습니다. 관리자에게 문의하세요.'),
      )
    })
    return () => {
      unsubMember?.()
      unsubAuth()
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      role,
      username,
      isOwner: role === 'owner',
      canEdit: role === 'owner' || role === 'editor',
      dataUid: user ? ADMIN_UID || user.uid : null,
      forbiddenReason,
      async login(id, password, remember) {
        const { auth } = getFirebase()
        setForbiddenReason(null)
        // 기본: 세션 유지(브라우저/탭을 닫으면 로그아웃). '로그인 유지' 선택 시에만 기기에 유지.
        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
        await signInWithEmailAndPassword(auth, usernameToEmail(id), password)
      },
      async logout() {
        const { auth } = getFirebase()
        await signOut(auth)
      },
    }),
    [status, user, role, username, forbiddenReason],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
