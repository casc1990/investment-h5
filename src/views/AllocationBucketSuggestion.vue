<template>
  <div class="bucket-suggestion-page">
    <div class="header-card">
      <button type="button" class="back-button" @click="router.push(`/allocation/${profileId}`)">← 返回策略详情</button>
      <div class="page-title">{{ bucketLabel }} · 配置建议</div>
      <div class="page-subtitle">这里集中看当前分类的新增资金建议与调仓提示，后面会继续围绕这个页面重点优化</div>
    </div>

    <div v-if="!currentProfile" class="section-card">
      <van-empty description="未找到当前策略" />
    </div>

    <template v-else>
      <div v-if="loading" class="section-card loading-block">
        <van-loading size="20px">建议数据加载中...</van-loading>
      </div>

      <div class="section-card summary-card">
        <div class="summary-top">
          <div>
            <div class="summary-label">当前策略</div>
            <div class="summary-value">{{ currentProfile.name }}</div>
          </div>
          <div class="summary-badge">{{ bucketLabel }}</div>
        </div>
        <div class="summary-grid">
          <div>
            <span class="summary-label">当前占比</span>
            <div class="summary-amount">{{ formatPercent(bucketSummary?.currentPct || 0) }}</div>
          </div>
          <div>
            <span class="summary-label">目标占比</span>
            <div class="summary-amount">{{ formatPercent(bucketSummary?.targetPct || 0) }}</div>
          </div>
          <div>
            <span class="summary-label">累计收益率</span>
            <div class="summary-amount" :class="profitClass(bucketSummary?.totalProfitRate)">{{ formatSignedPercent(bucketSummary?.totalProfitRate) }}</div>
          </div>
          <div>
            <span class="summary-label">已纳入基金</span>
            <div class="summary-amount">{{ bucketSummary?.funds?.length || 0 }}只</div>
          </div>
        </div>
      </div>

      <div class="section-card cash-card">
        <div>
          <div class="summary-label">本次新增资金（元）</div>
          <div class="cash-hint">填写后会按这笔新增资金重算补仓建议</div>
        </div>
        <van-field v-model.number="newCashAmount" type="number" placeholder="例如 3000" input-align="right" />
      </div>

      <div v-if="recommendation" class="section-card suggestion-card recommend">
        <div class="suggestion-top">
          <div>
            <div class="suggestion-title">新增资金建议</div>
            <div class="suggestion-reason">{{ recommendation.reason }}</div>
          </div>
          <div class="suggestion-amount">¥{{ formatAmount(recommendation.recommendedAmount) }}</div>
        </div>
        <div class="suggestion-meta">当前 {{ formatPercent(recommendation.currentPct) }} · 目标 {{ formatPercent(recommendation.targetPct) }} · 缺口 {{ formatPercent(recommendation.gapPct) }}</div>
        <div v-if="recommendation.recommendedFunds.length" class="fund-list">
          <div v-for="fund in recommendation.recommendedFunds" :key="fund.positionId" class="fund-row">
            <div>
              <div class="fund-name">{{ fund.fundName }}</div>
              <div class="fund-reason">{{ fund.reason }}</div>
            </div>
            <span class="fund-status">{{ fund.status }}</span>
          </div>
        </div>
        <div v-else class="empty-line">当前类别暂无可直接买入的候选基金</div>
      </div>

      <div v-if="rebalance" class="section-card suggestion-card rebalance">
        <div class="suggestion-top">
          <div>
            <div class="suggestion-title">调仓提示</div>
            <div class="suggestion-reason">当前比例 {{ formatPercent(rebalance.currentPct) }}，已超出目标上限</div>
          </div>
          <div class="suggestion-amount">{{ formatSignedPercent(rebalance.deviationPct) }}</div>
        </div>
        <div class="suggestion-meta">目标 {{ formatPercent(rebalance.targetPct) }} · 允许偏差 {{ formatPercent(rebalance.maxDeviationPct) }}</div>
        <div v-if="rebalance.candidateFunds.length" class="fund-list">
          <div v-for="fund in rebalance.candidateFunds" :key="fund.positionId" class="fund-row multi-line">
            <div>
              <div class="fund-name">{{ fund.fundName }}</div>
              <div class="fund-reason">{{ fund.reason }}</div>
            </div>
            <span class="fund-status">{{ fund.status }}</span>
          </div>
        </div>
        <div v-else class="empty-line">当前没有明确的调仓候选基金</div>
      </div>

      <div v-if="!recommendation && !rebalance && !loading" class="section-card">
        <van-empty description="当前类别暂无补仓或调仓建议" />
      </div>

      <div class="footer-actions">
        <van-button round plain type="primary" @click="router.push(`/allocation/${profileId}/bucket/${assetType}/select`)">基金录入</van-button>
        <van-button round type="primary" @click="router.push(`/allocation/${profileId}/bucket/${assetType}/holdings`)">基金持仓</van-button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { positionApi } from '../api'
