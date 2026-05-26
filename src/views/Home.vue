<template>
  <div class="home">
    <!-- 顶部卡片 - 总资产 -->
    <div class="header-card">
      <div class="header-top">
        <div class="total-info">
          <div class="label">💰 总资产</div>
          <div class="amount">¥{{ formatNumber(overview?.summary?.totalMarketValue || 0) }}</div>
          <div class="profit" :class="{ positive: overview?.summary?.totalProfit > 0, negative: overview?.summary?.totalProfit < 0 }">
            <span>{{ overview?.summary?.totalProfit >= 0 ? '+' : '' }}¥{{ formatNumber(overview?.summary?.totalProfit || 0) }}</span>
            <span class="rate">({{ overview?.summary?.totalProfitRate || 0 }}%)</span>
          </div>
        </div>
        <button class="logout-btn" @click="handleLogout">退出</button>
      </div>
    </div>

    <div class="today-strip">
      <div class="today-card">
        <div class="today-label">持仓日收益</div>
        <div class="today-value" :class="{ positive: homePositionDailyProfit > 0, negative: homePositionDailyProfit < 0 }">
          {{ homePositionDailyProfit >= 0 ? '+' : '' }}¥{{ formatNumber(homePositionDailyProfit) }}
        </div>
      </div>
      <div class="today-card">
        <div class="today-label">持有收益</div>
        <div class="today-value" :class="{ positive: overview?.summary?.totalProfit > 0, negative: overview?.summary?.totalProfit < 0 }">
          {{ overview?.summary?.totalProfit >= 0 ? '+' : '' }}¥{{ formatNumber(overview?.summary?.totalProfit || 0) }}
        </div>
      </div>
      <div class="today-card">
        <div class="today-label">未分配账户</div>
        <div class="today-value neutral">{{ unassignedAccounts?.length || 0 }}个</div>
      </div>
    </div>

    <!-- 成员分布 -->
    <div class="section">
      <div class="section-title">👥 成员分布</div>
      <div class="member-list">
        <div v-for="member in overview?.members" :key="member.member_id" class="member-card" :class="{ expanded: isMemberExpanded(member.member_id) }">
          <div class="member-header" @click="toggleMember(member.member_id)">
            <div class="member-identity">
              <span class="member-emoji">{{ member.emoji }}</span>
              <div class="member-title-wrap">
                <span class="member-name">{{ member.member_name }}</span>
                <span class="member-count">{{ member.accounts?.length || 0 }}个账户</span>
              </div>
            </div>
            <div class="member-overview">
              <div class="member-overview-profit" :class="{ positive: member.profit > 0, negative: member.profit < 0 }">
                {{ member.profit >= 0 ? '+' : '' }}¥{{ formatNumber(member.profit || 0) }}
              </div>
              <div class="member-overview-arrow">{{ isMemberExpanded(member.member_id) ? '收起' : '展开' }}</div>
            </div>
          </div>

          <div v-if="member.accounts?.length" class="member-stats">
            <div class="stat-item">
              <span class="stat-label">总资产</span>
              <span class="stat-value">¥{{ formatNumber(member.marketValue || 0) }}</span>
            </div>
            <div class="stat-item align-right">
              <span class="stat-label">总收益率</span>
              <span class="stat-value profit" :class="{ positive: member.profit > 0, negative: member.profit < 0 }">
                {{ member.profitRate || 0 }}%
              </span>
            </div>
          </div>

          <div v-if="member.accounts?.length && isMemberExpanded(member.member_id)" class="member-account-list">
            <div v-for="account in member.accounts" :key="account.accountId" class="member-account-item">
              <div class="account-main">
                <div class="account-title-row">
                  <span class="account-name">{{ account.accountName }}</span>
                  <span v-if="account.channel" class="account-channel">{{ account.channel }}</span>
                </div>
                <div class="account-subtitle">持有金额 ¥{{ formatNumber(account.marketValue || 0) }}</div>
              </div>
              <div class="account-side">
                <div class="account-profit" :class="{ positive: account.profit > 0, negative: account.profit < 0 }">
                  {{ account.profit >= 0 ? '+' : '' }}¥{{ formatNumber(account.profit || 0) }}
                </div>
                <div class="account-rate" :class="{ positive: account.profit > 0, negative: account.profit < 0 }">
                  {{ account.profitRate || 0 }}%
                </div>
              </div>
            </div>
          </div>

          <div v-else class="member-empty">
            <span>暂无账户或持仓</span>
          </div>
        </div>
        <van-empty v-if="!overview?.members?.length" description="暂无成员数据" />
      </div>
    </div>

    <!-- 无成员账户（未分配） -->
    <div v-if="unassignedAccounts?.length" class="section">
      <div class="section-title">📦 未分配账户</div>
      <div class="account-list">
        <div v-for="account in unassignedAccounts" :key="account.accountId" class="account-item">
          <div class="account-info">
            <span class="account-name">{{ account.accountName }}</span>
            <span class="account-channel">{{ account.channel }}</span>
          </div>
          <div class="account-value">
            <span class="value">¥{{ formatNumber(account.marketValue || 0) }}</span>
            <span class="profit" :class="{ positive: account.profit > 0 }">
              {{ account.profit >= 0 ? '+' : '' }}{{ account.profitRate }}%
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 快捷操作 -->
    <div class="section">
      <div class="section-title">⚡ 高频入口</div>
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
        <div class="action-item" @click="$router.push('/advisory')">
          <div class="icon orange">🤖</div>
          <span>顾投</span>
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
import { ref, computed, onActivated, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { authApi, statsApi } from '../api'
import { formatAmount as formatNumber } from '../utils/formatters'
import { shouldRefreshPageData } from '../utils/perfHelpers'

const router = useRouter()
const loading = ref(false)
const overview = ref(null)
const expandedMemberIds = ref([])
const lastLoadedAt = ref(0)
const hasLoadedOnce = ref(false)

// 未分配到成员的账户（直接使用后端返回的 unassignedAccounts）
const unassignedAccounts = computed(() => {
  return overview.value?.unassignedAccounts || []
})

const homePositionDailyProfit = computed(() => (
  Number(overview.value?.summary?.totalPositionYesterdayProfit ?? overview.value?.summary?.totalYesterdayProfit) || 0
))

const isMemberExpanded = (memberId) => expandedMemberIds.value.includes(memberId)

const toggleMember = (memberId) => {
  expandedMemberIds.value = isMemberExpanded(memberId)
    ? expandedMemberIds.value.filter(id => id !== memberId)
    : [...expandedMemberIds.value, memberId]
}

const fetchData = async () => {
  loading.value = true
  try {
    const data = await statsApi.overview()
    overview.value = data
    hasLoadedOnce.value = true
    lastLoadedAt.value = Date.now()
  } catch (error) {
    console.error('Failed to fetch overview:', error)
    showToast('数据加载失败: ' + (error.message || '网络错误'))
  } finally {
    loading.value = false
  }
}

const ensureFreshData = async ({ force = false } = {}) => {
  if (!shouldRefreshPageData({ hasData: hasLoadedOnce.value, lastLoadedAt: lastLoadedAt.value, force })) {
    return
  }
  await fetchData()
}

const handleLogout = async () => {
  try {
    await showConfirmDialog({
      title: '确认退出',
      message: '确定要退出登录吗？',
    })
    await authApi.logout()
  } catch (e) {
    // user cancelled
  }
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_username')
  router.push('/login')
}

onMounted(() => {
  ensureFreshData({ force: true })
})

onActivated(() => {
  ensureFreshData()
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

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.logout-btn {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  border-radius: 20px;
  padding: 6px 16px;
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
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
  color: #f87171;
}

.total-info .profit.negative {
  color: #4ade80;
}

.total-info .rate {
  margin-left: 4px;
}

.today-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 12px;
}

.today-card {
  background: white;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05);
}

.today-label {
  font-size: 12px;
  color: #94a3b8;
}

.today-value {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  color: #1f2937;
}

.today-value.positive {
  color: #f87171;
}

.today-value.negative {
  color: #4ade80;
}

.today-value.neutral {
  color: #1f2937;
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

/* 成员卡片 */
.member-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-card {
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  border-radius: 16px;
  padding: 14px;
  border: 1px solid #eef2ff;
  box-shadow: 0 8px 22px rgba(99, 102, 241, 0.08);
}

.member-card.expanded {
  box-shadow: 0 12px 28px rgba(99, 102, 241, 0.14);
}

.member-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
}

.member-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.member-emoji {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%);
  border-radius: 14px;
  flex-shrink: 0;
}

