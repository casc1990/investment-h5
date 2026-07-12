<template>
  <div class="allocation-page">
    <div class="hero-card">
      <div class="hero-topbar">
        <button type="button" class="back-link" @click="router.push('/allocation')">← 返回策略列表</button>
        <div v-if="currentProfile" class="hero-actions compact">
          <button type="button" class="hero-action-button" @click="openEditProfilePopup">修改</button>
          <button type="button" class="hero-action-button danger" @click="handleDeleteCurrentProfile">删除</button>
        </div>
      </div>

      <div class="hero-main" v-if="currentProfile && summary">
        <div class="hero-label">策略详情</div>
        <div class="hero-title">{{ currentProfile.name || '先创建一个配置方案' }}</div>

        <div class="hero-amount-row">
          <div class="hero-amount-main">
            <span class="hero-primary-label">总目标资产</span>
            <span class="hero-primary-value">¥{{ formatAmount(currentProfile.totalAsset || summary.allocationBaseMarketValue || 0) }}</span>
            <span class="hero-market-chip">
              <span class="hero-market-chip-label">当前总市值</span>
              <span class="hero-market-chip-value">¥{{ formatAmount(summary.totalMarketValue || 0) }}</span>
            </span>
          </div>
          <div class="hero-side-stats">
            <div class="hero-side-stat combined">
              <span class="hero-side-stat-label">昨日收益 / 昨日收益率</span>
              <div class="hero-side-stat-inline">
                <span class="hero-side-stat-value" :class="profitClass(yesterdaySummary.profit)" :style="heroProfitStyle(yesterdaySummary.profit)">{{ formatSignedAmount(yesterdaySummary.profit) }}</span>
                <span class="hero-side-stat-separator">/</span>
                <span class="hero-side-stat-value" :class="profitClass(yesterdaySummary.profitRate)" :style="heroProfitStyle(yesterdaySummary.profitRate)">{{ formatSignedPercent(yesterdaySummary.profitRate) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="hero-stat-strip">
          <div class="hero-stat-inline profit-card">
            <span class="hero-stat-label">总收益</span>
            <span class="hero-stat-value" :class="profitClass(summary.totalProfit)" :style="heroProfitStyle(summary.totalProfit)">{{ formatSignedAmount(summary.totalProfit) }}</span>
          </div>
          <div class="hero-strip-divider"></div>
          <div class="hero-stat-inline profit-card">
            <span class="hero-stat-label">总收益率</span>
            <span class="hero-stat-value" :class="profitClass(summary.totalProfitRate)" :style="heroProfitStyle(summary.totalProfitRate)">{{ formatSignedPercent(summary.totalProfitRate) }}</span>
          </div>
          <div class="hero-strip-divider"></div>
          <div class="hero-stat-inline profit-card">
            <span class="hero-stat-label">目标收益率</span>
            <span class="hero-stat-value" :class="profitClass(currentProfile.targetProfitRate)" :style="heroProfitStyle(currentProfile.targetProfitRate)">{{ formatPercent(currentProfile.targetProfitRate || 0) }}</span>
          </div>
          <div class="hero-strip-divider"></div>
          <div class="hero-stat-inline mini-stat">
            <span class="hero-stat-label">基金数</span>
            <span class="hero-stat-value neutral">{{ currentProfile.funds?.length || 0 }}只</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!profiles.length" class="section empty-section">
      <van-empty description="还没有资产配置方案">
        <van-button round type="primary" @click="openCreateProfilePopup">创建第一个方案</van-button>
      </van-empty>
    </div>

    <template v-else>
      <div class="section" v-if="currentProfile">
        <div class="section-header">
          <div>
            <div class="section-title">⚙️ 方案配置</div>
            <div class="section-subtitle">目标比例 + 实际偏差率 + 偏差金额（未配置分类默认隐藏）</div>
          </div>
        </div>
        <div class="bucket-table">
          <div class="bucket-head bucket-row">
            <span>类别</span>
            <span>目标</span>
            <span>实际偏差率</span>
            <span>偏差金额</span>
          </div>
          <div v-for="bucket in configuredBucketRows" :key="bucket.assetType" class="bucket-row">
            <span class="bucket-label">{{ getAssetTypeLabel(bucket.assetType) }}</span>
            <span>{{ formatPercent(bucket.targetPct) }}</span>
            <span :class="['bucket-deviation-value', profitClass(bucket.deviationPct)]">{{ formatSignedPercent(bucket.deviationPct) }}</span>
            <span :class="['bucket-deviation-value', profitClass(bucket.deviationAmount)]">{{ formatSignedAmount(bucket.deviationAmount) }}</span>
          </div>
        </div>

        <div class="section-header trend-section-header">
          <div>
            <div class="section-title">📈 累计收益率趋势</div>
            <div class="section-subtitle">累计收益率曲线按本策略已纳入基金历史快照自动汇总</div>
          </div>
        </div>
        <div class="allocation-trend-tabs" role="tablist" aria-label="策略趋势图切换">
          <button
            type="button"
            class="allocation-trend-tab"
            :class="{ active: activeTrendTab === 'profit_rate' }"
            @click="activeTrendTab = 'profit_rate'"
          >累计收益率统计</button>
          <button
            type="button"
            class="allocation-trend-tab"
            :class="{ active: activeTrendTab === 'daily_bucket' }"
            @click="activeTrendTab = 'daily_bucket'"
          >每日收益统计</button>
        </div>

        <div v-if="activeTrendTab === 'profit_rate'" class="allocation-trend-panel allocation-trend-panel-single">
          <div class="allocation-profit-card">
            <TrendChart
              :points="allocationProfitTrendPoints"
              summary-label="累计收益率"
              :formatter="formatSignedPercent"
              :y-axis-formatter="formatSignedPercent"
              :show-zero-baseline="false"
              :reference-lines="allocationTrendReferenceLines"
              :show-point-markers="false"
              @select="handleAllocationTrendSelect"
            />

            <div v-if="selectedAllocationTrendRow" class="trend-metrics-grid allocation-trend-metrics-grid compact-two-rows">
              <div class="metric-card compact">
                <span class="metric-label">所选日期</span>
                <span class="metric-value neutral">{{ selectedAllocationTrendRow.date }}</span>
              </div>
              <div class="metric-card compact">
                <span class="metric-label">累计收益</span>
                <span class="metric-value" :class="profitClass(selectedAllocationTrendRow.totalProfit)">{{ formatSignedAmount(selectedAllocationTrendRow.totalProfit) }}</span>
              </div>
              <div class="metric-card compact">
                <span class="metric-label">累计收益率</span>
                <span class="metric-value" :class="profitClass(selectedAllocationTrendRow.totalProfitRate)">{{ formatSignedPercent(selectedAllocationTrendRow.totalProfitRate) }}</span>
              </div>
              <div class="metric-card compact">
                <span class="metric-label">超额收益率</span>
                <span class="metric-value" :class="profitClass(selectedAllocationTrendRow.targetGapRate)">{{ formatSignedPercent(selectedAllocationTrendRow.targetGapRate) }}</span>
              </div>
              <div class="metric-card compact">
                <span class="metric-label">当前市值</span>
                <span class="metric-value neutral">¥{{ formatAmount(selectedAllocationTrendRow.totalMarketValue) }}</span>
              </div>
              <div class="metric-card compact">
                <span class="metric-label">目标收益率</span>
                <span class="metric-value neutral">{{ formatPercent(selectedAllocationTrendRow.targetProfitRate) }}</span>
              </div>
            </div>
            <van-empty v-else description="历史快照还不够，先在统计页多刷新几次积累数据" />
          </div>
        </div>

        <div v-else-if="activeTrendTab === 'daily_bucket'" class="allocation-trend-panel allocation-trend-panel-single">
          <div class="allocation-profit-card allocation-profit-card-secondary">
            <AllocationBucketProfitCalendar
              :series="allocationBucketDailyTrendSeries"
              summary-label="每日收益统计"
              :formatter="formatSignedAmount"
            />
          </div>
        </div>
      </div>

      <div class="section" v-if="summary">
        <div class="section-header">
          <div>
            <div class="section-title">📊 配置统计</div>
            <div class="section-subtitle">各类别目标、当前配比与收益概览</div>
          </div>
        </div>
        <div v-if="loading" class="section-loading"><van-loading size="20px">持仓加载中...</van-loading></div>
        <div v-else class="bucket-summary-list">
          <div v-for="bucket in configuredBucketSummaries" :key="bucket.assetType" class="bucket-summary-card" :class="bucket.status">
            <div class="bucket-summary-top">
              <div class="bucket-summary-heading">
                <div class="bucket-summary-title">{{ bucket.label }}</div>
                <span class="bucket-status-pill" :class="bucket.status">{{ getBucketStatusLabel(bucket.status) }}</span>
              </div>
              <div class="bucket-summary-value">
                <span>持仓市值</span>
                <strong>¥{{ formatAmount(bucket.marketValue) }}</strong>
              </div>
            </div>
            <div class="bucket-ratio-grid">
              <div class="bucket-summary-metric">
                <span class="small-label">目标</span>
                <div class="small-value">{{ formatPercent(bucket.targetPct) }}</div>
              </div>
              <div class="bucket-summary-metric">
                <span class="small-label">当前</span>
                <div class="small-value" :class="currentRatioClass(bucket.currentPct, bucket.targetPct)">{{ formatPercent(bucket.currentPct) }}</div>
              </div>
              <div class="bucket-summary-metric">
                <span class="small-label">偏差</span>
                <div class="small-value" :class="profitClass(bucket.deviationPct)">{{ formatSignedPercent(bucket.deviationPct) }}</div>
              </div>
              <div class="bucket-summary-metric">
                <span class="small-label">基金</span>
                <div class="small-value">{{ getBucketIncludedCount(bucket.assetType) }}只</div>
              </div>
            </div>
            <div class="bucket-profit-grid">
              <div class="bucket-profit-item">
                <span class="small-label">累计收益</span>
                <div class="bucket-profit-value" :class="profitClass(bucket.totalProfit)">{{ formatSignedAmount(bucket.totalProfit) }}</div>
                <span class="bucket-profit-rate" :class="profitClass(bucket.totalProfitRate)">{{ formatSignedPercent(bucket.totalProfitRate) }}</span>
              </div>
              <div class="bucket-profit-item">
                <span class="small-label">今日收益</span>
                <div class="bucket-profit-value" :class="profitClass(bucket.dailyProfit)">{{ formatSignedAmount(bucket.dailyProfit) }}</div>
                <span class="bucket-profit-rate" :class="profitClass(bucket.dailyProfitRate)">{{ formatSignedPercent(bucket.dailyProfitRate) }}</span>
              </div>
            </div>

            <div class="bucket-card-actions">
              <button type="button" class="bucket-mini-action primary" @click="openBucketSelector(bucket.assetType)">
                <span class="bucket-mini-action-title">基金录入</span>
                <span class="bucket-mini-action-subtitle">选择基金</span>
              </button>
              <button type="button" class="bucket-mini-action secondary" @click="openBucketHoldings(bucket.assetType)">
                <span class="bucket-mini-action-title">基金持仓</span>
                <span class="bucket-mini-action-subtitle">已纳入 {{ getBucketIncludedCount(bucket.assetType) }} 只</span>
              </button>
              <button type="button" class="bucket-mini-action ghost" @click="openBucketSuggestion(bucket.assetType)">
                <span class="bucket-mini-action-title">配置建议</span>
                <span class="bucket-mini-action-subtitle">{{ getBucketActionHint(bucket.status) }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <van-popup v-model:show="showProfilePopup" position="bottom" round class="profile-popup" safe-area-inset-bottom>
      <div class="popup-content">
        <div class="popup-title">{{ profileDraft.id ? '编辑配置方案' : '新建配置方案' }}</div>
        <van-field v-model="profileDraft.name" label="方案名称" placeholder="请输入方案名称，例如：稳健组合" />
        <van-field v-model="profileDraft.note" label="备注" placeholder="请输入备注信息（选填）" />
        <van-field v-model.number="profileDraft.totalAsset" label="组合总资产" type="number" placeholder="请输入组合总资产，例如：80000" />
        <van-field v-model.number="profileDraft.targetProfitRate" label="目标收益率" type="number" placeholder="请输入目标收益率，默认 0" />
        <div class="draft-summary" :class="{ invalid: profileDraftTotal !== 100 }">
          当前目标合计：{{ formatPercent(profileDraftTotal) }}
          <span v-if="profileDraftTotal < 100">，还差 {{ formatPercent(100 - profileDraftTotal) }}</span>
          <span v-else-if="profileDraftTotal > 100">，超出 {{ formatPercent(profileDraftTotal - 100) }}</span>
        </div>
        <div v-for="bucket in profileDraft.buckets" :key="bucket.assetType" class="draft-bucket-row">
          <div class="draft-bucket-label">{{ getAssetTypeLabel(bucket.assetType) }}</div>
          <div class="draft-bucket-inputs">
            <input v-model.number="bucket.targetPct" type="number" min="0" step="0.01" :placeholder="`${getAssetTypeLabel(bucket.assetType)}目标比例`" />
            <input v-model.number="bucket.maxDeviationPct" type="number" min="0" step="0.01" :placeholder="`${getAssetTypeLabel(bucket.assetType)}最大偏差`" />
          </div>
        </div>
        <div class="popup-actions">
          <van-button round :disabled="savingProfile" @click="showProfilePopup = false">取消</van-button>
          <van-button round type="primary" :loading="savingProfile" loading-text="保存中..." :disabled="!canSaveProfileDraft || savingProfile" @click="saveProfileDraft">保存方案</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import TrendChart from '../components/TrendChart.vue'
import AllocationBucketProfitCalendar from '../components/AllocationBucketProfitCalendar.vue'
import { positionApi } from '../api'
import {
  ALLOCATION_ASSET_TYPES,
  ALLOCATION_ASSET_TYPE_LABELS,
  ALLOCATION_ASSET_TYPE_ORDER,
  ALLOCATION_FUND_STATUSES,
  buildAllocationDailyProfitTrend,
  buildAllocationOccupancyMap,
  buildAllocationProfileSummary,
  buildAllocationProfitTrend,
  createDefaultAllocationBuckets,
  filterConfiguredAllocationBuckets,
  getPositionMarketValue,
  getPositionOccupancy,
  getPositionYesterdayProfit,
  guessAllocationAssetType,
  normalizeAllocationProfile,
} from '../utils/allocation'
import {
  ALLOCATION_PROFILES_UPDATED_EVENT,
  fetchAllocationProfiles,
  loadAllocationProfiles,
  loadSelectedAllocationProfileId,
  persistAllocationProfiles,
  saveSelectedAllocationProfileId,
} from '../utils/allocationStorage'
import { shouldRefreshPageData } from '../utils/perfHelpers'
import { fetchProfitSnapshots, getProfitSnapshots } from '../utils/profitLedger'
import { captureProfitSnapshotFromApis } from '../utils/profitSnapshotService'

const route = useRoute()
const router = useRouter()
const profiles = ref(loadAllocationProfiles())
const selectedProfileId = ref(String(route.params.profileId || loadSelectedAllocationProfileId() || profiles.value[0]?.id || ''))
const positions = ref([])
const loading = ref(false)
const lastLoadedAt = ref(0)
const hasLoadedOnce = ref(false)
const showProfilePopup = ref(false)
const savingProfile = ref(false)
const profileDraft = ref(createProfileDraft())
const selectedAllocationTrendRow = ref(null)
const activeTrendTab = ref('profit_rate')
const profitSnapshots = ref(getProfitSnapshots())

const assetTypeOptions = ALLOCATION_ASSET_TYPE_ORDER.map(value => ({ value, label: ALLOCATION_ASSET_TYPE_LABELS[value] }))
const fundStatusOptions = Object.values(ALLOCATION_FUND_STATUSES)

const currentProfile = computed(() => profiles.value.find(item => item.id === selectedProfileId.value) || null)
const occupancyMap = computed(() => buildAllocationOccupancyMap(profiles.value, positions.value))
const summary = computed(() => {
  if (!currentProfile.value) return null
  return buildAllocationProfileSummary({ profile: currentProfile.value, positions: positions.value, allProfiles: profiles.value })
})
const configuredBucketRows = computed(() => {
  if (!summary.value) return []
  return filterConfiguredAllocationBuckets({
    buckets: summary.value.bucketSummaries,
    funds: currentProfile.value?.funds || [],
  })
})
const configuredBucketSummaries = configuredBucketRows
const allocationProfitTrendPoints = computed(() => {
  if (!currentProfile.value) return []
  return buildAllocationProfitTrend({
    profile: currentProfile.value,
    snapshots: profitSnapshots.value,
  })
})
const allocationBucketDailyTrendSeries = computed(() => {
  if (!currentProfile.value) return []
  return buildAllocationDailyProfitTrend({
    profile: currentProfile.value,
    snapshots: profitSnapshots.value,
  })
})
const allocationTrendReferenceLines = computed(() => {
  if (!currentProfile.value) return []
  return [{
    key: 'target-profit-rate',
    label: '',
    value: Number(currentProfile.value.targetProfitRate) || 0,
    color: '#f97316',
    dasharray: '6 4',
    showAxisLabel: true,
    axisLabel: `目标 ${formatPercent(currentProfile.value.targetProfitRate || 0)}`,
  }]
})
const yesterdaySummary = computed(() => {
  const rows = summary.value?.fundRows || []
  const profit = round2(rows.reduce((sum, item) => sum + getPositionYesterdayProfit(item.position), 0))
  const currentMarketValue = round2(rows.reduce((sum, item) => sum + (Number(item.marketValue) || 0), 0))
  const previousMarketValue = round2(currentMarketValue - profit)
  const profitRate = previousMarketValue > 0 ? round2(profit / previousMarketValue * 100) : 0
  return { profit, profitRate }
})
const profileDraftTotal = computed(() => round2(profileDraft.value.buckets.reduce((sum, item) => sum + (Number(item.targetPct) || 0), 0)))
const canSaveProfileDraft = computed(() => {
  if (!profileDraft.value.name?.trim()) return false
  if ((Number(profileDraft.value.totalAsset) || 0) <= 0) return false
  return profileDraftTotal.value === 100
})

function round2(value) {
  return Number((Number(value) || 0).toFixed(2))
}

function formatAmount(value) {
  const num = Number(value) || 0
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPercent(value) {
  return `${round2(value)}%`
}

function formatSignedAmount(value) {
  const num = round2(value)
  return `${num >= 0 ? '+' : ''}${formatAmount(num)}`
}

function formatSignedPercent(value) {
  const num = round2(value)
  return `${num >= 0 ? '+' : ''}${num}%`
}

function profitClass(value) {
  const num = Number(value) || 0
  if (num > 0) return 'positive'
  if (num < 0) return 'negative'
  return 'neutral'
}

function currentRatioClass(currentPct, targetPct) {
  return Number(currentPct) > Number(targetPct) ? 'positive' : 'negative'
}

function heroProfitStyle(value) {
  const num = Number(value) || 0
  if (num > 0) {
    return {
      color: '#ff8a9b',
      textShadow: '0 1px 10px rgba(255, 84, 104, 0.5)',
      fontWeight: '800',
    }
  }
  if (num < 0) {
    return {
      color: '#7ef0b1',
      textShadow: '0 1px 10px rgba(34, 197, 94, 0.45)',
      fontWeight: '800',
    }
  }
  return {
    color: '#ffffff',
    textShadow: 'none',
    fontWeight: '700',
  }
}

function statusClass(status) {
  if (status === ALLOCATION_FUND_STATUSES.KEEP) return 'keep'
  if (status === ALLOCATION_FUND_STATUSES.WATCH) return 'watch'
  if (status === ALLOCATION_FUND_STATUSES.REDUCE) return 'reduce'
  return 'forbid'
}

function getAssetTypeLabel(assetType) {
  return ALLOCATION_ASSET_TYPE_LABELS[assetType] || '其他基金'
}

function getBucketStatusLabel(status) {
  if (status === 'low') return '低配'
  if (status === 'high') return '超配'
  return '达标'
}

function handleAllocationTrendSelect(row) {
  selectedAllocationTrendRow.value = row || null
}

function createProfileId() {
  return `allocation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createProfileDraft(profile = null) {
  if (!profile) {
    return {
      id: '',
      version: 0,
      name: '',
      note: '',
      totalAsset: null,
      targetProfitRate: 0,
      buckets: createDefaultAllocationBuckets().map(bucket => ({
        ...bucket,
        targetPct: null,
        maxDeviationPct: null,
      })),
    }
  }
  return JSON.parse(JSON.stringify({
    id: profile.id,
    version: Number(profile.version || 0),
    name: profile.name,
    note: profile.note || '',
    totalAsset: profile.totalAsset || null,
    targetProfitRate: profile.targetProfitRate ?? 0,
    buckets: profile.buckets,
  }))
}

async function persistProfiles(nextProfiles, nextSelectedId) {
  const previousProfiles = profiles.value
  profiles.value = await persistAllocationProfiles(nextProfiles, previousProfiles)
  selectedProfileId.value = nextSelectedId || profiles.value[0]?.id || ''
  saveSelectedAllocationProfileId(selectedProfileId.value)
  if (selectedProfileId.value) {
    router.replace(`/allocation/${selectedProfileId.value}`)
    return
  }
  router.replace('/allocation')
}

function syncProfilesFromStorage() {
  const nextProfiles = loadAllocationProfiles()
  profiles.value = nextProfiles

  const routeProfileId = String(route.params.profileId || '')
  const storedId = loadSelectedAllocationProfileId()
  const fallbackId = nextProfiles.some(item => item.id === routeProfileId)
    ? routeProfileId
    : nextProfiles.some(item => item.id === storedId)
      ? storedId
      : nextProfiles[0]?.id || ''

  selectedProfileId.value = fallbackId
}

function handleProfilesUpdated() {
  syncProfilesFromStorage()
}

async function updateCurrentProfile(mutator) {
  if (!currentProfile.value) return
  const nextProfiles = profiles.value.map(profile => {
    if (profile.id !== currentProfile.value.id) return profile
    const draft = JSON.parse(JSON.stringify(profile))
    mutator(draft)
    draft.updatedAt = new Date().toISOString()
    return normalizeAllocationProfile(draft)
  })
  await persistProfiles(nextProfiles, currentProfile.value.id)
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
    lastLoadedAt.value = Date.now()
    hasLoadedOnce.value = true

    captureProfitSnapshotFromApis().catch((error) => {
      console.warn('capture snapshot from allocation failed:', error)
    })
  } catch (error) {
    showToast(`持仓加载失败：${error.message || '网络错误'}`)
  } finally {
    loading.value = false
  }
}

async function ensureFreshData({ force = false } = {}) {
  if (!shouldRefreshPageData({ hasData: hasLoadedOnce.value, lastLoadedAt: lastLoadedAt.value, force })) return
  await fetchPositions()
}

function handleSelectProfile(profileId) {
  selectedProfileId.value = profileId
  saveSelectedAllocationProfileId(profileId)
  router.push(`/allocation/${profileId}`)
}

function openCreateProfilePopup() {
  profileDraft.value = createProfileDraft()
  showProfilePopup.value = true
}

function openBucketSelector(assetType) {
  if (!currentProfile.value) return
  router.push(`/allocation/${currentProfile.value.id}/bucket/${assetType}/select`)
}

function openBucketHoldings(assetType) {
  if (!currentProfile.value) return
  router.push(`/allocation/${currentProfile.value.id}/bucket/${assetType}/holdings`)
}

function openBucketSuggestion(assetType) {
  if (!currentProfile.value) return
  router.push(`/allocation/${currentProfile.value.id}/bucket/${assetType}/suggestion`)
}

function openEditProfilePopup() {
  if (!currentProfile.value) return
  profileDraft.value = createProfileDraft(currentProfile.value)
  showProfilePopup.value = true
}

async function saveProfileDraft() {
  if (savingProfile.value) return
  if (!canSaveProfileDraft.value) {
    showToast('请先填写方案名称、组合总资产，并确保目标比例合计等于100%')
    return
  }

  const normalized = normalizeAllocationProfile({
    id: profileDraft.value.id || createProfileId(),
    version: Number(profileDraft.value.version || 0),
    name: profileDraft.value.name.trim(),
    note: profileDraft.value.note?.trim() || '',
    totalAsset: Number(profileDraft.value.totalAsset) || 0,
    targetProfitRate: Number(profileDraft.value.targetProfitRate) || 0,
    buckets: profileDraft.value.buckets.map(item => ({
      assetType: item.assetType,
      targetPct: Number(item.targetPct) || 0,
      maxDeviationPct: Number(item.maxDeviationPct) || 0,
    })),
    funds: profileDraft.value.id
      ? currentProfile.value?.funds || []
      : [],
    defaultFundByType: profileDraft.value.id
      ? currentProfile.value?.defaultFundByType || {}
      : {},
    createdAt: profileDraft.value.id ? currentProfile.value?.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const exists = profiles.value.some(item => item.id === normalized.id)
  const nextProfiles = exists
    ? profiles.value.map(item => (item.id === normalized.id ? normalized : item))
    : [...profiles.value, normalized]

  try {
    savingProfile.value = true
    await persistProfiles(nextProfiles, normalized.id)
    showProfilePopup.value = false
    showToast(exists ? '配置方案已更新并同步' : '配置方案已创建并同步')
    router.replace(`/allocation/${normalized.id}`)
  } catch (error) {
    showToast(`配置方案保存失败：${error?.response?.data?.message || error.message || '网络错误'}`)
    if (error?.response?.status === 409) {
      try { profiles.value = await fetchAllocationProfiles() } catch { /* keep current form for retry */ }
    }
  } finally {
    savingProfile.value = false
  }
}

async function handleDeleteCurrentProfile() {
  if (!currentProfile.value) return
  try {
    await showConfirmDialog({ title: '删除方案', message: `确定删除“${currentProfile.value.name}”吗？` })
    const nextProfiles = profiles.value.filter(item => item.id !== currentProfile.value.id)
    await persistProfiles(nextProfiles, nextProfiles[0]?.id || '')
    showToast('已删除当前方案')
    if (nextProfiles[0]?.id) {
      router.replace(`/allocation/${nextProfiles[0].id}`)
    } else {
      router.replace('/allocation')
    }
  } catch (error) {
    if (error === 'cancel' || error?.message === 'cancel') return
    showToast(`删除失败：${error?.response?.data?.message || error.message || '网络错误'}`)
  }
}

function getCurrentFundConfig(positionId) {
  return currentProfile.value?.funds?.find(item => item.positionId === positionId) || null
}

function isPositionIncluded(position) {
  return Boolean(getCurrentFundConfig(position.id))
}

function isPositionLockedByOtherProfile(position) {
  const occupancy = getPositionOccupancy(occupancyMap.value, position)
  return occupancy.some(item => item.profileId !== currentProfile.value?.id)
}

function getPositionLockProfileNames(position) {
  const occupancy = getPositionOccupancy(occupancyMap.value, position)
    .filter(item => item.profileId !== currentProfile.value?.id)
  return occupancy.map(item => item.profileName).join('、')
}

function togglePositionInCurrentProfile(position, assetType = null) {
  if (!currentProfile.value) return
  if (!isPositionIncluded(position) && isPositionLockedByOtherProfile(position)) {
    showToast(`该基金已纳入方案：${getPositionLockProfileNames(position)}`)
    return
  }

  updateCurrentProfile(profile => {
    const existingIndex = profile.funds.findIndex(item => item.positionId === position.id)
    if (existingIndex >= 0) {
      profile.funds.splice(existingIndex, 1)
      return
    }
    profile.funds.push({
      positionId: position.id,
      assetType: assetType || guessAllocationAssetType(position),
      status: ALLOCATION_FUND_STATUSES.KEEP,
    })
  })
}

function getBucketIncludedCount(assetType) {
  return currentProfile.value?.funds?.filter(item => item.assetType === assetType).length || 0
}

function getBucketActionHint(status) {
  if (status === 'low') return '查看补仓建议'
  if (status === 'high') return '查看调仓提示'
  return '查看配置分析'
}

function getBucketCandidatePositions(assetType) {
  return [...positions.value]
    .filter(position => {
      const config = getCurrentFundConfig(position.id)
      if (config) return true
      return !isPositionLockedByOtherProfile(position)
    })
    .sort((a, b) => {
      const aConfig = getCurrentFundConfig(a.id)
      const bConfig = getCurrentFundConfig(b.id)
      const aIncludedInBucket = aConfig?.assetType === assetType
      const bIncludedInBucket = bConfig?.assetType === assetType
      if (aIncludedInBucket !== bIncludedInBucket) return aIncludedInBucket ? -1 : 1

      const aGuessMatch = guessAllocationAssetType(a) === assetType
      const bGuessMatch = guessAllocationAssetType(b) === assetType
      if (aGuessMatch !== bGuessMatch) return aGuessMatch ? -1 : 1

      const aIncluded = Boolean(aConfig)
      const bIncluded = Boolean(bConfig)
      if (aIncluded !== bIncluded) return aIncluded ? -1 : 1

      return getPositionMarketValue(b) - getPositionMarketValue(a)
    })
}

function updateFundConfig(positionId, field, value) {
  updateCurrentProfile(profile => {
    const fund = profile.funds.find(item => item.positionId === positionId)
    if (!fund) return
    fund[field] = value
  })
}

watch(() => route.params.profileId, (profileId) => {
  const nextId = String(profileId || '')
  if (!nextId) return
  const exists = profiles.value.some(item => item.id === nextId)
  if (!exists) {
    const fallbackId = profiles.value[0]?.id || ''
    if (fallbackId) {
      selectedProfileId.value = fallbackId
      saveSelectedAllocationProfileId(fallbackId)
      router.replace(`/allocation/${fallbackId}`)
    }
    return
  }
  selectedProfileId.value = nextId
  saveSelectedAllocationProfileId(nextId)
}, { immediate: true })

watch(profiles, (list) => {
  if (!list.length) return
  if (currentProfile.value) return
  const storedId = loadSelectedAllocationProfileId()
  const fallbackId = list.some(item => item.id === storedId) ? storedId : list[0]?.id || ''
  if (!fallbackId) return
  selectedProfileId.value = fallbackId
  saveSelectedAllocationProfileId(fallbackId)
}, { deep: true })

watch(allocationProfitTrendPoints, (points) => {
  if (!points.length) {
    selectedAllocationTrendRow.value = null
    return
  }
  const existing = points.find(item => item.date === selectedAllocationTrendRow.value?.date)
  selectedAllocationTrendRow.value = existing || points.at(-1)?.raw || null
}, { immediate: true })

onMounted(async () => {
  try { profitSnapshots.value = await fetchProfitSnapshots() } catch (error) { showToast(`历史收益同步失败：${error.message || '网络错误'}`) }
  try {
    profiles.value = await fetchAllocationProfiles()
    syncProfilesFromStorage()
  } catch (error) {
    showToast(`策略同步失败：${error.message || '网络错误'}`)
  }
  ensureFreshData({ force: true })
  if (typeof window !== 'undefined') {
    window.addEventListener(ALLOCATION_PROFILES_UPDATED_EVENT, handleProfilesUpdated)
  }
})

onActivated(async () => {
  try { profitSnapshots.value = await fetchProfitSnapshots() } catch { profitSnapshots.value = getProfitSnapshots() }
  try {
    profiles.value = await fetchAllocationProfiles()
  } catch {
    syncProfilesFromStorage()
  }
  ensureFreshData()
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener(ALLOCATION_PROFILES_UPDATED_EVENT, handleProfilesUpdated)
  }
})
</script>

<style scoped>
.allocation-page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: 16px 16px calc(var(--app-floating-page-space) + 16px);
}

.hero-card,
.section,
.position-card,
.bucket-summary-card,
.fund-row-card,
.suggestion-card {
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.hero-card {
  padding: 10px 12px 10px;
  margin-bottom: 14px;
  background: linear-gradient(180deg, #5b6ee1 0%, #4c63d2 100%);
  color: #fff;
}

.hero-topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.hero-main {
  margin-top: 8px;
}

.hero-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.74);
}

.hero-title {
  font-size: 18px;
  line-height: 1.2;
  font-weight: 700;
  margin-top: 2px;
  color: #fff;
}

.hero-amount-row {
  margin-top: 8px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
}

.hero-amount-main {
  min-width: 0;
  flex: 1;
}

.hero-side-stats {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  min-width: 164px;
}

.hero-side-stat {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.hero-side-stat.combined {
  min-width: 0;
}

.hero-side-stat-label {
  display: block;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.72);
}

.hero-side-stat-value {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.15;
  font-weight: 700;
  white-space: nowrap;
  color: #fff;
}

.hero-side-stat-inline {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 3px;
  flex-wrap: nowrap;
}

.hero-side-stat-inline .hero-side-stat-value {
  margin-top: 0;
}

.hero-side-stat-separator {
  color: rgba(255, 255, 255, 0.72);
  font-size: 11px;
  line-height: 1;
}

.hero-side-stat-value.positive {
  color: #ffe4e8;
  text-shadow: 0 1px 8px rgba(248, 113, 113, 0.34);
}

.hero-side-stat-value.negative {
  color: #e7ffe9;
  text-shadow: 0 1px 8px rgba(74, 222, 128, 0.3);
}

.hero-primary-label {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.74);
}

.hero-primary-value {
  display: block;
  margin-top: 2px;
  font-size: 24px;
  line-height: 1.04;
  font-weight: 700;
  color: #fff;
  font-family: 'Courier New', monospace;
  letter-spacing: -0.4px;
}

.hero-market-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
}

.hero-market-chip-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.82);
}

.hero-market-chip-value {
  font-size: 13px;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.2px;
}

.hero-stat-strip {
  display: flex;
  align-items: center;
  margin-top: 10px;
  padding: 8px 0;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 10px;
}

.hero-stat-inline {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
}

.hero-strip-divider {
  width: 1px;
  align-self: stretch;
  background: rgba(255, 255, 255, 0.22);
}

.hero-stat-label {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.76);
}

.hero-stat-value {
  display: block;
  font-size: 12px;
  line-height: 1.15;
  font-weight: 700;
  color: #fff;
  text-align: center;
  white-space: nowrap;
}

.hero-stat-value.neutral {
  color: #fff;
}

.hero-stat-value.positive {
  color: #ffe4e8;
  text-shadow: 0 1px 8px rgba(248, 113, 113, 0.34);
}

.hero-stat-value.negative {
  color: #e7ffe9;
  text-shadow: 0 1px 8px rgba(74, 222, 128, 0.3);
}

.hero-actions {
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: center;
}

.hero-actions.compact {
  flex: 0 0 auto;
}

.hero-action-button {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.hero-action-button.danger {
  color: #ffe3e6;
  border-color: rgba(255, 210, 214, 0.26);
  background: rgba(255, 107, 107, 0.12);
}

.back-link {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.96);
  padding: 0;
  border-radius: 0;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  text-align: left;
}

.section {
  padding: 16px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 17px;
  font-weight: 700;
  color: #111827;
}

.section-subtitle,
.profile-meta-row,
.position-meta,
.fund-row-meta,
.hint-line,
.bucket-summary-status,
.suggestion-reason,
.suggestion-meta,
.occupancy-hint {
  color: #6b7280;
  font-size: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.profile-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.profile-chip {
  border: none;
  border-radius: 999px;
  padding: 10px 14px;
  background: #eef2ff;
  color: #4338ca;
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.profile-chip.active {
  background: #4f46e5;
  color: #fff;
}

.profile-chip-count {
  font-size: 12px;
  opacity: 0.9;
}

.profile-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}

.danger-link {
  border: none;
  background: transparent;
  color: #dc2626;
  padding: 0;
}

.bucket-table {
  border-radius: 14px;
  overflow: hidden;
  background: #f8fafc;
}

.allocation-profit-card {
  margin-top: 12px;
  padding: 12px;
  border-radius: 16px;
  background: #f8fbff;
  border: 1px solid #dbeafe;
}

.allocation-profit-card-secondary {
  height: 100%;
}

.allocation-trend-tabs {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.allocation-trend-tab {
  appearance: none;
  border: 1px solid #dbeafe;
  background: #f8fbff;
  color: #475569;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
}

.allocation-trend-tab.active {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  border-color: #1d4ed8;
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.22);
}

.allocation-trend-panel {
  min-width: 0;
}

.allocation-trend-panel-single {
  margin-top: 10px;
}

.trend-section-header {
  margin-top: 16px;
}

.bucket-row {
  display: grid;
  grid-template-columns: 1.2fr 0.7fr 0.95fr 1.05fr;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 13px;
}

.bucket-head {
  background: #eef2ff;
  color: #4f46e5;
  font-weight: 700;
}

.bucket-label {
  color: #111827;
  font-weight: 600;
}

.bucket-deviation-value {
  font-weight: 700;
}

.bucket-deviation-value.positive {
  color: #f87171;
}

.bucket-deviation-value.negative {
  color: #4ade80;
}

.bucket-deviation-value.neutral {
  color: #6b7280;
}

.account-group + .account-group {
  margin-top: 16px;
}

.account-group-title,
.subsection-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 10px;
  color: #1f2937;
}

.position-card {
  padding: 14px;
  margin-bottom: 10px;
}

.position-top,
.fund-row-top,
.bucket-summary-top,
.suggestion-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.position-name,
.fund-row-name,
.bucket-summary-title,
.suggestion-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.position-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
}

.select-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #475569;
}

.select-field select,
.draft-bucket-inputs input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13px;
  background: #fff;
}

.bucket-summary-list,
.fund-row-list,
.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bucket-summary-card,
.fund-row-card,
.suggestion-card {
  padding: 12px;
}

.bucket-summary-card {
  position: relative;
  overflow: hidden;
  padding: 15px 14px 13px;
  border: 1px solid #edf1f7;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.055);
}

.bucket-summary-card::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  content: '';
}

.bucket-summary-card.low::before { background: #f59e0b; }
.bucket-summary-card.high::before { background: #ef4444; }
.bucket-summary-card.ok::before { background: #10b981; }

.bucket-summary-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  min-width: 0;
}

.bucket-status-pill {
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.bucket-status-pill.low { color: #b45309; background: #fff7ed; }
.bucket-status-pill.high { color: #dc2626; background: #fef2f2; }
.bucket-status-pill.ok { color: #047857; background: #ecfdf5; }

.bucket-summary-value {
  flex: none;
  text-align: right;
}

.bucket-summary-value span {
  display: block;
  margin-bottom: 2px;
  color: #94a3b8;
  font-size: 10px;
}

.bucket-summary-value strong {
  color: #0f172a;
  font-size: 16px;
  line-height: 1.2;
}

.fund-row-grid,
.trend-metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 8px;
}

.bucket-ratio-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-top: 13px;
  padding: 10px 8px;
  border-radius: 12px;
  background: #f8fafc;
}

.bucket-ratio-grid .bucket-summary-metric {
  min-width: 0;
  text-align: center;
}

.bucket-ratio-grid .small-label {
  margin-bottom: 3px;
  font-size: 10px;
}

.bucket-ratio-grid .small-value {
  font-size: 14px;
}

.bucket-profit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 9px;
}

.bucket-profit-item {
  position: relative;
  min-width: 0;
  padding: 10px 11px;
  border: 1px solid #eef2f7;
  border-radius: 12px;
  background: #fff;
}

.bucket-profit-value {
  margin-top: 3px;
  padding-right: 42px;
  overflow: hidden;
  font-size: 15px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bucket-profit-rate {
  position: absolute;
  right: 10px;
  bottom: 11px;
  font-size: 11px;
  font-weight: 700;
}

.metric-card {
  padding: 10px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
}

.metric-card.compact {
  background: #fff;
}

.metric-label {
  display: block;
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 4px;
}

.metric-value {
  font-weight: 700;
  color: #111827;
  font-size: 12px;
  line-height: 1.2;
}

.allocation-trend-metrics-grid {
  margin-top: 12px;
}

.allocation-trend-metrics-grid.compact-two-rows {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.allocation-trend-metrics-grid.compact-two-rows .metric-card {
  padding: 8px 9px;
}

.allocation-trend-metrics-grid.compact-two-rows .metric-label {
  margin-bottom: 3px;
  font-size: 10px;
}

.allocation-trend-metrics-grid.compact-two-rows .metric-value {
  font-size: 11px;
  line-height: 1.15;
  word-break: break-all;
}

.bucket-card-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 11px;
  padding-top: 11px;
  border-top: 1px solid #eef2f7;
}

.bucket-mini-action {
  min-width: 0;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  padding: 8px 8px;
  text-align: center;
  background: #f8fbff;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  justify-content: center;
}

.bucket-mini-action.primary {
  background: #eff6ff;
}

.bucket-mini-action.secondary {
  background: #f8fafc;
}

.bucket-mini-action.ghost {
  background: #f5f3ff;
  border-color: #ddd6fe;
}

.bucket-mini-action-title {
  font-size: 12px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.1;
}

.bucket-mini-action-subtitle {
  font-size: 10px;
  color: #64748b;
  line-height: 1.15;
}

.bucket-config-entry {
  margin-top: 14px;
  border-top: 1px solid #e5e7eb;
  padding-top: 12px;
}

.bucket-config-entry {
  width: 100%;
  margin-top: 14px;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  padding: 12px;
  background: #eff6ff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.bucket-config-button {
  cursor: pointer;
}

.bucket-config-summary {
  font-size: 12px;
  font-weight: 500;
  color: #1d4ed8;
}

.bucket-config-cta {
  font-size: 13px;
  font-weight: 700;
  color: #2563eb;
}

.small-label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}

.small-value,
.bucket-summary-amount,
.suggestion-amount {
  font-weight: 700;
  color: #111827;
}

.bucket-summary-metric {
  min-width: 0;
}

.bucket-summary-metric.wide {
  grid-column: 1 / -1;
}

.small-value.nowrap {
  white-space: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.small-value.nowrap::-webkit-scrollbar {
  display: none;
}

.fund-status-tag {
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  height: fit-content;
}

.fund-status-tag.keep { background: #dcfce7; color: #166534; }
.fund-status-tag.watch { background: #fef3c7; color: #92400e; }
.fund-status-tag.reduce { background: #fee2e2; color: #b91c1c; }
.fund-status-tag.forbid { background: #e5e7eb; color: #374151; }


.suggestion-block + .suggestion-block {
  margin-top: 18px;
}

.suggestion-card.recommend { border-left: 4px solid #3b82f6; }
.suggestion-card.rebalance { border-left: 4px solid #ef4444; }

.suggestion-funds {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.suggestion-fund-line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 12px;
  font-size: 13px;
}

.suggestion-fund-line.multi-line {
  align-items: flex-start;
}

.popup-content {
  max-height: min(78vh, 760px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 18px 16px calc(var(--app-tabbar-space) + 28px);
}

.popup-title {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 12px;
}

.draft-summary {
  margin: 12px 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 13px;
}

.draft-summary.invalid {
  background: #fef2f2;
  color: #dc2626;
}

.draft-bucket-row + .draft-bucket-row {
  margin-top: 12px;
}

.draft-bucket-label {
  font-size: 13px;
  color: #334155;
  margin-bottom: 8px;
}

.draft-bucket-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.popup-actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.popup-actions :deep(.van-button) {
  flex: 1;
}

.section-loading,
.empty-section {
  display: flex;
  justify-content: center;
}

.positive { color: #ee0a24; }
.negative { color: #07c160; }
.neutral { color: #111827; }

@media (max-width: 420px) {
  .hero-topbar,
  .position-top,
  .fund-row-top,
  .suggestion-top {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-main {
    margin-top: 10px;
  }

  .hero-amount-row {
    align-items: flex-start;
    gap: 10px;
  }

  .hero-side-stats {
    min-width: 104px;
    gap: 6px;
  }

  .hero-primary-value {
    font-size: 22px;
  }

  .hero-market-chip {
    gap: 6px;
    padding: 4px 8px;
  }

  .hero-market-chip-label {
    font-size: 10px;
  }

  .hero-market-chip-value {
    font-size: 12px;
  }

  .hero-stat-strip {
    padding: 8px 0;
  }

  .hero-stat-inline {
    padding: 0 4px;
  }

  .hero-stat-value {
    font-size: 11px;
  }

  .hero-actions {
    justify-content: flex-end;
  }

  .trend-metrics-grid {
    grid-template-columns: 1fr;
  }

  .allocation-trend-metrics-grid.compact-two-rows {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
