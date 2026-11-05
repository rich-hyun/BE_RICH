# BE RICH — 개인 자산관리 웹사이트

월별 자산 기록, 자산 추이·목표 분석, 보유 종목의 국가·업종(ETF 내부 구성 반영) 비중 분석을 하는 **본인 전용** 웹사이트입니다.

- **무료 운영**: GitHub Pages(정적 호스팅) + Firebase Spark(무료) 요금제
- **데이터 영구 저장**: Firebase Cloud Firestore (새로고침·다른 기기에서도 유지)
- **본인만 접근**: Firebase Authentication(이메일/비밀번호) + Firestore 보안 규칙(관리자 UID만 허용)
- **저장소에는 코드만**: 실제 자산 데이터·비밀번호·서비스 계정 키는 GitHub에 올라가지 않습니다

> 처음 설정하는 경우 → **[docs/SETUP.md (초보자용 설정 안내서)](docs/SETUP.md)** 를 순서대로 따라 하세요.

---

## 페이지 구성

| 페이지 | 주요 기능 |
|---|---|
| **1. 월별 자산** (`#/records`) | 날짜별 ISA·일반계좌·암호화폐·금·현금 입력/수정/삭제, 총자산 자동 계산, 직전 기록 대비 증감(날짜순 자동 재계산), 연·월 필터와 정렬, 같은 날짜 덮어쓰기 확인, 엑셀 가져오기(미리보기·검증·중복 방지) |
| **2. 추이·목표** (`#/dashboard`) | KPI 8종, 총자산 선 그래프(3개월~전체), 자산 유형별 누적 영역(표시/숨김), 월별 증감 막대(월 대표값 기준), 연도별 성장, 연도별 목표(달성률·부족액·남은 개월·월 필요 저축), 실제 vs 목표 그래프, 3가지 시나리오 미래 자산 시뮬레이션 |
| **계정 관리** (`#/accounts`, 관리자 전용) | 아이디·초기 비밀번호로 계정 추가(처음엔 조회 전용), 계정별 수정 권한 스위치, 접근 권한 삭제 |
| **3. 종목·비중** (`#/portfolio`) | 기준일별 보유 종목 스냅샷, 종목/계좌/국가/자산유형 도넛, ETF 내부 업종 비중 반영 업종 분석, **업종과 분리된** AI·반도체 테마 분석, 집중도(최대·상위3 종목, 국가 편중, 기업별 합산·ETF 간 중복), 사용자 정의 경고 기준, 월별 스냅샷 비교·추이, ETF 구성비 관리(기준일·출처·데이터 성격 기록), 월별 자산 기록과의 계좌 잔액 대조 |

공통: 원/만원/억원 단위 전환, 라이트/다크 모드, PC 사이드바·모바일 하단 탭, 엑셀/CSV/JSON 내보내기, JSON 백업 복원(미리보기·충돌 확인·병합/덮어쓰기 선택).

### 계산 원칙
- 모든 금액은 **정수 원**으로 저장합니다. 날짜는 한국 시간 기준 `YYYY-MM-DD` 문자열입니다.
- 증감은 저장/엑셀 행 순서가 아니라 **실제 날짜 순**으로 계산합니다.
- **월별 대표값** = 그 달의 마지막 기록일, **연말 값** = 그 해의 마지막 기록.
- 자산 증가율은 저축·입출금이 포함된 값이므로 **투자 수익률로 표시하지 않습니다.**
- ETF 업종 노출 = ETF 평가금액 × ETF 내부 업종 비중. 구성비가 없으면 ‘분류 미확인’으로 표시합니다.
- 업종(합계 100%)과 테마(AI·반도체·미국 빅테크, 중복 가능)는 별도 영역에서 분석합니다.
- 시세 자동 조회 기능은 없습니다(2차 개발 대상). 평가금액은 직접 입력합니다.

### 예시 데이터
- 개인 보유 종목·금액은 공개 저장소와 빌드 결과물에 넣지 않습니다. 보유 종목은 화면에서 입력하거나, 로컬에 보관한 JSON 백업을 “백업·복원 → JSON 복원”으로 불러옵니다.
- ETF 구성비 “예시 템플릿”(나스닥100·S&P500)은 **근사치**이며 운용사 공시 데이터가 아닙니다. 화면에 ‘예시(추정) – 확인 필요’로 표시되니 실제 값으로 교체하세요.

---

## 기술 스택

React 19 + TypeScript + Vite · Tailwind CSS v4 · shadcn/ui 스타일 컴포넌트(Radix) · Lucide Icons · Recharts · Firebase Auth/Firestore · SheetJS · GitHub Actions → GitHub Pages

```
src/
  lib/            계산·도메인 로직 (assets, portfolio, excel, backup, date, format …) + 단위 테스트
  contexts/       AuthContext(로그인), DataContext(Firestore 실시간 구독·저장), UiContext(알림·확인창·테마)
  pages/          LoginPage, RecordsPage, DashboardPage, PortfolioPage
  components/     ui/(공통 컴포넌트), records/, dashboard/, portfolio/
firestore.rules   보안 규칙 템플릿 ("ADMIN_UID" 자리표시자)
scripts/build-rules.mjs   UID를 넣은 배포용 규칙 생성 (firestore.rules.generated, git 제외)
tests/rules.test.ts       보안 규칙 테스트 (Firestore 에뮬레이터)
.github/workflows/deploy.yml   자동 배포
```

