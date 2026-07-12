import test from 'node:test'
import assert from 'node:assert/strict'

import { filterAndSortPositions, getPositionMarketValue, getPositionNavStatus } from '../src/utils/positionList.js'

const positions = [
  { id: '1', fund_name: '债券A', fund_code: '000001', current_market_value: 120, current_profit: 20, daily_profit: 1, profit_rate: 20, nav_update_status: 'updated' },
  { id: '2', fund_name: '指数B', fund_code: '000002', current_market_value: 200, current_profit: -10, daily_profit: 3, profit_rate: -5, nav_update_status: 'waiting' },
]

test('持仓市值优先使用后端统一字段', () => {
  assert.equal(getPositionMarketValue({ current_market_value: 123.45, cost: 100, current_profit: 99 }), 123.45)
  assert.equal(getPositionMarketValue({ cost: 100, current_profit: 20 }), 120)
})

test('持仓支持异常和盈亏筛选', () => {
  assert.deepEqual(filterAndSortPositions(positions, { status: 'abnormal' }).map(item => item.id), ['2'])
  assert.deepEqual(filterAndSortPositions(positions, { status: 'loss' }).map(item => item.id), ['2'])
})

test('持仓支持市值和日收益排序并生成净值状态', () => {
  assert.deepEqual(filterAndSortPositions(positions).map(item => item.id), ['2', '1'])
  assert.deepEqual(filterAndSortPositions(positions, { sort: 'daily_profit_desc' }).map(item => item.id), ['2', '1'])
  assert.equal(getPositionNavStatus(positions[1]).label, '净值待更新')
  assert.equal(getPositionNavStatus({ sync_state: 'error' }).key, 'error')
})
