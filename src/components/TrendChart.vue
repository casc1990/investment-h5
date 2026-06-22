<template>
  <div class="trend-chart-card">
    <div v-if="!points.length" class="empty-state">暂无趋势数据</div>
    <template v-else>
      <div class="chart-summary">
        <div>
          <div class="summary-label">{{ summaryLabel }}</div>
          <div class="summary-value neutral">
            {{ formatter(selectedPoint?.value ?? 0) }}
          </div>
        </div>
        <div class="summary-meta">
          <span>{{ selectedPoint?.label || '-' }}</span>
          <span>共 {{ points.length }} 个点</span>
        </div>
      </div>

      <div class="chart-body">
        <div class="y-axis-labels">
          <span v-for="guide in guides" :key="guide.value">{{ yAxisFormatter(guide.value) }}</span>
          <span v-if="hasZeroBaseline" class="zero-axis-label" :style="zeroAxisLabelStyle">0</span>
        </div>

        <div class="chart-main">
          <svg viewBox="0 0 320 160" class="chart-svg" preserveAspectRatio="none" @pointerdown="handlePointerSelect">
            <defs>
              <linearGradient id="trendArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="#1e80ff" stop-opacity="0.25" />
                <stop offset="100%" stop-color="#1e80ff" stop-opacity="0.02" />
              </linearGradient>
            </defs>
            <template v-if="hasZeroBaseline">
              <rect
                x="0"
                :y="padding.top"
                :width="width"
                :height="Math.max(0, zeroBaselineY - padding.top)"
                class="positive-zone"
              />
              <rect
                x="0"
                :y="zeroBaselineY"
                :width="width"
                :height="Math.max(0, height - padding.bottom - zeroBaselineY)"
                class="negative-zone"
              />
            </template>
            <line v-for="guide in guides" :key="guide.value" x1="0" :y1="yFor(guide.value)" x2="320" :y2="yFor(guide.value)" class="guide-line" />
            <line
              v-if="hasZeroBaseline"
              x1="0"
              :y1="zeroBaselineY"
              x2="320"
              :y2="zeroBaselineY"
              class="zero-baseline"
            />
            <path :d="areaPath" fill="url(#trendArea)" />
            <polyline :points="polylinePoints" fill="none" stroke="#1e80ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            <line
              v-if="selectedSvgPoint"
              :x1="selectedSvgPoint.x"
              y1="0"
              :x2="selectedSvgPoint.x"
              y2="160"
              class="focus-line"
            />
            <circle
              v-for="point in svgPoints"
              :key="point.key"
              :cx="point.x"
              :cy="point.y"
              :r="selectedSvgPoint?.key === point.key ? 5 : 4"
              :fill="selectedSvgPoint?.key === point.key ? '#1e80ff' : '#ffffff'"
              stroke="#1e80ff"
              stroke-width="2"
            />
            <rect x="0" y="0" width="320" height="160" fill="transparent" />
          </svg>

          <div class="x-labels">
            <span v-for="point in visibleLabels" :key="point.key">{{ point.label }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { buildTrendChartGuides, findNearestTrendPoint, formatTrendXAxisLabel } from '../utils/trendChart'

const emit = defineEmits(['select'])

const props = defineProps({
  points: {
    type: Array,
    default: () => [],
  },
  summaryLabel: {
    type: String,
    default: '当前总金额',
  },
  formatter: {
    type: Function,
    default: value => String(value ?? '-'),
  },
  yAxisFormatter: {
    type: Function,
    default: value => String(value ?? '-'),
  },
})

const width = 320
const height = 160
const padding = { top: 18, right: 12, bottom: 18, left: 12 }
const selectedKey = ref('')

const values = computed(() => props.points.map(item => Number(item.value) || 0))
const minValue = computed(() => values.value.length ? Math.min(...values.value) : 0)
const maxValue = computed(() => values.value.length ? Math.max(...values.value) : 0)

const normalizedMax = computed(() => {
  if (maxValue.value === minValue.value) return maxValue.value + 1
  return maxValue.value
})

const normalizedMin = computed(() => {
  if (maxValue.value === minValue.value) return minValue.value - 1
  return minValue.value
})

const yFor = (value) => {
  const usableHeight = height - padding.top - padding.bottom
  const ratio = (Number(value) - normalizedMin.value) / (normalizedMax.value - normalizedMin.value)
  return height - padding.bottom - (ratio * usableHeight)
}

const svgPoints = computed(() => {
  if (!props.points.length) return []
  const usableWidth = width - padding.left - padding.right
  const step = props.points.length === 1 ? 0 : usableWidth / (props.points.length - 1)

  return props.points.map((point, index) => ({
    ...point,
    key: point.key,
    label: formatTrendXAxisLabel(point),
    x: padding.left + (step * index),
    y: yFor(point.value),
  }))
})

const selectedSvgPoint = computed(() => svgPoints.value.find(point => point.key === selectedKey.value) || svgPoints.value.at(-1) || null)
const selectedPoint = computed(() => selectedSvgPoint.value || null)

const polylinePoints = computed(() => svgPoints.value.map(point => `${point.x},${point.y}`).join(' '))

const areaPath = computed(() => {
  if (!svgPoints.value.length) return ''
  const first = svgPoints.value[0]
  const last = svgPoints.value.at(-1)
  const linePath = svgPoints.value.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  return `${linePath} L ${last.x} ${height - padding.bottom} L ${first.x} ${height - padding.bottom} Z`
})

const guides = computed(() => buildTrendChartGuides(values.value))
const hasZeroBaseline = computed(() => normalizedMin.value < 0 && normalizedMax.value > 0)
const zeroBaselineY = computed(() => hasZeroBaseline.value ? yFor(0) : null)
const zeroAxisLabelStyle = computed(() => {
  if (!hasZeroBaseline.value) return {}
  return {
    top: `${zeroBaselineY.value}px`,
  }
})

const visibleLabels = computed(() => {
  if (svgPoints.value.length <= 4) return svgPoints.value
  const indexes = Array.from(new Set([
    0,
    Math.floor((svgPoints.value.length - 1) / 3),
    Math.floor(((svgPoints.value.length - 1) * 2) / 3),
    svgPoints.value.length - 1,
  ]))
  return indexes.map(index => svgPoints.value[index])
})

const handlePointerSelect = (event) => {
  const target = event.currentTarget
  if (!target?.getBoundingClientRect) return
  const rect = target.getBoundingClientRect()
  const ratio = rect.width ? width / rect.width : 1
  const localX = (event.clientX - rect.left) * ratio
  const nearest = findNearestTrendPoint(svgPoints.value, localX)
  if (nearest) selectedKey.value = nearest.key
}

watch(svgPoints, (points) => {
  if (!points.length) {
    selectedKey.value = ''
    return
  }
  const exists = points.some(point => point.key === selectedKey.value)
  if (!exists) selectedKey.value = points.at(-1)?.key || ''
}, { immediate: true })

watch(selectedPoint, (point) => {
  emit('select', point?.raw || null)
}, { immediate: true })
</script>

<style scoped>
.trend-chart-card {
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
  font-size: 24px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
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
  color: #8a94a6;
  text-align: right;
  flex-shrink: 0;
  position: relative;
}

.chart-main {
  min-width: 0;
  flex: 1;
}

.chart-svg {
  width: 100%;
  height: 160px;
  touch-action: none;
}

.guide-line {
  stroke: rgba(30, 128, 255, 0.12);
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.positive-zone {
  fill: rgba(238, 10, 36, 0.06);
}

.negative-zone {
  fill: rgba(7, 193, 96, 0.06);
}

.zero-baseline {
  stroke: rgba(238, 10, 36, 0.48);
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
}

.zero-axis-label {
  position: absolute;
  right: 0;
  transform: translateY(-50%);
  color: rgba(238, 10, 36, 0.82);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.focus-line {
  stroke: rgba(30, 128, 255, 0.3);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

.x-labels {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  font-size: 11px;
  color: #8a94a6;
}

.neutral {
  color: #666;
}
</style>
