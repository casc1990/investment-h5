import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPositionDetailRows,
  buildPositionTrendPoints,
  filterFundDetailRange,
  buildFundReturnChartPoints,
} from '../src/utils/fundDetail.js'

const snapshots = [
  {
    date: '2026-05-30',
    positions: [
      { id: 'p1', fund_code: '110020', account_id: 'a1', fund_name: '示例债券A', cost: 1000, current_profit: 80, yesterday_profit: 5, profit_rate: 8, nav_jzrq: '2026-05-30' },
    ],
  },
  {
    date: '2026-05-31',
    positions: [
      { id: 'p1', fund_code: '110020', account_id: 'a1', fund_name: '示例债券A', cost: 1000, current_profit: 100, yesterday_profit: 20, profit_rate: 10, nav_jzrq: '2026-05-31' },
    ],
  },
  {
    date: '2026-06-02',
    positions: [
      { id: 'p1', fund_code: '110020', account_id: 'a1', fund_name: '示例债券A', cost: 1000, current_profit: 120, yesterday_profit: 15, profit_rate: 12, nav_jzrq: '2026-06-02' },
    ],
  },
]

test('持仓详情可从历史快照中抽出单持仓收益曲线', () => {
  const rows = buildPositionDetailRows(snapshots, { positionId: 'p1', fundCode: '110020', accountId: 'a1' })

  assert.deepEqual(rows.map(item => item.date), ['2026-05-30', '2026-05-31', '2026-06-02'])
  assert.equal(rows[0].market_value, 1080)
  assert.equal(rows[2].total_profit, 120)

  const points = buildPositionTrendPoints(rows, { metric: 'total_profit' })
  assert.deepEqual(points.map(item => item.value), [80, 100, 120])
})

test('基金详情时间范围过滤支持近1月与全部', () => {
  const rows = [
    { date: '2025-01-01', cumulative_return_pct: 0, nav: 1 },
    { date: '2025-12-31', cumulative_return_pct: 20, nav: 1.2 },
    { date: '2026-01-31', cumulative_return_pct: 30, nav: 1.3 },
  ]

  assert.deepEqual(filterFundDetailRange(rows, '1m').map(item => item.date), ['2025-12-31', '2026-01-31'])
  assert.deepEqual(filterFundDetailRange(rows, 'all').map(item => item.date), ['2025-01-01', '2025-12-31', '2026-01-31'])

  const points = buildFundReturnChartPoints(rows)
  assert.equal(points.at(-1).value, 30)
})
