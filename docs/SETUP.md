# 초보자용 설정 · 배포 안내서

이 문서를 위에서부터 순서대로 따라 하면 **무료**로 본인 전용 자산관리 웹사이트를 운영할 수 있습니다.
걸리는 시간: 약 30분. 필요한 것: Google 계정, GitHub 계정(`rich-hyun`), 이 저장소.

> 📌 **비밀번호는 이 문서의 어떤 단계에서도 파일·코드·GitHub에 입력하지 않습니다.**
> 비밀번호는 오직 Firebase 콘솔에서 계정을 만들 때와 웹사이트 로그인 화면에서만 입력합니다.

---

## 1. Firebase 프로젝트 만들기

1. <https://console.firebase.google.com> 접속 → **프로젝트 추가**
2. 프로젝트 이름: 예) `be-rich-asset` → Google 애널리틱스는 **사용 안 함**으로 해도 됩니다.
3. 만들어진 프로젝트 좌측 하단 요금제가 **Spark(무료)** 인지 확인합니다. Blaze(종량제)로 업그레이드하지 마세요.
4. 프로젝트 개요 화면에서 **웹 앱 추가(`</>` 아이콘)** → 앱 닉네임 `be-rich-web` → **Firebase 호스팅은 체크하지 않음** → 앱 등록
5. 화면에 나오는 `firebaseConfig` 값(apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)을 메모장에 복사해 둡니다.
   - 이 값들은 **비밀값이 아닙니다**. 웹사이트를 여는 누구나 브라우저에서 볼 수 있는 식별값이며, 데이터 보호는 4단계의 보안 규칙이 담당합니다.

## 2. 로그인(Authentication) 설정 — 관리자 계정 1개 만들기

1. 좌측 메뉴 **빌드 → Authentication → 시작하기**
2. **Sign-in method** 탭 → **이메일/비밀번호** → 사용 설정 → 저장 (이메일 링크는 끄기)
3. **Users(사용자)** 탭 → **사용자 추가**
   - 이메일: 본인 이메일 (예: `you@example.com`). 이 이메일은 배포된 사이트 코드에 포함되어 공개되므로, 공개되어도 괜찮은 주소를 쓰세요
   - 비밀번호: **12자 이상, 다른 사이트와 다른** 강한 비밀번호 → 비밀번호 관리자에 저장해 두세요.
4. 추가된 사용자 행의 **사용자 UID**(예: `Xy12AbC...`)를 복사해 둡니다. 이것이 `ADMIN_UID` 입니다.
5. **Settings(설정) 탭 → 승인된 도메인** → **도메인 추가** → `rich-hyun.github.io`
   (`localhost`는 기본으로 들어 있습니다)
6. (권장) **Settings → 사용자 작업(User actions)** 메뉴가 보이면 **“생성(가입) 사용 설정”을 해제**해 새 계정 가입을 막으세요.
   메뉴가 없는 프로젝트도 있습니다. 그래도 괜찮습니다 — 누군가 계정을 만들어도 4단계 보안 규칙이 관리자 UID 외 모든 접근을 거부합니다.

> 이 웹사이트에는 회원가입 화면이 없습니다. 로그인 화면에서는 비밀번호만 입력하며, 이메일은 설정값(`VITE_ADMIN_EMAIL`)으로 고정됩니다.

## 3. Firestore 데이터베이스 만들기

1. 좌측 메뉴 **빌드 → Firestore Database → 데이터베이스 만들기**
2. 위치: **`asia-northeast3 (서울)`** 권장 (나중에 변경 불가)
3. 보안 규칙 시작 모드: **프로덕션 모드** 선택
   ⚠️ “테스트 모드”는 30일 동안 누구나 읽고 쓸 수 있으므로 선택하지 마세요.

## 4. 보안 규칙 배포 (가장 중요)

둘 중 편한 방법 하나를 고르세요.

### 방법 A — 콘솔에 붙여넣기 (가장 쉬움)
1. 이 저장소의 `firestore.rules` 파일 내용을 전부 복사
2. Firestore Database → **규칙** 탭에 붙여넣기
3. `"ADMIN_UID"` 를 2-4단계에서 복사한 UID로 교체 (따옴표는 유지)
   예: `request.auth.uid == "Xy12AbC..."`
4. **게시** 클릭
   - UID는 비밀번호가 아니지만, 저장소의 `firestore.rules` 파일은 `"ADMIN_UID"` 그대로 두면 됩니다.

