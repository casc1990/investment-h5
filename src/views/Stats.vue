<template>
  <div class="stats-page">
    <!-- 总览卡片 -->
    <div class="overview-card">
      <div class="overview-header">
        <div class="total-section">
          <div class="label">💰 总资产</div>
          <div class="amount">¥{{ formatNumber(overview?.totalMarketValue || 0) }}</div>
        </div>
        <div class="profit-section" :class="{ positive: overview?.totalProfit > 0, negative: overview?.totalProfit < 0 }">
          <div class="label">📈 累计收益</div>
          <div class="profit-value">
            {{ overview?.totalProfit >= 0 ? '+' : '' }}¥{{ formatNumber(overview?.totalProfit || 0) }}
          </div>
          <div class="profit-rate">
            收益率 {{ overview?.totalProfitRate || 0 }}%
          </div>
        </div>
      </div>
      
      <div class="overview-details">
        <div class="detail-item">
          <span class="label">总本金</span>
          <span class="value">¥{{ formatNumber(overview?.totalInvested || 0) }}</span>
        </div>
        <div class="detail-item">
          <span class="label">持仓数</span>
          <span class="value">{{ positions?.length || 0 }} 只</span>
        </div>
      </div>
    </div>

    <!-- 账户收益排行 -->
    <div class="section">
      <div class="section-title">🏆 账户收益排行</div>
      <div class="rank-list">
        <div v-for="(account, index) in sortedAccounts" :key="account.accountId" class="rank-item">
          <div class="rank-badge" :class="{ top: index < 3 }">
            {{ index + 1 }}
          </div>
          <div class="rank-info">
            <div class="account-name">{{ account.accountName }}</div>
            <div class="account-channel">{{ account.channel }}</div>
          </div>
          <div class="rank-profit" :class="{ positive: account.profit > 0, negative: account.profit < 0 }">
            <div class="profit">{{ account.profit >= 0 ? '+' : '' }}¥{{ formatNumber(account.profit) }}</div>
            <div class="rate">{{ account.profitRate }}%</div>
          </div>
        </div>
        <van-empty v-if="!sortedAccounts.length" description="暂无数据" />
      </div>
    </div>

    <!-- 持仓明细 -->
    <div class="section">
      <div class="section-title">📦 持仓明细</div>
      <div class="position-list">
        <div v-for="position in positions" :key="position.id" class="position-item" @click="showPositionDetail(position)">
          <div class="position-info">
            <div class="fund-name">{{ position['基金名称'] || '未知基金' }}</div>
            <div class="fund-code">{{ position['基金代码'] }}</div>
          </div>
          <div class="position-profit" :class="{ positive: getPositionProfit(position) > 0, negative: getPositionProfit(position) < 0 }">
            <div class="profit">{{ getPositionProfit(position) >= 0 ? '+' : '' }}¥{{ formatNumber(getPositionProfit(position)) }}</div>
            <div class="rate">{{ getPositionProfitRate(position) }}%</div>
          </div>
        </div>
        <van-empty v-if="!positions.length" description="暂无持仓" />
      </div>
    </div>

    <!-- 加载状态 -->
    <van-loading v-if="loading" type="spinner" class="loading" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { showToast } from 'vant'
import { statsApi, positionApi, marketApi } from '../api'

const loading = ref(false)
const overview = ref(null)
const positions = ref([])
const marketCache = ref({})

const sortedAccounts = computed(() => {
  if (!overview.value?.accounts) return []
  return [...overview.value.accounts].sort((a, b) => parseFloat(b.profit) - parseFloat(a.profit))
})

