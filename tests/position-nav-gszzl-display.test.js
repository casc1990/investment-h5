import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveDisplayedNavGszzl } from '../functions/[[path]].js'

test('持仓展示在已有存储涨跌幅时优先使用存储值，避免分红场景被净值差误算', () => {
  const result = resolveDisplayedNavGszzl({
    storedChangeRate: -0.05,
    estimateNav: 1.0302,
    confirmedNav: 1.0302,
    prevNav: 1.039,
  })

  assert.equal(result, -0.05)
})

test('持仓展示在缺少存储涨跌幅时，回退为盘中估算与确认净值差', () => {
  const result = resolveDisplayedNavGszzl({
    storedChangeRate: null,
    estimateNav: 1.2345,
    confirmedNav: 1.2300,
    prevNav: 1.2200,
  })

  assert.equal(result, 0.3659)
})

test('持仓展示在缺少存储涨跌幅且无盘中估算时，回退为确认净值相对前值的涨跌幅', () => {
  const result = resolveDisplayedNavGszzl({
    storedChangeRate: null,
    estimateNav: 1.2300,
    confirmedNav: 1.2300,
    prevNav: 1.2200,
  })

  assert.equal(result, 0.8197)
})