.member-title-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.member-name {
  font-weight: 700;
  font-size: 15px;
  color: #1f2937;
}

.member-count {
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.member-overview {
  text-align: right;
  flex-shrink: 0;
}

.member-overview-profit {
  font-size: 14px;
  font-weight: 700;
}

.member-overview-profit.positive {
  color: #f87171;
}

.member-overview-profit.negative {
  color: #4ade80;
}

.member-overview-arrow {
  margin-top: 4px;
  font-size: 12px;
  color: #7c8db5;
}

.member-stats {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #edf2f7;
}

.stat-item {
  display: flex;
  flex-direction: column;
}

.stat-item.align-right {
  text-align: right;
}

.stat-label {
  font-size: 12px;
  color: #94a3b8;
}

.stat-value {
  margin-top: 4px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  color: #1f2937;
}

.stat-value.profit.positive {
  color: #f87171;
}

.stat-value.profit.negative {
  color: #4ade80;
}

.member-account-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.member-account-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.88);
  border-radius: 14px;
  border: 1px solid #edf2ff;
}

.account-main {
  flex: 1;
  min-width: 0;
}

.account-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.account-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.account-channel {
  font-size: 11px;
  color: #6366f1;
  background: #eef2ff;
  border-radius: 999px;
  padding: 2px 8px;
}

.account-subtitle {
  margin-top: 6px;
  font-size: 12px;
  color: #94a3b8;
}

.account-side {
  text-align: right;
  flex-shrink: 0;
}

.account-profit,
.account-rate {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  font-weight: 700;
}

.account-rate {
  margin-top: 4px;
  font-size: 12px;
}

.account-profit.positive,
.account-rate.positive {
  color: #f87171;
}

.account-profit.negative,
.account-rate.negative {
  color: #4ade80;
}

.member-empty {
  font-size: 12px;
  color: #999;
  text-align: center;
  padding: 8px 0 2px;
}

/* 未分配账户列表 */
.account-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.account-list .account-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: #fff3e0;
  border-radius: 6px;
}

/* 快捷操作 */
.quick-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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
