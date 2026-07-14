<template>
  <div class="stats-page">
    <div class="overview-card">
      <div class="header-row">
        <div>
          <div class="asset-label">总资产</div>
          <div class="asset-amount">{{ formatAmount(overview?.summary?.totalMarketValue || 0) }}</div>
        </div>
        <van-button class="stats-refresh-btn" size="small" round @click="handleRefresh">刷新数据</van-button>
      </div>

      <div class="profit-row">
        <div class="profit-item">
          <div class="profit-label">{{ profitDateLabel }}收益</div>
          <div class="profit-value" :class="profitClass(overview?.summary?.totalPositionYesterdayProfit)">
            {{ formatSignedAmount(overview?.summary?.totalPositionYesterdayProfit || 0) }}
          </div>
          <div class="profit-subvalue" :class="profitClass(yesterdayProfitRate)">
            {{ formatSignedPercent(yesterdayProfitRate) }}
          </div>
        </div>
        <div class="profit-divider"></div>
        <div class="profit-item">
          <div class="profit-label">持有收益</div>
          <div class="profit-value" :class="profitClass(overview?.summary?.totalHoldingProfit)">
            {{ formatSignedAmount(overview?.summary?.totalHoldingProfit || 0) }}
          </div>
        </div>
      </div>

      <div class="profit-rate-bar overview-secondary-row">
        <span><span class="rate-label">累计收益</span><strong :class="profitClass(overview?.summary?.totalCumulativeProfit)">{{ formatSignedAmount(overview?.summary?.totalCumulativeProfit || 0) }}</strong></span>
        <span><span class="rate-label">持仓收益率</span><strong :class="profitClass(overview?.summary?.totalProfitRate)">{{ formatSignedPercent(overview?.summary?.totalProfitRate || 0) }}</strong></span>
      </div>
      <div class="update-status-row">净值进度 {{ navUpdateText }}</div>
    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">📈 收益走势</div>
          <div class="section-subtitle">按天看日收益，按周期看阶段收益</div>
        </div>
      </div>

      <div class="scope-summary-row">
        <span>当前：{{ activeScopeName }}</span>
        <button class="text-button" @click="showScopeFilters = !showScopeFilters">{{ showScopeFilters ? '收起' : '筛选' }}</button>
      </div>

      <div v-if="showScopeFilters" class="scope-filter-panel">
        <label>成员<select v-model="selectedMember"><option v-for="item in memberOptions" :key="item.value" :value="item.value">{{ item.text }}</option></select></label>
        <label>账户<select v-model="selectedAccount"><option v-for="item in accountOptions" :key="item.value" :value="item.value">{{ item.text }}</option></select></label>
        <div class="filter-panel-footer">
          <span>基金类型</span>
          <button class="text-button" @click="resetFilters">重置全部</button>
        </div>
        <div class="chip-row type-row">
          <button
            v-for="item in fundTypeOptions"
            :key="item.value"
            class="pill-chip small"
            :class="{ active: selectedFundType === item.value }"
            @click="selectedFundType = item.value"
          >{{ item.text }}</button>
        </div>
      </div>

      <div class="trend-control-grid">
        <label>走势<select v-model="trendMode"><option v-for="item in trendModeOptions" :key="item.value" :value="item.value">{{ item.text }}</option></select></label>
        <label>区间<select v-if="trendMode === 'daily'" v-model="dailyRange"><option v-for="item in dailyRangeOptions" :key="item.value" :value="item.value">{{ item.text }}</option></select><select v-else v-model="periodMode"><option v-for="item in periodOptions" :key="item.value" :value="item.value">{{ item.text }}</option></select></label>
        <label>指标<select v-model="trendMetric"><option value="amount">收益金额</option><option value="rate">收益率</option></select></label>
      </div>

      <TrendChart
        :points="trendSeries"
        :summary-label="trendSummaryLabel"
        :formatter="trendMetric === 'rate' ? formatSignedPercent : formatCurrencyValue"
        :y-axis-formatter="trendMetric === 'rate' ? formatAxisPercent : formatCompactAmount"
        :show-zero-baseline="true"
        @select="handleTrendSelect"
      />

      <div v-if="selectedTrendRow" class="trend-metrics-grid">
        <div class="metric-card">
          <span class="metric-label">所选日期</span>
          <span class="metric-value neutral">{{ selectedTrendDateLabel }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">日收益</span>
          <span class="metric-value" :class="profitClass(selectedTrendRow.daily_profit)">{{ formatSignedAmount(selectedTrendRow.daily_profit) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">日收益率</span>
          <span class="metric-value" :class="profitClass(selectedTrendRow.daily_profit_rate)">{{ formatSignedPercent(selectedTrendRow.daily_profit_rate) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">总金额</span>
          <span class="metric-value neutral">{{ formatCurrencyValue(selectedTrendRow.total_market_value) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">总收益</span>
          <span class="metric-value" :class="profitClass(selectedTrendRow.total_profit)">{{ formatSignedAmount(selectedTrendRow.total_profit) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">总收益率</span>
          <span class="metric-value" :class="profitClass(selectedTrendRow.total_profit_rate)">{{ formatSignedPercent(selectedTrendRow.total_profit_rate) }}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">🗂️ 周期汇总</div>
          <div class="section-subtitle">{{ currentPeriodLabel }}视角下的阶段表现</div>
        </div>
      </div>

      <div class="chip-row period-selector-row">
        <button
          v-for="item in periodOptions"
          :key="`summary-${item.value}`"
          class="pill-chip small"
          :class="{ active: periodMode === item.value }"
          @click="periodMode = item.value"
        >{{ item.text }}</button>
      </div>

      <div v-if="periodRows.length" class="period-list">
        <div v-for="row in visiblePeriodRows" :key="row.period_key" class="period-card">
          <div class="period-top">
            <div>
              <div class="period-title">{{ row.period_label }}</div>
              <div class="period-date">{{ row.start_date }} ~ {{ row.end_date }}</div>
            </div>
            <div class="period-amount">¥{{ formatAmount(row.total_market_value) }}</div>
          </div>
          <div class="period-grid">
            <div>
              <span class="small-label">当期收益</span>
              <div class="small-value" :class="profitClass(row.period_profit)">{{ formatSignedAmount(row.period_profit) }}</div>
            </div>
            <div>
              <span class="small-label">当期收益率</span>
              <div class="small-value" :class="profitClass(row.period_profit_rate)">{{ formatSignedPercent(row.period_profit_rate) }}</div>
            </div>
          </div>
          <div class="period-secondary">最大亏损 <span :class="profitClass(row.period_max_drawdown)">{{ formatSignedAmount(row.period_max_drawdown) }}</span> · 总收益率 <span :class="profitClass(row.total_profit_rate)">{{ formatSignedPercent(row.total_profit_rate) }}</span></div>
        </div>
        <button
          v-if="periodRows.length > 2"
          class="more-button"
          @click="handleMorePeriodRows"
        >
          查询更多（已显示 {{ visiblePeriodRows.length }}/{{ periodRows.length }}）
        </button>
      </div>
      <van-empty v-else description="周期数据还不够，先多积累几天快照" />

    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">🏆 收益贡献与拖累</div>
          <div class="section-subtitle">按当前筛选范围汇总指定区间收益</div>
        </div>
        <select v-model="contributionRange" class="compact-range-select" aria-label="贡献统计区间">
          <option v-for="item in contributionRangeOptions" :key="item.value" :value="item.value">{{ item.text }}</option>
        </select>
      </div>
      <div v-if="contributionRows.contributors.length || contributionRows.detractors.length" class="contribution-columns">
        <div class="contribution-group">
          <div class="contribution-heading positive">贡献最高</div>
          <div v-for="fund in contributionRows.contributors" :key="`gain-${fund.fund_code}`" class="contribution-item">
            <div><div class="fund-name">{{ fund.fund_name }}</div><div class="period-date">{{ fund.account_name }} · {{ fund.contribution_share.toFixed(2) }}%</div></div>
            <strong class="positive">{{ formatSignedAmount(fund.daily_profit) }}</strong>
          </div>
        </div>
        <div class="contribution-group">
          <div class="contribution-heading negative">拖累最大</div>
          <div v-for="fund in contributionRows.detractors" :key="`loss-${fund.fund_code}`" class="contribution-item">
            <div><div class="fund-name">{{ fund.fund_name }}</div><div class="period-date">{{ fund.account_name }} · {{ fund.contribution_share.toFixed(2) }}%</div></div>
            <strong class="negative">{{ formatSignedAmount(fund.daily_profit) }}</strong>
          </div>
        </div>
      </div>
      <van-empty v-else description="当前筛选范围暂无收益贡献数据" />
    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">🗓️ 历史每日账户统计</div>
          <div class="section-subtitle">当前筛选：{{ activeScopeName }}</div>
        </div>
      </div>

      <template v-if="dailyHistoryRows.length">
        <div class="daily-card-list">
          <div v-for="row in visibleDailyHistoryRows" :key="`${row.date}-${row.account_id}`" class="daily-history-card">
            <div class="daily-card-top">
              <div>
                <div class="period-title">{{ row.date }}</div>
                <div class="period-date">{{ row.account_name }}</div>
              </div>
              <div class="period-amount">¥{{ formatAmount(row.total_market_value) }}</div>
            </div>
            <div class="period-grid">
              <div>
                <span class="small-label">当日收益</span>
                <div class="small-value" :class="profitClass(row.daily_profit)">{{ formatSignedAmount(row.daily_profit) }}</div>
              </div>
              <div>
                <span class="small-label">当日收益率</span>
                <div class="small-value" :class="profitClass(row.daily_profit_rate)">{{ formatSignedPercent(row.daily_profit_rate) }}</div>
              </div>
            </div>
            <div class="period-secondary">总收益 <span :class="profitClass(row.total_profit)">{{ formatSignedAmount(row.total_profit) }}</span> · 总收益率 <span :class="profitClass(row.total_profit_rate)">{{ formatSignedPercent(row.total_profit_rate) }}</span></div>
          </div>
        </div>

        <div v-if="dailyHistoryRows.length > 2" class="more-actions">
          <button
            v-if="visibleDailyHistoryRows.length < dailyHistoryRows.length"
            class="more-button"
            @click="handleMoreDailyHistoryRows"
          >
            查询更多（已显示 {{ visibleDailyHistoryRows.length }}/{{ dailyHistoryRows.length }}）
          </button>
          <button
            v-if="visibleDailyHistoryRows.length > 2"
            class="more-button collapse-button"
            @click="handleCollapseDailyHistoryRows"
          >
            收起
          </button>
        </div>
      </template>
      <van-empty v-else description="暂无历史快照，点一次刷新统计即可开始积累" />
    </div>

    <van-loading v-if="loading" type="spinner" class="loading" />
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { showToast } from 'vant'
import TrendChart from '../components/TrendChart.vue'
import { formatAmount, formatPercent, formatSignedAmount, profitClass } from '../utils/formatters'
import { captureProfitSnapshotFromApis } from '../utils/profitSnapshotService'
import { shouldRefreshPageData } from '../utils/perfHelpers'
import { fetchProfitSnapshots, getProfitSnapshots } from '../utils/profitLedger'
import { readPageCache, writePageCache } from '../utils/pageCache'
import {
  buildAccountFilterOptions,
  buildPeriodProfitContributionRows,
  buildDailyHistoryRows,
  buildDisplayTrendSeries,
  buildFundTypeFilterOptions,
  buildMemberFilterOptions,
  buildPeriodHistoryRows,
  buildTrendSeries,
  getNextLoopDisplayCount,
} from '../utils/statsHistory'

const cachedStats = readPageCache('stats')
const loading = ref(false)
const overview = ref(cachedStats?.overview || null)
const allSnapshots = ref(getProfitSnapshots())
const lastLoadedAt = ref(cachedStats?.savedAt || 0)
const hasLoadedOnce = ref(Boolean(cachedStats?.overview))

const selectedMember = ref('all')
const selectedAccount = ref('all')
const selectedFundType = ref('all')
const selectedTrendRow = ref(null)
const showScopeFilters = ref(false)
const trendMode = ref('daily')
const trendMetric = ref('amount')
const dailyRange = ref(30)
const periodMode = ref('week')
const periodVisibleCountMap = ref({
  week: 2,
  month: 2,
  quarter: 2,
  halfyear: 2,
  year: 2,
})
const dailyHistoryVisibleCount = ref(2)
const contributionRange = ref(30)

const trendModeOptions = [
  { text: '按天', value: 'daily' },
  { text: '按周期', value: 'period' },
]

const dailyRangeOptions = [
  { text: '7天', value: 7 },
  { text: '30天', value: 30 },
  { text: '90天', value: 90 },
  { text: '180天', value: 180 },
  { text: '365天', value: 365 },
]

const contributionRangeOptions = [
  { text: '近7天', value: 7 },
  { text: '近30天', value: 30 },
  { text: '近90天', value: 90 },
  { text: '近180天', value: 180 },
  { text: '近1年', value: 365 },
]

const periodOptions = [
  { text: '周', value: 'week' },
  { text: '月', value: 'month' },
  { text: '季', value: 'quarter' },
  { text: '半年', value: 'halfyear' },
  { text: '年', value: 'year' },
]

const refreshSnapshots = () => {
  allSnapshots.value = getProfitSnapshots()
}

const syncSnapshots = async () => {
  try { allSnapshots.value = await fetchProfitSnapshots() } catch { refreshSnapshots() }
}

const fetchData = async () => {
  loading.value = true
  try {
    const data = await captureProfitSnapshotFromApis()
    overview.value = data.overview
    refreshSnapshots()
    writePageCache('stats', { overview: overview.value })
    hasLoadedOnce.value = true
    lastLoadedAt.value = Date.now()
  } catch (error) {
    console.error('Failed to fetch stats:', error)
    showToast('数据加载失败')
  } finally {
    loading.value = false
  }
}

const ensureFreshData = async ({ force = false } = {}) => {
  if (!shouldRefreshPageData({ hasData: hasLoadedOnce.value, lastLoadedAt: lastLoadedAt.value, force })) return
  await fetchData()
}

const handleRefresh = async () => {
  await fetchData()
  showToast('统计页已刷新')
}

const memberOptions = computed(() => buildMemberFilterOptions(allSnapshots.value))
const accountOptions = computed(() => buildAccountFilterOptions(allSnapshots.value, { memberId: selectedMember.value }))
const fundTypeOptions = computed(() => buildFundTypeFilterOptions(allSnapshots.value, {
  memberId: selectedMember.value,
  accountId: selectedAccount.value,
}))
const activeAccountName = computed(() => accountOptions.value.find(item => item.value === selectedAccount.value)?.text || '全部账户')
const activeMemberName = computed(() => memberOptions.value.find(item => item.value === selectedMember.value)?.text || '全部成员')
const activeFundTypeName = computed(() => fundTypeOptions.value.find(item => item.value === selectedFundType.value)?.text || '全部类型')
const activeScopeName = computed(() => {
  const parts = [selectedAccount.value === 'all' ? activeAccountName.value : `${activeMemberName.value} · ${activeAccountName.value}`]
  if (selectedFundType.value !== 'all') parts.push(activeFundTypeName.value)
  return parts.join(' / ')
})
const currentPeriodLabel = computed(() => periodOptions.find(item => item.value === periodMode.value)?.text || '周')
const profitDateLabel = computed(() => {
  const date = overview.value?.summary?.dailyProfitDate || allDailyHistoryRows.value?.[0]?.date || ''
  return date ? String(date).slice(5).replace('-', '/') : '最近交易日'
})
const navUpdateText = computed(() => {
  const updated = Number(overview.value?.summary?.updatedFundCount || 0)
  const total = Number(overview.value?.summary?.totalFundCount || 0)
  return total > 0 ? `${updated}/${total}只已更新` : '暂无净值进度'
})
const yesterdayProfitRate = computed(() => {
  const marketValue = Number(overview.value?.summary?.totalMarketValue) || 0
  const yesterdayProfit = Number(overview.value?.summary?.totalPositionYesterdayProfit) || 0
  const previousMarketValue = marketValue - yesterdayProfit
  if (previousMarketValue <= 0) return 0
  return Number(((yesterdayProfit / previousMarketValue) * 100).toFixed(2))
})

const allDailyHistoryRows = computed(() => buildDailyHistoryRows(allSnapshots.value, {
  memberId: selectedMember.value,
  accountId: selectedAccount.value,
  fundType: selectedFundType.value,
}))
const dailyHistoryRows = computed(() => allDailyHistoryRows.value)
const visibleDailyHistoryRows = computed(() => dailyHistoryRows.value.slice(0, dailyHistoryVisibleCount.value))
const trendDailyRows = computed(() => allDailyHistoryRows.value.slice(0, dailyRange.value))
const periodRows = computed(() => buildPeriodHistoryRows(allSnapshots.value, {
  memberId: selectedMember.value,
  accountId: selectedAccount.value,
  fundType: selectedFundType.value,
  period: periodMode.value,
}))
const visiblePeriodRows = computed(() => {
  const count = periodVisibleCountMap.value[periodMode.value] || 2
  return periodRows.value.slice(0, count)
})
const contributionRows = computed(() => buildPeriodProfitContributionRows(allSnapshots.value, {
  memberId: selectedMember.value,
  accountId: selectedAccount.value,
  fundType: selectedFundType.value,
  days: contributionRange.value,
  limit: 3,
}))
const trendRows = computed(() => (trendMode.value === 'daily' ? trendDailyRows.value : periodRows.value))
const trendSummaryLabel = computed(() => {
  const suffix = trendMetric.value === 'rate' ? '收益率' : '收益'
  return trendMode.value === 'daily' ? `所选日期${suffix}` : `所选周期阶段${suffix}`
})
const trendSeries = computed(() => {
  if (trendMode.value === 'daily') {
    return buildDisplayTrendSeries(trendDailyRows.value, { metric: trendMetric.value === 'rate' ? 'daily_profit_rate' : 'daily_profit', mode: 'daily' })
  }
  return buildTrendSeries(periodRows.value, { metric: trendMetric.value === 'rate' ? 'period_profit_rate' : 'period_profit', mode: 'period' })
})
const selectedTrendDateLabel = computed(() => {
  if (!selectedTrendRow.value) return '-'
  return trendMode.value === 'daily'
    ? selectedTrendRow.value.date || '-'
    : `${selectedTrendRow.value.start_date || '-'} ~ ${selectedTrendRow.value.end_date || '-'}`
})

const formatSignedPercent = (value) => {
  const num = Number(value) || 0
  const prefix = num > 0 ? '+' : ''
  return `${prefix}${formatPercent(num)}`
}

const formatCurrencyValue = (value) => `¥${formatAmount(value)}`
const formatAxisPercent = (value) => `${Number(value || 0).toFixed(2)}%`

const formatCompactAmount = (value) => {
  const num = Number(value) || 0
  if (Math.abs(num) >= 10000) return `¥${(num / 10000).toFixed(1)}万`
  return `¥${formatAmount(num)}`
}

const handleTrendSelect = (row) => {
  selectedTrendRow.value = row
}

const handleMorePeriodRows = () => {
  periodVisibleCountMap.value = {
    ...periodVisibleCountMap.value,
    [periodMode.value]: getNextLoopDisplayCount({
      total: periodRows.value.length,
      current: periodVisibleCountMap.value[periodMode.value] || 2,
    }),
  }
}

const handleMoreDailyHistoryRows = () => {
  dailyHistoryVisibleCount.value = getNextLoopDisplayCount({
    total: dailyHistoryRows.value.length,
    current: dailyHistoryVisibleCount.value,
  })
}

const handleCollapseDailyHistoryRows = () => {
  dailyHistoryVisibleCount.value = Math.min(2, dailyHistoryRows.value.length)
}

watch(trendRows, (rows) => {
  selectedTrendRow.value = rows[0] || null
}, { immediate: true })

watch(dailyHistoryRows, (rows) => {
  if (rows.length <= 2) {
    dailyHistoryVisibleCount.value = rows.length
    return
  }
  if (dailyHistoryVisibleCount.value > rows.length) {
    dailyHistoryVisibleCount.value = rows.length
  }
  if (dailyHistoryVisibleCount.value < 2) {
    dailyHistoryVisibleCount.value = 2
  }
}, { immediate: true })

watch([selectedMember, selectedAccount, selectedFundType], () => {
  dailyHistoryVisibleCount.value = 2
})

const resetFilters = () => {
  selectedMember.value = 'all'
  selectedAccount.value = 'all'
  selectedFundType.value = 'all'
}

watch(memberOptions, (options) => {
  const exists = options.some(item => item.value === selectedMember.value)
  if (!exists) selectedMember.value = 'all'
}, { immediate: true })

watch(accountOptions, (options) => {
  const exists = options.some(item => item.value === selectedAccount.value)
  if (!exists) selectedAccount.value = 'all'
}, { immediate: true })

watch(fundTypeOptions, (options) => {
  const exists = options.some(item => item.value === selectedFundType.value)
  if (!exists) selectedFundType.value = 'all'
}, { immediate: true })

onMounted(() => {
  ensureFreshData({ force: true })
  syncSnapshots().catch(() => {})
})

onActivated(() => {
  ensureFreshData()
  syncSnapshots().catch(() => {})
})
</script>

<style scoped>
.stats-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: var(--app-floating-page-space);
}

.overview-card {
  background: linear-gradient(135deg, #1e80ff 0%, #0066cc 100%);
  padding: 14px 18px 12px;
  color: white;
}

.header-row,
.section-header,
.period-top,
.daily-row,
.position-item,
.snapshot-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.header-row {
  align-items: flex-start;
  margin-bottom: 8px;
}

.update-status-row,
.scope-summary-row,
.overview-secondary-row,
.contribution-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.update-status-row {
  justify-content: flex-end;
  margin-top: 7px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 12px;
}

.stats-refresh-btn {
  --van-button-default-color: #1e80ff;
  --van-button-default-background: rgba(255, 255, 255, 0.96);
  --van-button-default-border-color: rgba(255, 255, 255, 0.96);
  font-weight: 600;
  flex-shrink: 0;
}

.asset-label,
.profit-label,
.rate-label,
.section-subtitle,
.small-label,
.daily-account,
.period-date {
  font-size: 12px;
  opacity: 0.86;
}

.asset-amount {
  margin-top: 4px;
  font-size: 27px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.profit-row {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 9px 0;
  margin-bottom: 8px;
}

.profit-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.profit-divider {
  width: 1px;
  height: 32px;
  background: rgba(255, 255, 255, 0.25);
}

.profit-value,
.rate-value,
.metric-value,
.period-amount,
.small-value,
.value,
.position-profit .profit,
.position-profit .rate {
  font-family: 'Courier New', monospace;
}

.profit-value {
  font-size: 16px;
  font-weight: 700;
}

.profit-subvalue {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.95;
}

.profit-rate-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.overview-secondary-row > span {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.overview-secondary-row > span:last-child {
  text-align: right;
}

.rate-value {
  font-size: 15px;
  font-weight: 700;
}

.section {
  background: white;
  margin: 12px;
  border-radius: 14px;
  padding: 16px;
}

.section-header {
  align-items: flex-start;
  margin-bottom: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #222;
}

.chip-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 10px;
}

.scope-summary-row {
  margin: 2px 0 10px;
  padding: 9px 11px;
  border-radius: 10px;
  background: #f8fbff;
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
}

.text-button {
  border: 0;
  padding: 2px 0 2px 12px;
  background: transparent;
  color: #1e80ff;
  font-size: 12px;
}

.scope-filter-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: -2px 0 10px;
  padding: 10px;
  border-radius: 10px;
  background: #f8fbff;
}

.scope-filter-panel label,
.trend-control-grid label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #7b8794;
  font-size: 13px;
  font-weight: 600;
}

.scope-filter-panel select,
.trend-control-grid select,
.compact-range-select {
  width: 100%;
  height: 42px;
  appearance: none;
  border: 1px solid #dce7f5;
  border-radius: 11px;
  padding: 0 32px 0 11px;
  background-color: #fff;
  background-image: linear-gradient(45deg, transparent 50%, #1e80ff 50%), linear-gradient(135deg, #1e80ff 50%, transparent 50%);
  background-position: calc(100% - 16px) 18px, calc(100% - 11px) 18px;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  color: #27364b;
  font-size: 15px;
  font-weight: 600;
  outline: none;
}

.scope-filter-panel select:focus,
.trend-control-grid select:focus,
.compact-range-select:focus {
  border-color: #1e80ff;
  box-shadow: 0 0 0 3px rgba(30, 128, 255, 0.1);
}

.filter-panel-footer,
.scope-filter-panel .type-row {
  grid-column: 1 / -1;
}

.filter-panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #7b8794;
  font-size: 11px;
}

.trend-control-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.compact-range-select {
  width: 104px;
  height: 38px;
  flex-shrink: 0;
  font-size: 14px;
}

.member-row,
.account-row,
.type-row,
.display-row {
  margin-top: 4px;
}

.fund-select-row {
  margin-bottom: 12px;
}

.fund-select {
  width: 100%;
  height: 40px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 0 12px;
  background: #f8fbff;
  color: #222;
  font-size: 14px;
}

.pill-chip {
  border: none;
  border-radius: 999px;
  background: #f3f6fb;
  color: #64748b;
  padding: 8px 14px;
  font-size: 13px;
  white-space: nowrap;
}

.pill-chip.small {
  padding: 7px 12px;
  font-size: 12px;
}

.pill-chip.active {
  background: #1e80ff;
  color: #fff;
  box-shadow: 0 8px 18px rgba(30, 128, 255, 0.2);
}

.trend-metrics-grid,
.period-grid,
.daily-values {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.trend-metrics-grid {
  margin-top: 12px;
}

.metric-card,
.period-card,
.daily-row,
.position-item {
  border-radius: 12px;
}

.metric-card {
  background: #f8fbff;
  padding: 12px;
}

.metric-label,
.small-label {
  color: #7b8794;
}

.metric-value,
.small-value,
.value,
.table-value {
  display: block;
  margin-top: 4px;
  font-size: 15px;
  font-weight: 700;
}

.table-value {
  margin-top: 0;
  text-align: right;
  white-space: nowrap;
}

.period-list,
.daily-card-list,
.position-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.contribution-columns {
  display: grid;
  gap: 12px;
}

.contribution-group {
  border: 1px solid #eef2f7;
  border-radius: 12px;
  overflow: hidden;
}

.contribution-heading {
  padding: 10px 12px;
  background: #f8fbff;
  font-size: 13px;
  font-weight: 700;
}

.contribution-item {
  gap: 12px;
  padding: 11px 12px;
  border-top: 1px solid #f1f5f9;
}

.contribution-item > div {
  min-width: 0;
}

.contribution-item .fund-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contribution-item strong {
  flex-shrink: 0;
  font-family: 'Courier New', monospace;
}

.subsection {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #e2e8f0;
}

.compact {
  margin-top: 10px;
}

.more-button {
  border: none;
  border-radius: 12px;
  padding: 10px 12px;
  background: #f3f6fb;
  color: #1e80ff;
  font-size: 13px;
  font-weight: 600;
}

.more-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.collapse-button {
  color: #64748b;
}

.daily-table-wrap {
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  overflow-x: auto;
  overflow-y: hidden;
}

.daily-table-header,
.daily-table-row {
  padding: 10px 12px;
}

.daily-table-header {
  background: #f8fbff;
  color: #7b8794;
  font-size: 12px;
  font-weight: 600;
}

.daily-table-body {
  display: flex;
  flex-direction: column;
}

.daily-table-row {
  border-top: 1px solid #f3f4f6;
  background: #fff;
}

.daily-table-grid {
  display: grid;
  grid-template-columns: 88px minmax(120px, 1.2fr) repeat(4, minmax(88px, 1fr));
  gap: 10px;
  align-items: center;
  min-width: 720px;
}

.period-card {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  padding: 10px 12px;
}

.period-card .period-top {
  align-items: center;
}

.period-card .period-grid {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #edf0f3;
}

.period-card .period-grid > div:last-child {
  text-align: right;
}

.period-secondary {
  margin-top: 7px;
  color: #8a94a3;
  font-size: 11px;
  text-align: right;
}

.daily-history-card {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  padding: 10px 12px;
}

.daily-card-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 0;
}

.daily-history-card .period-grid {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #edf0f3;
}

.daily-history-card .period-grid > div:last-child {
  text-align: right;
}

.period-title,
.fund-name {
  font-size: 14px;
  font-weight: 600;
  color: #222;
}

.table-date,
.table-scope {
  font-size: 13px;
  color: #222;
}

.table-scope {
  white-space: nowrap;
}

.period-amount {
  font-size: 16px;
  font-weight: 700;
  color: #222;
}

.daily-row,
.position-item {
  align-items: center;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  padding: 12px;
}

.daily-main,
.position-info {
  min-width: 0;
  flex: 1;
}

.fund-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.fund-code,
.member-tag,
.account-tag {
  font-size: 11px;
}

.fund-code {
  color: #999;
}

.member-tag {
  color: #1a73e8;
  background: #e8f0fe;
  padding: 1px 5px;
  border-radius: 3px;
}

.account-tag {
  color: #666;
  background: #f0f0f0;
  padding: 1px 5px;
  border-radius: 3px;
}

.position-profit {
  text-align: right;
  flex-shrink: 0;
}

.position-profit .profit {
  font-size: 15px;
  font-weight: 700;
}

.position-profit .rate {
  font-size: 12px;
  margin-top: 2px;
}

.positive { color: #f87171; }
.negative { color: #4ade80; }
.neutral { color: #666; }

.loading {
  display: block;
  margin: 40px auto;
}
</style>
