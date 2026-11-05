// firestore.rules(템플릿)의 "ADMIN_UID"를 실제 관리자 UID로 치환해
// firestore.rules.generated (git에 커밋되지 않음)를 만듭니다.
//
// UID 우선순위: 명령줄 인자 > 환경변수 ADMIN_UID > .env.local 의 VITE_ADMIN_UID
//   npm run rules:build
//   npm run rules:build -- AbCdEf123...
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

function fromEnvFile() {
  const p = resolve(root, '.env.local')
  if (!existsSync(p)) return ''
  const line = readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('VITE_ADMIN_UID='))
  return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : ''
}

const uid = (process.argv[2] || process.env.ADMIN_UID || fromEnvFile()).trim()
if (!uid) {
  console.error('관리자 UID가 없습니다. .env.local 에 VITE_ADMIN_UID=... 를 넣거나 `npm run rules:build -- <UID>` 로 실행하세요.')
  process.exit(1)
}
if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) {
  console.error('UID 형식이 올바르지 않습니다:', uid)
  process.exit(1)
}

const template = readFileSync(resolve(root, 'firestore.rules'), 'utf8')
const count = (template.match(/"ADMIN_UID"/g) || []).length
if (count === 0) {
  console.error('firestore.rules 에서 "ADMIN_UID" 자리표시자를 찾지 못했습니다.')
  process.exit(1)
}
writeFileSync(resolve(root, 'firestore.rules.generated'), template.replaceAll('"ADMIN_UID"', JSON.stringify(uid)))
console.log(`firestore.rules.generated 생성 완료 (UID: ${uid.slice(0, 4)}…, ${count}곳 치환)`)
console.log('배포: npx firebase-tools deploy --only firestore:rules')
