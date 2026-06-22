<template>
  <div class="position-detail-page">
    <van-nav-bar
      left-arrow
      title="基金详情"
      fixed
      placeholder
      @click-left="handleBack"
    />

    <div v-if="position" class="hero-card">
      <div class="hero-top">
        <div>
          <div class="hero-name">{{ position.fund_name || '未知基金' }}</div>
          <div class="hero-code">{{ position.fund_code }}</div>
        </div>
        <div class="hero-nav">
          <div class="hero-nav-value">{{ latestNavText }}</div>
          <div class="hero-nav-date">{{ position.nav_jzrq || '净值日期待更新' }}</div>
        </div>
      </div>

      <div class="hero-tags">
        <span v-if="position.member_name" class="hero-tag member">{{ position.member_emoji }} {{ position.member_name }}</span>
        <span v-if="position.account_name" class="hero-tag account">{{ position.account_name }}</span>
      </div>

      <div class="hero-metrics">
        <div class="hero-metric">
          <span class="metric-label">当前总额</span>
          <span class="metric-value neutral">{{ formatCurrencyValue(currentMarketValue) }}</span>
        </div>
        <div class="hero-metric">
          <span class="metric-label">持有收益</span>
          <span class="metric-value" :class="profitClass(position.current_profit)">{{ formatSignedAmount(position.current_profit) }}</span>
        </div>
        <div class="hero-metric">
          <span class="metric-label">持有收益率</span>
          <span class="metric-value" :class="profitClass(position.profit_rate)">{{ formatSignedPercent(position.profit_rate) }}</span>
        </div>
        <div class="hero-metric">
          <span class="metric-label">{{ position.daily_profit_label || '昨日收益' }}</span>
          <span class="metric-value" :class="profitClass(position.daily_profit)">{{ formatSignedAmount(position.daily_profit) }}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">📈 收益曲线</div>
          <div class="section-subtitle">按你的实际持仓快照展示该基金收益变化</div>
        </div>
      </div>

      <div class="chip-row">
        <button
          v-for="item in positionRangeOptions"
          :key="item.value"
          class="pill-chip small"
          :class="{ active: positionRange === item.value }"
          @click="positionRange = item.value"
        >
          {{ item.text }}
        </button>
      </div>

      <TrendChart
        :points="positionTrendPoints"
        summary-label="所选日期持有收益"
        :formatter="formatCurrencyValue"
        :y-axis-formatter="formatCompactAmount"
        @select="handlePositionTrendSelect"
      />

      <div v-if="selectedPositionTrendRow" class="metrics-grid">
        <div class="metric-card">
          <span class="metric-label">日期</span>
          <span class="metric-value neutral">{{ selectedPositionTrendRow.date }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">总金额</span>
          <span class="metric-value neutral">{{ formatCurrencyValue(selectedPositionTrendRow.market_value) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">持有收益</span>
          <span class="metric-value" :class="profitClass(selectedPositionTrendRow.total_profit)">{{ formatSignedAmount(selectedPositionTrendRow.total_profit) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">持有收益率</span>
          <span class="metric-value" :class="profitClass(selectedPositionTrendRow.total_profit_rate)">{{ formatSignedPercent(selectedPositionTrendRow.total_profit_rate) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">当日收益</span>
          <span class="metric-value" :class="profitClass(selectedPositionTrendRow.daily_profit)">{{ formatSignedAmount(selectedPositionTrendRow.daily_profit) }}</span>
        </div>
      </div>

      <van-empty v-if="!positionTrendPoints.length && !loading" description="历史快照还不够，先在统计页多刷新几次积累数据" />
    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">🧭 业绩走势</div>
          <div class="section-subtitle">数据来源：东方财富历史净值</div>
        </div>
      </div>

      <div class="chip-row">
        <button
          v-for="item in fundRangeOptions"
          :key="item.value"
          class="pill-chip small"
          :class="{ active: fundRange === item.value }"
          @click="fundRange = item.value"
        >
          {{ item.text }}
        </button>
      </div>

      <TrendChart
        :points="fundReturnPoints"
        summary-label="所选区间累计涨跌幅"
        :formatter="formatSignedPercent"
        :y-axis-formatter="formatAxisPercent"
        @select="handleFundTrendSelect"
      />

      <div v-if="selectedFundTrendRow" class="metrics-grid">
        <div class="metric-card">
          <span class="metric-label">净值日期</span>
          <span class="metric-value neutral">{{ selectedFundTrendRow.date }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">单位净值</span>
          <span class="metric-value neutral">{{ Number(selectedFundTrendRow.nav || 0).toFixed(4) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">当日涨跌幅</span>
          <span class="metric-value" :class="profitClass(selectedFundTrendRow.daily_return_pct)">{{ formatSignedPercent(selectedFundTrendRow.daily_return_pct) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">区间累计涨跌幅</span>
          <span class="metric-value" :class="profitClass(selectedFundTrendRow.cumulative_return_pct)">{{ formatSignedPercent(selectedFundTrendRow.cumulative_return_pct) }}</span>
        </div>
      </div>

      <van-loading v-if="detailLoading" type="spinner" class="loading" />
      <van-empty v-else-if="!fundReturnPoints.length && !loading" description="暂未拉到该基金历史业绩数据" />
    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">📊 历史业绩统计</div>
          <div class="section-subtitle">参考支付宝详情页，先展示核心区间表现</div>
        </div>
      </div>

      <div v-if="performanceStats.length" class="perf-table">
        <div class="perf-head perf-grid">
          <span>时间区间</span>
          <span>涨跌幅</span>
          <span>起止时间</span>
        </div>
        <div class="perf-body">
          <div v-for="item in performanceStats" :key="item.key" class="perf-row perf-grid">
            <span class="perf-label">{{ item.label }}</span>
            <span class="perf-value" :class="profitClass(item.return_pct)">{{ item.return_pct === null ? '--' : formatSignedPercent(item.return_pct) }}</span>
            <span class="perf-date">{{ item.start_date && item.end_date ? `${item.start_date} ~ ${item.end_date}` : '--' }}</span>
          </div>
        </div>
      </div>
      <van-empty v-else-if="!detailLoading" description="暂无历史业绩统计数据" />
    </div>

    <van-loading v-if="loading" type="spinner" class="loading page-loading" />
  </div>
</template>

<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import TrendChart from '../components/TrendChart.vue'
import { fundApi, positionApi } from '../api'
import { formatAmount, formatPercent, formatSignedAmount, profitClass } from '../utils/formatters'
import { getProfitSnapshots } from '../utils/profitLedger'
import {
  buildFundReturnChartPoints,
  buildPositionDetailRows,
  buildPositionTrendPoints,
  filterFundDetailRange,
} from '../utils/fundDetail'
import { setAppTabbarVisible } from '../utils/appShell'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const detailLoading = ref(false)
const position = ref(null)
const snapshots = ref([])
const fundDetail = ref(null)
const positionRange = ref('1y')
const fundRange = ref('1y')
const selectedPositionTrendRow = ref(null)
const selectedFundTrendRow = ref(null)

const positionRangeOptions = [
  { text: '近1月', value: '1m' },
  { text: '近3月', value: '3m' },
  { text: '近6月', value: '6m' },
  { text: '近1年', value: '1y' },
  { text: '全部', value: 'all' },
]

const fundRangeOptions = [
  { text: '近1月', value: '1m' },
  { text: '近3月', value: '3m' },
  { text: '近6月', value: '6m' },
  { text: '近1年', value: '1y' },
  { text: '近3年', value: '3y' },
  { text: '全部', value: 'all' },
]

const currentMarketValue = computed(() => Number((Number(position.value?.cost || 0) + Number(position.value?.current_profit || 0)).toFixed(2)))
const latestNavText = computed(() => {
  const nav = position.value?.nav_gsz ?? position.value?.nav_dwjz
  if (nav === null || nav === undefined || Number.isNaN(Number(nav))) return '--'
  return Number(nav).toFixed(4)
})

const positionRowsAll = computed(() => buildPositionDetailRows(snapshots.value, {
  positionId: position.value?.id || String(route.params.id || ''),
  fundCode: position.value?.fund_code || '',
  accountId: position.value?.account_id || '',
}))
const positionRows = computed(() => filterFundDetailRange(positionRowsAll.value, positionRange.value))
const positionTrendPoints = computed(() => buildPositionTrendPoints(positionRows.value, { metric: 'total_profit' }))

const fundTrendRowsAll = computed(() => fundDetail.value?.net_worth_trend || [])
const fundTrendRows = computed(() => filterFundDetailRange(fundTrendRowsAll.value, fundRange.value))
const fundReturnPoints = computed(() => buildFundReturnChartPoints(fundTrendRows.value))
const performanceStats = computed(() => fundDetail.value?.performance_stats || [])

const formatSignedPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
  const num = Number(value) || 0
  const prefix = num > 0 ? '+' : ''
  return `${prefix}${formatPercent(num)}`
}

const formatCurrencyValue = (value) => `¥${formatAmount(value)}`

const formatCompactAmount = (value) => {
  const num = Number(value) || 0
  if (Math.abs(num) >= 10000) return `¥${(num / 10000).toFixed(1)}万`
  return `¥${formatAmount(num)}`
}

const formatAxisPercent = (value) => `${Number(value || 0).toFixed(1)}%`

const handleBack = () => {
  router.back()
}

const handlePositionTrendSelect = (row) => {
  selectedPositionTrendRow.value = row
}

const handleFundTrendSelect = (row) => {
  selectedFundTrendRow.value = row
}

const loadPosition = async () => {
  const id = String(route.params.id || '')
  if (!id) return
  position.value = await positionApi.get(id)
}

const loadFundDetail = async (fundCode) => {
  if (!fundCode) {
    fundDetail.value = null
    return
  }
  detailLoading.value = true
  try {
    fundDetail.value = await fundApi.detail(fundCode)
  } catch (error) {
    console.error('Failed to fetch fund detail:', error)
    fundDetail.value = null
    showToast('基金历史业绩加载失败')
  } finally {
    detailLoading.value = false
  }
}

const fetchData = async () => {
  loading.value = true
  try {
    await loadPosition()
    snapshots.value = getProfitSnapshots()
    await loadFundDetail(position.value?.fund_code)
  } catch (error) {
    console.error('Failed to fetch position detail:', error)
    showToast('基金详情加载失败')
  } finally {
    loading.value = false
  }
}

watch(positionRows, (rows) => {
  selectedPositionTrendRow.value = rows.at(-1) || null
}, { immediate: true })

watch(fundTrendRows, (rows) => {
  selectedFundTrendRow.value = rows.at(-1) || null
}, { immediate: true })

onMounted(() => {
  setAppTabbarVisible(false)
  fetchData()
})

onActivated(() => {
  setAppTabbarVisible(false)
})

onBeforeUnmount(() => {
  setAppTabbarVisible(true)
})

onDeactivated(() => {
  setAppTabbarVisible(true)
})
</script>

<style scoped>
.position-detail-page {
  min-height: 100vh;
  background: #f5f7fb;
  padding-bottom: 28px;
}

.hero-card {
  margin: 12px;
  padding: 18px 16px;
  border-radius: 18px;
  color: #fff;
  background: linear-gradient(135deg, #1e80ff 0%, #3b5bdb 100%);
  box-shadow: 0 14px 28px rgba(30, 128, 255, 0.18);
}

.hero-top,
.section-header,
.perf-grid {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.hero-name {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.4;
}

.hero-code,
.hero-nav-date {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.88;
}

.hero-nav {
  text-align: right;
}

.hero-nav-value {
  font-size: 22px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.hero-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.hero-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
}

.hero-tag.member {
  background: rgba(255, 255, 255, 0.18);
}

.hero-tag.account {
  background: rgba(15, 23, 42, 0.16);
}

.hero-metrics,
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.hero-metrics {
  margin-top: 16px;
}

.hero-metric,
.metric-card {
  border-radius: 14px;
  padding: 12px;
}

.hero-metric {
  background: rgba(255, 255, 255, 0.14);
}

.metric-card {
  background: #f8fbff;
}

.metric-label,
.section-subtitle {
  font-size: 12px;
  color: #8a94a6;
}

.metric-value {
  display: block;
  margin-top: 6px;
  font-size: 16px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.metric-value.neutral {
  color: #1f2937;
}

.section {
  margin: 12px;
  padding: 16px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
}

.chip-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 14px 0;
}

.pill-chip {
  border: none;
  border-radius: 999px;
  padding: 7px 14px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 13px;
}

.pill-chip.small {
  padding: 6px 12px;
}

.pill-chip.active {
  background: #1e80ff;
  color: #fff;
}

.perf-table {
  margin-top: 8px;
}

.perf-head,
.perf-row {
  padding: 12px 4px;
}

.perf-head {
  color: #94a3b8;
  font-size: 12px;
  border-bottom: 1px solid #eef2f7;
}

.perf-row {
  align-items: center;
  border-bottom: 1px solid #f5f7fb;
}

.perf-label {
  font-weight: 600;
  color: #1f2937;
}

.perf-value {
  text-align: center;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.perf-date {
  text-align: right;
  font-size: 12px;
  color: #64748b;
}

.loading {
  display: block;
  margin: 20px auto;
}

.page-loading {
  margin-top: 48px;
}
</style>
