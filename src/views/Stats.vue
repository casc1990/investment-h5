<template>
  <div class="stats-page">
    <div class="overview-card">
      <div class="header-row">
        <div>
          <div class="asset-label">总资产(元)</div>
          <div class="asset-amount">{{ formatAmount(overview?.summary?.totalMarketValue || 0) }}</div>
        </div>
        <van-button class="stats-refresh-btn" size="small" round @click="handleRefresh">刷新数据</van-button>
      </div>

      <div class="profit-row">
        <div class="profit-item">
          <div class="profit-label">昨日收益</div>
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
        <div class="profit-divider"></div>
        <div class="profit-item">
          <div class="profit-label">累计收益</div>
          <div class="profit-value" :class="profitClass(overview?.summary?.totalCumulativeProfit)">
            {{ formatSignedAmount(overview?.summary?.totalCumulativeProfit || 0) }}
          </div>
        </div>
      </div>

      <div class="profit-rate-bar">
        <span class="rate-label">持仓收益率</span>
        <span class="rate-value" :class="profitClass(overview?.summary?.totalProfitRate)">
          {{ formatSignedPercent(overview?.summary?.totalProfitRate || 0) }}
        </span>
      </div>

      <div class="analysis-nav">
        <SectionShortcutNav :items="analysisLinks" />
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">📈 收益走势</div>
          <div class="section-subtitle">按天看日收益，按周期看阶段收益</div>
        </div>
      </div>

      <div class="chip-row member-row">
        <button
          v-for="item in memberOptions"
          :key="item.value"
          class="pill-chip"
          :class="{ active: selectedMember === item.value }"
          @click="selectedMember = item.value"
        >
          {{ item.text }}
        </button>
      </div>

      <div class="chip-row account-row">
        <button
          v-for="item in accountOptions"
          :key="item.value"
          class="pill-chip"
          :class="{ active: selectedAccount === item.value }"
          @click="selectedAccount = item.value"
        >
          {{ item.text }}
        </button>
      </div>

      <div class="chip-row type-row">
        <button
          v-for="item in fundTypeOptions"
          :key="item.value"
          class="pill-chip small"
          :class="{ active: selectedFundType === item.value }"
          @click="selectedFundType = item.value"
        >
          {{ item.text }}
        </button>
      </div>

      <div class="chip-row">
        <button
          v-for="item in trendModeOptions"
          :key="item.value"
          class="pill-chip"
          :class="{ active: trendMode === item.value }"
          @click="trendMode = item.value"
        >
          {{ item.text }}
        </button>
      </div>

      <div v-if="trendMode === 'daily'" class="chip-row">
        <button
          v-for="item in dailyRangeOptions"
          :key="item.value"
          class="pill-chip small"
          :class="{ active: dailyRange === item.value }"
          @click="dailyRange = item.value"
        >
          {{ item.text }}
        </button>
      </div>

      <div v-else class="chip-row">
        <button
          v-for="item in periodOptions"
          :key="item.value"
          class="pill-chip small"
          :class="{ active: periodMode === item.value }"
          @click="periodMode = item.value"
        >
          {{ item.text }}
        </button>
      </div>

      <TrendChart
        :points="trendSeries"
        :summary-label="trendSummaryLabel"
        :formatter="formatCurrencyValue"
        :y-axis-formatter="formatCompactAmount"
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
            <div>
              <span class="small-label">当期最大亏损</span>
              <div class="small-value" :class="profitClass(row.period_max_drawdown)">{{ formatSignedAmount(row.period_max_drawdown) }}</div>
            </div>
            <div>
              <span class="small-label">总收益率</span>
              <div class="small-value" :class="profitClass(row.total_profit_rate)">{{ formatSignedPercent(row.total_profit_rate) }}</div>
            </div>
          </div>
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

      <div v-if="monthPeriodRows.length" class="subsection month-period-subsection">
        <div class="section-header subsection-header">
          <div>
            <div class="section-title subsection-title">📅 月视角阶段表现</div>
            <div class="section-subtitle">按月查看阶段收益、收益率和最大亏损</div>
          </div>
        </div>
        <div class="period-list compact">
          <div v-for="row in visibleMonthPeriodRows" :key="`month-${row.period_key}`" class="period-card">
            <div class="period-top">
              <div>
                <div class="period-title">{{ row.period_label }}</div>
                <div class="period-date">{{ row.start_date }} ~ {{ row.end_date }}</div>
              </div>
              <div class="period-amount">¥{{ formatAmount(row.total_market_value) }}</div>
            </div>
            <div class="period-grid">
              <div>
                <span class="small-label">当月收益</span>
                <div class="small-value" :class="profitClass(row.period_profit)">{{ formatSignedAmount(row.period_profit) }}</div>
              </div>
              <div>
                <span class="small-label">当月收益率</span>
                <div class="small-value" :class="profitClass(row.period_profit_rate)">{{ formatSignedPercent(row.period_profit_rate) }}</div>
              </div>
              <div>
                <span class="small-label">最大亏损</span>
                <div class="small-value" :class="profitClass(row.period_max_drawdown)">{{ formatSignedAmount(row.period_max_drawdown) }}</div>
              </div>
              <div>
                <span class="small-label">月末总收益率</span>
                <div class="small-value" :class="profitClass(row.total_profit_rate)">{{ formatSignedPercent(row.total_profit_rate) }}</div>
              </div>
            </div>
          </div>
          <button
            v-if="monthPeriodRows.length > 2"
            class="more-button"
            @click="handleMoreMonthPeriodRows"
          >
            查询更多（已显示 {{ visibleMonthPeriodRows.length }}/{{ monthPeriodRows.length }}）
          </button>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">🗓️ 历史每日账户统计</div>
          <div class="section-subtitle">当前筛选：{{ activeScopeName }}</div>
        </div>
      </div>

      <div class="chip-row display-row">
        <button class="pill-chip small" :class="{ active: dailyHistoryDisplay === 'card' }" @click="dailyHistoryDisplay = 'card'">卡片模式</button>
        <button class="pill-chip small" :class="{ active: dailyHistoryDisplay === 'table' }" @click="dailyHistoryDisplay = 'table'">表格模式</button>
      </div>

      <template v-if="dailyHistoryRows.length">
        <div v-if="dailyHistoryDisplay === 'card'" class="daily-card-list">
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
                <span class="small-label">总收益</span>
                <div class="small-value" :class="profitClass(row.total_profit)">{{ formatSignedAmount(row.total_profit) }}</div>
              </div>
              <div>
                <span class="small-label">总收益率</span>
                <div class="small-value" :class="profitClass(row.total_profit_rate)">{{ formatSignedPercent(row.total_profit_rate) }}</div>
              </div>
              <div>
                <span class="small-label">昨日收益</span>
                <div class="small-value" :class="profitClass(row.daily_profit)">{{ formatSignedAmount(row.daily_profit) }}</div>
              </div>
              <div>
                <span class="small-label">昨日收益率</span>
                <div class="small-value" :class="profitClass(row.daily_profit_rate)">{{ formatSignedPercent(row.daily_profit_rate) }}</div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="daily-table-wrap">
          <div class="daily-table-header daily-table-grid">
            <span>日期</span>
            <span>范围</span>
            <span>总金额</span>
            <span>总收益</span>
            <span>收益率</span>
            <span>昨日收益</span>
          </div>
          <div class="daily-table-body">
            <div v-for="row in visibleDailyHistoryRows" :key="`${row.date}-${row.account_id}`" class="daily-table-row daily-table-grid">
              <span class="table-date">{{ row.date }}</span>
              <span class="table-scope">{{ row.account_name }}</span>
              <span class="table-value neutral">¥{{ formatAmount(row.total_market_value) }}</span>
              <span class="table-value" :class="profitClass(row.total_profit)">{{ formatSignedAmount(row.total_profit) }}</span>
              <span class="table-value" :class="profitClass(row.total_profit_rate)">{{ formatSignedPercent(row.total_profit_rate) }}</span>
              <span class="table-value" :class="profitClass(row.daily_profit)">{{ formatSignedAmount(row.daily_profit) }}</span>
            </div>
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

    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">🔎 单基金收益</div>
          <div class="section-subtitle">按成员、账户、类型后，再用下拉选择单只基金</div>
        </div>
      </div>

      <div class="fund-select-row">
        <select v-model="selectedFundCode" class="fund-select">
          <option v-for="item in fundSelectorOptions" :key="item.value" :value="item.value">
            {{ item.text }}
          </option>
        </select>
      </div>

      <div v-if="currentFundRows.length" class="position-list">
        <div v-for="fund in currentFundRows.slice(0, 50)" :key="`${fund.fund_code}-${fund.account_name}`" class="position-item">
          <div class="position-info">
            <div class="fund-name">{{ fund.fund_name }}</div>
            <div class="fund-meta">
              <span class="fund-code">{{ fund.fund_code }}</span>
              <span class="member-tag">{{ fund.fund_type }}</span>
              <span v-if="fund.account_name" class="account-tag">{{ fund.account_name }}</span>
              <span v-if="fund.nav_jzrq" class="account-tag">{{ fund.nav_jzrq }}</span>
            </div>
          </div>
          <div class="position-profit" :class="profitClass(fund.total_profit)">
            <div class="profit">{{ formatSignedAmount(fund.total_profit) }}</div>
            <div class="rate">{{ formatSignedPercent(fund.profit_rate || 0) }}</div>
            <div class="rate" :class="profitClass(fund.daily_profit)">日收益 {{ formatSignedAmount(fund.daily_profit) }}</div>
          </div>
        </div>
      </div>
      <van-empty v-else description="当前筛选下暂无基金数据" />
    </div>

    <div class="section">
      <div class="section-title">🤖 顾投组合</div>
      <div class="position-list">
        <div v-for="product in advisoryProducts" :key="product.id" class="position-item">
          <div class="position-info">
            <div class="fund-name">{{ product.product_name }}</div>
            <div class="fund-meta">
              <span class="fund-code">顾投组合</span>
              <span v-if="product.member_name" class="member-tag">{{ product.member_emoji }} {{ product.member_name }}</span>
              <span class="account-tag">{{ product.account_name || '未绑定账户' }}</span>
            </div>
          </div>
          <div class="position-profit" :class="profitClass(product.current_profit)">
            <div class="profit">{{ formatSignedAmount(product.current_profit) }}</div>
            <div class="rate">{{ formatSignedPercent(product.profit_rate || 0) }}</div>
          </div>
        </div>
        <van-empty v-if="!advisoryProducts.length" description="暂无顾投组合" />
      </div>
    </div>

    <van-loading v-if="loading" type="spinner" class="loading" />
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { showToast } from 'vant'
import SectionShortcutNav from '../components/SectionShortcutNav.vue'
import TrendChart from '../components/TrendChart.vue'
import { formatAmount, formatPercent, formatSignedAmount, profitClass } from '../utils/formatters'
import { captureProfitSnapshotFromApis } from '../utils/profitSnapshotService'
import { shouldRefreshPageData } from '../utils/perfHelpers'
import { getProfitSnapshots } from '../utils/profitLedger'
import {
  buildAccountFilterOptions,
  buildCurrentFundRows,
  buildDailyHistoryRows,
  buildDisplayTrendSeries,
  buildFundSelectorOptions,
  buildFundTypeFilterOptions,
  buildMemberFilterOptions,
  buildPeriodHistoryRows,
  buildTrendSeries,
  getNextLoopDisplayCount,
} from '../utils/statsHistory'

