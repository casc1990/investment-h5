<template>
  <div class="stats-page">
    <!-- 顶部统计卡片 -->
    <div class="overview-card">
      <!-- 总资产 -->
      <div class="total-asset">
        <div class="asset-label">总资产(元)</div>
        <div class="asset-amount">{{ formatAmount(overview?.summary?.totalMarketValue || 0) }}</div>
      </div>

      <!-- 三栏收益 -->
      <div class="profit-row">
        <div class="profit-item">
          <div class="profit-label">昨日收益</div>
          <div class="profit-value" :class="{ positive: Number(overview?.summary?.totalYesterdayProfit) >= 0, negative: Number(overview?.summary?.totalYesterdayProfit) < 0 }">
            {{ Number(overview?.summary?.totalYesterdayProfit) >= 0 ? '+' : '' }}{{ formatAmount(overview?.summary?.totalYesterdayProfit || 0) }}
          </div>
        </div>
        <div class="profit-divider"></div>
        <div class="profit-item">
          <div class="profit-label">持有收益</div>
          <div class="profit-value" :class="{ positive: Number(overview?.summary?.totalHoldingProfit) >= 0, negative: Number(overview?.summary?.totalHoldingProfit) < 0 }">
            {{ Number(overview?.summary?.totalHoldingProfit) >= 0 ? '+' : '' }}{{ formatAmount(overview?.summary?.totalHoldingProfit || 0) }}
          </div>
        </div>
        <div class="profit-divider"></div>
        <div class="profit-item">
          <div class="profit-label">累计收益</div>
          <div class="profit-value" :class="{ positive: Number(overview?.summary?.totalCumulativeProfit) >= 0, negative: Number(overview?.summary?.totalCumulativeProfit) < 0 }">
            {{ Number(overview?.summary?.totalCumulativeProfit) >= 0 ? '+' : '' }}{{ formatAmount(overview?.summary?.totalCumulativeProfit || 0) }}
          </div>
        </div>
      </div>

      <!-- 持仓收益率 -->
      <div class="profit-rate-bar" v-if="overview?.summary?.totalProfitRate">
        <span class="rate-label">持仓收益率</span>
        <span class="rate-value" :class="{ positive: Number(overview?.summary?.totalProfitRate) >= 0, negative: Number(overview?.summary?.totalProfitRate) < 0 }">
          {{ Number(overview?.summary?.totalProfitRate) >= 0 ? '+' : '' }}{{ overview?.summary?.totalProfitRate }}%
        </span>
      </div>
    </div>

    <!-- 持仓明细 -->
    <div class="section">
      <div class="section-title">📦 持仓明细</div>
      <div class="position-list">
        <div v-for="position in positions" :key="position.id" class="position-item">
          <div class="position-info">
            <div class="fund-name">{{ position.fund_name || '未知基金' }}</div>
            <div class="fund-meta">
              <span class="fund-code">{{ position.fund_code }}</span>
              <span v-if="position.member_name" class="member-tag">{{ position.member_emoji }} {{ position.member_name }}</span>
              <span class="account-tag">{{ position.account_name }}</span>
            </div>
          </div>
          <div class="position-profit" :class="{ positive: Number(position.current_profit) >= 0, negative: Number(position.current_profit) < 0 }">
            <div class="profit">
              {{ Number(position.current_profit) >= 0 ? '+' : '' }}{{ formatAmount(position.current_profit) }}
            </div>
            <div class="rate">
              {{ Number(position.profit_rate) >= 0 ? '+' : '' }}{{ position.profit_rate }}%
            </div>
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
import { ref, onMounted } from 'vue'
import { showToast } from 'vant'
import { statsApi, positionApi } from '../api'

const loading = ref(false)
const overview = ref(null)
const positions = ref([])

const formatAmount = (num) => {
  const val = parseFloat(num || 0)
  if (isNaN(val)) return '0.00'
  const [int, dec] = val.toFixed(2).split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${formatted}.${dec}`
}

const fetchData = async () => {
  loading.value = true
  try {
    const overviewData = await statsApi.overview()
    overview.value = overviewData

    const positionsData = await positionApi.list()
    positions.value = positionsData?.positions || []
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

/* 支付宝风格蓝色总览卡片 */
.overview-card {
  background: linear-gradient(135deg, #1E80FF 0%, #0066CC 100%);
  padding: 24px 20px 20px;
  color: white;
}

.total-asset {
  text-align: center;
  margin-bottom: 20px;
}

.asset-label {
  font-size: 13px;
  opacity: 0.85;
  margin-bottom: 6px;
}

.asset-amount {
  font-size: 34px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  letter-spacing: -1px;
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

.profit-label {
  font-size: 12px;
  opacity: 0.8;
}

.profit-value {
  font-size: 16px;
  font-weight: 600;
  font-family: 'Courier New', monospace;
  white-space: nowrap;
}

.profit-divider {
  width: 1px;
  height: 32px;
  background: rgba(255, 255, 255, 0.25);
}

.profit-rate-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.rate-label {
  font-size: 13px;
  opacity: 0.85;
}

.rate-value {
  font-size: 15px;
  font-weight: 600;
  font-family: 'Courier New', monospace;
}

/* 颜色 */
.positive { color: #FF6B6B; }
.negative { color: #7DDF64; }

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

.position-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.position-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
}

.position-info {
  flex: 1;
  min-width: 0;
}

.fund-name {
  font-weight: 500;
  color: #1a1a1a;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fund-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.fund-code {
  font-size: 11px;
  color: #999;
  font-family: 'Courier New', monospace;
}

.member-tag {
  font-size: 11px;
  color: #1a73e8;
  background: #e8f0fe;
  padding: 1px 5px;
  border-radius: 3px;
}

.account-tag {
  font-size: 11px;
  color: #666;
  background: #f0f0f0;
  padding: 1px 5px;
  border-radius: 3px;
}

.position-profit {
  text-align: right;
  flex-shrink: 0;
  margin-left: 12px;
}

.position-profit .profit {
  font-size: 15px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.position-profit .rate {
  font-size: 12px;
  font-family: 'Courier New', monospace;
  margin-top: 2px;
}

.loading {
  display: block;
  margin: 40px auto;
}
</style>
