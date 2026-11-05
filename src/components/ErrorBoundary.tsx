import { Component, type ErrorInfo, type ReactNode } from 'react'

/** 렌더링 중 예기치 못한 오류가 나도 빈 화면 대신 안내를 표시 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[BE RICH] 화면 오류', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-2xl border bg-card p-7">
          <h1 className="text-xl font-extrabold">화면을 표시하는 중 오류가 발생했습니다</h1>
          <p className="mt-2 break-words font-mono text-xs text-destructive">{this.state.error.message}</p>
          <p className="mt-3 text-sm text-muted-foreground">저장된 데이터는 안전합니다. 새로고침해도 계속되면 개발자 도구(F12) 콘솔의 오류 내용을 확인해 주세요.</p>
          <button
            type="button"
            className="mt-5 h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
            onClick={() => location.reload()}
          >
            새로고침
          </button>
        </div>
      </div>
    )
  }
}
