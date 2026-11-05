import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

// index.html의 '로딩 실패' 안내 타이머에 앱이 정상 시작되었음을 알림
;(window as unknown as { __beRichBooted?: boolean }).__beRichBooted = true

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
