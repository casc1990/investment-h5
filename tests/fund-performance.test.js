import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildFundPerformanceMap,
  buildFundPerformanceSummary,
  clearFundPerformanceCache,
  computePeriodReturnPct,
} from '../src/utils/fundPerformance.js'

test('基金周收益可按净值区间计算', () => {
  const rows = [
    { date: '2026-06-01', nav: 1.0 },
    { date: '2026-06-20', nav: 1.08 },
    { date: '2026-06-26', nav: 1.1 },
  ]

  assert.equal(computePeriodReturnPct(rows, 7), 1.85)
})

test('基金月收益优先使用官方 performance_stats，周收益仍按净值趋势计算', () => {
  const summary = buildFundPerformanceSummary({
    performance_stats: [
      { key: '1m', return_pct: 6.66 },
    ],
    net_worth_trend: [
      { date: '2026-06-01', nav: 1.0 },
      { date: '2026-06-20', nav: 1.08 },
      { date: '2026-06-26', nav: 1.1 },
    ],
  })

  assert.deepEqual(summary, {
    weeklyReturnPct: 1.85,
    monthlyReturnPct: 6.66,
  })
})

test('基金收益缓存会复用同一基金代码的详情请求', async () => {
  clearFundPerformanceCache()
  let requestCount = 0
  const detailFetcher = async () => {
    requestCount += 1
    return {
      performance_stats: [{ key: '1m', return_pct: 5.2 }],
      net_worth_trend: [
        { date: '2026-06-01', nav: 1.0 },
        { date: '2026-06-20', nav: 1.08 },
        { date: '2026-06-26', nav: 1.1 },
      ],
    }
  }

  const first = await buildFundPerformanceMap(['110020'], detailFetcher)
  const second = await buildFundPerformanceMap(['110020'], detailFetcher)

  assert.equal(requestCount, 1)
  assert.deepEqual(first['110020'], second['110020'])
})
