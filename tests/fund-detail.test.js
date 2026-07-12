import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPositionDetailRows,
  buildPositionTrendPoints,
  buildPositionRowsWithDividendAdjustments,
  filterFundDetailRange,
  buildFundReturnChartPoints,
  buildFundPeriodReturnRows,
  buildRecentFundNavRows,
  rebuildPositionRowsFromNavHistory,
} from '../src/utils/fundDetail.js'
import { mergeLatestConfirmedNavIntoHistory } from '../functions/[[path]].js'

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
})

test('基金详情业绩走势图优先对齐历史业绩统计的官方区间涨幅', () => {
  const rows = [
    { date: '2025-01-01', cumulative_return_pct: 0, nav: 1 },
    { date: '2025-12-31', cumulative_return_pct: 20, nav: 1.2 },
    { date: '2026-01-31', cumulative_return_pct: 30, nav: 1.3 },
  ]

  const periodRows = buildFundPeriodReturnRows(rows)
  assert.deepEqual(periodRows.map(item => item.period_return_pct), [0, 20, 30])

  const filteredRows = rows.slice(1)
  const filteredPeriodRows = buildFundPeriodReturnRows(filteredRows, { officialReturnPct: 1.7 })
  assert.deepEqual(filteredPeriodRows.map(item => item.period_return_pct), [0, 1.7])
  assert.deepEqual(filteredPeriodRows.map(item => item.raw_period_return_pct), [0, 8.33])

  const points = buildFundReturnChartPoints(filteredRows, { officialReturnPct: 1.7 })
  assert.equal(points[0].value, 0)
  assert.equal(points.at(-1).value, 1.7)
  assert.equal(points.at(-1).raw.period_return_pct, 1.7)
  assert.equal(points.at(-1).raw.raw_period_return_pct, 8.33)
})

test('基金详情历史净值表最多保留近30天并按日期倒序展示', () => {
  const base = new Date('2026-05-01T00:00:00')
  const rows = Array.from({ length: 35 }, (_, index) => {
    const date = new Date(base)
    date.setDate(base.getDate() + index)
    const dateText = date.toISOString().slice(0, 10)
    return {
      date: dateText,
      nav: Number((1 + (index * 0.01)).toFixed(4)),
      daily_return_pct: Number((index * 0.1).toFixed(2)),
    }
  })

  const result = buildRecentFundNavRows(rows)
  assert.equal(result.length, 30)
  assert.equal(result[0].date, '2026-06-03')
  assert.equal(result.at(-1).date, '2026-05-05')
})

test('基金详情把数据库中更新的确认净值补到东方财富历史序列末尾', () => {
  const rows = [
    { date: '2026-07-08', nav: 1.07, daily_return_pct: 0.1, cumulative_return_pct: 0 },
    { date: '2026-07-09', nav: 1.072, daily_return_pct: 0.19, cumulative_return_pct: 0.19 },
  ]
  const result = mergeLatestConfirmedNavIntoHistory(rows, {
    date: '2026-07-10',
    nav: 1.0752,
    daily_return_pct: 0.3,
  })

  assert.equal(result.at(-1).date, '2026-07-10')
  assert.equal(result.at(-1).nav, 1.0752)
  assert.equal(result.at(-1).daily_return_pct, 0.3)
  assert.equal(result.length, 3)
})

test('持仓收益曲线遇到基金分红时应按真实收益补回除息影响', () => {
  const rows = [
    {
      date: '2026-06-08',
      shares: 31524,
      market_value: 32752.24,
      total_profit: 4232.24,
      total_profit_rate: 14.84,
      daily_profit: -6.3,
      cost: 28520,
    },
    {
      date: '2026-06-09',
      shares: 31524,
      market_value: 32490.6,
      total_profit: 3970.6,
      total_profit_rate: 13.92,
      daily_profit: -261.64,
      cost: 28520,
    },
    {
      date: '2026-06-10',
      shares: 31524,
      market_value: 32481.14,
      total_profit: 3961.14,
      total_profit_rate: 13.89,
      daily_profit: -9.46,
      cost: 28520,
    },
  ]
  const fundTrendRows = [
    { date: '2026-06-08', unit_money: '' },
    { date: '2026-06-09', unit_money: '分红：每份派现金0.0083元' },
    { date: '2026-06-10', unit_money: '' },
  ]

  const adjusted = buildPositionRowsWithDividendAdjustments(rows, fundTrendRows)

  assert.equal(adjusted[0].dividend_amount, 0)
  assert.equal(adjusted[1].dividend_amount, 261.65)
  assert.equal(adjusted[1].adjusted_daily_profit, 0.01)
  assert.equal(adjusted[1].adjusted_total_profit, 4232.25)
  assert.equal(adjusted[1].adjusted_market_value, 32752.25)
  assert.equal(adjusted[2].cumulative_dividend_amount, 261.65)
  assert.equal(adjusted[2].adjusted_total_profit, 4222.79)
})

