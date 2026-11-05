import { firebaseInitError, missingConfig } from '@/lib/firebase'

/** Firebase 설정이 없거나 초기화에 실패했을 때 표시 (빈 화면 대신 원인 안내) */
export function SetupRequiredPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-7">
        <h1 className="text-xl font-extrabold">{firebaseInitError ? 'Firebase 연결에 실패했습니다' : 'Firebase 설정이 필요합니다'}</h1>
        {firebaseInitError ? (
          <p className="mt-2 break-words font-mono text-sm text-destructive">{firebaseInitError}</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              이 웹사이트는 Firebase(Authentication + Firestore)에 데이터를 저장합니다. 아래 환경변수가 빌드에 포함되지 않아 실행할 수 없습니다.
            </p>
            <ul className="mt-4 list-disc space-y-1 pl-5 font-mono text-sm">
              {missingConfig.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-4 text-sm text-muted-foreground">
          로컬 개발: <code className="font-mono">.env.local</code> 확인 후 다시 실행. 배포: 저장소의 <code className="font-mono">.env.production</code> 값을 확인하고 GitHub Actions를 다시 실행하세요.
        </p>
      </div>
    </div>
  )
}
