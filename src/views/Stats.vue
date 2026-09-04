<template>
  <div class="stats-page">
    <nav class="stats-domain-tabs" aria-label="统计类型">
      <button :class="{ active: activeStatsDomain === 'family' }" @click="activeStatsDomain = 'family'">家庭资产</button>
      <button :class="{ active: activeStatsDomain === 'fund' }" @click="activeStatsDomain = 'fund'">基金收益</button>
    </nav>

    <template v-if="activeStatsDomain === 'family'">
      <section class="family-stats-hero">
        <div class="family-stats-head"><span>家庭净资产</span><button @click="handleRefresh">刷新数据</button></div>
        <strong>{{ familyMoney(familyOverview?.summary?.net_worth) }}</strong>
        <div class="family-stats-grid">
          <div><span>总资产</span><b>{{ familyMoney(familyOverview?.summary?.total_assets) }}</b></div>
          <div><span>应收款</span><b>{{ familyMoney(familyOverview?.summary?.receivable_value) }}</b></div>
          <div><span>总负债</span><b>{{ familyMoney(familyOverview?.summary?.total_liabilities) }}</b></div>
          <div><span>可投资资产</span><b>{{ familyMoney(familyOverview?.summary?.investable_assets) }}</b></div>
        </div>
      </section>

      <section class="section family-trend-section">
        <div class="section-header"><div><div class="section-title">📈 净资产趋势</div><div class="section-subtitle">家庭资产、应收和负债变化后自动记录</div></div></div>
        <TrendChart :points="familyNetWorthPoints" summary-label="所选日期净资产" :formatter="familyMoney" :y-axis-formatter="compactFamilyMoney" />
      </section>

      <section class="section">
        <div class="section-header"><div><div class="section-title">🏠 家庭资产结构</div><div class="section-subtitle">基金自动汇总，其他项目来自家庭财务记账</div></div></div>
        <div class="family-structure-list">
          <div v-for="item in familyStructureRows" :key="item.key"><span><i :style="{ background: item.color }"></i>{{ item.label }}</span><b>{{ familyMoney(item.value) }}</b></div>
        </div>
        <button class="family-detail-button" @click="router.push('/family-finance')">查看家庭财务明细</button>
      </section>
    </template>

    <template v-else>
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
          <div class="section-subtitle">按确认日统计，包含当天更新的 QDII 收益</div>
        </div>
      </div>

      <div class="scope-summary-row">
        <span>当前：{{ activeScopeName }}</span>
        <div><button v-if="authIdentity.linked_member_id" class="text-button" @click="selectMyAssets">我的资产</button><button class="text-button" @click="showScopeFilters = !showScopeFilters">{{ showScopeFilters ? '收起' : '筛选' }}</button></div>
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

      <div class="trend-control-grid" :class="{ 'two-columns': trendMode === 'daily' }">
        <label>走势<select v-model="trendMode"><option v-for="item in trendModeOptions" :key="item.value" :value="item.value">{{ item.text }}</option></select></label>
        <label v-if="trendMode === 'period'">区间<select v-model="periodMode"><option v-for="item in periodOptions" :key="item.value" :value="item.value">{{ item.text }}</option></select></label>
        <label>指标<select v-model="trendMetric"><option value="amount">收益金额</option><option value="rate">收益率</option></select></label>
      </div>

      <AllocationBucketProfitCalendar
        v-if="trendMode === 'daily'"
        :series="dailyCalendarSeries"
        :summary-label="trendSummaryLabel"
        :formatter="trendMetric === 'rate' ? formatSignedPercent : formatCurrencyValue"
        @select="handleTrendSelect"
      />
      <PeriodProfitBarChart
        v-else
        :points="periodTrendSeries"
        :summary-label="trendSummaryLabel"
        :formatter="trendMetric === 'rate' ? formatSignedPercent : formatCurrencyValue"
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
          <span class="metric-label">{{ cumulativeMetricPrefix }}总金额</span>
          <span class="metric-value neutral">{{ formatCurrencyValue(selectedTrendRow.total_market_value) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">{{ cumulativeMetricPrefix }}总收益</span>
          <span class="metric-value" :class="profitClass(selectedTrendRow.total_profit)">{{ formatSignedAmount(selectedTrendRow.total_profit) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">{{ cumulativeMetricPrefix }}收益率</span>
          <span class="metric-value" :class="profitClass(selectedTrendRow.total_profit_rate)">{{ formatSignedPercent(selectedTrendRow.total_profit_rate) }}</span>
        </div>
      </div>
      <p v-if="selectedTrendRow && trendMode === 'daily'" class="snapshot-metric-note">
        日收益按确认日统计，包含当天更新的上一交易日 QDII 收益；净值归属日仅用于明细说明。
      </p>
    </div>

    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">🗂️ 周期汇总</div>
          <div class="section-subtitle">{{ currentPeriodLabel }}视角下的阶段表现</div>
        </div>
        <button class="health-entry-button" @click="router.push('/data-health')">数据健康 <van-icon name="arrow" /></button>
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
        <div
          v-for="row in visiblePeriodReconciliations"
          :key="row.period_key"
          class="period-card reconciliation-card"
          role="button"
          tabindex="0"
          @click="openReconciliation(row)"
          @keydown.enter="openReconciliation(row)"
        >
          <div class="period-top">
            <div>
              <div class="period-title">{{ row.period_label }} <span v-if="row.period_scope_note" class="period-scope-note">{{ row.period_scope_note }}</span></div>
              <div class="period-date">{{ row.coverage_start_date }} ~ {{ row.end_date }} <span v-if="row.coverage_note">· {{ row.coverage_note }}</span></div>
            </div>
            <van-icon class="period-card-arrow" name="arrow" />
          </div>
          <div class="period-metric-grid">
            <div class="period-main-metric">
              <span>期末基金市值</span>
              <strong :class="profitClass(row.closing_market_value)">¥{{ formatAmount(row.closing_market_value) }}</strong>
            </div>
            <div class="period-main-metric profit-metric">
              <span>本期投资收益</span>
              <strong :class="profitClass(row.investment_profit)">{{ formatSignedAmount(row.investment_profit) }}</strong>
              <small :class="profitClass(row.investment_profit_rate)">{{ formatSignedPercent(row.investment_profit_rate) }}</small>
            </div>
          </div>
          <div class="period-balance-line">
            <span>期初 <b :class="profitClass(row.opening_market_value)">¥{{ formatAmount(row.opening_market_value) }}</b></span>
            <van-icon name="arrow" />
            <span>期末 <b :class="profitClass(row.closing_market_value)">¥{{ formatAmount(row.closing_market_value) }}</b></span>
          </div>
          <div class="period-secondary reconciliation-meta">
            <span class="flow-chip">已记录资金 <b :class="profitClass(row.explicit_capital_flow)">{{ formatSignedAmount(row.explicit_capital_flow) }}</b></span>
            <span v-if="Math.abs(row.dividend_settlement_flow) >= 0.01" class="dividend-settlement-chip">{{ row.dividend_settlement_flow < 0 ? '分红待入账' : '分红已到账' }} <b :class="profitClass(row.dividend_settlement_flow)">{{ formatSignedAmount(row.dividend_settlement_flow) }}</b></span>
            <span v-if="Math.abs(row.inferred_position_flow) >= 0.01" class="snapshot-gap-chip">快照差额 <b :class="profitClass(row.inferred_position_flow)">{{ formatSignedAmount(row.inferred_position_flow) }}</b></span>
            <span class="reconciliation-link">查看明细 <van-icon name="arrow" /></span>
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

    <van-popup v-model:show="showReconciliationDetail" position="bottom" round teleport="body" class="reconciliation-popup">
      <div v-if="selectedReconciliation" class="reconciliation-detail">
        <div class="detail-drag-handle"></div>
        <div class="detail-header">
          <div><strong>周期对账明细</strong><span>{{ selectedReconciliation.coverage_start_date }} ~ {{ selectedReconciliation.end_date }}{{ selectedReconciliation.coverage_note ? ` · ${selectedReconciliation.coverage_note}` : '' }}</span></div>
          <button @click="showReconciliationDetail = false"><van-icon name="cross" /></button>
        </div>
        <div class="detail-equation">
          <div><span>期初基金市值</span><b>¥{{ formatAmount(selectedReconciliation.opening_market_value) }}</b></div>
          <div><span><i>+</i> 已记录资金流</span><b :class="profitClass(selectedReconciliation.explicit_capital_flow)">{{ formatSignedAmount(selectedReconciliation.explicit_capital_flow) }}</b></div>
          <div><span><i>+</i> 本期投资收益</span><b :class="profitClass(selectedReconciliation.investment_profit)">{{ formatSignedAmount(selectedReconciliation.investment_profit) }}</b></div>
          <div v-if="Math.abs(selectedReconciliation.dividend_settlement_flow) >= 0.01"><span><i>+</i> 分红结算调整</span><b :class="profitClass(selectedReconciliation.dividend_settlement_flow)">{{ formatSignedAmount(selectedReconciliation.dividend_settlement_flow) }}</b></div>
          <div v-if="Math.abs(selectedReconciliation.inferred_position_flow) >= 0.01" class="snapshot-gap-row"><span><i>+</i> 快照差额</span><b :class="profitClass(selectedReconciliation.inferred_position_flow)">{{ formatSignedAmount(selectedReconciliation.inferred_position_flow) }}</b></div>
          <div class="detail-total-row"><span><i>=</i> 期末基金市值</span><b>¥{{ formatAmount(selectedReconciliation.closing_market_value) }}</b></div>
        </div>
        <div class="detail-status" :class="{ balanced: Math.abs(selectedReconciliation.inferred_position_flow) < 0.01 }">
          <van-icon :name="Math.abs(selectedReconciliation.inferred_position_flow) < 0.01 ? 'passed' : 'info-o'" />
          {{ Math.abs(selectedReconciliation.inferred_position_flow) < 0.01 ? '明细与快照完全匹配' : '已计入快照差额，等式已勾稽' }}
        </div>
        <p v-if="Math.abs(selectedReconciliation.inferred_position_flow) >= 0.01" class="detail-note">
          <strong>什么是快照差额？</strong>
          它不是一笔真实交易，而是“期末市值变化”扣除已记录资金流、已确认收益和分红结算后的差额。通常来自非每日净值基金、净值/份额精度、历史补录或手动校准。
        </p>
        <div class="ledger-heading"><strong>明细流水</strong><span>交易归属日 · 收益确认日</span></div>
        <div v-if="selectedReconciliation.ledger_entries.length" class="ledger-list">
          <div v-for="entry in selectedReconciliation.ledger_entries" :key="entry.key" class="ledger-row">
            <div class="ledger-date">{{ shortMonthDay(entry.date) }}</div>
            <div class="ledger-copy"><span class="ledger-category">{{ entry.category }}</span><strong>{{ entry.title }}</strong><small>{{ entry.note }}</small></div>
            <b :class="profitClass(entry.reference_amount ?? entry.amount)">{{ formatSignedAmount(entry.reference_amount ?? entry.amount) }}</b>
          </div>
        </div>
        <van-empty v-else image-size="60" description="该周期暂无资金或收益流水" />
      </div>
    </van-popup>

    </template>
    <van-loading v-if="loading" type="spinner" class="loading" />
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import AllocationBucketProfitCalendar from '../components/AllocationBucketProfitCalendar.vue'
import PeriodProfitBarChart from '../components/PeriodProfitBarChart.vue'
import TrendChart from '../components/TrendChart.vue'
import { eventApi, familyFinanceApi, tradeApi } from '../api'
import { authIdentity, loadAuthIdentity } from '../utils/authIdentity'
import { formatAmount, formatPercent, formatSignedAmount, profitClass } from '../utils/formatters'
import { captureProfitSnapshotFromApis } from '../utils/profitSnapshotService'
import { shouldRefreshPageData } from '../utils/perfHelpers'
import { INVESTMENT_DATA_UPDATED_EVENT } from '../utils/appShell'
import { fetchProfitSnapshots, getProfitSnapshots } from '../utils/profitLedger'
import { readPageCache, writePageCache } from '../utils/pageCache'
import {
  buildAccountFilterOptions,
  buildPeriodProfitContributionRows,
  buildDailyHistoryRows,
  buildFundTypeFilterOptions,
  buildMemberFilterOptions,
  buildPeriodHistoryRows,
  buildTrendSeries,
  getNextLoopDisplayCount,
} from '../utils/statsHistory'
import { buildPeriodReconciliations } from '../utils/statsReconciliation'

const cachedStats = readPageCache('stats')
const router = useRouter()
const loading = ref(false)
const overview = ref(cachedStats?.overview || null)
const familyOverview = ref(cachedStats?.familyOverview || null)
const activeStatsDomain = ref('family')
const allSnapshots = ref(getProfitSnapshots())
const allTrades = ref(cachedStats?.trades || [])
const allDividendEvents = ref(cachedStats?.dividendEvents || [])
const lastLoadedAt = ref(cachedStats?.savedAt || 0)
const hasLoadedOnce = ref(Boolean(cachedStats?.overview))

const selectedMember = ref('all')
const selectedAccount = ref('all')
const selectedFundType = ref('all')
const selectedTrendRow = ref(null)
const showScopeFilters = ref(false)
const trendMode = ref('daily')
const trendMetric = ref('amount')
const periodMode = ref('week')
const periodVisibleCountMap = ref({
  week: 2,
  month: 2,
  quarter: 2,
  halfyear: 2,
  year: 2,
})
const contributionRange = ref(30)
const selectedReconciliation = ref(null)
const showReconciliationDetail = ref(false)

const familyMoney = value => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const compactFamilyMoney = value => {
  const number = Number(value || 0)
  if (Math.abs(number) >= 10000) return `¥${(number / 10000).toFixed(1)}万`
  return `¥${Math.round(number).toLocaleString('zh-CN')}`
}
const familyNetWorthPoints = computed(() => (familyOverview.value?.snapshots || []).map(item => ({
  key: item.date,
  date: item.date,
  value: Number(item.net_worth || 0),
})))
const familyStructureRows = computed(() => {
  const summary = familyOverview.value?.summary || {}
  const palette = ['#1e80ff', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#eab308']
  const categoryMap = new Map((familyOverview.value?.categories?.assets || []).map(item => [item.code, item.name]))
  const manualRows = new Map()
  for (const asset of familyOverview.value?.assets || []) {
    const key = asset.category_code || 'other_asset'
    manualRows.set(key, Number(manualRows.get(key) || 0) + Number(asset.current_value || 0))
  }
  const rows = [
    { key: 'fund', label: '基金资产', value: Number(summary.fund_value || 0) },
    { key: 'advisory', label: '顾投', value: Number(summary.advisory_value || 0) },
    ...[...manualRows.entries()].map(([key, value]) => ({ key: `asset-${key}`, label: categoryMap.get(key) || '其他资产', value })),
    { key: 'receivable', label: '应收款', value: Number(summary.receivable_value || 0) },
    { key: 'liability', label: '家庭负债', value: Number(summary.total_liabilities || 0) },
  ].filter(item => item.value !== 0)
  return rows.map((item, index) => ({ ...item, color: palette[index % palette.length] }))
})

const trendModeOptions = [
  { text: '按天', value: 'daily' },
  { text: '按周期', value: 'period' },
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

const loadTrades = async () => {
  try {
    const tradeData = await tradeApi.list()
    allTrades.value = tradeData?.trades || []
  } catch (error) {
    console.warn('Failed to load reconciliation trades:', error)
  }
}

const loadDividendEvents = async () => {
  try {
    const eventData = await eventApi.list({ group: 'all', limit: 200 })
    const groups = eventData?.groups || {}
    allDividendEvents.value = [...(groups.pending || []), ...(groups.confirmed || [])]
      .filter(event => event.event_type === 'dividend' && event.source_type === 'dividend_announcement')
  } catch (error) {
    console.warn('Failed to load dividend reconciliation events:', error)
  }
}

const fetchData = async () => {
  loading.value = true
  try {
    const [fundResult, familyResult] = await Promise.allSettled([captureProfitSnapshotFromApis(), familyFinanceApi.overview()])
    if (fundResult.status === 'rejected') throw fundResult.reason
    overview.value = fundResult.value.overview
    if (familyResult.status === 'fulfilled') familyOverview.value = familyResult.value
    else console.warn('Failed to fetch family stats:', familyResult.reason)
    refreshSnapshots()
    await Promise.all([loadTrades(), loadDividendEvents()])
    writePageCache('stats', { overview: overview.value, familyOverview: familyOverview.value, trades: allTrades.value, dividendEvents: allDividendEvents.value })
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
  if (activeStatsDomain.value === 'family') {
    loading.value = true
    try {
      familyOverview.value = await familyFinanceApi.overview()
      writePageCache('stats', { overview: overview.value, familyOverview: familyOverview.value, trades: allTrades.value, dividendEvents: allDividendEvents.value })
      showToast('家庭资产统计已刷新')
    } catch (error) {
      console.error('Failed to refresh family stats:', error)
      showToast('家庭资产刷新失败')
    } finally {
      loading.value = false
    }
    return
  }
  await fetchData()
  showToast('基金收益统计已刷新')
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
const periodRows = computed(() => buildPeriodHistoryRows(allSnapshots.value, {
  memberId: selectedMember.value,
  accountId: selectedAccount.value,
  fundType: selectedFundType.value,
  period: periodMode.value,
}))
const periodReconciliations = computed(() => buildPeriodReconciliations({
  periodRows: periodRows.value,
  dailyRows: allDailyHistoryRows.value,
  snapshots: allSnapshots.value,
  trades: allTrades.value,
  dividendEvents: allDividendEvents.value,
  filters: {
    memberId: selectedMember.value,
    accountId: selectedAccount.value,
    fundType: selectedFundType.value,
  },
}))
const visiblePeriodRows = computed(() => {
  const count = periodVisibleCountMap.value[periodMode.value] || 2
  return periodRows.value.slice(0, count)
})
const visiblePeriodReconciliations = computed(() => {
  const count = periodVisibleCountMap.value[periodMode.value] || 2
  return periodReconciliations.value.slice(0, count)
})
const contributionRows = computed(() => buildPeriodProfitContributionRows(allSnapshots.value, {
  memberId: selectedMember.value,
  accountId: selectedAccount.value,
  fundType: selectedFundType.value,
  days: contributionRange.value,
  limit: 3,
}))
const trendRows = computed(() => (trendMode.value === 'daily' ? allDailyHistoryRows.value : periodRows.value))
const trendSummaryLabel = computed(() => {
  const suffix = trendMetric.value === 'rate' ? '收益率' : '收益'
  return trendMode.value === 'daily' ? `所选日期${suffix}` : `所选周期阶段${suffix}`
})
const dailyCalendarSeries = computed(() => [{
  key: 'daily-profit',
  assetType: 'daily-profit',
  label: activeScopeName.value,
  points: allDailyHistoryRows.value.map(row => ({
    date: row.date,
    value: Number(row[trendMetric.value === 'rate' ? 'daily_profit_rate' : 'daily_profit']) || 0,
    raw: row,
  })),
}])
const periodTrendSeries = computed(() => buildTrendSeries(periodRows.value, {
  metric: trendMetric.value === 'rate' ? 'period_profit_rate' : 'period_profit',
  mode: 'period',
}))
const selectedTrendDateLabel = computed(() => {
  if (!selectedTrendRow.value) return '-'
  return trendMode.value === 'daily'
    ? selectedTrendRow.value.date || '-'
    : `${selectedTrendRow.value.start_date || '-'} ~ ${selectedTrendRow.value.end_date || '-'}`
})
const cumulativeMetricPrefix = computed(() => (trendMode.value === 'daily' ? '快照' : '期末'))

const formatSignedPercent = (value) => {
  const num = Number(value) || 0
  const prefix = num > 0 ? '+' : ''
  return `${prefix}${formatPercent(num)}`
}

const formatCurrencyValue = (value) => `¥${formatAmount(value)}`
const shortMonthDay = date => String(date || '').slice(5).replace('-', '月') + (date ? '日' : '')
const handleTrendSelect = (row) => {
  selectedTrendRow.value = row
}

const openReconciliation = (row) => {
  selectedReconciliation.value = row
  showReconciliationDetail.value = true
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

watch(trendRows, (rows) => {
  selectedTrendRow.value = rows[0] || null
}, { immediate: true })

const resetFilters = () => {
  selectedMember.value = 'all'
  selectedAccount.value = 'all'
  selectedFundType.value = 'all'
}
const selectMyAssets = () => {
  if (!authIdentity.linked_member_id) return
  selectedMember.value = authIdentity.linked_member_id
  selectedAccount.value = 'all'
}

const handleInvestmentDataUpdated = () => {
  fetchData().catch(() => {})
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
  window.addEventListener(INVESTMENT_DATA_UPDATED_EVENT, handleInvestmentDataUpdated)
  loadAuthIdentity().catch(() => {})
  ensureFreshData({ force: true })
  syncSnapshots().catch(() => {})
  loadTrades().catch(() => {})
  loadDividendEvents().catch(() => {})
})

onUnmounted(() => {
  window.removeEventListener(INVESTMENT_DATA_UPDATED_EVENT, handleInvestmentDataUpdated)
})

onActivated(() => {
  ensureFreshData()
  syncSnapshots().catch(() => {})
  loadTrades().catch(() => {})
  loadDividendEvents().catch(() => {})
})
</script>

<style scoped>
.stats-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: var(--app-floating-page-space);
}

.stats-domain-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  margin: 10px 12px 12px;
  padding: 4px;
  border: 1px solid #e4eaf2;
  border-radius: 14px;
  background: #eef2f7;
}
.stats-domain-tabs button { height: 40px; border: 0; border-radius: 10px; background: transparent; color: #758196; font-size: 14px; font-weight: 600; }
.stats-domain-tabs button.active { color: #1e80ff; background: #fff; box-shadow: 0 3px 10px rgba(37,59,91,.09); }

.family-stats-hero {
  margin: 0 12px 12px;
  padding: 17px 18px 15px;
  border-radius: 18px;
  color: #fff;
  background: linear-gradient(135deg, #1e80ff 0%, #0066cc 100%);
}
.family-stats-head { display: flex; align-items: center; justify-content: space-between; }
.family-stats-head span { font-size: 13px; opacity: .78; }
.family-stats-head button { height: 28px; padding: 0 11px; border: 1px solid rgba(255,255,255,.3); border-radius: 999px; color: #fff; background: rgba(255,255,255,.1); font-size: 11px; }
.family-stats-hero > strong { display: block; margin-top: 6px; font-size: 29px; font-variant-numeric: tabular-nums; }
.family-stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); margin-top: 13px; border-radius: 10px; background: rgba(255,255,255,.1); }
.family-stats-grid div { padding: 9px; text-align: center; }
.family-stats-grid div:nth-child(even) { border-left: 1px solid rgba(255,255,255,.2); }
.family-stats-grid div:nth-child(n + 3) { border-top: 1px solid rgba(255,255,255,.2); }
.family-stats-grid span, .family-stats-grid b { display: block; }
.family-stats-grid span { font-size: 10px; opacity: .72; }
.family-stats-grid b { margin-top: 3px; font-size: 12px; }
.family-trend-section { overflow: hidden; }
.family-structure-list > div { display: flex; align-items: center; justify-content: space-between; padding: 12px 2px; border-bottom: 1px solid #eef2f7; }
.family-structure-list span { display: flex; align-items: center; gap: 9px; color: #536074; font-size: 13px; }
.family-structure-list i { width: 9px; height: 9px; border-radius: 50%; }
.family-structure-list b { color: #172033; font-size: 14px; }
.family-detail-button { width: 100%; height: 40px; margin-top: 13px; border: 0; border-radius: 10px; color: #1e80ff; background: #eaf3ff; font-size: 13px; font-weight: 600; }

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

.trend-control-grid.two-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
  margin-top: 8px;
  gap: 6px;
}

.trend-metrics-grid .metric-card {
  min-width: 0;
  min-height: 38px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  border-radius: 10px;
}

.trend-metrics-grid .metric-label {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1.2;
}

.trend-metrics-grid .metric-value {
  min-width: 0;
  margin-top: 0;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.2;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snapshot-metric-note {
  margin: 6px 2px 0;
  color: #98a2b3;
  font-size: 10px;
  line-height: 1.4;
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

.metric-label {
  color: #7b8794;
}

.metric-value,
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

.health-entry-button {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 9px;
  background: #eef5ff;
  color: #1e80ff;
  font-size: 11px;
  font-weight: 600;
}

.reconciliation-card {
  cursor: pointer;
  background: linear-gradient(180deg, #fff 0%, #fbfdff 100%);
  border-color: #e2e9f3;
  box-shadow: 0 5px 16px rgba(37, 59, 91, .05);
}

.period-card-arrow {
  flex: none;
  color: #b1bac8;
  font-size: 15px;
}

.period-metric-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.period-main-metric {
  min-width: 0;
  padding: 10px 11px;
  border-radius: 11px;
  background: #f5f8fc;
}

.period-main-metric.profit-metric {
  background: #f7f8ff;
}

.period-main-metric span,
.period-main-metric small {
  display: block;
  color: #8a94a3;
  font-size: 9px;
}

.period-main-metric strong {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: #172033;
  font-family: 'Courier New', monospace;
  font-size: clamp(14px, 4.2vw, 18px);
  letter-spacing: -.3px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.period-main-metric strong.positive,
.period-balance-line b.positive {
  color: #f87171;
}

.period-main-metric strong.negative,
.period-balance-line b.negative {
  color: #4ade80;
}

.period-main-metric small {
  margin-top: 2px;
  font-weight: 600;
}

.period-balance-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
  color: #a0aaba;
  font-size: 9px;
}

.period-balance-line span {
  min-width: 0;
}

.period-balance-line b {
  color: #657187;
  font-family: 'Courier New', monospace;
  font-weight: 600;
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

.reconciliation-card .period-secondary {
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
}

.reconciliation-meta {
  flex-wrap: wrap;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #eef2f7;
}

.flow-chip,
.dividend-settlement-chip,
.snapshot-gap-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 7px;
  border-radius: 999px;
  background: #f2f5f9;
  color: #788497;
  font-size: 9px;
}

.dividend-settlement-chip {
  background: #fff1f2;
  color: #d95a66;
}

.snapshot-gap-chip {
  background: #fff7e8;
  color: #ad7414;
}

.flow-chip b,
.dividend-settlement-chip b,
.snapshot-gap-chip b {
  font-family: 'Courier New', monospace;
}

.reconciliation-link {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  color: #1e80ff;
  font-weight: 600;
}

:deep(.reconciliation-popup) {
  max-height: 88vh;
  overflow-y: auto;
  background: #f5f7fb;
}

.reconciliation-detail {
  padding: 0 14px calc(24px + env(safe-area-inset-bottom));
}

.detail-drag-handle {
  width: 38px;
  height: 4px;
  margin: 8px auto 12px;
  border-radius: 999px;
  background: #d8dee8;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0 3px 13px;
}

.detail-header strong,
.detail-header span {
  display: block;
}

.detail-header strong { color: #172033; font-size: 18px; }
.detail-header span { margin-top: 3px; color: #8a94a3; font-size: 11px; }
.detail-header button { width: 30px; height: 30px; border: 0; border-radius: 50%; background: #e8edf5; color: #64748b; }

.detail-equation {
  padding: 6px 13px;
  border: 1px solid #e2e9f3;
  border-radius: 15px;
  background: #fff;
}

.detail-equation > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  border-bottom: 1px solid #f0f3f7;
}

.detail-equation > div:last-child { border-bottom: 0; }
.detail-equation span { color: #8490a3; font-size: 11px; }
.detail-equation b { flex: none; color: #253047; font-family: 'Courier New', monospace; font-size: 12px; }
.detail-equation i { display: inline-block; width: 12px; color: #a6afbd; font-style: normal; text-align: center; }
.detail-equation .snapshot-gap-row { margin: 0 -5px; padding: 0 5px; border-radius: 8px; background: #fffaf0; }
.detail-equation .detail-total-row { min-height: 44px; }
.detail-equation .detail-total-row span,
.detail-equation .detail-total-row b { color: #172033; font-weight: 700; }

.detail-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 8px 0 13px;
  color: #f59e0b;
  font-size: 11px;
}

.detail-status.balanced { color: #16b364; }
.ledger-heading { display: flex; align-items: baseline; justify-content: space-between; margin: 0 3px 8px; }
.ledger-heading strong { color: #253047; font-size: 14px; }
.ledger-heading span { color: #98a2b3; font-size: 9px; }
.ledger-list { overflow: hidden; border: 1px solid #e4eaf2; border-radius: 15px; background: #fff; }
.ledger-row { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 9px; align-items: center; padding: 11px; border-bottom: 1px solid #eef2f7; }
.ledger-row:last-child { border-bottom: 0; }
.ledger-date { color: #1e80ff; font-size: 10px; font-weight: 700; }
.ledger-copy { min-width: 0; }
.ledger-category { display: inline-block; margin-bottom: 3px; padding: 2px 5px; border-radius: 5px; background: #eef5ff; color: #1e80ff; font-size: 9px; }
.ledger-copy strong, .ledger-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ledger-copy strong { color: #334155; font-size: 11px; }
.ledger-copy small { margin-top: 2px; color: #98a2b3; font-size: 9px; }
.ledger-row > b { font-family: 'Courier New', monospace; font-size: 11px; }
.detail-note { margin: -4px 0 13px; padding: 10px 11px; border-radius: 10px; background: #fff7e8; color: #8a6b35; font-size: 10px; line-height: 1.55; }
.detail-note strong { display: block; margin-bottom: 3px; color: #78520f; font-size: 11px; }

.period-title,
.fund-name {
  font-size: 14px;
  font-weight: 600;
  color: #222;
}

.period-scope-note {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: 999px;
  background: #fff3db;
  color: #b26a00;
  font-size: 10px;
  font-weight: 600;
  vertical-align: 1px;
}

.table-date,
.table-scope {
  font-size: 13px;
  color: #222;
}

.table-scope {
  white-space: nowrap;
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
