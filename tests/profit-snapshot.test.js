import test from 'node:test'
import assert from 'node:assert/strict'

import { buildServerProfitSnapshot, resolveProfitSnapshotDate } from '../shared/profitSnapshot.js'

test('服务端快照使用最新确认净值日期，而不是定时任务执行日期', () => {
  const positions = [
    { shares: 10, nav_jzrq: '2026-07-17' },
    { shares: 20, nav_jzrq: '2026-07-20' },
  ]
  assert.equal(resolveProfitSnapshotDate(positions, '2026-07-21'), '2026-07-20')
})

test('服务端快照汇总基金和顾投收益并保留历史净值日期', () => {
  const snapshot = buildServerProfitSnapshot({
    capturedAt: Date.parse('2026-07-21T00:30:00Z'),
    fallbackDate: '2026-07-21',
    positions: [{
      id: 'p1', shares: 100, cost: 900, current_market_value: 1000,
      current_profit: 100, yesterday_profit: 20, realized_profit: 5,
      nav_jzrq: '2026-07-20', nav_dwjz: 10,
    }],
    advisoryProducts: [{
      id: 'a1', product_name: '顾投', total_amount: 500, current_profit: 50,
      daily_profit: -3, profit_rate: 11.11, snapshot_date: '2026-07-20',
    }],
  })

  assert.equal(snapshot.date, '2026-07-20')
  assert.equal(snapshot.summary.totalMarketValue, 1500)
  assert.equal(snapshot.summary.totalYesterdayProfit, 17)
  assert.equal(snapshot.summary.totalHoldingProfit, 150)
  assert.equal(snapshot.summary.totalCumulativeProfit, 155)
  assert.equal(snapshot.positions.length, 2)
})
