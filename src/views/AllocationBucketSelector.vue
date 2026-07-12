<template>
  <div class="bucket-selector-page">
    <div class="selector-header-card">
      <button type="button" class="back-button" @click="router.push(`/allocation/${profileId}`)">← 返回策略详情</button>
      <div class="selector-title">{{ bucketLabel }} · 基金录入</div>
      <div class="selector-subtitle">打开独立页面列出全部持仓基金，支持单选/多选纳入当前类别；点击基金可进详情页</div>
    </div>

    <div v-if="!currentProfile" class="selector-section">
      <van-empty description="未找到当前策略" />
    </div>

    <template v-else>
      <div class="selector-section selector-summary-card compact-summary-card">
        <div class="selector-summary-top">
          <div>
            <div class="summary-label">当前策略</div>
            <div class="summary-value">{{ currentProfile.name }}</div>
          </div>
          <div class="summary-badge">已选 {{ selectedPositionIds.length }} 只</div>
        </div>
        <div class="selector-toolbar">
          <van-button size="small" round plain type="primary" @click="selectAllAvailable">全选可选</van-button>
          <van-button size="small" round plain @click="clearSelection">清空当前分类</van-button>
        </div>
      </div>

      <div v-if="loading" class="selector-section loading-block">
        <van-loading size="20px">基金数据加载中...</van-loading>
      </div>

      <div v-else class="selector-list">
        <div v-if="rows.length" class="selector-section">
          <van-checkbox-group v-model="selectedPositionIds">
            <div
              v-for="item in rows"
              :key="item.position.id"
              class="fund-select-card"
              :class="{
                checked: selectedPositionIds.includes(item.position.id),
                locked: item.selectionDisabled,
              }"
            >
              <div class="fund-select-main">
                <van-checkbox
                  :name="item.position.id"
                  :disabled="item.selectionDisabled"
                  icon-size="20px"
                />
                <div class="fund-select-info" @click="openPositionDetail(item.position.id)">
                  <div class="fund-select-topline">
                    <div class="fund-name">{{ item.position.fund_name || '未知基金' }}</div>
                    <div class="fund-amount">¥{{ formatAmount(item.marketValue) }}</div>
                  </div>
                  <div class="fund-owner">{{ getPositionOwnerText(item.position) }}</div>
                  <div class="fund-meta">基金代码：{{ item.position.fund_code }}</div>
                  <div class="fund-tags-action-row">
                    <div class="fund-tags">
                      <span v-if="item.includedInCurrentBucket" class="tag active-tag">当前已纳入</span>
                      <span v-else-if="item.includedInCurrentProfile" class="tag move-tag">已在{{ getAssetTypeLabel(item.config?.assetType) }}</span>
                      <span v-if="item.guessMatched" class="tag guess-tag">系统识别匹配</span>
                      <span v-if="item.lockedByCurrentProfileOtherBucket" class="tag occupied-tag">已纳入其他类别</span>
                      <span v-if="item.lockedByOtherProfile && !item.includedInCurrentProfile" class="tag locked-tag">已被其他方案占用</span>
                    </div>
                    <div class="fund-inline-actions">
                      <van-button
                        v-if="selectedPositionIds.includes(item.position.id)"
                        size="mini"
                        plain
                        type="success"
                        @click.stop="cycleDraftStatus(item.position.id)"
                      >{{ statusDraftMap[item.position.id] || ALLOCATION_FUND_STATUSES.KEEP }}</van-button>
                      <van-button size="mini" plain type="primary" @click.stop="openPositionDetail(item.position.id)">详情</van-button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="fund-metric-lines compact-metrics">
                <div class="metric-line primary">
                  <span class="metric-chip">
                    <span class="metric-chip-label">日收益</span>
                    <span class="metric-chip-value" :class="profitClass(item.position.daily_profit)">{{ formatSignedAmount(item.position.daily_profit) }}</span>
                  </span>
                  <span class="metric-chip">
                    <span class="metric-chip-label">日收益率</span>
                    <span class="metric-chip-value" :class="profitClass(item.position.daily_profit_rate)">{{ formatSignedPercent(item.position.daily_profit_rate) }}</span>
                  </span>
                  <span class="metric-chip">
                    <span class="metric-chip-label">累计</span>
                    <span class="metric-chip-value" :class="profitClass(item.totalProfitRate)">{{ formatSignedPercent(item.totalProfitRate) }}</span>
                  </span>
                </div>
                <div class="metric-line secondary">
                  <span class="metric-chip mini">
                    <span class="metric-chip-label">周</span>
                    <span class="metric-chip-value" :class="profitClass(item.weeklyReturnPct)">{{ formatSignedPercent(item.weeklyReturnPct) }}</span>
                  </span>
                  <span class="metric-chip mini">
                    <span class="metric-chip-label">月</span>
                    <span class="metric-chip-value" :class="profitClass(item.monthlyReturnPct)">{{ formatSignedPercent(item.monthlyReturnPct) }}</span>
                  </span>
                </div>
              </div>

              <div v-if="item.lockedByCurrentProfileOtherBucket" class="occupancy-hint">
                当前策略中已归入：{{ getAssetTypeLabel(item.config?.assetType) }}
              </div>

              <div v-else-if="item.lockedByOtherProfile && !item.includedInCurrentProfile" class="occupancy-hint">
                已纳入：{{ item.occupancy.filter(entry => entry.profileId !== currentProfile.id).map(entry => entry.profileName).join('、') }}
              </div>

            </div>
          </van-checkbox-group>
        </div>
        <div v-else class="selector-section">
          <van-empty description="当前没有可展示的基金" />
        </div>
      </div>

      <div class="selector-footer">
        <div class="footer-summary">将把 {{ selectedPositionIds.length }} 只基金归入“{{ bucketLabel }}”</div>
        <div class="footer-actions">
          <van-button round @click="router.push(`/allocation/${profileId}`)">取消</van-button>
          <van-button round type="primary" @click="saveSelection">保存选择</van-button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { fundApi, positionApi } from '../api'
