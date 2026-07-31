<template>
  <div class="bucket-holdings-page">
    <div class="header-card">
      <button type="button" class="back-button" @click="router.push(`/allocation/${profileId}`)">← 返回策略详情</button>
      <div class="page-title">{{ bucketLabel }} · 基金持仓</div>
      <div class="page-subtitle">仅展示当前类别已纳入基金的收益数据，点击具体基金可进入详情页</div>
    </div>

    <div v-if="!currentProfile" class="section-card">
      <van-empty description="未找到当前策略" />
    </div>

    <template v-else>
      <div class="section-card summary-card">
        <div class="summary-top">
          <div>
            <div class="summary-label">当前策略</div>
            <div class="summary-value">{{ currentProfile.name }}</div>
          </div>
          <div class="summary-badge">{{ rows.length }} 只基金</div>
        </div>
        <div class="summary-grid">
          <div>
            <span class="summary-label">当前市值</span>
            <div class="summary-amount">¥{{ formatAmount(bucketSummary?.marketValue || 0) }}</div>
          </div>
          <div>
            <span class="summary-label">总收益/率</span>
            <div class="summary-amount summary-combined" :class="profitClass(bucketSummary?.totalProfit)">
              {{ formatSignedAmount(bucketSummary?.totalProfit) }} / {{ formatSignedPercent(bucketSummary?.totalProfitRate) }}
            </div>
          </div>
          <div>
            <span class="summary-label">当前配比</span>
            <div class="summary-amount">{{ formatPercent(bucketSummary?.currentPct || 0) }}</div>
          </div>
          <div>
            <span class="summary-label">目标配比</span>
            <div class="summary-amount">{{ formatPercent(bucketSummary?.targetPct || 0) }}</div>
          </div>
          <div>
            <span class="summary-label">昨日收益/率</span>
            <div class="summary-amount summary-combined" :class="profitClass(bucketSummary?.dailyProfit)">
              {{ formatSignedAmount(bucketSummary?.dailyProfit) }} / {{ formatSignedPercent(bucketSummary?.dailyProfitRate) }}
            </div>
          </div>
          <div>
            <span class="summary-label">偏离值</span>
            <div class="summary-amount" :class="profitClass(bucketSummary?.deviationPct)">{{ formatSignedPercent(bucketSummary?.deviationPct) }}</div>
          </div>
        </div>
      </div>

      <div v-if="!loading && distributionRows.length" class="section-card pie-section">
        <div class="pie-header">
          <div>
            <div class="pie-title">持仓金额占比分布</div>
            <div class="pie-subtitle">按当前类别下各基金的持仓总金额计算</div>
          </div>
          <div class="pie-total">¥{{ formatAmount(bucketSummary?.marketValue || 0) }}</div>
        </div>

        <div class="pie-layout">
          <div class="pie-chart-wrap">
            <div class="pie-chart" :style="{ background: pieGradient }">
              <div class="pie-hole">
                <div class="pie-hole-label">当前类别</div>
                <div class="pie-hole-value">{{ rows.length }}只</div>
              </div>
            </div>
          </div>

          <div class="pie-legend">
            <div v-for="item in distributionRows" :key="item.positionId" class="legend-item">
              <span class="legend-dot" :style="{ backgroundColor: item.color }"></span>
              <div class="legend-main">
                <div class="legend-topline">
                  <span class="legend-name">{{ item.fundName }}</span>
                  <span class="legend-pct">{{ formatPercent(item.amountPct) }}</span>
                </div>
                <div class="legend-meta">
                  <span>¥{{ formatAmount(item.marketValue) }}</span>
                  <span :class="profitClass(item.totalProfitRate)">{{ formatSignedPercent(item.totalProfitRate) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="loading" class="section-card loading-block">
        <van-loading size="20px">基金数据加载中...</van-loading>
      </div>

      <div v-else-if="rows.length" class="section-card profit-analysis-section">
        <div class="analysis-header">
          <div>
            <div class="pie-title">收益统计</div>
            <div class="pie-subtitle">选择周期后，下方基金明细同步展示该周期收益</div>
          </div>
          <div class="analysis-total" :class="profitClass(selectedPeriodRow?.profit)">
            <span>{{ activePeriodLabel }}收益</span>
            <strong>{{ selectedPeriodRow ? formatSignedAmount(selectedPeriodRow.profit) : '--' }}</strong>
            <small>{{ selectedPeriodRow ? formatSignedPercent(selectedPeriodRow.profitRate) : '--' }}</small>
          </div>
        </div>

        <div class="period-tabs" role="tablist" aria-label="收益统计周期">
          <button v-for="option in periodOptions" :key="option.value" type="button" class="period-tab" :class="{ active: activePeriod === option.value }" @click="activePeriod = option.value">
            {{ option.label }}
          </button>
        </div>

        <AllocationBucketProfitCalendar
          v-if="activePeriod === 'day' && calendarSeries.length"
          :series="calendarSeries"
          summary-label="当日收益"
          :formatter="formatSignedAmount"
          @select="handleCalendarSelect"
        />

        <div v-else-if="selectedPeriodRow" class="period-navigator">
          <button type="button" :disabled="selectedPeriodIndex <= 0" @click="selectAdjacentPeriod(-1)">‹</button>
          <div>
            <strong>{{ selectedPeriodRow.label }}</strong>
            <span>{{ selectedPeriodRow.startDate }} 至 {{ selectedPeriodRow.endDate }}</span>
          </div>
          <button type="button" :disabled="selectedPeriodIndex >= profitPeriodRows.length - 1" @click="selectAdjacentPeriod(1)">›</button>
        </div>

        <div class="fund-detail-header">
          <div>
            <strong>{{ activePeriodLabel }}收益明细</strong>
            <span>{{ selectedPeriodRow?.label || '暂无周期数据' }}</span>
          </div>
          <span>共 {{ selectedFundRows.length }} 只</span>
        </div>

        <div class="period-fund-list">
          <button v-for="item in selectedFundRows" :key="item.positionId" type="button" class="period-fund-row" @click="openPositionDetail(item.positionId)">
            <div class="period-fund-main">
              <div class="fund-name">{{ item.position?.fund_name || item.periodFund?.fundName || '未知基金' }}</div>
              <div class="fund-owner">{{ getPositionOwnerText(item.position) }}</div>
              <div class="fund-tags compact-tags">
                <span class="tag bucket-tag">{{ bucketLabel }}</span>
                <span class="tag status-tag">{{ item.status }}</span>
              </div>
            </div>
            <div class="period-fund-profit" :class="profitClass(item.periodFund?.profit)">
              <strong>{{ item.periodFund ? formatSignedAmount(item.periodFund.profit) : '--' }}</strong>
              <span>{{ item.periodFund ? formatSignedPercent(item.periodFund.profitRate) : '--' }}</span>
              <small>市值 ¥{{ formatAmount(item.marketValue) }}</small>
            </div>
          </button>
        </div>
      </div>

      <div v-else class="section-card">
        <van-empty description="当前类别还没有纳入基金" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { positionApi } from '../api'
import {
  ALLOCATION_ASSET_TYPE_LABELS,
  buildAllocationBucketProfitPeriods,
  buildAllocationProfileSummary,
  getAllocationPositionOwnerText,
} from '../utils/allocation'
import { fetchAllocationProfiles, loadAllocationProfiles } from '../utils/allocationStorage'
import { fetchProfitSnapshots, getProfitSnapshots } from '../utils/profitLedger'
import { formatAmount, formatSignedAmount, formatPercent, profitClass } from '../utils/formatters'
import AllocationBucketProfitCalendar from '../components/AllocationBucketProfitCalendar.vue'

const route = useRoute()
const router = useRouter()

const profiles = ref(loadAllocationProfiles())
const positions = ref([])
const loading = ref(false)
const profitSnapshots = ref(getProfitSnapshots())
const activePeriod = ref('day')
const selectedPeriodKey = ref('')
const periodOptions = [
  { label: '日', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '年', value: 'year' },
]
const PIE_COLORS = ['#4f46e5', '#0ea5e9', '#14b8a6', '#f97316', '#ef4444', '#a855f7', '#22c55e', '#f59e0b']

const profileId = computed(() => String(route.params.profileId || ''))
const assetType = computed(() => String(route.params.assetType || ''))
const currentProfile = computed(() => profiles.value.find(item => item.id === profileId.value) || null)
const bucketLabel = computed(() => ALLOCATION_ASSET_TYPE_LABELS[assetType.value] || '当前分类')
const summary = computed(() => {
  if (!currentProfile.value) return null
  return buildAllocationProfileSummary({ profile: currentProfile.value, positions: positions.value, allProfiles: profiles.value })
})
const bucketSummary = computed(() => summary.value?.bucketSummaries?.find(item => item.assetType === assetType.value) || null)
const rows = computed(() => bucketSummary.value?.funds || [])
const distributionRows = computed(() => (bucketSummary.value?.holdingDistribution || []).map((item, index) => ({
  ...item,
  color: PIE_COLORS[index % PIE_COLORS.length],
})))
const pieGradient = computed(() => {
  if (!distributionRows.value.length) return '#e5e7eb'
  let start = 0
  const segments = distributionRows.value.map(item => {
    const end = Number((start + item.amountPct).toFixed(2))
    const segment = `${item.color} ${start}% ${end}%`
    start = end
    return segment
  })
  return `conic-gradient(${segments.join(', ')})`
})
const profitPeriodRows = computed(() => {
  if (!currentProfile.value || !assetType.value) return []
  return buildAllocationBucketProfitPeriods({
    profile: currentProfile.value,
    snapshots: profitSnapshots.value,
    assetType: assetType.value,
    period: activePeriod.value,
  })
})
const selectedPeriodIndex = computed(() => profitPeriodRows.value.findIndex(item => item.key === selectedPeriodKey.value))
const selectedPeriodRow = computed(() => profitPeriodRows.value.find(item => item.key === selectedPeriodKey.value) || profitPeriodRows.value.at(-1) || null)
const activePeriodLabel = computed(() => periodOptions.find(item => item.value === activePeriod.value)?.label || '日')
const calendarSeries = computed(() => profitPeriodRows.value.length ? [{
  key: assetType.value,
  assetType: assetType.value,
  label: bucketLabel.value,
  points: profitPeriodRows.value.map(row => ({ key: row.key, date: row.key, value: row.profit, raw: row })),
}] : [])
const selectedFundRows = computed(() => {
  const periodFundMap = new Map((selectedPeriodRow.value?.funds || []).map(fund => [fund.positionId, fund]))
  return rows.value.map(item => ({ ...item, periodFund: periodFundMap.get(item.positionId) || null }))
    .sort((a, b) => Math.abs(b.periodFund?.profit || 0) - Math.abs(a.periodFund?.profit || 0))
})

function formatSignedPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
  const num = Number(value) || 0
  const prefix = num > 0 ? '+' : ''
  return `${prefix}${formatPercent(num)}`
}

function getPositionOwnerText(position) {
  return getAllocationPositionOwnerText(position)
}

async function fetchPositions() {
  loading.value = true
  try {
    const data = await positionApi.list()
    if (Array.isArray(data)) {
      positions.value = data
    } else if (Array.isArray(data?.positions)) {
      positions.value = data.positions
    } else {
      positions.value = []
    }
  } catch (error) {
    showToast(`持仓加载失败：${error.message || '网络错误'}`)
  } finally {
    loading.value = false
  }
}

function openPositionDetail(positionId) {
  router.push(`/positions/${positionId}`)
}

function handleCalendarSelect(row) {
  if (row?.key) selectedPeriodKey.value = row.key
}

function selectAdjacentPeriod(offset) {
  const next = profitPeriodRows.value[selectedPeriodIndex.value + offset]
  if (next) selectedPeriodKey.value = next.key
}

watch([activePeriod, profitPeriodRows], ([, periods]) => {
  if (!periods.some(item => item.key === selectedPeriodKey.value)) selectedPeriodKey.value = periods.at(-1)?.key || ''
}, { immediate: true })

onMounted(async () => {
  try { profitSnapshots.value = await fetchProfitSnapshots() } catch (error) { showToast(`历史收益同步失败：${error.message || '网络错误'}`) }
  try { profiles.value = await fetchAllocationProfiles() } catch (error) { showToast(`策略同步失败：${error.message || '网络错误'}`) }
  await fetchPositions()
})
</script>

<style scoped>
.bucket-holdings-page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: 16px 16px calc(var(--app-tabbar-space) + 20px);
}

