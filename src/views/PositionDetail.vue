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
        <div class="hero-identity">
          <div class="hero-name">{{ position.fund_name || '未知基金' }}</div>
          <div class="hero-meta-line">
            <span class="hero-code">{{ position.fund_code }}</span>
            <span v-if="position.member_name" class="hero-tag member">{{ position.member_emoji }} {{ position.member_name }}</span>
            <span v-if="position.account_name" class="hero-tag account">{{ position.account_name }}</span>
          </div>
        </div>
        <div class="hero-nav">
          <div class="hero-nav-caption">最新净值</div>
          <div class="hero-nav-value">{{ latestNavText }}</div>
          <div class="hero-nav-date">{{ position.nav_jzrq || '净值日期待更新' }}</div>
        </div>
      </div>

      <div class="hero-primary">
        <div class="hero-primary-main">
          <div class="hero-primary-label">当前总额</div>
          <div class="hero-primary-value" :class="profitClass(position.profit_rate)">{{ formatCurrencyValue(currentMarketValue) }}</div>
        </div>
        <div class="hero-primary-side">
          <div class="hero-side-label">持有收益</div>
          <div class="hero-side-value" :class="profitClass(position.current_profit)">{{ formatSignedAmount(position.current_profit) }}</div>
        </div>
      </div>

      <div class="hero-metrics hero-metrics-compact">
        <div class="hero-metric compact">
          <span class="metric-label">{{ position.daily_profit_label || '昨日收益' }}</span>
          <span class="metric-value" :class="profitClass(position.daily_profit)">{{ formatSignedAmount(position.daily_profit) }}</span>
        </div>
        <div class="hero-metric compact">
          <span class="metric-label">持有收益率</span>
          <span class="metric-value" :class="profitClass(position.profit_rate)">{{ formatSignedPercent(position.profit_rate) }}</span>
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

      <div class="section-tabs">
        <button class="section-tab" :class="{ active: positionTrendTab === 'daily' }" @click="positionTrendTab = 'daily'">每日收益</button>
        <button class="section-tab" :class="{ active: positionTrendTab === 'cumulative' }" @click="positionTrendTab = 'cumulative'">累计收益</button>
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
        :summary-label="positionTrendSummaryLabel"
        :formatter="positionTrendFormatter"
        :y-axis-formatter="positionTrendAxisFormatter"
        :show-zero-baseline="positionTrendTab === 'daily'"
        :show-point-markers="false"
        @select="handlePositionTrendSelect"
      />

      <div v-if="positionRowForDisplay" class="trend-metrics-strip">
        <div class="trend-metric-chip">
          <span class="trend-chip-label">日期</span>
          <span class="trend-chip-value neutral">{{ positionRowForDisplay.date }}</span>
        </div>
        <div v-if="positionRowForDisplay.nav" class="trend-metric-chip">
          <span class="trend-chip-label">净值</span>
          <span class="trend-chip-value neutral">{{ Number(positionRowForDisplay.nav).toFixed(4) }}</span>
        </div>
        <template v-if="positionTrendTab === 'daily'">
          <div class="trend-metric-chip">
            <span class="trend-chip-label">当日收益</span>
            <span class="trend-chip-value" :class="profitClass(positionRowForDisplay.adjusted_daily_profit ?? positionRowForDisplay.daily_profit)">{{ formatSignedAmount(positionRowForDisplay.adjusted_daily_profit ?? positionRowForDisplay.daily_profit) }}</span>
          </div>
          <div class="trend-metric-chip">
            <span class="trend-chip-label">持有收益</span>
            <span class="trend-chip-value" :class="profitClass(positionRowForDisplay.adjusted_total_profit ?? positionRowForDisplay.total_profit)">{{ formatSignedAmount(positionRowForDisplay.adjusted_total_profit ?? positionRowForDisplay.total_profit) }}</span>
          </div>
        </template>
        <template v-else>
          <div class="trend-metric-chip">
            <span class="trend-chip-label">累计收益</span>
            <span class="trend-chip-value" :class="profitClass(positionRowForDisplay.adjusted_total_profit ?? positionRowForDisplay.total_profit)">{{ formatSignedAmount(positionRowForDisplay.adjusted_total_profit ?? positionRowForDisplay.total_profit) }}</span>
          </div>
          <div class="trend-metric-chip">
            <span class="trend-chip-label">持有收益率</span>
            <span class="trend-chip-value" :class="profitClass(positionRowForDisplay.adjusted_total_profit_rate ?? positionRowForDisplay.total_profit_rate)">{{ formatSignedPercent(positionRowForDisplay.adjusted_total_profit_rate ?? positionRowForDisplay.total_profit_rate) }}</span>
          </div>
        </template>
        <div v-if="positionRowForDisplay.has_dividend" class="trend-metric-chip dividend-chip">
          <span class="trend-chip-label">💰 分红</span>
          <span class="trend-chip-value neutral">每份 {{ positionRowForDisplay.dividend_per_share }} 元</span>
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
        summary-label="所选周期涨跌幅"
        :formatter="formatSignedPercent"
        :y-axis-formatter="formatAxisPercent"
        :show-point-markers="false"
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
          <span class="metric-label">周期涨跌幅</span>
          <span class="metric-value" :class="profitClass(selectedFundTrendRow.period_return_pct)">{{ formatSignedPercent(selectedFundTrendRow.period_return_pct) }}</span>
        </div>
      </div>

      <van-loading v-if="detailLoading" type="spinner" class="loading" />
      <van-empty v-else-if="!fundReturnPoints.length && !loading" description="暂未拉到该基金历史业绩数据" />
    </div>

    <div class="section history-section">
      <div class="section-header">
        <div>
          <div class="section-title">📊 历史业绩统计</div>
          <div class="section-subtitle">阶段表现与最近30个净值记录</div>
        </div>
      </div>

      <div class="history-tabs">
        <button class="history-tab" :class="{ active: historyTab === 'period' }" @click="historyTab = 'period'">阶段涨幅</button>
        <button class="history-tab" :class="{ active: historyTab === 'nav' }" @click="historyTab = 'nav'">历史净值</button>
      </div>

      <template v-if="historyTab === 'period'">
        <div v-if="performanceStats.length" class="perf-table screenshot-style">
          <div class="perf-head perf-grid perf-grid-period">
            <span>时间区间</span>
            <span>涨跌幅</span>
            <span>起止时间</span>
          </div>
          <div class="perf-body">
            <div v-for="item in performanceStats" :key="item.key" class="perf-row perf-grid perf-grid-period">
              <span class="perf-label">{{ item.label }}</span>
              <span class="perf-value" :class="profitClass(item.return_pct)">{{ item.return_pct === null ? '--' : formatSignedPercent(item.return_pct) }}</span>
              <span class="perf-date">{{ item.start_date && item.end_date ? `${item.start_date} ~ ${item.end_date}` : '--' }}</span>
            </div>
          </div>
        </div>
        <van-empty v-else-if="!detailLoading" description="暂无阶段涨幅数据" />
      </template>

      <template v-else>
        <div v-if="recentFundNavRows.length" class="perf-table screenshot-style">
          <div class="history-hint">仅展示最近30天净值</div>
          <div class="perf-head perf-grid perf-grid-nav">
            <span>日期</span>
            <span>单位净值</span>
            <span>日涨跌幅</span>
          </div>
          <div class="perf-body">
            <div v-for="item in recentFundNavRows" :key="item.date" class="perf-row perf-grid perf-grid-nav">
              <span class="perf-label">{{ item.date }}</span>
              <span class="perf-nav">{{ Number(item.nav || 0).toFixed(4) }}</span>
              <span class="perf-value" :class="profitClass(item.daily_return_pct)">{{ formatSignedPercent(item.daily_return_pct) }}</span>
            </div>
          </div>
        </div>
        <van-empty v-else-if="!detailLoading" description="暂无历史净值数据" />
      </template>
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
import { fetchProfitSnapshots, getProfitSnapshots } from '../utils/profitLedger'
import {
  buildFundReturnChartPoints,
  buildRecentFundNavRows,
  buildPositionDetailRows,
  buildPositionRowsWithDividendAdjustments,
  buildPositionTrendPoints,
  filterFundDetailRange,
  rebuildPositionRowsFromNavHistory,
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
const positionTrendTab = ref('daily')
const selectedPositionTrendRow = ref(null)
const selectedFundTrendRow = ref(null)
const historyTab = ref('period')

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

// 从基金净值历史重建的持仓收益序列（不走旧快照，避免分红断层）
const navRebuiltRowsAll = computed(() => rebuildPositionRowsFromNavHistory(
  fundTrendRowsAll.value,
  {
    shares: position.value?.shares,
    cost: position.value?.cost,
    created_at: position.value?.created_at,
  },
  'all', // 全量，后面再按 range 过滤
))

// 旧快照链（保留作兜底 / 参考）
const positionRowsAll = computed(() => buildPositionDetailRows(snapshots.value, {
  positionId: position.value?.id || String(route.params.id || ''),
  fundCode: position.value?.fund_code || '',
  accountId: position.value?.account_id || '',
}))
const adjustedPositionRowsAll = computed(() => buildPositionRowsWithDividendAdjustments(
  positionRowsAll.value,
  fundTrendRowsAll.value,
))

// 图表用净值历史重建路径；旧快照链仅在没拿到净值历史时兜底
const effectivePositionRowsAll = computed(() => {
  const navRows = navRebuiltRowsAll.value
  if (navRows && navRows.length > 0) return navRows
  return adjustedPositionRowsAll.value
})

const positionRows = computed(() => {
  const all = effectivePositionRowsAll.value
  // 如果是 nav 重建格式（含 daily_profit 字段），直接按 range 过滤
  if (all && all.length > 0 && 'daily_profit' in all[0] && !('total_profit' in all[0])) {
    return filterFundDetailRange(navRebuiltRowsAll.value, positionRange.value)
  }
  // 兜底：旧快照链
  return filterFundDetailRange(adjustedPositionRowsAll.value, positionRange.value)
})

// 统一新旧两种格式的展示字段，模板用这个而不是直接读 row
const positionRowForDisplay = computed(() => {
  const row = selectedPositionTrendRow.value
  if (!row) return null
  // nav 重建格式（不含 cost，无法算持有收益率）
  if ('cumulative_profit' in row) {
    const shares = position.value?.shares || 0
    const cost = position.value?.cost || 0
    const cumProfit = row.cumulative_profit || 0
    const profitRate = cost > 0 ? Number(((cumProfit / cost) * 100).toFixed(2)) : 0
    return {
      date: row.date,
      nav: row.nav,
      daily_profit: row.daily_profit,
      cumulative_profit: row.cumulative_profit,
      cumulative_dividend_amount: row.cumulative_dividend_amount || 0,
      has_dividend: row.has_dividend || false,
      dividend_per_share: row.dividend_per_share || 0,
      dividend_amount: row.dividend_amount || 0,
      profit_rate: profitRate,
      // 兜底兼容字段
      market_value: null,
      total_profit: cumProfit,
      total_profit_rate: profitRate,
      adjusted_daily_profit: row.daily_profit,
      adjusted_total_profit: cumProfit,
      adjusted_total_profit_rate: profitRate,
      adjusted_market_value: null,
    }
  }
  // 旧快照格式
  return {
    date: row.date,
    nav: row.nav || null,
    daily_profit: row.daily_profit,
    cumulative_profit: row.total_profit,
    cumulative_dividend_amount: row.cumulative_dividend_amount || 0,
    has_dividend: (row.dividend_per_share || 0) > 0,
    dividend_per_share: row.dividend_per_share || 0,
    dividend_amount: row.dividend_amount || 0,
    profit_rate: row.total_profit_rate ?? row.profit_rate ?? 0,
    market_value: row.adjusted_market_value ?? row.market_value,
    total_profit: row.adjusted_total_profit ?? row.total_profit,
    total_profit_rate: row.adjusted_total_profit_rate ?? row.total_profit_rate ?? 0,
    adjusted_daily_profit: row.adjusted_daily_profit ?? row.daily_profit,
    adjusted_total_profit: row.adjusted_total_profit ?? row.total_profit,
    adjusted_total_profit_rate: row.adjusted_total_profit_rate ?? row.total_profit_rate ?? 0,
    adjusted_market_value: row.adjusted_market_value ?? row.market_value,
  }
})

// 图表指标：优先用 nav 重建格式的 cumulative_profit（累计）；兜底用旧链
const positionTrendMetric = computed(() => {
  const rows = effectivePositionRowsAll.value
  if (rows && rows.length > 0 && 'cumulative_profit' in rows[0]) {
    return positionTrendTab.value === 'daily' ? 'daily_profit' : 'cumulative_profit'
  }
  return positionTrendTab.value === 'daily' ? 'adjusted_daily_profit' : 'adjusted_total_profit'
})

const positionTrendPoints = computed(() => {
  const rows = positionRows.value
  if (!rows || rows.length === 0) return []
  // nav 重建格式直接用 cumulative_profit / daily_profit
  if ('cumulative_profit' in rows[0]) {
    const metric = positionTrendTab.value === 'daily' ? 'daily_profit' : 'cumulative_profit'
    return rows.map(row => ({
      key: row.date,
      date: row.date,
      label: row.label || String(row.date).slice(5),
      value: Number((Number(row?.[metric] ?? 0) || 0).toFixed(2)),
      raw: row,
    }))
  }
  return buildPositionTrendPoints(rows, { metric: positionTrendMetric.value })
})

const fundTrendRowsAll = computed(() => fundDetail.value?.net_worth_trend || [])
const fundTrendRows = computed(() => filterFundDetailRange(fundTrendRowsAll.value, fundRange.value))
const performanceStats = computed(() => fundDetail.value?.performance_stats || [])
const currentFundPerformanceStat = computed(() => performanceStats.value.find(item => item.key === fundRange.value) || null)
const fundReturnPoints = computed(() => buildFundReturnChartPoints(fundTrendRows.value, {
  officialReturnPct: currentFundPerformanceStat.value?.return_pct ?? null,
}))
const recentFundNavRows = computed(() => buildRecentFundNavRows(fundTrendRowsAll.value, 30))

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

const positionTrendSummaryLabel = computed(() => (positionTrendTab.value === 'daily' ? '所选日期每日收益' : '所选日期累计收益'))
const positionTrendFormatter = computed(() => (positionTrendTab.value === 'daily' ? formatCurrencyValue : formatCurrencyValue))
const positionTrendAxisFormatter = computed(() => (positionTrendTab.value === 'daily' ? formatCompactAmount : formatCompactAmount))

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
    try { snapshots.value = await fetchProfitSnapshots() } catch { snapshots.value = getProfitSnapshots() }
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
  padding: 16px;
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
  font-size: 19px;
  font-weight: 700;
  line-height: 1.4;
}

