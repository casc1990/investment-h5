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

      <div v-if="bucketTrendSeries.length" class="section-card">
        <div class="pie-header">
          <div>
            <div class="pie-title">当前类别每日收益统计</div>
            <div class="pie-subtitle">仅展示 {{ bucketLabel }} 的每日收益统计日历</div>
          </div>
        </div>
        <AllocationBucketProfitCalendar
          :series="bucketTrendSeries"
          summary-label="每日收益统计"
          :formatter="formatSignedAmount"
        />
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

      <div v-else-if="rows.length" class="list-wrap">
        <button
          v-for="item in rows"
          :key="item.positionId"
          type="button"
          class="fund-card"
          @click="openPositionDetail(item.positionId)"
        >
          <div class="fund-topline">
            <div>
              <div class="fund-name">{{ item.position?.fund_name || '未知基金' }}</div>
              <div class="fund-owner">{{ getPositionOwnerText(item.position) }}</div>
              <div class="fund-meta">基金代码：{{ item.position?.fund_code || '--' }}</div>
            </div>
            <div class="fund-amount">¥{{ formatAmount(item.marketValue) }}</div>
          </div>

          <div class="fund-tags">
            <span class="tag bucket-tag">{{ bucketLabel }}</span>
            <span class="tag status-tag">{{ item.status }}</span>
          </div>

          <div class="metrics-grid">
            <div class="metric-card">
              <span class="metric-label">日收益</span>
              <span class="metric-value" :class="profitClass(item.position?.daily_profit)">{{ formatSignedAmount(item.position?.daily_profit) }}</span>
            </div>
            <div class="metric-card">
              <span class="metric-label">日收益率</span>
              <span class="metric-value" :class="profitClass(item.position?.daily_profit_rate)">{{ formatSignedPercent(item.position?.daily_profit_rate) }}</span>
            </div>
            <div class="metric-card">
              <span class="metric-label">周收益</span>
              <span class="metric-value" :class="profitClass(item.weeklyReturnPct)">{{ formatSignedPercent(item.weeklyReturnPct) }}</span>
            </div>
            <div class="metric-card">
              <span class="metric-label">月收益</span>
              <span class="metric-value" :class="profitClass(item.monthlyReturnPct)">{{ formatSignedPercent(item.monthlyReturnPct) }}</span>
            </div>
          </div>
        </button>
      </div>

      <div v-else class="section-card">
        <van-empty description="当前类别还没有纳入基金" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { fundApi, positionApi } from '../api'
import {
  ALLOCATION_ASSET_TYPE_LABELS,
  buildAllocationBucketDailyProfitTrend,
  buildAllocationProfileSummary,
  getAllocationPositionOwnerText,
} from '../utils/allocation'
import { buildFundPerformanceMap } from '../utils/fundPerformance'
import { loadAllocationProfiles } from '../utils/allocationStorage'
import { getProfitSnapshots } from '../utils/profitLedger'
import { formatAmount, formatSignedAmount, formatPercent, profitClass } from '../utils/formatters'
import AllocationBucketProfitCalendar from '../components/AllocationBucketProfitCalendar.vue'

const route = useRoute()
const router = useRouter()

const profiles = ref(loadAllocationProfiles())
const positions = ref([])
const loading = ref(false)
const performanceMap = ref({})
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
const rows = computed(() => (bucketSummary.value?.funds || []).map(item => ({
  ...item,
  weeklyReturnPct: performanceMap.value[item.position?.fund_code]?.weeklyReturnPct ?? null,
  monthlyReturnPct: performanceMap.value[item.position?.fund_code]?.monthlyReturnPct ?? null,
})))
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
const bucketTrendSeries = computed(() => {
  if (!currentProfile.value || !assetType.value) return []
  return buildAllocationBucketDailyProfitTrend({
    profile: currentProfile.value,
    snapshots: getProfitSnapshots(),
    assetTypes: [assetType.value],
  })
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

async function fetchPerformance() {
  const codes = [...new Set((bucketSummary.value?.funds || []).map(item => item.position?.fund_code).filter(Boolean))]
  performanceMap.value = await buildFundPerformanceMap(codes, fundApi.detail)
}

function openPositionDetail(positionId) {
  router.push(`/positions/${positionId}`)
}

onMounted(async () => {
  await fetchPositions()
  await fetchPerformance()
})
</script>

<style scoped>
.bucket-holdings-page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: 16px 16px calc(var(--app-tabbar-space) + 20px);
}

.header-card,
.section-card,
.fund-card {
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
.metric-label,
.fund-owner,
.fund-meta {
  color: #6b7280;
  font-size: 12px;
}

.page-subtitle {
  margin-top: 8px;
}

.summary-top,
.fund-topline {
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

.summary-grid,
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.summary-amount,
.metric-value,
.fund-name,
.fund-amount {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.fund-amount {
  color: #4f46e5;
  white-space: nowrap;
}

.list-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fund-card {
  border: none;
  display: block;
  width: 100%;
  padding: 14px;
  text-align: left;
}

.fund-owner {
  margin-top: 6px;
}

.fund-meta {
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

.metric-card {
  padding: 12px;
  border-radius: 14px;
  background: #f8fafc;
}

.metric-value {
  display: block;
  margin-top: 6px;
}

.loading-block {
  display: flex;
  justify-content: center;
}

.pie-section {
  overflow: hidden;
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
.fund-amount,
.legend-pct,
.legend-name,
.pie-total,
.pie-hole-value {
  font-size: 18px;
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
  font-size: 12px;
  color: #6b7280;
}

.pie-subtitle {
  margin-top: 4px;
}

.pie-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.pie-chart-wrap {
  display: flex;
  justify-content: center;
}

.pie-chart {
  width: 190px;
  height: 190px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45);
}

.pie-hole {
  width: 96px;
  height: 96px;
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
  gap: 10px;
}

.legend-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 14px;
  background: #f8fafc;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 6px;
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
  margin-top: 6px;
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
