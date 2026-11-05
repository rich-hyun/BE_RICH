import { missingConfig } from '@/lib/firebase'

/** Firebase 설정이 없을 때 표시 (데모 모드로 위장하지 않음) */
export function SetupRequiredPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-7">
        <h1 className="text-xl font-extrabold">Firebase 설정이 필요합니다</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          이 웹사이트는 Firebase(Authentication + Firestore)에 데이터를 저장합니다. 아래 환경변수가 설정되지 않아 실행할 수 없습니다.
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 font-mono text-sm">
          {missingConfig.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          로컬 개발: 프로젝트 루트의 <code className="font-mono">.env.example</code>을 <code className="font-mono">.env.local</code>로 복사해 값을 채운 뒤
          다시 실행하세요. 배포: GitHub 저장소 Settings → Secrets and variables → Actions 에 값을 등록하세요. 자세한 방법은 README의 “초보자용 설정 안내”를 참고하세요.
        </p>
      </div>
    </div>
  )
}
