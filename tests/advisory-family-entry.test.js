import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/views/Advisory.vue', import.meta.url), 'utf8')
const familySource = readFileSync(new URL('../src/views/FamilyFinance.vue', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('../functions/[[path]].js', import.meta.url), 'utf8')

test('顾投资产从家庭财务提供查看编辑更新三个独立入口', () => {
  assert.match(familySource, />查看<\/button>/)
  assert.match(familySource, /openAdvisory\(item, 'edit'\)/)
  assert.match(familySource, /openAdvisory\(item, 'update'\)/)
  assert.match(familySource, /product_id: item\.advisory_id/)
})

test('顾投详情页提供返回、精简总览和全部更新记录', () => {
  assert.match(source, /van-nav-bar[^>]+left-arrow/)
  assert.match(source, /@click-left="goBack"/)
  assert.match(source, /资产总览/)
  assert.match(source, /更新记录/)
  assert.match(source, /modalMode === 'edit'/)
  assert.match(source, /modalMode !== 'edit'/)
  assert.match(apiSource, /snapshots: snapshots\.map/)
})
