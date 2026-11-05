import { useState, type FormEvent } from 'react'
import { Eye, Pencil, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EmptyState, Field, Notice, Spinner } from '@/components/ui/misc'
import { firestoreErrorMessage, useData, type Member } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { ADMIN_USERNAME, USERNAME_PATTERN } from '@/lib/firebase'
import { cn } from '@/lib/utils'

function CreateMemberCard() {
  const { members, createMember } = useData()
  const { toast } = useUi()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<{ username?: string; password?: string }>({})
  const [busy, setBusy] = useState(false)

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (busy) return
    const id = username.trim().toLowerCase()
    const e: typeof err = {}
    if (!USERNAME_PATTERN.test(id)) e.username = '영문 소문자로 시작하는 영문 소문자·숫자·밑줄(_) 3~20자'
    else if (id === ADMIN_USERNAME || members.some((m) => m.username === id)) e.username = '이미 사용 중인 아이디입니다.'
    if (password.length < 6) e.password = '6자 이상 입력하세요.'
    setErr(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      await createMember(id, password)
      toast(`${id} 계정을 추가했습니다. 처음에는 조회만 가능합니다.`)
      setUsername('')
      setPassword('')
    } catch (ex) {
      toast(`추가 실패: ${firestoreErrorMessage(ex)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="size-4" /> 계정 추가
        </CardTitle>
        <CardDescription>새 계정은 조회만 가능한 상태로 등록됩니다. 아이디와 비밀번호를 상대방에게 직접 전달하세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <Field label="아이디" htmlFor="m-id" error={err.username}>
            <Input
              id="m-id"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="예: chaewon"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
            />
          </Field>
          <Field label="초기 비밀번호" htmlFor="m-pw" error={err.password}>
            <Input id="m-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
          </Field>
          <Button type="submit" className="sm:mt-6" disabled={busy}>
            {busy ? <Spinner /> : <UserPlus />} 추가
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function MemberRow({ m }: { m: Member }) {
  const { setMemberCanEdit, removeMember } = useData()
  const { confirm, toast } = useUi()
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    setBusy(true)
    try {
      await setMemberCanEdit(m.uid, !m.canEdit)
      toast(m.canEdit ? `${m.username}: 조회 전용으로 변경했습니다.` : `${m.username}: 수정 권한을 부여했습니다.`)
    } catch (e) {
      toast(`변경 실패: ${firestoreErrorMessage(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async () => {
    const ok = await confirm({
      title: `${m.username} 계정의 접근 권한을 삭제할까요?`,
      description: '삭제하면 이 아이디로는 더 이상 데이터를 볼 수 없습니다. 같은 아이디를 다시 쓰려면 Firebase 콘솔 > Authentication에서 사용자도 삭제하세요.',
      confirmText: '삭제',
      destructive: true,
    })
    if (!ok) return
    try {
      await removeMember(m.uid)
      toast('삭제했습니다.')
    } catch (e) {
      toast(`삭제 실패: ${firestoreErrorMessage(e)}`, 'error')
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{m.username}</span>
        {m.canEdit ? (
          <Badge variant="success">
            <Pencil className="size-3" /> 수정 가능
          </Badge>
        ) : (
          <Badge variant="secondary">
            <Eye className="size-3" /> 조회만
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={m.canEdit}
          aria-label={`${m.username} 수정 권한`}
          disabled={busy}
          onClick={toggle}
          className="flex items-center gap-2 text-sm text-muted-foreground disabled:opacity-50"
        >
          수정 권한
          <span className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', m.canEdit ? 'bg-primary' : 'bg-muted-foreground/30')}>
            <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', m.canEdit ? 'translate-x-5.5' : 'translate-x-0.5')} />
          </span>
        </button>
        <Button variant="ghost" size="icon" aria-label={`${m.username} 삭제`} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}

export default function AccountsPage() {
  const { members } = useData()
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">계정 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">로그인할 수 있는 계정과 수정 권한을 관리합니다. 모든 계정은 같은 자산 데이터를 봅니다.</p>
      </div>
      <CreateMemberCard />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" /> 계정 목록
          </CardTitle>
          <CardDescription>스위치를 켜면 기록 추가·수정·삭제가 가능해집니다. 변경 내용은 상대방 화면에 바로 반영됩니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            <li className="flex items-center gap-2 py-3">
              <span className="font-semibold">{ADMIN_USERNAME}</span>
              <Badge>
                <ShieldCheck className="size-3" /> 관리자
              </Badge>
            </li>
            {members.map((m) => (
              <MemberRow key={m.uid} m={m} />
            ))}
          </ul>
          {members.length === 0 && (
            <EmptyState icon={Users} title="추가된 계정이 없습니다" description="위에서 아이디와 비밀번호를 입력해 계정을 추가하세요." />
          )}
          <Notice className="mt-3">비밀번호를 잊은 계정은 삭제 후 Firebase 콘솔에서 사용자를 지우고 다시 추가하세요.</Notice>
        </CardContent>
      </Card>
    </div>
  )
}
