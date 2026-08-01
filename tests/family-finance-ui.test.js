import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const viewSource = readFileSync(new URL('../src/views/FamilyFinance.vue', import.meta.url), 'utf8')
const functionSource = readFileSync(new URL('../functions/[[path]].js', import.meta.url), 'utf8')

test('家庭财务页覆盖资产、应收、负债和快照场景', () => {
  assert.match(viewSource, /label: '资产'/)
  assert.match(viewSource, /label: '应收'/)
  assert.match(viewSource, /label: '负债'/)
  assert.match(viewSource, /保存今日快照/)
  assert.match(viewSource, /基金自动汇总，其他资产手工记账/)
})

test('家庭财务页复用现有系统的页面底色、主色和卡片层级', () => {
  assert.match(viewSource, /background: #f5f5f5/)
  assert.match(viewSource, /linear-gradient\(135deg, #1e80ff 0%, #0066cc 100%\)/)
  assert.match(viewSource, /border-radius: 12px/)
  assert.match(viewSource, /background: #1e80ff/)
  assert.doesNotMatch(viewSource, /#18275b|#3549a8/)
})

test('家庭财务后端使用独立表且基金仅通过读查询汇总', () => {
  for (const table of ['family_assets', 'family_asset_records', 'family_receivables', 'family_liabilities', 'family_snapshots']) {
    assert.match(functionSource, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`))
  }
  const overviewBlock = functionSource.slice(functionSource.indexOf("path === '/api/family-finance/overview'"), functionSource.indexOf('// ========== 事件中心 API'))
  assert.doesNotMatch(overviewBlock, /UPDATE positions|INSERT INTO positions|DELETE FROM positions/)
})

test('成员存在家庭财务记录时禁止静默删除', () => {
  assert.match(functionSource, /该成员仍有家庭资产、应收款或负债，请先处理归属/)
  assert.match(functionSource, /status: 409|, 409\)/)
})
