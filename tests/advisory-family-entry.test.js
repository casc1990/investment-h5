import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/views/Advisory.vue', import.meta.url), 'utf8')

test('顾投日报从家庭财务进入并支持按账户筛选', () => {
  assert.match(source, /label: '家庭财务', to: '\/family-finance'/)
  assert.match(source, /route\.query\.account_id \? \{ account_id: route\.query\.account_id \}/)
  assert.match(source, /watch\(\(\) => route\.query\.account_id/)
})
