import test from 'node:test'
import assert from 'node:assert/strict'

import { parsePingzhongdataFundHistory } from '../functions/[[path]].js'

test('pingzhongdata 基金详情优先使用官方区间涨幅变量，避免区间口径偏差', () => {
  const text = [
    "var f_S_name = '示例基金A';",
    "var syl_1y = '0.25';",
    "var syl_3y = '0.81';",
    "var syl_6y = '1.75';",
    "var syl_1n = '1.70';",
    'var Data_netWorthTrend = ' + JSON.stringify([
      { x: Date.parse('2025-01-01T00:00:00Z'), y: 1.0, equityReturn: 0, unitMoney: '' },
      { x: Date.parse('2025-06-19T00:00:00Z'), y: 1.0415, equityReturn: 0.1, unitMoney: '' },
      { x: Date.parse('2026-03-23T00:00:00Z'), y: 1.0741, equityReturn: 0.1, unitMoney: '' },
      { x: Date.parse('2026-05-21T00:00:00Z'), y: 1.0688, equityReturn: 0.1, unitMoney: '' },
      { x: Date.parse('2026-06-21T00:00:00Z'), y: 1.0169, equityReturn: 0.1, unitMoney: '' },
    ]) + ';',
  ].join('\n')
  const html = [
    '<dl class="dataItem01"><dd><span>近1月：</span><span class="ui-font-middle ui-color-red ui-num">0.25%</span></dd><dd><span>近1年：</span><span class="ui-font-middle ui-color-red ui-num">1.70%</span></dd></dl>',
    '<dl class="dataItem02"><dd><span>近3月：</span><span class="ui-font-middle ui-color-red ui-num">0.81%</span></dd><dd><span>近3年：</span><span class="ui-font-middle ui-color-red ui-num">11.59%</span></dd></dl>',
    '<dl class="dataItem03"><dd><span>近6月：</span><span class="ui-font-middle ui-color-red ui-num">1.75%</span></dd><dd><span>成立来：</span><span class="ui-font-middle ui-color-red ui-num">59.76%</span></dd></dl>',
  ].join('')

  const result = parsePingzhongdataFundHistory(text, html)
  const perfMap = Object.fromEntries(result.performance_stats.map(item => [item.key, item]))

  assert.equal(perfMap['1m'].return_pct, 0.25)
  assert.equal(perfMap['3m'].return_pct, 0.81)
  assert.equal(perfMap['6m'].return_pct, 1.75)
  assert.equal(perfMap['1y'].return_pct, 1.7)
  assert.equal(perfMap['3y'].return_pct, 11.59)
  assert.equal(perfMap['all'].return_pct, 59.76)
})
