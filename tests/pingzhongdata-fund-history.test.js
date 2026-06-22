import test from 'node:test'
import assert from 'node:assert/strict'

import { parsePingzhongdataFundHistory } from '../functions/[[path]].js'

test('pingzhongdata 基金详情可解析净值走势和区间涨跌幅', () => {
  const text = [
    "var f_S_name = '示例基金A';",
    'var Data_netWorthTrend = ' + JSON.stringify([
      { x: Date.parse('2025-01-01T00:00:00Z'), y: 1.0, equityReturn: 0, unitMoney: '' },
      { x: Date.parse('2025-06-01T00:00:00Z'), y: 1.1, equityReturn: 1.5, unitMoney: '' },
      { x: Date.parse('2025-12-31T00:00:00Z'), y: 1.2, equityReturn: 0.9, unitMoney: '' },
      { x: Date.parse('2026-01-31T00:00:00Z'), y: 1.3, equityReturn: 0.8, unitMoney: '' },
    ]) + ';',
  ].join('\n')

  const result = parsePingzhongdataFundHistory(text)

  assert.equal(result.fund_name, '示例基金A')
  assert.equal(result.net_worth_trend.length, 4)
  assert.equal(result.net_worth_trend.at(-1).nav, 1.3)
  assert.equal(result.net_worth_trend.at(-1).cumulative_return_pct, 30)

  const perfMap = Object.fromEntries(result.performance_stats.map(item => [item.key, item]))
  assert.equal(perfMap['1m'].return_pct, 8.33)
  assert.equal(perfMap['1y'].return_pct, 30)
  assert.equal(perfMap['all'].return_pct, 30)
})
