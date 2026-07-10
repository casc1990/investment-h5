<template>
  <div class="profit-calendar-card">
    <div v-if="!normalizedSeries.length" class="empty-state">暂无每日收益统计数据</div>
    <template v-else>
      <div class="calendar-topbar">
        <div class="calendar-summary-main">
          <div class="calendar-summary-label">{{ summaryLabel }}</div>
          <div class="calendar-summary-value" :class="profitClass(selectedPoint?.value)">
            {{ selectedPoint ? formatter(selectedPoint.value) : '--' }}
          </div>
        </div>
        <div class="calendar-summary-meta">
          <span v-if="showCategoryTabs">{{ selectedSeries?.label || '-' }}</span>
          <span>{{ selectedPoint?.date || visibleMonthLabel }}</span>
        </div>
      </div>

      <div v-if="showCategoryTabs" class="calendar-category-row">
        <button
          v-for="item in normalizedSeries"
          :key="item.key"
          type="button"
          class="calendar-category-chip"
          :class="{ active: selectedAssetType === item.assetType }"
          @click="selectedAssetType = item.assetType"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="calendar-toolbar">
        <button type="button" class="calendar-nav-button" :disabled="!canPrevMonth" @click="goPrevMonth">‹</button>
        <div class="calendar-month-title">{{ visibleMonthLabel }}</div>
        <button type="button" class="calendar-nav-button" :disabled="!canNextMonth" @click="goNextMonth">›</button>
      </div>

      <div class="calendar-weekdays">
        <span v-for="day in weekdays" :key="day">{{ day }}</span>
      </div>

      <div class="calendar-grid">
        <button
          v-for="cell in calendarCells"
          :key="cell.key"
          type="button"
          class="calendar-cell"
          :class="[
            cell.kind === 'empty' ? 'is-empty' : '',
            cell.kind === 'day' ? profitClass(cell.value) : '',
            cell.isToday ? 'is-today' : '',
            cell.isSelected ? 'is-selected' : '',
          ]"
          :style="cell.kind === 'day' ? cellStyle(cell) : {}"
          :disabled="cell.kind === 'empty'"
          @click="selectCell(cell)"
        >
          <template v-if="cell.kind === 'day'">
            <span class="calendar-day-label">{{ cell.day }}</span>
            <span class="calendar-day-value">{{ compactFormatter(cell.value) }}</span>
          </template>
        </button>
      </div>

      <div class="calendar-footer">
        <div class="calendar-footer-card">
          <span class="footer-label">当月累计</span>
          <span class="footer-value" :class="profitClass(monthTotal)">{{ formatter(monthTotal) }}</span>
        </div>
        <div class="calendar-footer-card">
          <span class="footer-label">正收益天数</span>
          <span class="footer-value positive">{{ positiveDays }} 天</span>
        </div>
        <div class="calendar-footer-card">
          <span class="footer-label">负收益天数</span>
          <span class="footer-value negative">{{ negativeDays }} 天</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  series: {
    type: Array,
    default: () => [],
  },
  summaryLabel: {
    type: String,
    default: '分类每日收益统计',
  },
  formatter: {
    type: Function,
    default: value => String(value ?? '-'),
  },
})

const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const selectedAssetType = ref('')
const selectedMonthKey = ref('')
const selectedDateKey = ref('')

const round2 = (value) => Number((Number(value) || 0).toFixed(2))
const pad2 = (value) => String(value).padStart(2, '0')
const parseMonthKey = (date = '') => String(date || '').slice(0, 7)
const toMonthLabel = (monthKey = '') => {
  const [year, month] = String(monthKey || '').split('-')
  if (!year || !month) return '-'
  return `${year}年 ${Number(month)}月`
}
const toDateKey = (date = '') => String(date || '').slice(0, 10)
const compactFormatter = (value) => {
  const num = round2(value)
  const prefix = num > 0 ? '+' : ''
  const abs = Math.abs(num)
  if (abs >= 10000) return `${prefix}${(abs / 10000).toFixed(1)}w`
  if (abs >= 1000) return `${prefix}${(abs / 1000).toFixed(1)}k`
  if (abs >= 100) return `${prefix}${abs.toFixed(0)}`
  return `${prefix}${abs.toFixed(2)}`
}

