import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveDisplayedYesterdayProfit } from '../functions/[[path]].js'

test('分红场景昨日收益优先按真实涨跌幅反推，避免把分红误算成亏损', () => {
  const result = resolveDisplayedYesterdayProfit({
    shares: 31272.5043,
    confirmedNav: 1.0302,
    prevNav: 1.039,
    storedChangeRate: -0.05,
  })

  assert.equal(result, -16.2461)
})

test('普通场景在缺少存储涨跌幅时，回退为净值差乘份额', () => {
  const result = resolveDisplayedYesterdayProfit({
    shares: 100,
    confirmedNav: 1.01,
    prevNav: 1,
    storedChangeRate: null,
  })

  assert.equal(result, 1)
})
