import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/views/Positions.vue', import.meta.url), 'utf8')
const detailSource = fs.readFileSync(new URL('../src/views/PositionDetail.vue', import.meta.url), 'utf8')

test('持仓页顶部合并为成员、账户、筛选排序三个下拉项', () => {
  assert.match(source, /v-model="selectedMemberId"/)
  assert.match(source, /v-model="selectedAccountId"/)
  assert.match(source, /v-model="viewOption" title="筛选排序"/)
  assert.doesNotMatch(source, /class="position-tools"/)
})

test('基金详情每日收益使用日历且累计收益保留趋势图', () => {
  assert.match(detailSource, /AllocationBucketProfitCalendar/)
  assert.match(detailSource, /v-if="positionTrendTab === 'daily'"/)
  assert.match(detailSource, /<TrendChart\s+v-else/)
  assert.match(detailSource, /positionDailyCalendarSeries/)
})

test('总览卡默认展示全部收益统计', () => {
  assert.match(source, /<div class="summary-profit-row">/)
  assert.doesNotMatch(source, /summaryExpanded/)
})

test('净值更新标签只在交易日展示', () => {
  assert.match(source, /position\.is_trading_day && position\.daily_profit_updated && position\.show_nav_update_notice/)
  assert.match(source, /position\.is_trading_day && position\.show_nav_update_notice" class="nav-status-tag"/)
})

test('持仓卡片复用投资策略状态并支持跳转到对应策略', () => {
  assert.match(source, /buildPositionAllocationStatusMap/)
  assert.match(source, /class="allocation-status-tag"/)
  assert.match(source, /getPositionAllocationStatus\(position\)\.label/)
  assert.match(source, /`\/allocation\/\$\{meta\.profileId\}`/)
  assert.match(source, /meta\.conflict/)
})

test('持仓筛选状态跨页面保留，空路由参数不会重置现有筛选', () => {
  assert.match(source, /readPositionViewState/)
  assert.match(source, /writePositionViewState/)
  assert.match(source, /hasOwnProperty\.call\(route\.query, 'member_id'\)/)
  assert.match(source, /hasOwnProperty\.call\(route\.query, 'account_id'\)/)
})

test('编辑持仓弹层挂载到 body 并在关闭后恢复滚动位置', () => {
  assert.match(source, /teleport="body"/)
  assert.match(source, /@closed="restorePositionsScroll"/)
  assert.match(source, /capturePositionsScroll\(\)/)
  assert.match(source, /position: sticky;/)
  assert.match(source, /showAddModal\.value = false[\s\S]*onDeactivated/)
})