import {
  ALLOCATION_ASSET_TYPE_LABELS,
  buildAllocationProfileSummary,
  buildAllocationSuggestions,
} from '../utils/allocation'
import { fetchAllocationProfiles, loadAllocationProfiles } from '../utils/allocationStorage'
import { formatAmount, formatPercent, profitClass } from '../utils/formatters'

const route = useRoute()
const router = useRouter()

const profiles = ref(loadAllocationProfiles())
const positions = ref([])
const loading = ref(false)
const newCashAmount = ref(null)

const profileId = computed(() => String(route.params.profileId || ''))
const assetType = computed(() => String(route.params.assetType || ''))
const currentProfile = computed(() => profiles.value.find(item => item.id === profileId.value) || null)
const bucketLabel = computed(() => ALLOCATION_ASSET_TYPE_LABELS[assetType.value] || '当前分类')
const summary = computed(() => {
  if (!currentProfile.value) return null
  return buildAllocationProfileSummary({ profile: currentProfile.value, positions: positions.value })
})
const bucketSummary = computed(() => summary.value?.bucketSummaries?.find(item => item.assetType === assetType.value) || null)
const suggestions = computed(() => {
  if (!currentProfile.value) return null
  return buildAllocationSuggestions({
    profile: currentProfile.value,
    positions: positions.value,
    newCashAmount: Number(newCashAmount.value) || 0,
  })
})
const recommendation = computed(() => suggestions.value?.recommendedCategories?.find(item => item.assetType === assetType.value) || null)
const rebalance = computed(() => suggestions.value?.rebalanceCategories?.find(item => item.assetType === assetType.value) || null)

function formatSignedPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
  const num = Number(value) || 0
  const prefix = num > 0 ? '+' : ''
  return `${prefix}${formatPercent(num)}`
}

async function fetchPositions() {
  loading.value = true
  try {
    const data = await positionApi.list()
    if (Array.isArray(data)) {
      positions.value = data
    } else if (Array.isArray(data?.positions)) {
      positions.value = data.positions
    } else {
      positions.value = []
    }
  } catch (error) {
    showToast(`持仓加载失败：${error.message || '网络错误'}`)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try { profiles.value = await fetchAllocationProfiles() } catch (error) { showToast(`策略同步失败：${error.message || '网络错误'}`) }
  await fetchPositions()
})
</script>

<style scoped>
.bucket-suggestion-page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: 16px 16px calc(var(--app-floating-page-space) + 20px);
}

.header-card,
.section-card {
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  padding: 14px;
  margin-bottom: 14px;
}

.loading-block {
  display: flex;
  justify-content: center;
}

.back-button {
  border: none;
  background: transparent;
  color: #4f46e5;
  font-size: 14px;
  font-weight: 700;
  padding: 0;
}

.page-title {
  margin-top: 8px;
  font-size: 21px;
  font-weight: 700;
  color: #111827;
}

.page-subtitle,
.summary-label,
.cash-hint,
.suggestion-reason,
.suggestion-meta,
.fund-reason,
.empty-line {
  color: #6b7280;
  font-size: 12px;
}

.page-subtitle {
  margin-top: 8px;
}

.summary-top,
.suggestion-top,
.fund-row,
.footer-actions,
.cash-card {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.summary-value {
  margin-top: 6px;
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.summary-badge {
  padding: 7px 11px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
  font-weight: 700;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 10px;
}

.summary-amount,
.suggestion-amount,
.fund-name,
.fund-status {
  font-weight: 700;
  color: #111827;
}

.cash-card :deep(.van-field) {
  flex: 1;
  min-width: 150px;
  background: #f8fafc;
  border-radius: 12px;
}

.suggestion-card {
  border-left: 4px solid transparent;
}

.suggestion-card.recommend {
  border-left-color: #3b82f6;
  background: #f8fbff;
}

.suggestion-card.rebalance {
  border-left-color: #ef4444;
  background: #fffaf9;
}

.suggestion-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.suggestion-meta {
  margin-top: 8px;
}

.fund-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fund-row {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.85);
  align-items: flex-start;
}

.fund-status {
  white-space: nowrap;
  color: #4f46e5;
}

.empty-line {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.85);
}

.footer-actions {
  position: sticky;
  bottom: calc(12px + env(safe-area-inset-bottom));
  z-index: 20;
  padding: 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(18px);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.12);
}

.footer-actions :deep(.van-button) {
  flex: 1;
}
</style>
