<template>
  <div class="ledger-page">
    <div class="ledger-header">
      <div>
        <div class="page-title">📒 收益台账</div>
        <div class="page-subtitle">按天记录总资产、昨日收益、持有收益变化</div>
      </div>
      <van-button size="small" type="primary" plain @click="handleRefresh">刷新记录</van-button>
    </div>

    <div class="period-tabs">
      <van-tabs v-model:active="activePeriod">
        <van-tab v-for="item in periodOptions" :key="item.value" :title="item.label" :name="item.value" />
      </van-tabs>
    </div>

    <div class="section nav-section">
      <SectionShortcutNav :items="analysisLinks" />
    </div>

    <div v-if="rangeSummary.latest" class="summary-card">
      <div class="summary-top">
        <div>
          <div class="summary-label">最新总资产</div>
          <div class="summary-value">¥{{ formatAmount(rangeSummary.latest.summary.totalMarketValue) }}</div>
        </div>
        <div class="summary-date">{{ rangeSummary.latest.date }}</div>
      </div>
      <div class="summary-grid">
        <div class="metric-card">
          <span class="metric-label">区间资产变化</span>
          <span class="metric-value" :class="profitClass(rangeSummary.assetChange)">{{ formatSigned(rangeSummary.assetChange) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">区间持有收益变化</span>
          <span class="metric-value" :class="profitClass(rangeSummary.holdingProfitChange)">{{ formatSigned(rangeSummary.holdingProfitChange) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">最好单日收益</span>
          <span class="metric-value positive">{{ formatSigned(rangeSummary.bestYesterdayProfit) }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">最差单日收益</span>
          <span class="metric-value negative">{{ formatSigned(rangeSummary.worstYesterdayProfit) }}</span>
        </div>
      </div>
    </div>

    <div v-if="fundTrend.length" class="section">
      <div class="section-title">📦 当前持仓收益跟踪</div>
      <div class="fund-list">
        <div v-for="fund in fundTrend" :key="fund.fund_code" class="fund-card">
          <div class="fund-main">
            <div class="fund-name-row">
              <span class="fund-name">{{ fund.fund_name || fund.fund_code }}</span>
              <span class="fund-code">{{ fund.fund_code }}</span>
            </div>
            <div class="fund-tags">
              <span v-if="fund.member_name" class="member-tag">{{ fund.member_emoji || '👤' }} {{ fund.member_name }}</span>
              <span v-if="fund.account_name" class="account-tag">{{ fund.account_name }}</span>
            </div>
          </div>
          <div class="fund-metrics">
            <div class="fund-asset">¥{{ formatAmount(fund.asset_value) }}</div>
            <div class="fund-profit" :class="profitClass(fund.current_profit)">{{ formatSigned(fund.current_profit) }}</div>
            <div class="fund-delta" :class="profitClass(fund.profit_change)">
              区间变化 {{ formatSigned(fund.profit_change) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">🗓️ 每日收益记录</div>
      <div v-if="snapshots.length" class="snapshot-list">
        <div v-for="snapshot in snapshots" :key="snapshot.date" class="snapshot-card">
          <div class="snapshot-top">
            <div class="snapshot-date">{{ snapshot.date }}</div>
            <div class="snapshot-assets">¥{{ formatAmount(snapshot.summary.totalMarketValue) }}</div>
          </div>
          <div class="snapshot-grid">
            <div class="snapshot-item">
              <span class="item-label">昨日收益</span>
              <span class="item-value" :class="profitClass(snapshot.summary.totalYesterdayProfit)">{{ formatSigned(snapshot.summary.totalYesterdayProfit) }}</span>
            </div>
            <div class="snapshot-item">
              <span class="item-label">持有收益</span>
              <span class="item-value" :class="profitClass(snapshot.summary.totalHoldingProfit)">{{ formatSigned(snapshot.summary.totalHoldingProfit) }}</span>
            </div>
            <div class="snapshot-item">
              <span class="item-label">累计收益</span>
              <span class="item-value" :class="profitClass(snapshot.summary.totalCumulativeProfit)">{{ formatSigned(snapshot.summary.totalCumulativeProfit) }}</span>
            </div>
            <div class="snapshot-item">
              <span class="item-label">记录持仓数</span>
              <span class="item-value neutral">{{ snapshot.positions?.length || 0 }} 只</span>
            </div>
          </div>
        </div>
      </div>
      <van-empty v-else description="暂时还没有收益快照，进入本页后会自动记录今天的数据" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import SectionShortcutNav from '../components/SectionShortcutNav.vue'
import { formatAmount, formatSignedAmount, profitClass } from '../utils/formatters'
import { buildFundTrend, fetchProfitSnapshots, getProfitSnapshots, summarizeProfitRange } from '../utils/profitLedger'
import { captureProfitSnapshotFromApis } from '../utils/profitSnapshotService'

const periodOptions = [
  { label: '近7天', value: 7 },
  { label: '近30天', value: 30 },
  { label: '近90天', value: 90 },
]

const activePeriod = ref(30)
const allSnapshots = ref([])
const loading = ref(false)

const analysisLinks = [
  { label: '统计', to: '/stats', icon: '📈' },
  { label: '配置', to: '/allocation', icon: '🎯' },
  { label: '台账', to: '/ledger', icon: '📒' },
  { label: '顾投', to: '/advisory', icon: '🤖' },
]

const snapshots = computed(() => {
  const days = activePeriod.value
  if (!days) return allSnapshots.value

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`

  return allSnapshots.value.filter(item => item.date >= startKey)
})
const rangeSummary = computed(() => summarizeProfitRange(snapshots.value))
const fundTrend = computed(() => buildFundTrend(snapshots.value))

const formatSigned = formatSignedAmount

const refreshLocalSnapshots = () => {
  allSnapshots.value = getProfitSnapshots()
}

const captureSnapshot = async () => {
  loading.value = true
  try {
    const data = await captureProfitSnapshotFromApis()
    if (!data.snapshotResult?.saved) {
      throw new Error(data.snapshotResult?.reason || 'snapshot-save-failed')
    }

    refreshLocalSnapshots()
    return true
  } catch (error) {
    console.error('capture snapshot failed:', error)
    showToast('收益台账刷新失败')
    return false
  } finally {
    loading.value = false
  }
}

const handleRefresh = async () => {
  const success = await captureSnapshot()
  if (success) {
    showToast('收益台账已刷新')
  }
}

onMounted(async () => {
  try { allSnapshots.value = await fetchProfitSnapshots() } catch { refreshLocalSnapshots() }
  await captureSnapshot()
})
</script>

<style scoped>
.ledger-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 12px 12px 84px;
}

.ledger-header,
.summary-card,
.section {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
}

.nav-section {
  padding: 12px 16px;
}

.ledger-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: #222;
}

.page-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: #888;
}

.period-tabs {
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 12px;
}

.summary-card {
  background: linear-gradient(135deg, #1e80ff 0%, #0066cc 100%);
  color: #fff;
}

.summary-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 14px;
}

.summary-label {
  font-size: 13px;
  opacity: 0.85;
}

.summary-value {
  margin-top: 6px;
  font-size: 30px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.summary-date {
  font-size: 13px;
  opacity: 0.9;
}

.summary-grid,
.snapshot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.metric-card,
.snapshot-item {
  background: rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  padding: 10px 12px;
}

.metric-label,
.item-label {
  display: block;
  font-size: 12px;
  opacity: 0.85;
  margin-bottom: 4px;
}

.metric-value,
.item-value {
  font-size: 15px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #222;
  margin-bottom: 12px;
}

.fund-list,
.snapshot-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fund-card,
.snapshot-card {
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  padding: 12px;
  background: #fafafa;
}

.fund-card {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.fund-main {
  min-width: 0;
  flex: 1;
}

.fund-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.fund-name {
  font-size: 14px;
  font-weight: 600;
  color: #222;
}

.fund-code {
  font-size: 11px;
  color: #888;
  font-family: 'Courier New', monospace;
}

.fund-tags {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.member-tag,
.account-tag {
  font-size: 11px;
  border-radius: 999px;
  padding: 2px 8px;
}

.member-tag {
  color: #1a73e8;
  background: #e8f0fe;
}

.account-tag {
  color: #666;
  background: #f0f0f0;
}

.fund-metrics {
  text-align: right;
  flex-shrink: 0;
}

.fund-asset,
.snapshot-assets {
  font-size: 16px;
  font-weight: 700;
  color: #222;
  font-family: 'Courier New', monospace;
}

.fund-profit {
  margin-top: 4px;
  font-size: 15px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.fund-delta {
  margin-top: 4px;
  font-size: 12px;
}

.snapshot-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.snapshot-date {
  font-size: 14px;
  font-weight: 600;
  color: #222;
}

.positive {
  color: #f87171;
}

.negative {
  color: #4ade80;
}

.neutral {
  color: #666;
}
</style>