.hero-nav-date {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.88;
}

.hero-identity {
  min-width: 0;
  flex: 1;
}

.hero-meta-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.hero-code {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.82);
  font-family: 'Courier New', monospace;
}

.hero-nav {
  flex: 0 0 auto;
  text-align: right;
}

.hero-nav-caption {
  font-size: 11px;
  opacity: 0.72;
}

.hero-nav-value {
  font-size: 22px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.hero-primary {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-end;
  margin-top: 14px;
}

.hero-primary-main {
  flex: 1;
  min-width: 0;
}

.hero-primary-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.78);
}

.hero-primary-value {
  margin-top: 6px;
  font-size: 32px;
  line-height: 1.15;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: #ffffff;
  text-shadow: 0 2px 6px rgba(15, 23, 42, 0.26);
}

.hero-primary-value.positive {
  color: #ffe3e8;
}

.hero-primary-value.negative {
  color: #d9ffe7;
}

.hero-primary-side {
  min-width: 106px;
  padding: 12px 12px 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(8px);
}

.hero-side-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);
}

.hero-side-value,
.hero-side-rate {
  font-family: 'Courier New', monospace;
  font-weight: 700;
  text-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
}

.hero-side-value {
  margin-top: 6px;
  font-size: 16px;
  color: #ffffff;
}

