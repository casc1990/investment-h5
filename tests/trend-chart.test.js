import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  buildTrendChartGuides,
  findNearestTrendPoint,
  formatTrendXAxisLabel,
  normalizeTrendChartBounds,
  normalizeTrendReferenceLines,
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

test('趋势图可强制纳入 0 基线，便于显示红绿警戒区', () => {
  assert.deepEqual(normalizeTrendChartBounds([12, 24], true), { min: 0, max: 24 })
  assert.deepEqual(normalizeTrendChartBounds([-18, -6], true), { min: -18, max: 0 })
  assert.deepEqual(normalizeTrendChartBounds([12, 24], false), { min: 12, max: 24 })
})

test('趋势图边界会纳入目标收益率等参照线，避免标线被裁掉', () => {
  assert.deepEqual(normalizeTrendChartBounds([3, 5], false, [8]), { min: 3, max: 8 })
  assert.deepEqual(normalizeTrendChartBounds([3, 5], true, [8]), { min: 0, max: 8 })
  assert.deepEqual(normalizeTrendChartBounds([-4, -2], false, [6]), { min: -4, max: 6 })
})

test('趋势图参照线可输出纵轴标签配置，便于标记目标收益率', () => {
  const lines = normalizeTrendReferenceLines([
    {
      key: 'target-profit-rate',
      value: 5,
      color: '#f97316',
      showAxisLabel: true,
      axisLabel: '目标 5%',
    },
  ], value => `${value}%`)

  assert.equal(lines.length, 1)
  assert.deepEqual(lines[0], {
    key: 'target-profit-rate',
    label: '',
    value: 5,
    color: '#f97316',
    dasharray: '6 4',
    showAxisLabel: true,
    axisLabel: '目标 5%',
  })

  const fallbackLine = normalizeTrendReferenceLines([{ value: 8, showAxisLabel: true }], value => `${value}%`)[0]
  assert.equal(fallbackLine.axisLabel, '8%')
})

test('统计页收益走势趋势图显式开启 0 刻度红线', () => {
  const source = fs.readFileSync(new URL('../src/views/Stats.vue', import.meta.url), 'utf8')
  assert.match(source, /<TrendChart[\s\S]*:show-zero-baseline="true"/)
})
