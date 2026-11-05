import { lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { DataProvider } from '@/contexts/DataContext'
import { UiProvider } from '@/contexts/UiContext'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/LoginPage'
import { SetupRequiredPage } from '@/pages/SetupRequiredPage'
import { Spinner } from '@/components/ui/misc'
import { firebaseReady } from '@/lib/firebase'

const RecordsPage = lazy(() => import('@/pages/RecordsPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const PortfolioPage = lazy(() => import('@/pages/PortfolioPage'))

function FullScreenSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner /> {label}
    </div>
  )
}

/** 인증 확인 전에는 아무 데이터도 렌더링하지 않고, 관리자가 아니면 로그인 화면으로 이동 */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullScreenSpinner label="로그인 상태 확인 중…" />
  if (status !== 'admin') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

function LoginRoute() {
  const { status } = useAuth()
  if (status === 'loading') return <FullScreenSpinner label="로그인 상태 확인 중…" />
  // 로그인 성공 시 1페이지(월별 자산 관리)로 이동
  if (status === 'admin') return <Navigate to="/records" replace />
  return <LoginPage />
}

export default function App() {
  if (!firebaseReady) return <SetupRequiredPage />
  return (
    <UiProvider>
      <AuthProvider>
        <DataProvider>
          {/* GitHub Pages는 SPA 라우팅을 지원하지 않으므로 HashRouter 사용 (새로고침 시 404 방지) */}
          <HashRouter>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              <Route
                element={
                  <RequireAdmin>
                    <Layout />
                  </RequireAdmin>
                }
              >
                <Route path="/records" element={<Suspense fallback={<FullScreenSpinner label="불러오는 중…" />}><RecordsPage /></Suspense>} />
                <Route path="/dashboard" element={<Suspense fallback={<FullScreenSpinner label="불러오는 중…" />}><DashboardPage /></Suspense>} />
                <Route path="/portfolio" element={<Suspense fallback={<FullScreenSpinner label="불러오는 중…" />}><PortfolioPage /></Suspense>} />
              </Route>
              <Route path="*" element={<Navigate to="/records" replace />} />
            </Routes>
          </HashRouter>
        </DataProvider>
      </AuthProvider>
    </UiProvider>
  )
}