import {
  ALLOCATION_ASSET_TYPE_LABELS,
  ALLOCATION_FUND_STATUSES,
  applyAllocationBucketSelection,
  buildAllocationSelectablePositions,
  getAllocationPositionOwnerText,
  normalizeAllocationProfile,
} from '../utils/allocation'
import { buildFundPerformanceMap } from '../utils/fundPerformance'
import {
  fetchAllocationProfiles,
  loadAllocationProfiles,
  persistAllocationProfiles,
  saveSelectedAllocationProfileId,
} from '../utils/allocationStorage'
import { formatAmount, formatSignedAmount, formatPercent, profitClass } from '../utils/formatters'

const route = useRoute()
const router = useRouter()

const profiles = ref(loadAllocationProfiles())
const positions = ref([])
const loading = ref(false)
const selectedPositionIds = ref([])
const statusDraftMap = ref({})
const performanceMap = ref({})

const profileId = computed(() => String(route.params.profileId || ''))
const assetType = computed(() => String(route.params.assetType || ''))
const currentProfile = computed(() => profiles.value.find(item => item.id === profileId.value) || null)
const bucketLabel = computed(() => ALLOCATION_ASSET_TYPE_LABELS[assetType.value] || '当前分类')
const fundStatusOptions = Object.values(ALLOCATION_FUND_STATUSES)
const baseRows = computed(() => {
  if (!currentProfile.value || !assetType.value) return []
  return buildAllocationSelectablePositions({
    positions: positions.value,
    profiles: profiles.value,
    currentProfile: currentProfile.value,
    assetType: assetType.value,
  })
})
const rows = computed(() => baseRows.value.map(item => ({
  ...item,
  weeklyReturnPct: performanceMap.value[item.position.fund_code]?.weeklyReturnPct ?? null,
  monthlyReturnPct: performanceMap.value[item.position.fund_code]?.monthlyReturnPct ?? null,
})))

function formatSignedPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
  const num = Number(value) || 0
  const prefix = num > 0 ? '+' : ''
  return `${prefix}${formatPercent(num)}`
}

function getAssetTypeLabel(value) {
  return ALLOCATION_ASSET_TYPE_LABELS[value] || '其他基金'
}

function getPositionOwnerText(position) {
  return getAllocationPositionOwnerText(position)
}

function initializeDrafts() {
  if (!currentProfile.value || !assetType.value) {
    selectedPositionIds.value = []
    statusDraftMap.value = {}
    return
  }

  const selected = currentProfile.value.funds
    .filter(item => item.assetType === assetType.value)
    .map(item => item.positionId)
  selectedPositionIds.value = selected

  const nextStatusMap = {}
  for (const fund of currentProfile.value.funds || []) {
    nextStatusMap[fund.positionId] = fund.status || ALLOCATION_FUND_STATUSES.KEEP
  }
  statusDraftMap.value = nextStatusMap
}

function updateDraftStatus(positionId, status) {
  statusDraftMap.value = {
    ...statusDraftMap.value,
    [positionId]: status,
  }
}

function cycleDraftStatus(positionId) {
  const currentStatus = statusDraftMap.value[positionId] || ALLOCATION_FUND_STATUSES.KEEP
  const currentIndex = fundStatusOptions.indexOf(currentStatus)
  const nextStatus = fundStatusOptions[(currentIndex + 1) % fundStatusOptions.length] || ALLOCATION_FUND_STATUSES.KEEP
  updateDraftStatus(positionId, nextStatus)
  showToast(`基金状态：${nextStatus}`)
}

function selectAllAvailable() {
  selectedPositionIds.value = rows.value
    .filter(item => !item.selectionDisabled || item.includedInCurrentBucket)
    .map(item => item.position.id)
}

function clearSelection() {
  selectedPositionIds.value = []
}

function openPositionDetail(positionId) {
  router.push(`/positions/${positionId}`)
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

async function fetchPerformance() {
  const codes = [...new Set(baseRows.value.map(item => item.position.fund_code).filter(Boolean))]
  performanceMap.value = await buildFundPerformanceMap(codes, fundApi.detail)
}

async function saveSelection() {
  if (!currentProfile.value || !assetType.value) {
    showToast('当前分类信息无效')
    return
  }

  const nextProfile = applyAllocationBucketSelection({
    profile: currentProfile.value,
    assetType: assetType.value,
    selectedPositionIds: selectedPositionIds.value,
  })

  nextProfile.funds = nextProfile.funds.map(fund => {
    if (!selectedPositionIds.value.includes(fund.positionId)) return fund
    return {
      ...fund,
      status: statusDraftMap.value[fund.positionId] || fund.status || ALLOCATION_FUND_STATUSES.KEEP,
    }
  })

  const nextProfiles = profiles.value.map(profile => (
    profile.id === nextProfile.id ? normalizeAllocationProfile(nextProfile) : profile
  ))
  try {
    profiles.value = await persistAllocationProfiles(nextProfiles, profiles.value)
    saveSelectedAllocationProfileId(nextProfile.id)
    showToast(`已保存并同步${bucketLabel.value}基金选择`)
    router.push(`/allocation/${nextProfile.id}`)
  } catch (error) {
    showToast(`保存失败：${error?.response?.data?.message || error.message || '网络错误'}`)
  }
}

watch([currentProfile, assetType], initializeDrafts, { immediate: true })
watch(selectedPositionIds, (ids) => {
  const nextStatusMap = { ...statusDraftMap.value }
  for (const id of ids) {
    if (!nextStatusMap[id]) {
      nextStatusMap[id] = ALLOCATION_FUND_STATUSES.KEEP
    }
  }
  statusDraftMap.value = nextStatusMap
}, { deep: true })

onMounted(async () => {
  try { profiles.value = await fetchAllocationProfiles() } catch (error) { showToast(`策略同步失败：${error.message || '网络错误'}`) }
  await fetchPositions()
  initializeDrafts()
  await fetchPerformance()
})
</script>

<style scoped>
.bucket-selector-page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: 16px 16px calc(var(--app-floating-page-space) + 20px);
}

