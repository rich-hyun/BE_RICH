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
| **3. 종목·비중** (`#/portfolio`) | 기준일별 보유 종목 스냅샷, 종목/계좌/국가/자산유형 도넛, ETF 내부 업종 비중 반영 업종 분석, **업종과 분리된** AI·반도체 테마 분석, 집중도(최대·상위3 종목, 국가 편중, 기업별 합산·ETF 간 중복), 사용자 정의 경고 기준, 월별 스냅샷 비교·추이, ETF 구성비 관리(기준일·출처·데이터 성격 기록), 월별 자산 기록과의 계좌 잔액 대조 |

공통: 원/만원/억원 단위 전환, 라이트/다크 모드, PC 사이드바·모바일 하단 탭, 엑셀/CSV/JSON 내보내기, JSON 백업 복원(미리보기·병합/덮어쓰기 선택).

### 계산 원칙
- 모든 금액은 **정수 원**으로 저장합니다. 날짜는 한국 시간 기준 `YYYY-MM-DD` 문자열입니다.
- 증감은 저장/엑셀 행 순서가 아니라 **실제 날짜 순**으로 계산합니다.
- **월별 대표값** = 그 달의 마지막 기록일, **연말 값** = 그 해의 마지막 기록.
- 자산 증가율은 저축·입출금이 포함된 값이므로 **투자 수익률로 표시하지 않습니다.**
- ETF 업종 노출 = ETF 평가금액 × ETF 내부 업종 비중. 구성비가 없으면 ‘분류 미확인’으로 표시합니다.
- 업종(합계 100%)과 테마(AI·반도체·미국 빅테크, 중복 가능)는 별도 영역에서 분석합니다.
- 시세 자동 조회 기능은 없습니다(2차 개발 대상). 평가금액은 직접 입력합니다.

### 예시 데이터
- 3페이지의 “예시 데이터 불러오기”는 요구사항 문서의 2026-11-05 기준 예시 6종목(합계 77,950,000원)을 ‘예시’ 배지와 함께 추가합니다. 월별 자산 기록에는 반영하지 않습니다.
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
```
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
| 회원가입 | 공개 회원가입 화면 없음. 관리자 계정은 Firebase 콘솔에서 1회 직접 생성 |
| 다른 계정 | 화면에서 즉시 로그아웃 + Firestore 규칙이 서버에서 UID 불일치 거부 |
| 로그인 유지 | 기본은 세션 유지(브라우저 닫으면 로그아웃). “로그인 유지” 체크 시에만 기기에 유지 |
| 로그아웃 후 | 메모리의 데이터 즉시 삭제. 오프라인 디스크 캐시(IndexedDB)를 사용하지 않음 |
| Firebase 웹 설정(apiKey 등) | 공개되어도 되는 클라이언트 식별값. GitHub Secrets로 주입하지만 빌드 결과에 포함됨 |
| 서비스 계정 키·관리자 자격증명 | 이 앱은 사용하지 않음. `.gitignore`로 커밋 차단, 배포 시 빌드 결과물 검사 |
| 개인 데이터 파일 | `*.xlsx`, `*.csv`, 백업 JSON은 `.gitignore`로 커밋 차단 |

자세한 배포 전 보안 점검 목록은 [docs/SETUP.md의 7단계](docs/SETUP.md#7-배포-전-보안-점검)를 참고하세요.
