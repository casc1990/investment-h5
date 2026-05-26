import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTrendChartGuides,
  findNearestTrendPoint,
  formatTrendXAxisLabel,
} from '../src/utils/trendChart.js'

test('趋势图纵轴金额刻度返回顶部中部底部三档', () => {
  const guides = buildTrendChartGuides([1000, 1600, 2200])

  assert.equal(guides.length, 3)
  assert.deepEqual(guides.map(item => item.value), [2200, 1600, 1000])
})

test('趋势图横轴优先显示原始日期标签', () => {
  assert.equal(formatTrendXAxisLabel({ date: '2026-05-23', label: '05-23' }), '05-23')
  assert.equal(formatTrendXAxisLabel({ label: '2026年05月' }), '2026年05月')
})

test('手机点选趋势图时可命中最近的数据点', () => {
  const points = [
    { key: 'a', x: 12, y: 88, raw: { date: '2026-05-21' } },
    { key: 'b', x: 100, y: 60, raw: { date: '2026-05-22' } },
    { key: 'c', x: 188, y: 40, raw: { date: '2026-05-23' } },
  ]

  assert.equal(findNearestTrendPoint(points, 20)?.key, 'a')
  assert.equal(findNearestTrendPoint(points, 120)?.key, 'b')
  assert.equal(findNearestTrendPoint(points, 260)?.key, 'c')
})
