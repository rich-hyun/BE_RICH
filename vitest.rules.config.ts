import { defineConfig } from 'vitest/config'

// 보안 규칙 테스트 전용 설정 (Firestore 에뮬레이터 필요: npm run test:rules)
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
