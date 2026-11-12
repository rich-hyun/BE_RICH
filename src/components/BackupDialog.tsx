import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileJson, FileSpreadsheet, FileText, History, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Notice, Spinner } from '@/components/ui/misc'
import { useData, firestoreErrorMessage, type HistoryEntry } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { buildBackup, diffBackup, parseBackup, planRestore, BackupError, COLLECTION_LABELS, type ParsedBackup, type RestoreMode } from '@/lib/backup'
import { downloadBlob } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { todayKST } from '@/lib/date'

const MODES: { value: RestoreMode; label: string; desc: string }[] = [
  { value: 'merge-keep', label: '병합 (기존 유지)', desc: '새 항목만 추가합니다. 같은 항목이 이미 있으면 현재 데이터를 유지합니다.' },
  { value: 'merge-overwrite', label: '병합 (백업 우선)', desc: '새 항목을 추가하고, 내용이 다른 같은 항목은 백업 파일 내용으로 덮어씁니다. (이전 내용은 변경 이력에 보존)' },
  { value: 'replace', label: '전체 덮어쓰기', desc: '백업 파일에 없는 현재 항목은 삭제하고 백업 내용으로 교체합니다. (삭제된 항목도 변경 이력에 보존)' },
]
const fmtTime = (ms: number) => new Date(ms).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
const ACTION_LABEL = { update: '수정 전', delete: '삭제 전' } as const
const COLL_LABEL: Record<string, string> = { ...COLLECTION_LABELS, settings: '설정' }

export function BackupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { isOwner } = useAuth()
  // 백업·복원·이력은 관리자 전용. (최종 차단은 Firestore 규칙 + 서버에 저장된 계정 권한)
  if (!isOwner) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <BackupBody />}</DialogContent>
    </Dialog>
  )
}

