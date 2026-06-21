import test from 'node:test'
import assert from 'node:assert/strict'

import { mergeFundEstimateIntoSnapshot } from '../functions/[[path]].js'

test('同净值日期的 QDII 盘中估算保留确认日涨跌幅，不被估算涨幅覆盖', () => {
  const result = mergeFundEstimateIntoSnapshot({
    nav: 2.773,
    navDate: '2026-06-08',
    gszzl: 1.73,
    prev_nav: 2.7258,
    estimateNav: 2.788,
    estimateChange: 0.54,
    officialNavYesterday: 2.773,
    fundGzNavDate: '2026-06-08',
  })

  assert.deepEqual(result, {
    nav: 2.788,
    navDate: '2026-06-08',
    gszzl: 1.73,
    prev_nav: 2.7258,
    dwjz: 2.773,
  })
})

test('fundgz 日期更新时，沿用估算涨幅并把旧确认净值下沉到 prev_nav', () => {
  const result = mergeFundEstimateIntoSnapshot({
    nav: 2.773,
    navDate: '2026-06-08',
    gszzl: 1.73,
    prev_nav: 2.7258,
    estimateNav: 2.788,
    estimateChange: 0.54,
    officialNavYesterday: 2.773,
    fundGzNavDate: '2026-06-09',
  })

  assert.deepEqual(result, {
    nav: 2.788,
    navDate: '2026-06-09',
    gszzl: 0.54,
    prev_nav: 2.773,
    dwjz: 2.773,
  })
})
