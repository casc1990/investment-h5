<template>
  <div class="home">
    <!-- 顶部卡片 -->
    <div class="header-card">
      <div class="total-info">
        <div class="label">💰 总资产</div>
        <div class="amount">¥{{ formatNumber(overview?.totalMarketValue || 0) }}</div>
        <div class="profit" :class="{ positive: overview?.totalProfit > 0, negative: overview?.totalProfit < 0 }">
          <span>{{ overview?.totalProfit >= 0 ? '+' : '' }}¥{{ formatNumber(overview?.totalProfit || 0) }}</span>
          <span class="rate">({{ overview?.totalProfitRate || 0 }}%)</span>
        </div>
      </div>
    </div>

    <!-- 账户分布 -->
    <div class="section">
      <div class="section-title">📊 账户分布</div>
      <div class="account-list">
        <div v-for="account in overview?.accounts" :key="account.accountId" class="account-item">
          <div class="account-info">
            <span class="account-name">{{ account.accountName }}</span>
            <span class="account-channel">{{ account.channel }}</span>
          </div>
          <div class="account-value">
            <span class="value">¥{{ formatNumber(account.marketValue) }}</span>
            <span class="profit" :class="{ positive: account.profit > 0 }">
              {{ account.profit >= 0 ? '+' : '' }}{{ account.profitRate }}%
            </span>
          </div>
        </div>
        <van-empty v-if="!overview?.accounts?.length" description="暂无账户数据" />
      </div>
    </div>

    <!-- 快捷操作 -->
    <div class="section">
      <div class="section-title">⚡ 快捷操作</div>
      <div class="quick-actions">
        <div class="action-item" @click="$router.push('/trades?type=buy')">
          <div class="icon green">💵</div>
          <span>买入</span>
        </div>
        <div class="action-item" @click="$router.push('/trades?type=sell')">
          <div class="icon red">💰</div>
          <span>卖出</span>
        </div>
        <div class="action-item" @click="$router.push('/positions')">
          <div class="icon blue">📦</div>
          <span>持仓</span>
        </div>
        <div class="action-item" @click="$router.push('/stats')">
          <div class="icon purple">📈</div>
          <span>统计</span>
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-overlay">
      <van-loading size="24px">加载中...</van-loading>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { statsApi } from '../api'
import { showToast } from 'vant'

const loading = ref(false)
const overview = ref(null)

const formatNumber = (num) => {
  return parseFloat(num || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const fetchData = async () => {
  loading.value = true
  try {
    const data = await statsApi.overview()
    overview.value = data
  } catch (error) {
    console.error('Failed to fetch overview:', error)
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
.home {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 70px;
}

.header-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 24px 20px;
  color: white;
}

.total-info {
  text-align: center;
}

.total-info .label {
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 8px;
}

.total-info .amount {
  font-size: 32px;
  font-weight: bold;
  font-family: 'Courier New', monospace;
}

.total-info .profit {
  margin-top: 8px;
  font-size: 16px;
}

.total-info .profit.positive {
  color: #4ade80;
}

.total-info .profit.negative {
  color: #f87171;
}

.total-info .rate {
  margin-left: 4px;
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

.account-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.account-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
}

.account-info {
  display: flex;
  flex-direction: column;
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

.account-value {
  text-align: right;
  display: flex;
  flex-direction: column;
}

.account-value .value {
  font-weight: 600;
  font-family: 'Courier New', monospace;
  color: #333;
}

.account-value .profit {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.account-value .profit.positive {
  color: #4ade80;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 8px;
  background: #f9f9f9;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.2s;
}

.action-item:active {
  transform: scale(0.95);
}

.action-item .icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.action-item span {
  font-size: 13px;
  color: #666;
}

.loading-overlay {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255,255,255,0.9);
  padding: 20px;
  border-radius: 8px;
}
</style>