function BackupBody() {
  const data = useData()
  const { toast, confirm } = useUi()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<(ParsedBackup & { fileName: string }) | null>(null)
  const [mode, setMode] = useState<RestoreMode>('merge-keep')
  const [includeSettings, setIncludeSettings] = useState(false)
  const [includeMembers, setIncludeMembers] = useState(false)
  const [ack, setAck] = useState(false)
  const [preBackup, setPreBackup] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stamp = todayKST()

  const current = useMemo(
    () => ({ assetRecords: data.records, holdings: data.holdings, etfCompositions: data.compositions, goals: data.goals }),
    [data.records, data.holdings, data.compositions, data.goals],
  )

  const downloadJson = useCallback(
    async (name: string) => {
      const b = await buildBackup({
        assetRecords: data.records,
        holdings: data.holdings,
        etfCompositions: data.compositions,
        goals: data.goals,
        settings: data.settings,
        members: data.members.map((m) => ({ username: m.username, canEdit: m.canEdit })),
      })
      downloadBlob(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }), name)
    },
    [data.records, data.holdings, data.compositions, data.goals, data.settings, data.members],
  )

  const exportJson = async () => {
    try {
      await downloadJson(`be-rich-backup-${stamp}.json`)
      await data.markBackupDone().catch(() => undefined)
      toast('백업 파일을 내려받았습니다. 안전한 곳에 보관하세요.')
    } catch (e) {
      toast(e instanceof BackupError ? e.message : `백업 실패: ${firestoreErrorMessage(e)}`, 'error')
    }
  }

  const onFile = async (f: File | undefined) => {
    setError(null)
    setPending(null)
    setAck(false)
    if (!f) return
    if (f.size > 20 * 1024 * 1024) {
      setError('파일이 너무 큽니다 (20MB 초과).')
      return
    }
    try {
      const parsed = await parseBackup(await f.text())
      setPending({ ...parsed, fileName: f.name })
    } catch (e) {
      setError(e instanceof BackupError ? e.message : '파일을 읽는 중 오류가 발생했습니다.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const diffs = useMemo(() => (pending ? diffBackup(pending.data, current) : []), [pending, current])
  const plan = useMemo(() => (pending ? planRestore(pending.data, current, mode) : null), [pending, current, mode])
  const conflictTotal = diffs.reduce((n, d) => n + d.conflictCount, 0)
  const duplicateTotal = diffs.reduce((n, d) => n + d.duplicates.length, 0)
  // 확인이 필요한 상황: 충돌/중복이 있거나, 삭제가 일어나거나, 무결성 검사가 실패한 경우
  const needsAck = conflictTotal > 0 || duplicateTotal > 0 || mode === 'replace' || pending?.integrity === 'mismatch'
  const matchedMembers = pending ? pending.data.members.filter((m) => data.members.some((c) => c.username === m.username)) : []

  const runRestore = async () => {
    if (!pending || !plan || busy) return
    const ok = await confirm({
      title: '백업을 복원할까요?',
      description: `추가 ${plan.writes.filter((w) => !w.previous).length}건 · 덮어쓰기 ${plan.writes.filter((w) => w.previous).length}건 · 삭제 ${plan.deletes.length}건 · 변경 없음 ${plan.unchanged}건${plan.kept ? ` · 현재 값 유지 ${plan.kept}건` : ''}. 덮어쓰거나 삭제되는 항목의 이전 내용은 변경 이력에 보존됩니다.`,
      confirmText: '복원',
      destructive: mode === 'replace' || plan.deletes.length > 0,
    })
    if (!ok) return
    setBusy(true)
    try {
      if (preBackup) await downloadJson(`be-rich-before-restore-${stamp}.json`)
      const r = await data.restore(pending.data, mode, { includeSettings, includeMembers })
      toast(`복원 완료: ${r.written}건 기록, ${r.deleted}건 삭제`)
      setPending(null)
      setAck(false)
    } catch (e) {
      toast(`복원 실패: ${firestoreErrorMessage(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  // ───── 변경 이력 ─────
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [histLimit, setHistLimit] = useState(50)
  const [histError, setHistError] = useState<string | null>(null)
  const { fetchHistory } = data
  const loadHistory = useCallback(
    async (max: number) => {
      setHistError(null)
      try {
        setHistory(await fetchHistory(max))
      } catch (e) {
        setHistError(firestoreErrorMessage(e))
      }
    },
    [fetchHistory],
  )
  const [tab, setTab] = useState('export')
  useEffect(() => {
    if (tab === 'history') void loadHistory(histLimit)
  }, [tab, histLimit, loadHistory])

  const restoreEntry = async (h: HistoryEntry) => {
    const ok = await confirm({
      title: '이 시점으로 되돌릴까요?',
      description: `${fmtTime(h.savedAt)}에 보존된 ‘${h.label}’ 내용으로 되돌립니다. 지금 저장된 내용은 다시 변경 이력에 남습니다.`,
      confirmText: '되돌리기',
    })
    if (!ok) return
    try {
      await data.restoreFromHistory(h)
      toast('이전 버전으로 되돌렸습니다.')
      void loadHistory(histLimit)
    } catch (e) {
      toast(`되돌리기 실패: ${firestoreErrorMessage(e)}`, 'error')
    }
  }

  const daysSince = data.lastBackupAt ? Math.floor((Date.now() - data.lastBackupAt) / 86400000) : null
  const stale = data.lastBackupAt === null || (daysSince != null && daysSince >= 30)

  return (
    <>
      <DialogHeader>
        <DialogTitle>백업 · 복원 (관리자)</DialogTitle>
        <DialogDescription>Firebase 무료 요금제에는 자동 백업이 없습니다. 월 1회 이상 JSON 파일을 내려받아 보관하세요.</DialogDescription>
      </DialogHeader>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full [&>button]:flex-1">
          <TabsTrigger value="export">내보내기</TabsTrigger>
          <TabsTrigger value="restore">JSON 복원</TabsTrigger>
          <TabsTrigger value="history">변경 이력</TabsTrigger>
        </TabsList>

        <TabsContent value="export" className="flex flex-col gap-2">
          {data.lastBackupAt !== undefined && (
            <Notice tone={stale ? 'danger' : 'info'}>
              {data.lastBackupAt === null ? '아직 백업 파일을 내려받은 기록이 없습니다. 지금 JSON 백업을 받아 두세요.' : `마지막 백업: ${fmtTime(data.lastBackupAt)} (${daysSince}일 전)${stale ? ' — 백업한 지 오래되었습니다.' : ''}`}
            </Notice>
          )}
          <Button variant="default" className="justify-start" onClick={exportJson}>
            <FileJson /> 전체 데이터 JSON 백업 (복원용)
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            onClick={async () => {
              const { exportWorkbook } = await import('@/lib/excel')
              downloadBlob(exportWorkbook({ records: data.records, holdings: data.holdings, goals: data.goals }), `be-rich-${stamp}.xlsx`)
            }}
          >
            <FileSpreadsheet /> 엑셀(.xlsx) 다운로드 (열람용)
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            onClick={async () => {
              const { exportRecordsCsv } = await import('@/lib/excel')
              downloadBlob(exportRecordsCsv(data.records), `be-rich-records-${stamp}.csv`)
            }}
          >
            <FileText /> 월별 자산 기록 CSV 다운로드 (열람용)
          </Button>
          <Notice className="mt-2">
            JSON 백업에는 월별 자산 기록 {data.records.length}건 · 보유 종목 {data.holdings.length}건 · ETF 구성비 {data.compositions.length}건 · 목표 {data.goals.length}건 · 설정 ·
            계정 {data.members.length}개(아이디와 수정 권한만)가 담깁니다. 로그인 비밀번호와 인증 토큰은 포함되지 않습니다. 개인 자산 정보이므로 GitHub 등 공개 장소에 올리지 마세요.
          </Notice>
        </TabsContent>

        <TabsContent value="restore" className="flex flex-col gap-3">
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload /> 백업 JSON 파일 선택
          </Button>
          {error && <Notice tone="danger">{error}</Notice>}
          {pending && plan && (
            <>
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-semibold">{pending.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  백업 시각: {pending.data.exportedAt ? new Date(pending.data.exportedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '알 수 없음'} · 형식 v{pending.sourceVersion}
                  {pending.integrity === 'verified' && ' · 무결성 확인됨'}
                </p>
                <table className="mt-2 w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 text-left font-medium">항목</th>
                      <th className="text-right font-medium">백업</th>
                      <th className="text-right font-medium">신규</th>
                      <th className="text-right font-medium">동일</th>
                      <th className="text-right font-medium">충돌</th>
                      <th className="text-right font-medium">현재</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {diffs.map((d) => (
                      <tr key={d.collection} className="border-t">
                        <td className="py-1">{d.label}</td>
                        <td className="text-right">{d.incoming}</td>
                        <td className="text-right">{d.newCount}</td>
                        <td className="text-right">{d.identicalCount}</td>
                        <td className={`text-right ${d.conflictCount ? 'font-semibold text-destructive' : ''}`}>{d.conflictCount}</td>
                        <td className="text-right">{d.existingCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-muted-foreground">신규 = 현재 없음 · 동일 = 내용까지 같아 건너뜀 · 충돌 = 같은 항목인데 내용이 다름</p>
                {pending.skipped > 0 && <p className="mt-2 text-xs text-destructive">형식이 잘못된 항목 {pending.skipped}건은 제외됩니다.</p>}
              </div>

              {pending.integrity === 'mismatch' && (
                <Notice tone="danger">파일 내용이 내보낼 때와 달라졌습니다(손상되었거나 직접 수정됨). 내용을 확인한 뒤에만 복원하세요.</Notice>
              )}
              {pending.sourceVersion < 2 && <Notice>{pending.warnings[0]}</Notice>}
              {pending.warnings.filter((_, i) => !(pending.sourceVersion < 2 && i === 0)).map((w) => (
                <Notice key={w}>{w}</Notice>
              ))}

              {diffs.some((d) => d.conflicts.length > 0) && (
                <details className="rounded-lg border p-3 text-xs" open>
                  <summary className="cursor-pointer text-sm font-semibold">충돌 {conflictTotal}건 — 같은 항목인데 내용이 다릅니다</summary>
                  <p className="mt-1 text-muted-foreground">
                    {mode === 'merge-keep' ? '현재 값을 유지합니다.' : '백업 값으로 덮어쓰며, 현재 값은 변경 이력에 보존됩니다.'}
                  </p>
                  <ul className="mt-2 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                    {diffs.flatMap((d) =>
                      d.conflicts.slice(0, 100).map((c) => (
                        <li key={d.collection + c.id} className="rounded border p-1.5">
                          <span className="font-medium">
                            {d.label} · {c.title}
                          </span>
                          <span className="block text-muted-foreground">현재: {c.current}</span>
                          <span className="block">백업: {c.incoming}</span>
                        </li>
                      )),
                    )}
                  </ul>
                </details>
              )}
              {duplicateTotal > 0 && (
                <details className="rounded-lg border border-amber-500/50 p-3 text-xs" open>
                  <summary className="cursor-pointer text-sm font-semibold">중복 가능성 {duplicateTotal}건 — 같은 날짜·종목이 다른 ID로 이미 있습니다</summary>
                  <p className="mt-1 text-muted-foreground">복원하면 같은 종목·구성비가 두 번 들어갈 수 있습니다. 필요하면 복원 후 한쪽을 삭제하세요.</p>
                  <ul className="mt-2 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                    {diffs.flatMap((d) =>
                      d.duplicates.slice(0, 100).map((c) => (
                        <li key={d.collection + c.id} className="rounded border p-1.5">
                          <span className="font-medium">
                            {d.label} · {c.title}
                          </span>
                          <span className="block text-muted-foreground">현재: {c.current}</span>
                          <span className="block">백업: {c.incoming}</span>
                        </li>
                      )),
                    )}
                  </ul>
                </details>
              )}

              <div className="flex flex-col gap-2">
                {MODES.map((m) => (
                  <label key={m.value} className="flex cursor-pointer gap-2 rounded-lg border p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/50">
                    <input type="radio" name="mode" checked={mode === m.value} onChange={() => setMode(m.value)} className="mt-1 accent-[var(--primary)]" />
                    <span>
                      <span className="font-semibold">{m.label}</span>
                      <span className="block text-xs text-muted-foreground">{m.desc}</span>
                    </span>
                  </label>
                ))}
                {pending.data.settings && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={includeSettings} onChange={(e) => setIncludeSettings(e.target.checked)} className="accent-[var(--primary)]" />
                    설정(금액 단위·경고 기준)도 복원
                  </label>
                )}
                {pending.data.members.length > 0 && (
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={includeMembers} onChange={(e) => setIncludeMembers(e.target.checked)} className="mt-1 accent-[var(--primary)]" />
                    <span>
                      계정 수정 권한도 복원
                      <span className="block text-xs text-muted-foreground">
                        이미 등록된 아이디 {matchedMembers.length}개만 적용됩니다. 비밀번호는 백업에 없으므로 없는 계정은 ‘계정 관리’에서 새로 만들어야 합니다.
                      </span>
                    </span>
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={preBackup} onChange={(e) => setPreBackup(e.target.checked)} className="accent-[var(--primary)]" />
                  복원 전에 현재 데이터를 JSON으로 먼저 내려받기 (권장)
                </label>
                {needsAck && (
                  <label className="flex items-start gap-2 rounded-lg border border-destructive/40 p-2.5 text-sm">
                    <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 accent-[var(--primary)]" />
                    <span>
                      위 미리보기를 확인했습니다.
                      {conflictTotal > 0 && ` 충돌 ${conflictTotal}건은 선택한 방식으로 처리됩니다.`}
                      {plan.deletes.length > 0 && ` 현재 항목 ${plan.deletes.length}건이 삭제됩니다.`}
                      {duplicateTotal > 0 && ` 중복 가능성 ${duplicateTotal}건이 있어도 진행합니다.`}
                    </span>
                  </label>
                )}
              </div>
              <Button onClick={runRestore} disabled={busy || (needsAck && !ack)} variant={mode === 'replace' ? 'destructive' : 'default'}>
                {busy && <Spinner />} 복원 실행
              </Button>
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="flex flex-col gap-2">
          <Notice>
            기록·종목·구성비·목표를 수정하거나 삭제하면 직전 내용이 자동으로 보존됩니다. 관리자만 볼 수 있으며, 이 화면에서 이전 버전으로 되돌릴 수 있습니다.
          </Notice>
          {histError && <Notice tone="danger">{histError}</Notice>}
          {!history && !histError && <Spinner />}
          {history && history.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">보존된 이전 버전이 아직 없습니다.</p>}
          {history && history.length > 0 && (
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
                  <History className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {COLL_LABEL[h.collection] ?? h.collection} · {h.label}
                    </span>
                    <span className="block text-muted-foreground">
                      {fmtTime(h.savedAt)} · {ACTION_LABEL[h.action]} 내용
                    </span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => restoreEntry(h)}>
                    되돌리기
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {history && history.length >= histLimit && (
            <Button variant="ghost" size="sm" onClick={() => setHistLimit((n) => n + 100)}>
              더 보기
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}
