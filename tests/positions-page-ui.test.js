import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/views/Positions.vue', import.meta.url), 'utf8')

test('持仓页顶部合并为成员、账户、筛选排序三个下拉项', () => {
  assert.match(source, /v-model="selectedMemberId"/)
  assert.match(source, /v-model="selectedAccountId"/)
  assert.match(source, /v-model="viewOption" title="筛选排序"/)
  assert.doesNotMatch(source, /class="position-tools"/)
})

test('总览卡默认展示全部收益统计', () => {
  assert.match(source, /<div class="summary-profit-row">/)
  assert.doesNotMatch(source, /summaryExpanded/)
})

test('净值更新标签只在交易日展示', () => {
  assert.match(source, /position\.is_trading_day && position\.daily_profit_updated/)
  assert.match(source, /v-if="position\.is_trading_day" class="nav-status-tag"/)
})