.hero-side-rate {
  margin-top: 4px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
}

.hero-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
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
  margin-top: 14px;
}

.hero-metrics-compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.hero-metric,
.metric-card {
  border-radius: 14px;
  padding: 12px;
}

.hero-metric.compact {
  padding: 10px 12px;
}

.hero-metric {
  background: rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(6px);
}

.hero-metric .metric-label {
  color: rgba(255, 255, 255, 0.78);
}

.hero-metric .metric-value {
  color: #ffffff;
  text-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
}

.hero-metric .metric-value.positive {
  color: #ffe3e8;
}

.hero-metric .metric-value.negative {
  color: #d9ffe7;
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

.positive {
  color: #ee0a24;
}

.negative {
  color: #07c160;
}

.metric-value.neutral {
  color: #1f2937;
}

.section {
  margin: 12px;
  padding: 15px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
}

.history-section {
  padding-top: 14px;
}

.history-tabs {
  display: flex;
  gap: 10px;
  margin: 14px 0 10px;
  padding: 4px;
  border-radius: 18px;
  background: #f6f7fb;
}

.history-tab {
  flex: 1;
  border: none;
  background: transparent;
  color: #a0a7b4;
  font-size: 16px;
  font-weight: 600;
  padding: 12px 0;
  border-radius: 14px;
}

.history-tab.active {
  color: #1f2937;
  background: #fff;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05);
}

.history-hint {
  margin-bottom: 10px;
  font-size: 12px;
  color: #a0a7b4;
}

.section-tabs {
  display: flex;
  gap: 10px;
  margin: 14px 0 10px;
  padding: 4px;
  border-radius: 18px;
  background: #f6f7fb;
}

.section-tab {
  flex: 1;
  border: none;
  background: transparent;
  color: #a0a7b4;
  font-size: 15px;
  font-weight: 600;
  padding: 10px 0;
  border-radius: 14px;
}

.section-tab.active {
  color: #1f2937;
  background: #fff;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05);
}

.trend-metrics-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.trend-metric-chip {
  padding: 10px 12px;
  border-radius: 14px;
  background: #f8fbff;
  border: 1px solid #edf3fb;
}

.trend-chip-label {
  display: block;
  font-size: 11px;
  color: #8a94a6;
}

.trend-chip-value {
  display: block;
  margin-top: 4px;
  font-size: 14px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.trend-chip-value.neutral {
  color: #1f2937;
}

.chip-row {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  margin: 14px 0;
}

.chip-row::-webkit-scrollbar {
  display: none;
}

.pill-chip {
  flex: 0 0 auto;
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

.screenshot-style {
  border-radius: 20px;
  background: #fff;
}

.perf-grid-period {
  display: grid;
  grid-template-columns: 1fr 1fr 1.4fr;
  align-items: center;
}

.perf-grid-nav {
  display: grid;
  grid-template-columns: 1.15fr 0.9fr 0.95fr;
  align-items: center;
}

.perf-head,
.perf-row {
  padding: 16px 2px;
}

.perf-head {
  color: #adb5c3;
  font-size: 13px;
  border-bottom: 1px solid #f1f4f8;
}

.perf-row {
  align-items: center;
  border-bottom: 1px solid #f6f7fb;
}

.perf-row:last-child {
  border-bottom: none;
}

.perf-label {
  font-weight: 700;
  font-size: 16px;
  color: #1f2937;
}

.perf-nav,
.perf-value {
  text-align: center;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.perf-nav {
  color: #1f2937;
}

.perf-date {
  text-align: right;
  font-size: 12px;
  line-height: 1.4;
  color: #94a3b8;
}

.loading {
  display: block;
  margin: 20px auto;
}

.page-loading {
  margin-top: 48px;
}
</style>