const normalizedSeries = computed(() => {
  const list = Array.isArray(props.series) ? props.series : []
  return list
    .filter(item => Array.isArray(item?.points) && item.points.length)
    .map(item => ({
      ...item,
      points: item.points
        .map(point => ({
          ...point,
          date: toDateKey(point.date),
          monthKey: parseMonthKey(point.date),
          value: round2(point.value),
        }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date))),
    }))
})

const showCategoryTabs = computed(() => normalizedSeries.value.length > 1)
const selectedSeries = computed(() => normalizedSeries.value.find(item => item.assetType === selectedAssetType.value) || normalizedSeries.value[0] || null)
const monthKeys = computed(() => [...new Set((selectedSeries.value?.points || []).map(point => point.monthKey))])
const monthIndex = computed(() => monthKeys.value.findIndex(item => item === selectedMonthKey.value))
const visibleMonthLabel = computed(() => toMonthLabel(selectedMonthKey.value))
const canPrevMonth = computed(() => monthIndex.value > 0)
const canNextMonth = computed(() => monthIndex.value >= 0 && monthIndex.value < monthKeys.value.length - 1)
const visiblePoints = computed(() => (selectedSeries.value?.points || []).filter(point => point.monthKey === selectedMonthKey.value))
const pointMap = computed(() => new Map(visiblePoints.value.map(point => [point.date, point])))
const maxAbsValue = computed(() => {
  const values = visiblePoints.value.map(point => Math.abs(Number(point.value) || 0)).filter(value => value > 0)
  return values.length ? Math.max(...values) : 0
})
const monthTotal = computed(() => round2(visiblePoints.value.reduce((sum, point) => sum + point.value, 0)))
const positiveDays = computed(() => visiblePoints.value.filter(point => point.value > 0).length)
const negativeDays = computed(() => visiblePoints.value.filter(point => point.value < 0).length)

