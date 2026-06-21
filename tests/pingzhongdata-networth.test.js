import test from 'node:test'
import assert from 'node:assert/strict'

import { parsePingzhongdataNetWorth } from '../functions/[[path]].js'

test('分红场景优先使用 equityReturn 作为涨跌幅，避免把分红误算成大跌', () => {
  const text = `var Data_netWorthTrend = [{"x":1780848000000,"y":1.039,"equityReturn":-0.02,"unitMoney":""},{"x":1780934400000,"y":1.0302,"equityReturn":-0.05,"unitMoney":"分红：每份派现金0.0083元"}];`

  const result = parsePingzhongdataNetWorth(text)

  assert.equal(result.currentNAV, 1.0302)
  assert.equal(result.prevNAV, 1.039)
  assert.equal(result.changeRate, -0.05)
  assert.equal(result.unitMoney, '分红：每份派现金0.0083元')
})

test('普通场景在缺少 equityReturn 时回退为净值差计算涨跌幅', () => {
  const text = `var Data_netWorthTrend = [{"x":1780848000000,"y":1.0000,"unitMoney":""},{"x":1780934400000,"y":1.0100,"unitMoney":""}];`

  const result = parsePingzhongdataNetWorth(text)

  assert.equal(result.currentNAV, 1.01)
  assert.equal(result.prevNAV, 1)
  assert.equal(result.changeRate, 1)
})