const loading = ref(false)
const overview = ref(null)
const advisoryProducts = ref([])
const allSnapshots = ref([])
const lastLoadedAt = ref(0)
const hasLoadedOnce = ref(false)

const selectedMember = ref('all')
const selectedAccount = ref('all')
const selectedFundType = ref('all')
const selectedFundCode = ref('all')
const selectedTrendRow = ref(null)
const trendMode = ref('daily')
const dailyRange = ref(30)
const periodMode = ref('week')
const periodVisibleCountMap = ref({
  week: 2,
  month: 2,
  quarter: 2,
  halfyear: 2,
  year: 2,
})
const dailyHistoryDisplay = ref('card')
const dailyHistoryVisibleCount = ref(2)
const monthPeriodVisibleCount = ref(2)

const analysisLinks = [
  { label: '统计', to: '/stats', icon: '📈' },
  { label: '顾投', to: '/advisory', icon: '🤖' },
]

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

const fetchData = async () => {
  loading.value = true
  try {
    const data = await captureProfitSnapshotFromApis()
    overview.value = data.overview
    advisoryProducts.value = data.advisoryProducts
    refreshSnapshots()
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
const fundSelectorOptions = computed(() => buildFundSelectorOptions(allSnapshots.value, {
  memberId: selectedMember.value,
  accountId: selectedAccount.value,
  fundType: selectedFundType.value,
}))
const activeAccountName = computed(() => accountOptions.value.find(item => item.value === selectedAccount.value)?.text || '全部账户')
const activeMemberName = computed(() => memberOptions.value.find(item => item.value === selectedMember.value)?.text || '全部成员')
const activeFundTypeName = computed(() => fundTypeOptions.value.find(item => item.value === selectedFundType.value)?.text || '全部类型')
const activeFundName = computed(() => fundSelectorOptions.value.find(item => item.value === selectedFundCode.value)?.text || '全部基金')
const activeScopeName = computed(() => {
  const parts = [selectedAccount.value === 'all' ? activeAccountName.value : `${activeMemberName.value} · ${activeAccountName.value}`]
  if (selectedFundType.value !== 'all') parts.push(activeFundTypeName.value)
  if (selectedFundCode.value !== 'all') parts.push(activeFundName.value)
  return parts.join(' / ')
})
const currentPeriodLabel = computed(() => periodOptions.find(item => item.value === periodMode.value)?.text || '周')
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
const monthPeriodRows = computed(() => buildPeriodHistoryRows(allSnapshots.value, {
  memberId: selectedMember.value,
  accountId: selectedAccount.value,
  fundType: selectedFundType.value,
  period: 'month',
}))
const visiblePeriodRows = computed(() => {
  const count = periodVisibleCountMap.value[periodMode.value] || 2
  return periodRows.value.slice(0, count)
})
const visibleMonthPeriodRows = computed(() => monthPeriodRows.value.slice(0, monthPeriodVisibleCount.value))
const currentFundRows = computed(() => buildCurrentFundRows(allSnapshots.value, {
  memberId: selectedMember.value,
  accountId: selectedAccount.value,
  fundType: selectedFundType.value,
  fundCode: selectedFundCode.value,
}))
const trendRows = computed(() => (trendMode.value === 'daily' ? trendDailyRows.value : periodRows.value))
const trendSummaryLabel = computed(() => (trendMode.value === 'daily' ? '所选日期日收益' : '所选周期阶段收益'))
const trendSeries = computed(() => {
  if (trendMode.value === 'daily') {
    return buildDisplayTrendSeries(trendDailyRows.value, { metric: 'daily_profit', mode: 'daily' })
  }
  return buildTrendSeries(periodRows.value, { metric: 'period_profit', mode: 'period' })
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

const handleMoreMonthPeriodRows = () => {
  monthPeriodVisibleCount.value = getNextLoopDisplayCount({
    total: monthPeriodRows.value.length,
    current: monthPeriodVisibleCount.value,
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

watch([selectedMember, selectedAccount, selectedFundType, selectedFundCode], () => {
  dailyHistoryVisibleCount.value = 2
  monthPeriodVisibleCount.value = 2
})

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

watch(fundSelectorOptions, (options) => {
  const exists = options.some(item => item.value === selectedFundCode.value)
  if (!exists) selectedFundCode.value = 'all'
}, { immediate: true })

onMounted(() => {
  ensureFreshData({ force: true })
})

onActivated(() => {
  ensureFreshData()
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
  padding: 22px 18px 18px;
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
  margin-bottom: 18px;
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
  font-size: 32px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.profit-row {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 14px 0;
  margin-bottom: 14px;
}

.profit-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
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
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.rate-value {
  font-size: 15px;
  font-weight: 700;
}

.analysis-nav {
  margin-top: 14px;
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
  padding: 12px;
}

.daily-history-card {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  padding: 12px;
}

.daily-card-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 10px;
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