.selector-header-card,
.selector-section,
.fund-select-card {
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.selector-header-card,
.selector-section {
  padding: 12px;
  margin-bottom: 10px;
}

.back-button {
  border: none;
  background: transparent;
  color: #4f46e5;
  font-size: 14px;
  font-weight: 700;
  padding: 0;
}

.selector-title {
  margin-top: 6px;
  font-size: 19px;
  font-weight: 700;
  color: #111827;
}

.selector-subtitle,
.fund-owner,
.fund-meta,
.occupancy-hint,
.summary-label,
.footer-summary,
.metric-label,
.metric-chip-label {
  color: #6b7280;
  font-size: 11px;
}

.selector-subtitle {
  margin-top: 6px;
  font-size: 11px;
}

.selector-summary-top,
.selector-toolbar,
.fund-select-topline,
.footer-actions,
.selector-topline {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.summary-value {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.summary-badge {
  padding: 6px 10px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 11px;
  font-weight: 700;
}

.selector-toolbar {
  margin-top: 10px;
}

.selector-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.selector-summary-card.compact-summary-card {
  padding: 10px 12px;
}

.selector-toolbar :deep(.van-button) {
  min-height: 28px;
  padding: 0 10px;
  font-size: 11px;
}

.loading-block {
  display: flex;
  justify-content: center;
}

.fund-select-card {
  display: block;
  padding: 10px 0;
  margin: 0;
  border: none;
  border-bottom: 1px solid #eef2f7;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

.fund-select-card.checked {
  border-color: transparent;
  background: linear-gradient(180deg, rgba(248, 250, 255, 0.9) 0%, rgba(244, 247, 255, 0.9) 100%);
}

.fund-select-card.locked {
  opacity: 0.72;
}

.fund-select-main {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.fund-select-info {
  flex: 1;
  min-width: 0;
}

.fund-name,
.fund-amount {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.fund-amount {
  color: #4f46e5;
  white-space: nowrap;
}

.fund-owner {
  margin-top: 4px;
}

.fund-meta {
  margin-top: 2px;
}

.fund-tags-action-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
}

.fund-inline-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.fund-inline-actions :deep(.van-button) {
  min-height: 24px;
  padding: 0 8px;
  font-size: 10px;
}

.fund-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 600;
}

.active-tag {
  background: #dcfce7;
  color: #15803d;
}

.move-tag {
  background: #ede9fe;
  color: #6d28d9;
}

.guess-tag {
  background: #eff6ff;
  color: #1d4ed8;
}

.locked-tag {
  background: #fee2e2;
  color: #b91c1c;
}

.occupied-tag {
  background: #fff7ed;
  color: #c2410c;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.compact-metrics {
  margin-top: 6px;
}

.fund-metric-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.metric-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 999px;
  background: #f8fafc;
  line-height: 1.1;
}

.metric-chip.mini {
  padding: 2px 6px;
  background: #f1f5f9;
}

.metric-chip-value {
  font-size: 11px;
  font-weight: 700;
  color: #111827;
}

.list-metrics-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.metric-card {
  padding: 7px 8px;
  background: #f8fafc;
  border-radius: 10px;
}

.metric-value {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  font-weight: 700;
  color: #111827;
}

.occupancy-hint {
  margin-top: 6px;
}

.selector-footer {
  position: sticky;
  bottom: calc(12px + env(safe-area-inset-bottom));
  z-index: 20;
  padding: 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(18px);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.12);
}

.footer-actions {
  margin-top: 10px;
}

.footer-actions :deep(.van-button) {
  flex: 1;
}
</style>
