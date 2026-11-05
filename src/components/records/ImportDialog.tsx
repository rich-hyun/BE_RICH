import { useRef, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Notice, Spinner } from '@/components/ui/misc'
import { useData, firestoreErrorMessage } from '@/contexts/DataContext'
import { useUi } from '@/contexts/UiContext'
import { ImportError, parseAssetWorkbook, type ImportPreview, type ImportRow, type ImportStatus } from '@/lib/excel'
import { ASSET_KEYS } from '@/lib/types'
import { formatKDate } from '@/lib/date'
import { withCommas } from '@/lib/format'
import { cn } from '@/lib/utils'

const STATUS: Record<ImportStatus, { label: string; variant: 'default' | 'secondary' | 'warning' | 'destructive' | 'success' }> = {
  new: { label: '신규', variant: 'success' },
  same: { label: '이미 있음(동일)', variant: 'secondary' },
  conflict: { label: '기존과 다름', variant: 'warning' },
  invalid: { label: '오류', variant: 'destructive' },
  duplicateInFile: { label: '파일 내 중복', variant: 'destructive' },
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { records, importRecords } = useData()
  const { toast, confirm } = useUi()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setPreview(null)
    setError(null)
    setFileName('')
  }

  const onFile = async (f: File | undefined) => {
    reset()
    if (!f) return
    if (f.size > 10 * 1024 * 1024) return setError('파일이 너무 큽니다 (10MB 초과).')
    if (!/\.(xlsx|xls|xlsm|csv)$/i.test(f.name)) return setError('엑셀(.xlsx, .xls) 또는 CSV 파일만 가져올 수 있습니다.')
    try {
      setFileName(f.name)
      setPreview(parseAssetWorkbook(await f.arrayBuffer(), records))
    } catch (e) {
      setError(e instanceof ImportError ? e.message : '파일을 처리하는 중 오류가 발생했습니다.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const toggle = (row: ImportRow) => {
    if (!preview || row.status === 'invalid' || row.status === 'duplicateInFile' || row.status === 'same') return
    setPreview({ ...preview, rows: preview.rows.map((r) => (r === row ? { ...r, include: !r.include } : r)) })
  }

  const selected = preview?.rows.filter((r) => r.include && r.values && r.date) ?? []
  const overwrites = selected.filter((r) => r.status === 'conflict').length
  const issues = preview?.rows.filter((r) => r.errors.length || r.warnings.length) ?? []

  const run = async () => {
    if (!preview || busy || selected.length === 0) return
    if (overwrites > 0) {
      const ok = await confirm({
        title: `기존 기록 ${overwrites}건을 덮어쓸까요?`,
        description: '같은 날짜의 기존 기록이 엑셀 내용으로 교체됩니다.',
        confirmText: '덮어쓰고 가져오기',
        destructive: true,
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      const n = await importRecords(selected.map((r) => ({ date: r.date!, memo: r.memo, ...r.values! })))
      toast(`${n}건을 가져왔습니다.`)
      reset()
      onOpenChange(false)
    } catch (e) {
      toast(`가져오기 실패: ${firestoreErrorMessage(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>엑셀에서 기록 가져오기</DialogTitle>
          <DialogDescription>
            ‘월별자산입력’ 시트(날짜·ISA계좌·일반계좌·암호화폐·금·현금)를 읽어 미리보기를 보여줍니다. 실제 날짜 순으로 정렬해 총자산과 증감률을 다시 계산·검증합니다.
          </DialogDescription>
        </DialogHeader>

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm,.csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        {!preview && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-sm text-muted-foreground hover:bg-muted"
          >
            <FileSpreadsheet className="size-8" />
            <span className="font-semibold text-foreground">엑셀 파일 선택</span>
            <span>파일은 브라우저에서만 읽으며, 선택한 행만 Firestore에 저장됩니다.</span>
          </button>
        )}
        {error && <Notice tone="danger">{error}</Notice>}

        {preview && (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{fileName}</span>
              <Badge variant="secondary">시트: {preview.sheetName}</Badge>
              <Badge variant="secondary">헤더 {preview.headerRow}행</Badge>
              <Badge variant="secondary">{preview.rows.length}행 인식</Badge>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => fileRef.current?.click()}>
                <Upload /> 다른 파일
              </Button>
            </div>
            {preview.fileWarnings.map((w) => (
              <Notice key={w} tone="warning">
                {w}
              </Notice>
            ))}

            <div className="max-h-[42dvh] overflow-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr>
                    <th className="w-8 p-2" />
                    <th className="p-2 text-left">행</th>
                    <th className="p-2 text-left">날짜</th>
                    {['ISA', '일반', '암호화폐', '금', '현금', '총자산(재계산)'].map((h) => (
                      <th key={h} className="p-2 text-right">
                        {h}
                      </th>
                    ))}
                    <th className="p-2 text-left">상태</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {preview.rows.map((r) => {
                    const selectable = r.status === 'new' || r.status === 'conflict'
                    return (
                      <tr key={r.rowNumber} className={cn('border-t', !r.include && 'text-muted-foreground')}>
                        <td className="p-2 text-center">
                          <input type="checkbox" checked={r.include} disabled={!selectable} onChange={() => toggle(r)} className="accent-[var(--primary)]" aria-label={`${r.rowNumber}행 포함`} />
                        </td>
                        <td className="p-2">{r.rowNumber}</td>
                        <td className="p-2 whitespace-nowrap">{r.date ? formatKDate(r.date) : <span className="text-destructive">{r.rawDate || '(빈 값)'}</span>}</td>
                        {ASSET_KEYS.map((k) => (
                          <td key={k} className="p-2 text-right">
                            {r.values ? withCommas(r.values[k]) : '-'}
                          </td>
                        ))}
                        <td className="p-2 text-right font-semibold">{r.computedTotal != null ? withCommas(r.computedTotal) : '-'}</td>
                        <td className="p-2">
                          <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {issues.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="mb-1.5 text-xs font-bold">확인 목록 ({issues.length}행)</p>
                <ul className="max-h-32 space-y-1 overflow-auto text-xs">
                  {issues.map((r) => (
                    <li key={r.rowNumber}>
                      <span className="font-semibold">{r.rowNumber}행</span>{' '}
                      {r.errors.map((e) => (
                        <span key={e} className="text-destructive">
                          · {e}{' '}
                        </span>
                      ))}
                      {r.warnings.map((w) => (
                        <span key={w} className="text-amber-700 dark:text-amber-300">
                          · {w}{' '}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Notice>
              ‘이미 있음(동일)’ 행은 다시 저장하지 않아 재업로드해도 중복이 생기지 않습니다. ‘기존과 다름’ 행은 체크하면 기존 기록을 덮어씁니다.
            </Notice>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            닫기
          </Button>
          {preview && (
            <Button onClick={run} disabled={busy || selected.length === 0}>
              {busy && <Spinner />} {selected.length}건 가져오기{overwrites ? ` (덮어쓰기 ${overwrites})` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