const calendarCells = computed(() => {
  if (!selectedMonthKey.value) return []
  const [yearStr, monthStr] = selectedMonthKey.value.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!year || !month) return []

  const firstDay = new Date(year, month - 1, 1)
  const totalDays = new Date(year, month, 0).getDate()
  const cells = []

  for (let i = 0; i < firstDay.getDay(); i += 1) {
    cells.push({ key: `empty-head-${i}`, kind: 'empty' })
  }

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`

  for (let day = 1; day <= totalDays; day += 1) {
    const dateKey = `${selectedMonthKey.value}-${pad2(day)}`
    const point = pointMap.value.get(dateKey)
    cells.push({
      key: dateKey,
      kind: 'day',
      day,
      date: dateKey,
      value: round2(point?.value || 0),
      raw: point || null,
      isToday: dateKey === todayKey,
      isSelected: dateKey === selectedDateKey.value,
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `empty-tail-${cells.length}`, kind: 'empty' })
  }

  return cells
})

const selectedPoint = computed(() => pointMap.value.get(selectedDateKey.value) || visiblePoints.value.at(-1) || null)

function profitClass(value) {
  const num = Number(value) || 0
  if (num > 0) return 'positive'
  if (num < 0) return 'negative'
  return 'neutral'
}

function cellStyle(cell) {
  const value = Number(cell?.value) || 0
  const abs = Math.abs(value)
  const intensity = maxAbsValue.value > 0 ? abs / maxAbsValue.value : 0

  if (value > 0) {
    return {
      background: `rgba(248, 113, 113, ${0.12 + (intensity * 0.48)})`,
      color: '#ee0a24',
    }
  }
  if (value < 0) {
    return {
      background: `rgba(7, 193, 96, ${0.10 + (intensity * 0.34)})`,
      color: '#07c160',
    }
  }
  return {
    background: '#f3f4f6',
    color: '#9ca3af',
  }
}

function selectCell(cell) {
  if (!cell || cell.kind !== 'day') return
  selectedDateKey.value = cell.date
}

function goPrevMonth() {
  if (!canPrevMonth.value) return
  selectedMonthKey.value = monthKeys.value[monthIndex.value - 1] || selectedMonthKey.value
}

function goNextMonth() {
  if (!canNextMonth.value) return
  selectedMonthKey.value = monthKeys.value[monthIndex.value + 1] || selectedMonthKey.value
}

watch(normalizedSeries, (series) => {
  if (!series.length) {
    selectedAssetType.value = ''
    selectedMonthKey.value = ''
    selectedDateKey.value = ''
    return
  }
  const exists = series.some(item => item.assetType === selectedAssetType.value)
  if (!exists) selectedAssetType.value = series[0].assetType
}, { immediate: true })

watch(selectedSeries, (series) => {
  const keys = [...new Set((series?.points || []).map(point => point.monthKey))]
  if (!keys.length) {
    selectedMonthKey.value = ''
    selectedDateKey.value = ''
    return
  }
  if (!keys.includes(selectedMonthKey.value)) {
    selectedMonthKey.value = keys.at(-1) || keys[0]
  }
}, { immediate: true })

watch([visiblePoints, selectedMonthKey], ([points]) => {
  const exists = points.some(point => point.date === selectedDateKey.value)
  if (!exists) selectedDateKey.value = points.at(-1)?.date || ''
}, { immediate: true })
</script>

<style scoped>
.profit-calendar-card {
  background: #f8fbff;
  border-radius: 14px;
  padding: 14px;
}

.empty-state {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 13px;
}

.calendar-topbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.calendar-summary-main {
  min-width: 0;
  flex: 1;
}

.calendar-summary-label,
.calendar-summary-meta,
.footer-label,
.calendar-day-label,
.calendar-weekdays {
  font-size: 12px;
  color: #7b8794;
}

.calendar-summary-value {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}

.calendar-summary-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  text-align: right;
  flex-shrink: 0;
}

.calendar-category-row {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.calendar-category-chip {
  border: none;
  border-radius: 999px;
  padding: 8px 12px;
  background: #ffffff;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.calendar-category-chip.active {
  background: #4f46e5;
  color: #ffffff;
}

.calendar-toolbar {
  margin-top: 14px;
  display: grid;
  grid-template-columns: 40px 1fr 40px;
  gap: 8px;
  align-items: center;
}

.calendar-nav-button {
  border: none;
  border-radius: 12px;
  height: 40px;
  background: #ffffff;
  color: #475569;
  font-size: 20px;
  font-weight: 700;
}

.calendar-nav-button:disabled {
  opacity: 0.4;
}

.calendar-month-title {
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.calendar-weekdays {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  text-align: center;
}

.calendar-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.calendar-cell {
  min-width: 0;
  aspect-ratio: 1 / 1;
  border: none;
  border-radius: 12px;
  padding: 6px 2px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.65);
}

.calendar-cell.is-empty {
  background: transparent;
  box-shadow: none;
}

.calendar-cell.is-selected {
  outline: 2px solid rgba(79, 70, 229, 0.38);
}

.calendar-cell.is-today {
  box-shadow: inset 0 0 0 2px rgba(79, 70, 229, 0.2);
}

.calendar-day-label {
  font-size: 12px;
  font-weight: 700;
  color: currentColor;
  line-height: 1;
}

.calendar-day-value {
  max-width: 100%;
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  color: currentColor;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.calendar-footer {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.calendar-footer-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.footer-value {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.positive {
  color: #ee0a24;
}

.negative {
  color: #07c160;
}

.neutral {
  color: #64748b;
}

@media (max-width: 390px) {
  .profit-calendar-card {
    padding: 12px;
  }

  .calendar-summary-value {
    font-size: 20px;
  }

  .calendar-month-title {
    font-size: 15px;
  }

  .calendar-weekdays,
  .calendar-day-value {
    font-size: 9px;
  }

  .calendar-grid,
  .calendar-weekdays {
    gap: 4px;
  }

  .calendar-cell {
    padding: 4px 2px;
    border-radius: 10px;
  }
}
</style>