test('净值历史重建路径：只允许从持仓录入日期开始，累计收益也从该日起算', () => {
  const fundTrendRows = [
    { date: '2026-05-01', nav: 1.0, daily_return_pct: 1.0, unit_money: '' },
    { date: '2026-05-02', nav: 1.01, daily_return_pct: 1.0, unit_money: '' },
    { date: '2026-06-15', nav: 1.02, daily_return_pct: 1.0, unit_money: '' },
    { date: '2026-06-16', nav: 1.03, daily_return_pct: -0.5, unit_money: '' },
  ]
  const positionSnapshot = { shares: 10000, cost: 10000, created_at: '2026-06-15' }

  const result = rebuildPositionRowsFromNavHistory(fundTrendRows, positionSnapshot, 'all')

  assert.deepEqual(result.map(r => r.date), ['2026-06-15', '2026-06-16'])
  assert.equal(result[0].cumulative_profit, 200, '累计收益应从录入首日持有收益口径开始')
  assert.equal(result[1].cumulative_profit, 300, '第二天累计应等于当日持有收益，不混入录入前历史')
})

test('净值历史重建路径：最新累计收益应与最新持有收益一致', () => {
  const fundTrendRows = [
    { date: '2026-07-01', nav: 1.0307, equityReturn: -0.05, unit_money: '' },
    { date: '2026-07-02', nav: 1.0308, equityReturn: 0.01, unit_money: '' },
    { date: '2026-07-03', nav: 1.0308, equityReturn: 0.0, unit_money: '' },
  ]
  const positionSnapshot = { shares: 10000, cost: 10000 }

  const result = rebuildPositionRowsFromNavHistory(fundTrendRows, positionSnapshot, 'all')
  const latest = result.at(-1)

  assert.equal(latest.cumulative_profit, 308, '最新累计收益应等于 10000 * 1.0308 - 10000 = 308')
})

test('净值历史重建路径：分红除息日使用 equityReturn，不应出现假性大跌', () => {
  // 003102 真实数据：6/9 分红，equityReturn=-0.05
  // 注意 fundTrendRows 字段名是 unit_money（下划线）
  const fundTrendRows = [
    { date: '2026-06-08', y: 1.039, equityReturn: -0.02, unit_money: '' },
    { date: '2026-06-09', y: 1.0302, equityReturn: -0.05, unit_money: '分红：每份派现金0.0083元' },
    { date: '2026-06-10', y: 1.0299, equityReturn: -0.03, unit_money: '' },
    { date: '2026-06-11', y: 1.0291, equityReturn: -0.08, unit_money: '' },
  ]
  const positionSnapshot = { shares: 31523.97, cost: 28520 }

  const result = rebuildPositionRowsFromNavHistory(fundTrendRows, positionSnapshot, 'all')

  const jun9Row = result.find(r => r.date === '2026-06-09')
  const expectedDailyProfit = Number((31523.97 * 1.039 * -0.05 / 100).toFixed(2))
  assert.equal(jun9Row.daily_profit, expectedDailyProfit, `6/9 当日收益应为 ${expectedDailyProfit}（按前一日净值*涨跌幅）`)
  assert.equal(jun9Row.has_dividend, true, '6/9 应标记为分红日')
  assert.equal(jun9Row.dividend_per_share, 0.0083, '每份分红 0.0083 元')

  const jun10Row = result.find(r => r.date === '2026-06-10')
  const expectedJun10 = Number((31523.97 * 1.0302 * -0.03 / 100).toFixed(2))
  assert.equal(jun10Row.daily_profit, expectedJun10, `6/10 应为 -0.03% 对应的小额负收益 ${expectedJun10}`)

  assert.ok(result[0].cumulative_profit !== undefined, '应有累计收益字段')
  assert.ok(result[result.length - 1].cumulative_profit !== undefined, '最后一天应有累计收益')

  const jun8 = result.find(r => r.date === '2026-06-08')
  const jun11 = result.find(r => r.date === '2026-06-11')
  const cumJump = Math.abs(jun11.cumulative_profit - jun8.cumulative_profit)
  assert.ok(cumJump < 500, `3 天累计收益变化（${cumJump}）应远小于 500 元`)
})