### Firestore 구조
```
users/{uid}/assetRecords/{YYYY-MM-DD}   date, isa, brokerage, crypto, gold, cash, memo, createdAt, updatedAt
users/{uid}/holdings/{holdingId}        snapshotDate, accountType, symbol, name, assetType, country,
                                        marketValue, costBasis, quantity, industry, themes, memo, isSample, …
users/{uid}/etfCompositions/{id}        symbol, name, asOfDate, source, quality, industries{업종:%}, holdings[…], updatedAt
users/{uid}/goals/{goalId}              targetYear, targetAmount, memo, createdAt, updatedAt
users/{uid}/settings/general            displayCurrency, riskThresholds, preferredChartRange, simulation
members/{uid}                           username, canEdit, createdAt, updatedAt   (관리자가 등록한 계정)
```
자산 데이터는 관리자 UID 경로(`users/{관리자UID}/…`) 하나만 사용하며, 등록 계정은 이 데이터를 함께 봅니다.
로그인은 아이디로 합니다. 관리자 아이디(`VITE_ADMIN_USERNAME`, 기본 `jaehyun`)는 `VITE_ADMIN_EMAIL`로, 그 외 아이디는 `{아이디}@{authDomain}` 가상 이메일로 변환됩니다(메일 발송 없음).

자산 기록의 문서 ID를 날짜로 사용하므로 같은 날짜 기록이 중복 생성되지 않고, 엑셀 재업로드 시에도 중복이 생기지 않습니다.

---

## 명령어

```bash
npm install            # 의존성 설치
npm run dev            # 로컬 개발 서버 (http://localhost:5173)
npm run typecheck      # TypeScript 검사
npm test               # 단위 테스트 (계산·엑셀 가져오기·포트폴리오 분석·백업)
npm run test:rules     # 보안 규칙 테스트 (Java 필요, Firestore 에뮬레이터 자동 실행)
npm run build          # 프로덕션 빌드 (dist/)
npm run rules:build    # .env.local 의 VITE_ADMIN_UID 로 firestore.rules.generated 생성
npm run rules:deploy   # 위 + Firebase에 보안 규칙 배포 (firebase login 필요)
```

## 보안 요약

| 항목 | 처리 방식 |
|---|---|
| 비밀번호 | 저장소·코드·환경변수 어디에도 없음. Firebase Authentication이 보관·검증 |
| 회원가입 | 공개 회원가입 화면 없음. 관리자 계정은 Firebase 콘솔에서 1회 생성, 그 외 계정은 관리자가 ‘계정 관리’에서 추가 |
| 권한 | 등록 계정은 기본 조회 전용, 관리자가 켠 경우에만 쓰기 허용. Firestore 규칙이 `members/{uid}.canEdit`를 서버에서 검사 |
| 다른 계정 | 등록되지 않은 계정은 화면에서 즉시 로그아웃 + Firestore 규칙이 서버에서 거부 |
| 로그인 유지 | 기본은 세션 유지(브라우저 닫으면 로그아웃). “로그인 유지” 체크 시에만 기기에 유지 |
| 로그아웃 후 | 메모리의 데이터 즉시 삭제. 오프라인 디스크 캐시(IndexedDB)를 사용하지 않음 |
| Firebase 웹 설정(apiKey 등) | 공개되어도 되는 클라이언트 식별값. GitHub Secrets로 주입하지만 빌드 결과에 포함됨 |
| 서비스 계정 키·관리자 자격증명 | 이 앱은 사용하지 않음. `.gitignore`로 커밋 차단, 배포 시 빌드 결과물 검사 |
| 개인 데이터 파일 | `*.xlsx`, `*.csv`, 백업 JSON은 `.gitignore`로 커밋 차단 |

자세한 배포 전 보안 점검 목록은 [docs/SETUP.md의 7단계](docs/SETUP.md#7-배포-전-보안-점검)를 참고하세요.

## 데이터 보존 (백업·복원·변경 이력) — 관리자 전용

- **JSON 백업(v2)**: 월별 자산 기록, 보유 종목, ETF 구성비, 목표 자산, 설정, 계정(아이디·수정 권한만)을 한 파일로 저장합니다. 비밀번호·인증 토큰·UID는 포함되지 않으며(코드에서 키 이름까지 검사), 파일에 SHA-256 체크섬이 들어 있어 손상·변조를 감지합니다.
- **복원**: 파일을 고르면 신규/동일/충돌 건수와 충돌 항목의 현재값·백업값을 미리 보여 주고, 같은 날짜·종목이 다른 ID로 있는 중복 가능성도 알려 줍니다. 충돌·삭제가 있으면 확인 체크 후에만 실행되며, 복원 직전 현재 데이터를 자동으로 내려받을 수 있습니다.
- **오래된 백업 호환**: 파일에 형식 버전이 있고 `src/lib/backup.ts`의 `MIGRATIONS`가 v1 → v2 → … 순서로 변환합니다. 형식을 바꿀 때는 `BACKUP_VERSION`을 올리고 변환 함수를 추가하세요. 더 새로운 버전의 파일은 안내 메시지와 함께 거부합니다.
- **변경 이력**: 기록·종목·구성비·목표를 수정/삭제(복원·가져오기로 덮어쓰는 경우 포함)하면 직전 문서가 `users/{관리자}/history`에 자동 보존됩니다. “백업·복원 → 변경 이력”에서 이전 버전으로 되돌릴 수 있습니다. 보안 규칙상 이력은 추가만 가능하고 조회·삭제는 관리자만 가능합니다.
- **무료 요금제**: Cloud Functions·자동 백업 없이 브라우저에서 파일을 직접 내려받는 방식입니다. 이력은 수정·삭제 때만 문서 1건씩 더 쓰며(일 2만 쓰기 한도 대비 미미), 이력 목록은 탭을 열 때만 읽습니다.
- 기능 배포 후 **보안 규칙을 다시 배포**해야 합니다: `npm run rules:deploy`
