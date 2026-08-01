<template>
  <div class="period-bar-card">
    <div v-if="!normalizedPoints.length" class="empty-state">暂无周期收益数据</div>
    <template v-else>
      <div class="bar-summary">
        <div>
          <div class="summary-label">{{ summaryLabel }}</div>
          <div class="summary-value" :class="profitClass(selectedPoint?.value)">{{ formatter(selectedPoint?.value || 0) }}</div>
        </div>
        <div class="summary-period">{{ selectedPoint?.raw?.start_date || '-' }} ~ {{ selectedPoint?.raw?.end_date || '-' }}</div>
      </div>

      <div ref="scrollRef" class="bar-scroll">
        <div class="bar-chart" :style="{ width: `${Math.max(100, normalizedPoints.length * 52)}px` }">
          <div class="zero-line"><span>0</span></div>
          <button
            v-for="point in normalizedPoints"
            :key="point.key"
            type="button"
            class="bar-item"
            :class="{ selected: point.key === selectedKey }"
            @click="selectPoint(point)"
          >
            <span class="bar-track">
              <span class="bar-fill" :class="profitClass(point.value)" :style="barStyle(point.value)" />
            </span>
            <span class="bar-label">{{ point.shortLabel }}</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'

const emit = defineEmits(['select'])
const props = defineProps({
  points: { type: Array, default: () => [] },
  summaryLabel: { type: String, default: '所选周期收益' },
  formatter: { type: Function, default: value => String(value ?? '-') },
})

const selectedKey = ref('')
const scrollRef = ref(null)
const normalizedPoints = computed(() => (props.points || []).map((point, index) => ({
  ...point,
  key: point.key || String(index),
  value: Number(point.value) || 0,
  shortLabel: String(point.raw?.period_key || point.label || '').replace(/^\d{4}-/, ''),
})))
const maxAbsValue = computed(() => Math.max(1, ...normalizedPoints.value.map(point => Math.abs(point.value))))
const selectedPoint = computed(() => normalizedPoints.value.find(point => point.key === selectedKey.value) || normalizedPoints.value.at(-1) || null)

function profitClass(value) {
  const number = Number(value) || 0
  if (number > 0) return 'positive'
  if (number < 0) return 'negative'
  return 'neutral'
}

function barStyle(value) {
  const number = Number(value) || 0
  const size = `${Math.max(2, Math.abs(number) / maxAbsValue.value * 44)}%`
  return number >= 0 ? { bottom: '50%', height: size } : { top: '50%', height: size }
}

function selectPoint(point) {
  selectedKey.value = point.key
}

watch(normalizedPoints, async (points) => {
  if (!points.length) {
    selectedKey.value = ''
    return
  }
  if (!points.some(point => point.key === selectedKey.value)) selectedKey.value = points.at(-1).key
  await nextTick()
  if (scrollRef.value) scrollRef.value.scrollLeft = scrollRef.value.scrollWidth
}, { immediate: true })

watch(selectedPoint, point => emit('select', point?.raw || null), { immediate: true })
</script>

<style scoped>
.period-bar-card { margin-top: 12px; padding: 14px; border-radius: 16px; background: #f8fbff; }
.bar-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.summary-label { color: #7b8794; font-size: 12px; }
.summary-value { margin-top: 4px; font-family: 'Courier New', monospace; font-size: 22px; font-weight: 700; }
.summary-period { color: #8a94a3; font-size: 11px; text-align: right; }
.bar-scroll { margin-top: 12px; overflow-x: auto; scrollbar-width: none; }
.bar-scroll::-webkit-scrollbar { display: none; }
.bar-chart { position: relative; display: flex; height: 190px; min-width: 100%; }
.zero-line { position: absolute; z-index: 0; top: 50%; right: 0; left: 0; border-top: 1px dashed #f08a9b; }
.zero-line span { position: absolute; top: -8px; left: 0; padding-right: 3px; background: #f8fbff; color: #e54864; font-size: 9px; }
.bar-item { position: relative; z-index: 1; flex: 1 0 52px; border: 0; background: transparent; padding: 0 4px; }
.bar-track { position: absolute; inset: 8px 8px 24px; }
.bar-fill { position: absolute; right: 3px; left: 3px; min-height: 2px; border-radius: 5px; opacity: .72; }
.bar-fill.positive { background: linear-gradient(180deg, #ff7b8c, #f24f68); }
.bar-fill.negative { background: linear-gradient(180deg, #3ed59a, #10aa70); }
.bar-fill.neutral { background: #cbd5e1; }
.bar-item.selected .bar-fill { opacity: 1; box-shadow: 0 0 0 2px rgba(30, 128, 255, .14); }
.bar-label { position: absolute; right: 0; bottom: 1px; left: 0; color: #8491a3; font-size: 9px; white-space: nowrap; }
.bar-item.selected .bar-label { color: #1e80ff; font-weight: 700; }
.positive { color: #ee0a24; }
.negative { color: #07c160; }
.neutral { color: #64748b; }
.empty-state { padding: 32px 0; color: #94a3b8; text-align: center; }
</style>