.header-card,
.section-card {
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.header-card,
.section-card {
  padding: 16px;
  margin-bottom: 16px;
}

.back-button {
  border: none;
  background: transparent;
  color: #4f46e5;
  font-size: 14px;
  font-weight: 700;
  padding: 0;
}

.page-title {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}

.page-subtitle,
.summary-label,
.fund-owner {
  color: #6b7280;
  font-size: 12px;
}

.page-subtitle {
  margin-top: 8px;
}

.summary-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.summary-value {
  margin-top: 6px;
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.summary-badge,
.tag {
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.summary-badge {
  background: #eef2ff;
  color: #4338ca;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.summary-amount,
.fund-name {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.fund-owner {
  margin-top: 4px;
}

.fund-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.bucket-tag {
  background: #ede9fe;
  color: #6d28d9;
}

.status-tag {
  background: #ecfeff;
  color: #155e75;
}

.loading-block {
  display: flex;
  justify-content: center;
}

.pie-section {
  overflow: hidden;
  padding: 12px;
}

.pie-header,
.legend-topline,
.legend-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}
.pie-title,
.summary-amount,
.legend-pct,
.legend-name,
.pie-total,
.pie-hole-value {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.summary-combined {
  font-size: 16px;
  line-height: 1.35;
  white-space: nowrap;
}

.pie-subtitle,
.pie-hole-label,
.legend-meta {
  font-size: 11px;
  color: #6b7280;
}

.pie-subtitle {
  margin-top: 4px;
}

.pie-layout {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.pie-chart-wrap {
  display: flex;
  justify-content: center;
}

.pie-chart {
  width: 132px;
  height: 132px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45);
}

.pie-hole {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}

.pie-legend {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 7px 9px;
  border-radius: 10px;
  background: #f8fafc;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
}

.legend-main {
  flex: 1;
  min-width: 0;
}

.legend-name {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
}

.legend-meta {
  margin-top: 3px;
}

.profit-analysis-section {
  padding: 14px;
}

.analysis-header,
.fund-detail-header,
.period-fund-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.analysis-header {
  align-items: flex-start;
}

.analysis-total {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.analysis-total span,
.analysis-total small,
.fund-detail-header span,
.period-navigator span,
.period-fund-profit small {
  font-size: 11px;
  color: #64748b;
}

.analysis-total strong {
  font-size: 18px;
}

.period-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  margin: 14px 0 12px;
  border-radius: 12px;
  background: #f1f5f9;
}

.period-tab {
  height: 34px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: #64748b;
  font-size: 14px;
  font-weight: 700;
}

.period-tab.active {
  color: #2563eb;
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}

.period-navigator {
  min-height: 92px;
  display: grid;
  grid-template-columns: 38px 1fr 38px;
  gap: 8px;
  align-items: center;
  padding: 12px;
  border-radius: 14px;
  background: #f8fbff;
}

.period-navigator button {
  height: 38px;
  border: none;
  border-radius: 10px;
  background: #fff;
  color: #475569;
  font-size: 22px;
}

.period-navigator button:disabled {
  opacity: 0.35;
}

.period-navigator div {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  text-align: center;
}

.fund-detail-header {
  align-items: center;
  margin-top: 16px;
  padding: 0 2px 10px;
  border-bottom: 1px solid #eef2f7;
}

.fund-detail-header div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.period-fund-list {
  display: flex;
  flex-direction: column;
}

.period-fund-row {
  width: 100%;
  align-items: center;
  padding: 13px 2px;
  border: none;
  border-bottom: 1px solid #f1f5f9;
  background: transparent;
  text-align: left;
}

.period-fund-row:last-child {
  border-bottom: none;
  padding-bottom: 2px;
}

.period-fund-main {
  min-width: 0;
  flex: 1;
}

.period-fund-main .fund-name {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.35;
}

.compact-tags {
  margin-top: 6px;
  gap: 5px;
}

.compact-tags .tag {
  padding: 3px 7px;
  font-size: 10px;
}

.period-fund-profit {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.period-fund-profit strong {
  font-size: 16px;
}

.period-fund-profit span {
  font-size: 13px;
  font-weight: 700;
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
</style>
