<template>
  <div class="bucket-trend-card">
    <div v-if="!normalizedSeries.length" class="empty-state">暂无分类每日收益数据</div>
    <template v-else>
      <div class="chart-summary">
        <div>
          <div class="summary-label">{{ summaryLabel }}</div>
          <div class="summary-value neutral">{{ selectedRow?.label || '-' }}</div>
        </div>
        <div class="summary-meta">
          <span>{{ selectedRow?.date || '-' }}</span>
          <span>共 {{ pointCount }} 个点</span>
        </div>
      </div>

      <div class="chart-body">
        <div class="y-axis-labels">
          <span v-for="guide in guides" :key="guide.value">{{ yAxisFormatter(guide.value) }}</span>
          <span v-if="hasZeroBaseline" class="zero-axis-label" :style="zeroAxisLabelStyle">0</span>
        </div>

        <div class="chart-main">
          <svg viewBox="0 0 320 160" class="chart-svg" preserveAspectRatio="none" @pointerdown="handlePointerSelect">
            <template v-if="hasZeroBaseline">
              <rect x="0" :y="padding.top" :width="width" :height="Math.max(0, zeroBaselineY - padding.top)" class="positive-zone" />
              <rect x="0" :y="zeroBaselineY" :width="width" :height="Math.max(0, height - padding.bottom - zeroBaselineY)" class="negative-zone" />
            </template>
            <line v-for="guide in guides" :key="guide.value" x1="0" :y1="yFor(guide.value)" x2="320" :y2="yFor(guide.value)" class="guide-line" />
            <line v-if="hasZeroBaseline" x1="0" :y1="zeroBaselineY" x2="320" :y2="zeroBaselineY" class="zero-baseline" />
            <g v-for="series in renderedSeries" :key="series.key">
              <polyline
                :points="series.pointsText"
                fill="none"
                :stroke="series.color"
                stroke-width="2.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </g>
            <line
              v-if="selectedX !== null"
              :x1="selectedX"
              y1="0"
              :x2="selectedX"
              y2="160"
              class="focus-line"
            />
            <rect x="0" y="0" width="320" height="160" fill="transparent" />
          </svg>

          <div class="x-labels">
            <span v-for="point in visibleLabels" :key="point.key">{{ point.label }}</span>
          </div>
        </div>
      </div>

      <div class="series-legend-grid">
        <div v-for="item in selectedSeriesValues" :key="item.key" class="series-legend-item">
          <span class="series-dot" :style="{ backgroundColor: item.color }"></span>
          <span class="series-name">{{ item.label }}</span>
          <span class="series-value" :class="profitClass(item.value)">{{ formatter(item.value) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { buildTrendChartGuides, findNearestTrendPoint, formatTrendXAxisLabel, normalizeTrendChartBounds } from '../utils/trendChart'

const emit = defineEmits(['select'])

const props = defineProps({
  series: {
    type: Array,
    default: () => [],
  },
  summaryLabel: {
    type: String,
    default: '分类每日收益趋势',
  },
  formatter: {
    type: Function,
    default: value => String(value ?? '-'),
  },
  yAxisFormatter: {
    type: Function,
    default: value => String(value ?? '-'),
  },
  showZeroBaseline: {
    type: Boolean,
    default: true,
  },
})

const width = 320
const height = 160
const padding = { top: 18, right: 12, bottom: 18, left: 12 }
const selectedKey = ref('')

const getAxisKey = (point = {}) => String(point.date || point.label || point.key || '')

const normalizedSeries = computed(() => {
  const list = Array.isArray(props.series) ? props.series : []
  return list
    .filter(item => Array.isArray(item?.points) && item.points.length)
    .map(item => ({
      ...item,
      points: item.points.map(point => ({
        ...point,
        axisKey: getAxisKey(point),
        label: formatTrendXAxisLabel(point),
      })),
    }))
})

const pointCount = computed(() => normalizedSeries.value[0]?.points?.length || 0)
const allValues = computed(() => normalizedSeries.value.flatMap(item => item.points.map(point => Number(point.value) || 0)))
const bounds = computed(() => normalizeTrendChartBounds(allValues.value, props.showZeroBaseline, []))
const minValue = computed(() => bounds.value.min)
const maxValue = computed(() => bounds.value.max)
const normalizedMax = computed(() => (maxValue.value === minValue.value ? maxValue.value + 1 : maxValue.value))
const normalizedMin = computed(() => (maxValue.value === minValue.value ? minValue.value - 1 : minValue.value))

const yFor = (value) => {
  const usableHeight = height - padding.top - padding.bottom
  const ratio = (Number(value) - normalizedMin.value) / (normalizedMax.value - normalizedMin.value)
  return height - padding.bottom - (ratio * usableHeight)
}

const xAxisPoints = computed(() => {
  const basePoints = normalizedSeries.value[0]?.points || []
  if (!basePoints.length) return []
  const usableWidth = width - padding.left - padding.right
  const step = basePoints.length === 1 ? 0 : usableWidth / (basePoints.length - 1)
  return basePoints.map((point, index) => ({
    ...point,
    key: point.axisKey,
    x: padding.left + (step * index),
  }))
})

const xMap = computed(() => new Map(xAxisPoints.value.map(point => [point.key, point.x])))

const renderedSeries = computed(() => normalizedSeries.value.map(series => ({
  ...series,
  points: series.points.map(point => ({
    ...point,
    x: xMap.value.get(point.axisKey) ?? padding.left,
    y: yFor(point.value),
  })),
  pointsText: series.points.map(point => {
    const x = xMap.value.get(point.axisKey) ?? padding.left
    return `${x},${yFor(point.value)}`
  }).join(' '),
})))

const guides = computed(() => buildTrendChartGuides([minValue.value, maxValue.value]))
const hasZeroBaseline = computed(() => pointCount.value > 0 && props.showZeroBaseline)
const zeroBaselineY = computed(() => (hasZeroBaseline.value ? yFor(0) : null))
const zeroAxisLabelStyle = computed(() => (hasZeroBaseline.value ? { top: `${zeroBaselineY.value}px` } : {}))

const selectedRow = computed(() => xAxisPoints.value.find(point => point.key === selectedKey.value) || xAxisPoints.value.at(-1) || null)
const selectedX = computed(() => selectedRow.value?.x ?? null)
const visibleLabels = computed(() => {
  if (xAxisPoints.value.length <= 4) return xAxisPoints.value
  const indexes = Array.from(new Set([
    0,
    Math.floor((xAxisPoints.value.length - 1) / 3),
    Math.floor(((xAxisPoints.value.length - 1) * 2) / 3),
    xAxisPoints.value.length - 1,
  ]))
  return indexes.map(index => xAxisPoints.value[index])
})

const selectedSeriesValues = computed(() => {
  if (!selectedRow.value) return []
  return renderedSeries.value.map(series => {
    const point = series.points.find(item => item.axisKey === selectedRow.value.key)
    return {
      key: `${series.key}-${selectedRow.value.key}`,
      assetType: series.assetType,
      label: series.label,
      color: series.color,
      value: Number(point?.value) || 0,
      raw: point?.raw || null,
    }
  })
})

const profitClass = (value) => {
  const num = Number(value) || 0
  if (num > 0) return 'positive'
  if (num < 0) return 'negative'
  return 'neutral'
}

const handlePointerSelect = (event) => {
  const target = event.currentTarget
  if (!target?.getBoundingClientRect) return
  const rect = target.getBoundingClientRect()
  const ratio = rect.width ? width / rect.width : 1
  const localX = (event.clientX - rect.left) * ratio
  const nearest = findNearestTrendPoint(xAxisPoints.value, localX)
  if (nearest) selectedKey.value = nearest.key
}

watch(xAxisPoints, (points) => {
  if (!points.length) {
    selectedKey.value = ''
    return
  }
  const exists = points.some(point => point.key === selectedKey.value)
  if (!exists) selectedKey.value = points.at(-1)?.key || ''
}, { immediate: true })

watch(selectedSeriesValues, (rows) => {
  emit('select', {
    date: selectedRow.value?.date || '',
    label: selectedRow.value?.label || '',
    values: rows,
  })
}, { immediate: true })
</script>

<style scoped>
.bucket-trend-card {
  background: #f8fbff;
  border-radius: 14px;
  padding: 14px;
}

.empty-state {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 13px;
}

.chart-summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.summary-label {
  font-size: 12px;
  color: #7b8794;
}

.summary-value {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}

.summary-meta {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  font-size: 11px;
  color: #8a94a6;
}

.chart-body {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.y-axis-labels {
  width: 56px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 4px 0 26px;
  font-size: 11px;
  color: #94a3b8;
  position: relative;
}

.zero-axis-label {
  position: absolute;
  left: 0;
  transform: translateY(-50%);
  font-size: 11px;
  color: #ef4444;
  font-weight: 700;
}

.chart-main {
  flex: 1;
  min-width: 0;
}

.chart-svg {
  width: 100%;
  height: 180px;
  display: block;
}

.guide-line {
  stroke: #e2e8f0;
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.focus-line {
  stroke: #cbd5e1;
  stroke-width: 1.2;
  stroke-dasharray: 4 4;
}

.zero-baseline {
  stroke: #ef4444;
  stroke-width: 1.4;
  stroke-dasharray: 6 4;
}

.positive-zone {
  fill: rgba(248, 113, 113, 0.08);
}

.negative-zone {
  fill: rgba(74, 222, 128, 0.08);
}

.x-labels {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: #94a3b8;
}

.series-legend-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.series-legend-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  padding: 8px 10px;
}

.series-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.series-name {
  font-size: 12px;
  color: #475569;
  min-width: 0;
}

.series-value {
  font-size: 12px;
  font-weight: 700;
}

.series-value.positive {
  color: #f87171;
}

.series-value.negative {
  color: #4ade80;
}

.series-value.neutral {
  color: #111827;
}
</style>