### 방법 B — 명령어로 배포
```bash
npx firebase login                       # 브라우저에서 Google 로그인 (본인 PC에서 1회)
npx firebase use --add                   # 1단계 프로젝트 선택, 별칭 default
npm run rules:deploy                     # .env.local 의 VITE_ADMIN_UID로 규칙 생성 후 배포
```
`firestore.rules.generated`, `.firebaserc` 는 `.gitignore`에 포함되어 GitHub에 올라가지 않습니다.

> 배포 후 Firestore → 규칙 탭에서 실제로 UID가 들어간 규칙이 게시되었는지 꼭 확인하세요.

## 5. 내 PC에서 실행해 보기

Node.js 20 이상이 필요합니다. (<https://nodejs.org> LTS 설치)

```bash
cd BE_RICH
npm install
copy .env.example .env.local     # macOS/Linux: cp .env.example .env.local
```
`.env.local`을 메모장으로 열어 1-5단계의 `firebaseConfig` 값, 관리자 이메일, UID를 채웁니다. **비밀번호는 넣지 않습니다.**

```bash
npm run dev
```
브라우저에서 <http://localhost:5173> → 비밀번호 입력 → 로그인되면 1페이지(월별 자산)가 열립니다.

### 기존 엑셀 데이터 가져오기
1. 1페이지 **엑셀 가져오기** → 기존 `월별자산현황` 엑셀 파일 선택
2. 미리보기에서 날짜·금액·총자산 재계산 결과와 확인 목록(오류·경고)을 확인
3. **N건 가져오기** 클릭 → Firestore에 저장됩니다.
   - 같은 파일을 다시 올리면 ‘이미 있음(동일)’으로 표시되어 중복 저장되지 않습니다.
   - 엑셀 파일 자체는 저장소에 넣지 마세요(`.gitignore`가 `*.xlsx`를 차단합니다).

## 6. GitHub Pages로 무료 배포

1. GitHub 저장소 **Settings → Secrets and variables → Actions → New repository secret** 에서 아래 8개를 등록
   | 이름 | 값 |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | firebaseConfig.apiKey |
   | `VITE_FIREBASE_AUTH_DOMAIN` | firebaseConfig.authDomain |
   | `VITE_FIREBASE_PROJECT_ID` | firebaseConfig.projectId |
   | `VITE_FIREBASE_STORAGE_BUCKET` | firebaseConfig.storageBucket |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | firebaseConfig.messagingSenderId |
   | `VITE_FIREBASE_APP_ID` | firebaseConfig.appId |
   | `VITE_ADMIN_EMAIL` | 관리자 이메일 (선택: 비우면 로그인 화면에서 이메일도 입력) |
   | `VITE_ADMIN_UID` | 관리자 UID |

   - Secrets에 넣더라도 이 값들은 빌드된 JavaScript에 포함되어 공개됩니다(원래 공개되는 값이라 괜찮습니다).
   - **비밀번호나 서비스 계정 키는 Secrets에도 넣지 마세요.** 이 앱은 그런 값이 필요 없습니다.
2. **Settings → Pages → Build and deployment → Source: “GitHub Actions”** 선택
3. 코드를 `main` 브랜치에 push 하면 **Actions** 탭에서 자동 배포가 진행됩니다(약 2~3분).
4. 완료 후 주소: **<https://rich-hyun.github.io/BE_RICH/>**

> 무료 GitHub 계정에서 Pages를 쓰려면 저장소가 **공개(Public)** 여야 합니다. 저장소에는 소스 코드만 있고 자산 데이터·비밀번호는 없으므로 공개해도 데이터는 노출되지 않습니다. 화면(HTML) 자체는 누구나 볼 수 있지만, 로그인하지 않으면 데이터를 불러올 수 없습니다.

### (권장) API 키 사용처 제한
Google Cloud 콘솔(<https://console.cloud.google.com/apis/credentials>) → 해당 프로젝트 → **Browser key** → 애플리케이션 제한사항 **웹사이트** →
`https://rich-hyun.github.io/*`, `http://localhost:5173/*` 추가. 다른 사이트에서 이 키를 도용하는 것을 줄여 줍니다.

## 7. 배포 전 보안 점검

| # | 점검 항목 | 확인 방법 |
|---|---|---|
| 1 | 로그인 전 데이터 조회 불가 | 시크릿 창에서 사이트 접속 → 로그인 화면만 보이는지. 개발자도구 Network 탭에 Firestore 요청이 없는지 |
| 2 | URL 직접 입력 차단 | 시크릿 창에서 `…/BE_RICH/#/dashboard`, `#/portfolio` 직접 입력 → 로그인 화면으로 이동하는지 |
| 3 | 다른 계정 차단 | 로그인 화면은 관리자 이메일로 고정되어 있어 다른 계정으로는 로그인 자체가 불가합니다. 서버 측 차단은 `npm run test:rules`(아래)로 다른 UID의 읽기·쓰기가 거부되는지 확인합니다 |
| 4 | 저장소에 비밀번호 없음 | GitHub 저장소 검색창에서 비밀번호 일부를 검색해 결과가 없는지. `.env.local`이 커밋되지 않았는지(`git status`) |
| 5 | 개발자도구 노출 확인 | 배포 사이트에서 F12 → Sources/검색(Ctrl+Shift+F)으로 비밀번호·`private_key` 검색 → 없어야 정상. apiKey·이메일·UID는 보이는 것이 정상 |
| 6 | 로그아웃 후 조회 불가 | 로그아웃 → 뒤로가기 → 로그인 화면으로 돌아가는지. 새로고침해도 데이터가 보이지 않는지 |
| 7 | 보안 규칙 실제 배포 | Firestore → 규칙 탭에 `"ADMIN_UID"`가 아닌 실제 UID가 들어 있는지, 테스트 모드 규칙(`allow read, write: if true` 또는 기한 조건)이 없는지 |

### 보안 규칙 자동 테스트 (선택, Java 필요)
```bash
npm run test:rules
```
로컬 Firestore 에뮬레이터에서 다음을 검증합니다: 관리자 읽기/쓰기 허용, 비로그인 거부, 다른 계정 거부(관리자 경로·자기 경로 모두), 정의되지 않은 경로 거부, 잘못된 데이터 형식 거부. 실제 Firebase 프로젝트에는 접속하지 않습니다.

## 8. 무료 요금제(Spark)로 충분한가?

| Firestore 무료 한도(일) | 이 앱의 예상 사용량 |
|---|---|
| 읽기 50,000회 | 접속 1회당 저장된 문서 수만큼(수십~수백 회). 하루 수십 번 접속해도 여유 |
| 쓰기 20,000회 | 기록 저장 1건당 1~2회 |
| 저장 용량 1 GiB | 10년치 기록·스냅샷도 수 MB 수준 |

- Authentication 이메일/비밀번호 로그인은 무료입니다.
- Cloud Functions, 유료 백업, 외부 시세 API 등 결제가 필요한 기능은 사용하지 않습니다.
- 무료 요금제에는 Firestore 자동 백업이 없습니다 → **한 달에 한 번 화면의 “백업·복원 → JSON 백업”** 을 내려받아 개인 저장소(구글 드라이브 등)에 보관하세요.

## 9. 자주 묻는 문제

| 증상 | 해결 |
|---|---|
| “Firebase 설정이 필요합니다” 화면 | `.env.local` 또는 GitHub Secrets 값 누락. 이름 철자 확인 후 다시 실행/배포 |
| “비밀번호가 올바르지 않습니다” | Authentication 사용자 이메일과 `VITE_ADMIN_EMAIL`이 같은지 확인 |
| “데이터 접근 권한이 없습니다” | 보안 규칙의 UID가 로그인 계정 UID와 같은지, 규칙을 게시했는지 확인 |
| 배포 사이트에서 로그인 시 `auth/unauthorized-domain` | 2-5단계의 승인된 도메인에 `rich-hyun.github.io` 추가 |
| Actions 배포 실패: Secret 누락 | 6-1단계 Secrets 이름 확인 |

## 10. 향후 확장

- **비밀번호 변경**: Firebase 콘솔 → Authentication → 사용자 → ⋮ → 비밀번호 재설정(메일 발송). 앱 안 변경 화면은 `updatePassword` API로 추가할 수 있도록 인증 로직이 `src/contexts/AuthContext.tsx` 한 곳에 모여 있습니다.
- **2단계 인증(MFA)**: Firebase의 SMS/TOTP 다단계 인증은 Identity Platform 업그레이드가 필요하며 요금 조건이 있을 수 있어 1차 버전에서는 구현하지 않았습니다.
- **자동 시세 조회**: 외부 시세 API가 필요하므로 2차 개발로 분리했습니다. 현재는 평가금액을 직접 입력합니다.