const formatNumber = (num) => {
  return parseFloat(num || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const getPositionProfit = (position) => {
  const quantity = parseFloat(position['持仓数量']) || 0
  const costPrice = parseFloat(position['成本价'] || position['买入净值']) || 0
  const market = marketCache.value[position['基金代码']]
  if (!market) return 0
  return (market.nav - costPrice) * quantity
}

const getPositionProfitRate = (position) => {
  const costPrice = parseFloat(position['成本价'] || position['买入净值']) || 0
  const market = marketCache.value[position['基金代码']]
  if (!market || costPrice === 0) return '0.00'
  return ((market.nav - costPrice) / costPrice * 100).toFixed(2)
}

const showPositionDetail = (position) => {
  const profit = getPositionProfit(position)
  const rate = getPositionProfitRate(position)
  const market = marketCache.value[position['基金代码']]
  showToast(`
${position['基金名称']}
成本价: ¥${position['成本价'] || position['买入净值']}
最新净值: ¥${market?.nav || '-'}
当前收益: ${profit >= 0 ? '+' : ''}¥${formatNumber(profit)} (${rate}%)
  `.trim())
}

const fetchData = async () => {
  loading.value = true
  try {
    // 获取总览
    const overviewData = await statsApi.overview()
    overview.value = overviewData

    // 获取持仓列表
    const positionData = await positionApi.list()
    positions.value = positionData?.positions || []

    // 获取行情
    const fundCodes = [...new Set(positions.value.map(p => p['基金代码']).filter(Boolean))]
    for (const code of fundCodes) {
      try {
        const market = await marketApi.get(code)
        marketCache.value[code] = market
      } catch (e) {
        console.error(`Failed to fetch market for ${code}:`, e)
      }
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error)
    showToast('数据加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.stats-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 80px;
}

.overview-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 24px 20px;
  color: white;
}

.overview-header {
  display: flex;
  justify-content: space-between;
}

.total-section .label {
  font-size: 14px;
  opacity: 0.9;
}

.total-section .amount {
  font-size: 28px;
  font-weight: bold;
  font-family: 'Courier New', monospace;
  margin-top: 4px;
}

.profit-section {
  text-align: right;
}

.profit-section .label {
  font-size: 14px;
  opacity: 0.9;
}

.profit-section.positive .profit-value {
  color: #4ade80;
}

.profit-section.negative .profit-value {
  color: #f87171;
}

.profit-value {
  font-size: 20px;
  font-weight: bold;
  font-family: 'Courier New', monospace;
  margin-top: 4px;
}

.profit-rate {
  font-size: 13px;
  opacity: 0.9;
  margin-top: 4px;
}

.overview-details {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,0.2);
  display: flex;
  justify-content: space-between;
}

.detail-item {
  display: flex;
  flex-direction: column;
}

.detail-item .label {
  font-size: 13px;
  opacity: 0.8;
}

.detail-item .value {
  font-size: 16px;
  font-weight: 600;
  font-family: 'Courier New', monospace;
  margin-top: 4px;
}

.section {
  background: white;
  margin: 12px;
  border-radius: 12px;
  padding: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #333;
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
}

.rank-badge {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ddd;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.rank-badge.top {
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  color: #fff;
}

.rank-info {
  flex: 1;
}

.account-name {
  font-weight: 500;
  color: #333;
}

.account-channel {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.rank-profit {
  text-align: right;
}

.rank-profit.positive {
  color: #07c160;
}

.rank-profit.negative {
  color: #ee0a24;
}

.rank-profit .profit {
  font-weight: 600;
  font-family: 'Courier New', monospace;
}

.rank-profit .rate {
  font-size: 12px;
  margin-top: 2px;
}

.position-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.position-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
  cursor: pointer;
}

.position-info {
  flex: 1;
}

.fund-name {
  font-weight: 500;
  color: #333;
}

.fund-code {
  font-size: 12px;
  color: #999;
  font-family: 'Courier New', monospace;
  margin-top: 2px;
}

.position-profit {
  text-align: right;
}

.position-profit.positive {
  color: #07c160;
}

.position-profit.negative {
  color: #ee0a24;
}

.position-profit .profit {
  font-weight: 600;
  font-family: 'Courier New', monospace;
}

.position-profit .rate {
  font-size: 12px;
  margin-top: 2px;
}

.loading {
  display: block;
  margin: 40px auto;
}
</style>
