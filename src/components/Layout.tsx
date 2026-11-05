import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { CalendarDays, LineChart, PieChart, LogOut, Moon, Sun, DatabaseBackup, TrendingUp, Users, Eye } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { Segmented, Spinner, Notice } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { BackupDialog } from '@/components/BackupDialog'
import type { DisplayUnit } from '@/lib/types'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/records', label: '월별 자산', icon: CalendarDays },
  { to: '/dashboard', label: '추이·목표', icon: LineChart },
  { to: '/portfolio', label: '종목·비중', icon: PieChart },
]

const UNIT_OPTIONS: { value: DisplayUnit; label: string }[] = [
  { value: 'won', label: '원' },
  { value: 'man', label: '만원' },
  { value: 'eok', label: '억원' },
]

export function Layout() {
  const { logout, isOwner, canEdit, username, role } = useAuth()
  const nav = isOwner ? [...NAV, { to: '/accounts', label: '계정 관리', icon: Users }] : NAV
  const { settings, updateSettings, loading, error } = useData()
  const { theme, toggleTheme, confirm, toast } = useUi()
  const [backupOpen, setBackupOpen] = useState(false)

  const onLogout = async () => {
    if (!(await confirm({ title: '로그아웃할까요?', confirmText: '로그아웃' }))) return
    await logout()
    toast('로그아웃되었습니다.', 'info')
  }
  const setUnit = (u: DisplayUnit) => updateSettings({ displayCurrency: u }).catch(() => toast('설정 저장 실패', 'error'))

  return (
    <div className="min-h-dvh md:pl-60">
      {/* PC 사이드바 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card px-3 py-5 md:flex">
        <div className="mb-6 flex items-center gap-2 px-3">
          <div className="rounded-lg bg-primary p-1.5 text-primary-foreground">
            <TrendingUp className="size-4" />
          </div>
          <span className="text-lg font-extrabold tracking-tight">BE RICH</span>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted',
                  isActive && 'bg-accent text-accent-foreground hover:bg-accent',
                )
              }
            >
              <n.icon className="size-[18px]" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-1">
          <p className="px-2 text-xs text-muted-foreground">
            <b className="text-foreground">{username}</b> · {role === 'owner' ? '관리자' : role === 'editor' ? '수정 가능' : '조회 전용'}
          </p>
          <div>
            <p className="mb-1.5 px-2 text-[11px] font-semibold text-muted-foreground">금액 단위</p>
            <Segmented value={settings.displayCurrency} onChange={setUnit} options={UNIT_OPTIONS} className="w-full [&>button]:flex-1" />
          </div>
          <Button variant="ghost" className="justify-start" onClick={() => setBackupOpen(true)}>
            <DatabaseBackup /> 백업·내보내기
          </Button>
          <Button variant="ghost" className="justify-start" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun /> : <Moon />} {theme === 'dark' ? '라이트 모드' : '다크 모드'}
          </Button>
          <Button variant="ghost" className="justify-start text-muted-foreground" onClick={onLogout}>
            <LogOut /> 로그아웃
          </Button>
        </div>
      </aside>

      {/* 모바일 상단바 */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-card/95 px-4 py-2.5 backdrop-blur md:hidden">
        <div className="rounded-md bg-primary p-1 text-primary-foreground">
          <TrendingUp className="size-3.5" />
        </div>
        <span className="font-extrabold">BE RICH</span>
        <div className="ml-auto flex items-center gap-1">
          <Segmented size="xs" value={settings.displayCurrency} onChange={setUnit} options={UNIT_OPTIONS} />
          <Button variant="ghost" size="icon" aria-label="백업" onClick={() => setBackupOpen(true)}>
            <DatabaseBackup />
          </Button>
          <Button variant="ghost" size="icon" aria-label="테마 전환" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="로그아웃" onClick={onLogout}>
            <LogOut />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8">
        {!canEdit && (
          <Notice className="mb-4">
            <Eye className="mr-1 inline size-4 align-[-3px]" />
            <b>조회 전용 계정</b>입니다. 기록을 볼 수만 있으며, 수정하려면 관리자에게 수정 권한을 요청하세요.
          </Notice>
        )}
        {error && (
          <Notice tone="danger" className="mb-4">
            {error}
          </Notice>
        )}
        {loading ? (
          <div className="flex h-[60dvh] items-center justify-center gap-2 text-muted-foreground">
            <Spinner /> 데이터를 불러오는 중…
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {/* 모바일 하단 탭 */}
      <nav style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }} className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold text-muted-foreground', isActive && 'text-primary')
            }
          >
            <n.icon className="size-5" />
            {n.label}
          </NavLink>
        ))}
      </nav>

      <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} />
    </div>
  )
}
