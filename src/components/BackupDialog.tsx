import { useRef, useState } from 'react'
import { FileJson, FileSpreadsheet, FileText, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Notice, Spinner } from '@/components/ui/misc'
import { useData, firestoreErrorMessage } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { buildBackup, diffBackup, parseBackup, BackupError, type BackupData, type RestoreMode } from '@/lib/backup'
import { downloadBlob } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { todayKST } from '@/lib/date'

const MODES: { value: RestoreMode; label: string; desc: string }[] = [
  { value: 'merge-keep', label: '병합 (기존 유지)', desc: '새 항목만 추가합니다. 같은 항목이 이미 있으면 현재 데이터를 유지합니다.' },
  { value: 'merge-overwrite', label: '병합 (백업 우선)', desc: '새 항목을 추가하고, 같은 항목은 백업 파일 내용으로 덮어씁니다.' },
  { value: 'replace', label: '전체 덮어쓰기', desc: '현재 데이터를 모두 지우고 백업 파일 내용으로 교체합니다.' },
]

export function BackupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const data = useData()
  const { canEdit } = useAuth()
  const { toast, confirm } = useUi()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ data: BackupData; skipped: number; fileName: string } | null>(null)
  const [mode, setMode] = useState<RestoreMode>('merge-keep')
  const [includeSettings, setIncludeSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stamp = todayKST()

  const exportJson = () => {
    const b = buildBackup({
      assetRecords: data.records,
      holdings: data.holdings,
      etfCompositions: data.compositions,
      goals: data.goals,
      settings: data.settings,
    })
    downloadBlob(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }), `be-rich-backup-${stamp}.json`)
  }

  const onFile = async (f: File | undefined) => {
    setError(null)
    setPending(null)
    if (!f) return
    if (f.size > 20 * 1024 * 1024) {
      setError('파일이 너무 큽니다 (20MB 초과).')
      return
    }
    try {
      const parsed = parseBackup(await f.text())
      setPending({ ...parsed, fileName: f.name })
    } catch (e) {
      setError(e instanceof BackupError ? e.message : '파일을 읽는 중 오류가 발생했습니다.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const diffs = pending
    ? diffBackup(pending.data, { assetRecords: data.records, holdings: data.holdings, etfCompositions: data.compositions, goals: data.goals })
    : []

  const runRestore = async () => {
    if (!pending || busy) return
    const ok = await confirm({
      title: '백업을 복원할까요?',
      description:
        mode === 'replace'
          ? '현재 저장된 데이터가 모두 삭제되고 백업 내용으로 교체됩니다. 먼저 현재 데이터를 JSON으로 백업해 두는 것을 권장합니다.'
          : '선택한 방식으로 백업 데이터를 병합합니다.',
      confirmText: '복원',
      destructive: mode === 'replace',
    })
    if (!ok) return
    setBusy(true)
    try {
      await data.restore(pending.data, mode, includeSettings)
      toast('복원이 완료되었습니다.')
      setPending(null)
    } catch (e) {
      toast(`복원 실패: ${firestoreErrorMessage(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>백업 · 내보내기</DialogTitle>
          <DialogDescription>Firebase 무료 요금제에는 자동 백업이 없으므로 주기적으로 파일을 내려받아 보관하세요.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="export">
          <TabsList className="w-full [&>button]:flex-1">
            <TabsTrigger value="export">내보내기</TabsTrigger>
            {canEdit && <TabsTrigger value="restore">JSON 복원</TabsTrigger>}
          </TabsList>
          <TabsContent value="export" className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="justify-start"
              onClick={async () => {
                const { exportWorkbook } = await import('@/lib/excel')
                downloadBlob(exportWorkbook({ records: data.records, holdings: data.holdings, goals: data.goals }), `be-rich-${stamp}.xlsx`)
              }}
            >
              <FileSpreadsheet /> 전체 데이터 엑셀(.xlsx) 다운로드
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={async () => {
                const { exportRecordsCsv } = await import('@/lib/excel')
                downloadBlob(exportRecordsCsv(data.records), `be-rich-records-${stamp}.csv`)
              }}
            >
              <FileText /> 월별 자산 기록 CSV 다운로드
            </Button>
            <Button variant="outline" className="justify-start" onClick={exportJson}>
              <FileJson /> 전체 데이터 JSON 백업 (복원용)
            </Button>
            <Notice className="mt-2">
              현재 기록 {data.records.length}건 · 보유 종목 {data.holdings.length}건 · ETF 구성비 {data.compositions.length}건 · 목표 {data.goals.length}건.
              백업 파일에는 개인 자산 정보가 담겨 있으니 GitHub 등 공개 장소에 올리지 마세요.
            </Notice>
          </TabsContent>
          <TabsContent value="restore" className="flex flex-col gap-3">
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload /> 백업 JSON 파일 선택
            </Button>
            {error && <Notice tone="danger">{error}</Notice>}
            {pending && (
              <>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="font-semibold">{pending.fileName}</p>
                  <p className="text-xs text-muted-foreground">백업 시각: {pending.data.exportedAt ? new Date(pending.data.exportedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '알 수 없음'}</p>
                  <table className="mt-2 w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 text-left font-medium">항목</th>
                        <th className="text-right font-medium">백업</th>
                        <th className="text-right font-medium">신규</th>
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
                          <td className="text-right">{d.conflictCount}</td>
                          <td className="text-right">{d.existingCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pending.skipped > 0 && <p className="mt-2 text-xs text-destructive">형식이 잘못된 항목 {pending.skipped}건은 제외됩니다.</p>}
                </div>
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
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={includeSettings} onChange={(e) => setIncludeSettings(e.target.checked)} className="accent-[var(--primary)]" />
                    설정(금액 단위·경고 기준)도 복원
                  </label>
                </div>
                <Button onClick={runRestore} disabled={busy} variant={mode === 'replace' ? 'destructive' : 'default'}>
                  {busy && <Spinner />} 복원 실행
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
