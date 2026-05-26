import test from 'node:test'
import assert from 'node:assert/strict'

import { summarizeOverviewDailyProfits } from '../functions/[[path]].js'

test('首页总览同时返回基金日收益、顾投日收益和合计日收益', () => {
  const summary = summarizeOverviewDailyProfits(270.22, -53.76)

  assert.equal(summary.totalPositionYesterdayProfit, 270.22)
  assert.equal(summary.totalAdvisoryYesterdayProfit, -53.76)
  assert.equal(summary.totalYesterdayProfit, 216.46)
})

test('空值会安全回退为 0', () => {
  const summary = summarizeOverviewDailyProfits(undefined, null)

  assert.deepEqual(summary, {
    totalYesterdayProfit: 0,
    totalPositionYesterdayProfit: 0,
    totalAdvisoryYesterdayProfit: 0,
  })
})
