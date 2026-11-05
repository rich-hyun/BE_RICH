import type { EtfComposition } from './types'

/**
 * 예시 데이터 — 실제 데이터가 아닙니다.
 * - 개인 보유 종목·금액은 공개 저장소/빌드 결과물에 포함되지 않도록 코드에 두지 않습니다.
 *   (보유 종목은 화면에서 입력하거나 JSON 백업 복원으로 불러오세요)
 * - ETF 구성비 템플릿: 지수의 대략적인 구성을 보여주기 위한 근사치이며 운용사 공시 데이터가 아닙니다.
 *   반드시 보유 ETF 운용사 홈페이지의 최신 구성종목/업종 비중으로 교체해야 합니다.
 */

type Template = Omit<EtfComposition, 'id' | 'symbol' | 'asOfDate' | 'updatedAt'> & { key: string; label: string }

export const COMPOSITION_TEMPLATES: Template[] = [
  {
    key: 'ndx-sample',
    label: '나스닥100 지수 (예시 근사치)',
    name: '나스닥100 추종 ETF',
    source: '예시 템플릿 – 근사치, 운용사 공시 아님 (교체 필요)',
    quality: 'sample',
    industries: { 반도체: 26, 소프트웨어: 20, '인터넷·플랫폼': 20, 소비재: 17, 헬스케어: 6, 통신: 4, 산업재: 4, 기타: 3 },
    holdings: [
      { name: 'NVIDIA', symbol: 'NVDA', weight: 9, industry: '반도체', themes: ['AI', '반도체', '미국 빅테크'] },
      { name: 'Microsoft', symbol: 'MSFT', weight: 8, industry: '소프트웨어', themes: ['AI', '미국 빅테크'] },
      { name: 'Apple', symbol: 'AAPL', weight: 8, industry: '소비재', themes: ['미국 빅테크'] },
      { name: 'Amazon', symbol: 'AMZN', weight: 5.5, industry: '인터넷·플랫폼', themes: ['AI', '미국 빅테크'] },
      { name: 'Broadcom', symbol: 'AVGO', weight: 5, industry: '반도체', themes: ['AI', '반도체', '미국 빅테크'] },
      { name: 'Alphabet', symbol: 'GOOGL', weight: 6.8, industry: '인터넷·플랫폼', themes: ['AI', '미국 빅테크'] },
      { name: 'Meta Platforms', symbol: 'META', weight: 4, industry: '인터넷·플랫폼', themes: ['AI', '미국 빅테크'] },
      { name: 'Tesla', symbol: 'TSLA', weight: 3, industry: '소비재', themes: ['미국 빅테크'] },
    ],
  },
  {
    key: 'spx-sample',
    label: 'S&P500 지수 (예시 근사치)',
    name: 'S&P500 추종 ETF',
    source: '예시 템플릿 – 근사치, 운용사 공시 아님 (교체 필요)',
    quality: 'sample',
    industries: { 반도체: 12, 소프트웨어: 12, '인터넷·플랫폼': 12, 금융: 13, 헬스케어: 10, 산업재: 9, 소비재: 16, 에너지: 3, 통신: 3, 부동산: 2, 기타: 8 },
    holdings: [
      { name: 'NVIDIA', symbol: 'NVDA', weight: 7, industry: '반도체', themes: ['AI', '반도체', '미국 빅테크'] },
      { name: 'Microsoft', symbol: 'MSFT', weight: 6.5, industry: '소프트웨어', themes: ['AI', '미국 빅테크'] },
      { name: 'Apple', symbol: 'AAPL', weight: 6, industry: '소비재', themes: ['미국 빅테크'] },
      { name: 'Amazon', symbol: 'AMZN', weight: 4, industry: '인터넷·플랫폼', themes: ['AI', '미국 빅테크'] },
      { name: 'Alphabet', symbol: 'GOOGL', weight: 3.7, industry: '인터넷·플랫폼', themes: ['AI', '미국 빅테크'] },
      { name: 'Meta Platforms', symbol: 'META', weight: 3, industry: '인터넷·플랫폼', themes: ['AI', '미국 빅테크'] },
      { name: 'Broadcom', symbol: 'AVGO', weight: 2.5, industry: '반도체', themes: ['AI', '반도체', '미국 빅테크'] },
      { name: 'Tesla', symbol: 'TSLA', weight: 2, industry: '소비재', themes: ['미국 빅테크'] },
      { name: 'JPMorgan Chase', symbol: 'JPM', weight: 1.5, industry: '금융', themes: [] },
    ],
  },
]