test('净值历史重建路径：兼容后端整理结构 nav/daily_return_pct/unit_money', () => {
  const fundTrendRows = [
    { date: '2026-07-07', nav: 1.1096, daily_return_pct: 0.08, unit_money: '' },
    { date: '2026-07-08', nav: 1.1096, daily_return_pct: 0.00, unit_money: '' },
    { date: '2026-07-09', nav: 1.1112, daily_return_pct: 0.14, unit_money: '' },
  ]
  const positionSnapshot = { shares: 2891.5, cost: 3113 }

  const result = rebuildPositionRowsFromNavHistory(fundTrendRows, positionSnapshot, 'all')
  const jul9 = result.find(r => r.date === '2026-07-09')
  const expectedJul9 = Number((2891.5 * 1.1096 * 0.14 / 100).toFixed(2))

  assert.equal(jul9.daily_profit, expectedJul9, `后端整理结构也应算出非 0 收益，预期 ${expectedJul9}`)
  assert.ok(result.some(r => Math.abs(r.daily_profit) > 0), '至少应存在非 0 的每日收益点')
})

test('净值历史重建路径：普通无分红日直接用 equityReturn 计算', () => {
  const fundTrendRows = [
    { date: '2026-07-01', y: 1.0307, equityReturn: -0.05, unit_money: '' },
    { date: '2026-07-02', y: 1.0308, equityReturn: 0.01, unit_money: '' },
    { date: '2026-07-03', y: 1.0308, equityReturn: 0.0, unit_money: '' },
  ]
  const positionSnapshot = { shares: 10000, cost: 10000 }

  const result = rebuildPositionRowsFromNavHistory(fundTrendRows, positionSnapshot, 'all')

  const jul1 = result.find(r => r.date === '2026-07-01')
  assert.equal(jul1.daily_profit, -5.15, '7/1 收益 = 10000 * 1.0307 * -0.05% ≈ -5.15')
  assert.equal(jul1.cumulative_profit, 307, '7/1 累计 = 10000 * 1.0307 - 10000 = 307')

  const jul2 = result.find(r => r.date === '2026-07-02')
  assert.equal(jul2.daily_profit, 1.03, '7/2 收益 = 10000 * 1.0307 * 0.01% ≈ +1.03')
  assert.equal(jul2.cumulative_profit, 308, '7/2 累计 = 10000 * 1.0308 - 10000 = 308')

  const jul3 = result.find(r => r.date === '2026-07-03')
  assert.equal(jul3.daily_profit, 0, '7/3 收益 = 0')
  assert.equal(jul3.cumulative_profit, 308, '7/3 累计 = 308 不变')

  const jump = Number(Math.abs(jul2.cumulative_profit - jul1.cumulative_profit).toFixed(2))
  assert.equal(jump, 1, '7/1→7/2 累计跳变应为 1 元')
})

test('净值历史重建路径：无 equityReturn 时回退到净值差计算', () => {
  const fundTrendRows = [
    { date: '2026-06-01', y: 1.0, equityReturn: null, unit_money: '' },
    { date: '2026-06-02', y: 1.01, equityReturn: null, unit_money: '' },
    { date: '2026-06-03', y: 1.005, equityReturn: null, unit_money: '' },
  ]
  const positionSnapshot = { shares: 10000, cost: 10000 }

  const result = rebuildPositionRowsFromNavHistory(fundTrendRows, positionSnapshot, 'all')

  const jun2 = result.find(r => r.date === '2026-06-02')
  assert.equal(jun2.daily_profit, 100, '净值从 1.0 涨到 1.01 = +1%，收益 10000 * 1.0 * 1% = 100')

  const jun3 = result.find(r => r.date === '2026-06-03')
  assert.equal(jun3.daily_profit, -50.5, `净值从 1.01 跌到 1.005 = -0.5%，收益 ≈ -50.5，实际 ${jun3.daily_profit}`)
})
