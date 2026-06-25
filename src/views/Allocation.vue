<template>
  <div class="allocation-page">
    <div class="hero-card">
      <div>
        <div class="hero-label">🎯 资产配置</div>
        <div class="hero-title">{{ currentProfile?.name || '先创建一个配置方案' }}</div>
        <div class="hero-subtitle">多方案 / 最大偏差 / 手动纳入 / 方案内建议</div>
      </div>
      <div class="hero-actions">
        <van-button size="small" round type="primary" @click="openCreateProfilePopup">新建方案</van-button>
        <van-button v-if="currentProfile" size="small" round plain type="primary" @click="openEditProfilePopup">编辑</van-button>
      </div>
    </div>

    <div v-if="!profiles.length" class="section empty-section">
      <van-empty description="还没有资产配置方案">
        <van-button round type="primary" @click="openCreateProfilePopup">创建第一个方案</van-button>
      </van-empty>
    </div>

    <template v-else>
      <div class="section">
        <div class="section-title">📚 配置方案</div>
        <div class="profile-chip-row">
          <button
            v-for="profile in profiles"
            :key="profile.id"
            type="button"
            class="profile-chip"
            :class="{ active: profile.id === selectedProfileId }"
            @click="handleSelectProfile(profile.id)"
          >
            <span>{{ profile.name }}</span>
            <span class="profile-chip-count">{{ profile.funds?.length || 0 }}只</span>
          </button>
        </div>
        <div v-if="currentProfile" class="profile-meta-row">
          <span>未覆盖资产：¥{{ formatAmount(summary?.uncoveredMarketValue || 0) }}</span>
          <span>未覆盖基金：{{ summary?.uncoveredPositionCount || 0 }}只</span>
          <button type="button" class="danger-link" @click="handleDeleteCurrentProfile">删除当前方案</button>
        </div>
      </div>

      <div class="section" v-if="currentProfile">
        <div class="section-header">
          <div>
            <div class="section-title">⚙️ 方案配置</div>
            <div class="section-subtitle">目标比例 + 允许最大偏差</div>
          </div>
        </div>
        <div class="bucket-table">
          <div class="bucket-head bucket-row">
            <span>类别</span>
            <span>目标</span>
            <span>偏差</span>
          </div>
          <div v-for="bucket in currentProfile.buckets" :key="bucket.assetType" class="bucket-row">
            <span class="bucket-label">{{ getAssetTypeLabel(bucket.assetType) }}</span>
            <span>{{ formatPercent(bucket.targetPct) }}</span>
            <span>±{{ formatPercent(bucket.maxDeviationPct) }}</span>
          </div>
        </div>
      </div>

      <div class="section" v-if="currentProfile">
        <div class="section-header">
          <div>
            <div class="section-title">➕ 手动纳入基金</div>
            <div class="section-subtitle">同账户下同基金只能归属一个方案</div>
          </div>
        </div>
        <div v-if="loading" class="section-loading"><van-loading size="20px">持仓加载中...</van-loading></div>
        <template v-else>
          <div v-for="group in positionGroups" :key="group.accountId" class="account-group">
            <div class="account-group-title">{{ group.accountName }}</div>
            <div v-for="position in group.positions" :key="position.id" class="position-card">
              <div class="position-top">
                <div>
                  <div class="position-name">{{ position.fund_name || '未知基金' }}</div>
                  <div class="position-meta">{{ position.fund_code }} · 当前市值 ¥{{ formatAmount(getPositionMarketValue(position)) }}</div>
                </div>
                <van-button
                  size="small"
                  round
                  :type="isPositionIncluded(position) ? 'danger' : 'primary'"
                  :plain="!isPositionIncluded(position)"
                  :disabled="isPositionLockedByOtherProfile(position)"
                  @click="togglePositionInCurrentProfile(position)"
                >
                  {{ isPositionIncluded(position) ? '移出方案' : (isPositionLockedByOtherProfile(position) ? '已被占用' : '纳入方案') }}
                </van-button>
              </div>
              <div v-if="isPositionLockedByOtherProfile(position) && !isPositionIncluded(position)" class="occupancy-hint">
                已纳入：{{ getPositionLockProfileNames(position) }}
              </div>
              <div v-if="isPositionIncluded(position)" class="position-controls">
                <label class="select-field">
                  <span>基金类别</span>
                  <select
                    :value="getCurrentFundConfig(position.id)?.assetType || guessAllocationAssetType(position)"
                    @change="updateFundConfig(position.id, 'assetType', $event.target.value)"
                  >
                    <option v-for="item in assetTypeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                </label>
                <label class="select-field">
                  <span>基金状态</span>
                  <select
                    :value="getCurrentFundConfig(position.id)?.status || ALLOCATION_FUND_STATUSES.KEEP"
                    @change="updateFundConfig(position.id, 'status', $event.target.value)"
                  >
                    <option v-for="status in fundStatusOptions" :key="status" :value="status">{{ status }}</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="section" v-if="summary">
        <div class="section-header">
          <div>
            <div class="section-title">📊 配置统计</div>
            <div class="section-subtitle">按目标比例 ± 最大偏差判断达标 / 低配 / 超配</div>
          </div>
        </div>
        <div class="bucket-summary-list">
          <div v-for="bucket in summary.bucketSummaries" :key="bucket.assetType" class="bucket-summary-card" :class="bucket.status">
            <div class="bucket-summary-top">
              <div>
                <div class="bucket-summary-title">{{ bucket.label }}</div>
                <div class="bucket-summary-status">{{ getBucketStatusLabel(bucket.status) }}</div>
              </div>
              <div class="bucket-summary-amount">¥{{ formatAmount(bucket.marketValue) }}</div>
            </div>
            <div class="bucket-summary-grid">
              <div><span class="small-label">目标</span><div class="small-value">{{ formatPercent(bucket.targetPct) }}</div></div>
              <div><span class="small-label">偏差</span><div class="small-value">±{{ formatPercent(bucket.maxDeviationPct) }}</div></div>
              <div><span class="small-label">当前</span><div class="small-value">{{ formatPercent(bucket.currentPct) }}</div></div>
              <div><span class="small-label">偏离值</span><div class="small-value" :class="profitClass(bucket.deviationPct)">{{ formatSignedPercent(bucket.deviationPct) }}</div></div>
            </div>
          </div>
        </div>
      </div>

      <div class="section" v-if="summary">
        <div class="section-header">
          <div>
            <div class="section-title">🧾 配置内基金</div>
            <div class="section-subtitle">查看整仓占比、类别占比与状态</div>
          </div>
        </div>
        <div v-if="summary.fundRows.length" class="fund-row-list">
          <div v-for="fund in summary.fundRows" :key="fund.positionId" class="fund-row-card">
            <div class="fund-row-top">
              <div>
                <div class="fund-row-name">{{ fund.position.fund_name }}</div>
                <div class="fund-row-meta">{{ fund.position.account_name }} · {{ fund.position.fund_code }}</div>
              </div>
              <div class="fund-status-tag" :class="statusClass(fund.status)">{{ fund.status }}</div>
            </div>
            <div class="fund-row-grid">
              <div><span class="small-label">当前市值</span><div class="small-value">¥{{ formatAmount(fund.marketValue) }}</div></div>
              <div><span class="small-label">占整个方案</span><div class="small-value">{{ formatPercent(fund.portfolioPct) }}</div></div>
              <div><span class="small-label">所属类别</span><div class="small-value">{{ fund.assetTypeLabel }}</div></div>
              <div><span class="small-label">占所属类别</span><div class="small-value">{{ formatPercent(fund.assetBucketPct) }}</div></div>
            </div>
          </div>
        </div>
        <van-empty v-else description="当前方案还没有纳入基金" />
      </div>

      <div class="section" v-if="suggestions">
        <div class="section-header">
          <div>
            <div class="section-title">💡 方案内建议</div>
            <div class="section-subtitle">新增资金建议 + 调仓提示都会参考基金状态</div>
          </div>
        </div>
        <div class="cash-input-card">
          <div class="cash-input-label">本次新增资金（元）</div>
          <van-field v-model.number="newCashAmount" type="number" placeholder="例如 3000" input-align="right" />
        </div>

        <div class="suggestion-block">
          <div class="subsection-title">新增资金配置建议</div>
          <div v-if="suggestions.recommendedCategories.length" class="suggestion-list">
            <div v-for="item in suggestions.recommendedCategories" :key="item.assetType" class="suggestion-card recommend">
              <div class="suggestion-top">
                <div>
                  <div class="suggestion-title">{{ item.label }}</div>
                  <div class="suggestion-reason">{{ item.reason }}</div>
                </div>
                <div class="suggestion-amount">¥{{ formatAmount(item.recommendedAmount) }}</div>
              </div>
              <div class="suggestion-meta">当前 {{ formatPercent(item.currentPct) }} · 目标 {{ formatPercent(item.targetPct) }} · 缺口 {{ formatPercent(item.gapPct) }}</div>
              <div v-if="item.recommendedFunds.length" class="suggestion-funds">
                <div v-for="fund in item.recommendedFunds" :key="fund.positionId" class="suggestion-fund-line">
                  <span>{{ fund.fundName }}</span>
                  <span>{{ fund.status }}</span>
                </div>
              </div>
            </div>
          </div>
          <van-empty v-else description="当前没有需要补仓的类别" />
        </div>

        <div class="suggestion-block">
          <div class="subsection-title">调仓提示</div>
          <div v-if="suggestions.rebalanceCategories.length" class="suggestion-list">
            <div v-for="item in suggestions.rebalanceCategories" :key="item.assetType" class="suggestion-card rebalance">
              <div class="suggestion-top">
                <div>
                  <div class="suggestion-title">{{ item.label }}</div>
                  <div class="suggestion-reason">当前比例 {{ formatPercent(item.currentPct) }}，已超出目标上限</div>
                </div>
                <div class="suggestion-amount">{{ formatSignedPercent(item.deviationPct) }}</div>
              </div>
              <div v-if="item.candidateFunds.length" class="suggestion-funds">
                <div v-for="fund in item.candidateFunds" :key="fund.positionId" class="suggestion-fund-line multi-line">
                  <div>
                    <div>{{ fund.fundName }}</div>
                    <div class="hint-line">{{ fund.reason }}</div>
                  </div>
                  <span>{{ fund.status }}</span>
                </div>
              </div>
            </div>
          </div>
          <van-empty v-else description="当前没有需要调仓的超配类别" />
        </div>
      </div>
    </template>

    <van-popup v-model:show="showProfilePopup" position="bottom" round class="profile-popup" safe-area-inset-bottom>
      <div class="popup-content">
        <div class="popup-title">{{ profileDraft.id ? '编辑配置方案' : '新建配置方案' }}</div>
        <van-field v-model="profileDraft.name" label="方案名称" placeholder="请输入方案名称，例如：稳健组合" />
        <van-field v-model="profileDraft.note" label="备注" placeholder="请输入备注信息（选填）" />
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
          <van-button round @click="showProfilePopup = false">取消</van-button>
          <van-button round type="primary" :disabled="!canSaveProfileDraft" @click="saveProfileDraft">保存方案</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted, ref } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import { positionApi } from '../api'
import {
  ALLOCATION_ASSET_TYPES,
  ALLOCATION_ASSET_TYPE_LABELS,
  ALLOCATION_ASSET_TYPE_ORDER,
  ALLOCATION_FUND_STATUSES,
  buildAllocationOccupancyMap,
  buildAllocationProfileSummary,
  buildAllocationSuggestions,
  createDefaultAllocationBuckets,
  getPositionMarketValue,
  getPositionOccupancy,
  guessAllocationAssetType,
  normalizeAllocationProfile,
} from '../utils/allocation'
import {
  loadAllocationProfiles,
  loadSelectedAllocationProfileId,
  saveAllocationProfiles,
  saveSelectedAllocationProfileId,
} from '../utils/allocationStorage'
import { shouldRefreshPageData } from '../utils/perfHelpers'

const profiles = ref(loadAllocationProfiles())
const selectedProfileId = ref(loadSelectedAllocationProfileId() || profiles.value[0]?.id || '')
const positions = ref([])
const loading = ref(false)
const lastLoadedAt = ref(0)
const hasLoadedOnce = ref(false)
const showProfilePopup = ref(false)
const newCashAmount = ref(null)
const profileDraft = ref(createProfileDraft())

const assetTypeOptions = ALLOCATION_ASSET_TYPE_ORDER.map(value => ({ value, label: ALLOCATION_ASSET_TYPE_LABELS[value] }))
const fundStatusOptions = Object.values(ALLOCATION_FUND_STATUSES)

const currentProfile = computed(() => profiles.value.find(item => item.id === selectedProfileId.value) || null)
const occupancyMap = computed(() => buildAllocationOccupancyMap(profiles.value, positions.value))
const summary = computed(() => {
  if (!currentProfile.value) return null
  return buildAllocationProfileSummary({ profile: currentProfile.value, positions: positions.value, allProfiles: profiles.value })
})
const suggestions = computed(() => {
  if (!currentProfile.value) return null
  return buildAllocationSuggestions({
    profile: currentProfile.value,
    positions: positions.value,
    newCashAmount: Number(newCashAmount.value) || 0,
  })
})
const profileDraftTotal = computed(() => round2(profileDraft.value.buckets.reduce((sum, item) => sum + (Number(item.targetPct) || 0), 0)))
const canSaveProfileDraft = computed(() => {
  if (!profileDraft.value.name?.trim()) return false
  return profileDraftTotal.value === 100
})
const positionGroups = computed(() => {
  const groups = new Map()
  for (const position of positions.value) {
    const accountId = position.account_id || 'unknown'
    if (!groups.has(accountId)) {
      groups.set(accountId, {
        accountId,
        accountName: position.account_name || '未命名账户',
        positions: [],
      })
    }
    groups.get(accountId).positions.push(position)
  }
  return [...groups.values()].map(group => ({
    ...group,
    positions: [...group.positions].sort((a, b) => getPositionMarketValue(b) - getPositionMarketValue(a)),
  }))
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

function createProfileId() {
  return `allocation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createProfileDraft(profile = null) {
  if (!profile) {
    return {
      id: '',
      name: '',
      note: '',
      buckets: createDefaultAllocationBuckets().map(bucket => ({
        ...bucket,
        targetPct: null,
        maxDeviationPct: null,
      })),
    }
  }
  return JSON.parse(JSON.stringify({
    id: profile.id,
    name: profile.name,
    note: profile.note || '',
    buckets: profile.buckets,
  }))
}

function persistProfiles(nextProfiles, nextSelectedId) {
  profiles.value = nextProfiles
  selectedProfileId.value = nextSelectedId || nextProfiles[0]?.id || ''
  saveAllocationProfiles(nextProfiles)
  saveSelectedAllocationProfileId(selectedProfileId.value)
}

function updateCurrentProfile(mutator) {
  if (!currentProfile.value) return
  const nextProfiles = profiles.value.map(profile => {
    if (profile.id !== currentProfile.value.id) return profile
    const draft = JSON.parse(JSON.stringify(profile))
    mutator(draft)
    draft.updatedAt = new Date().toISOString()
    return normalizeAllocationProfile(draft)
  })
  persistProfiles(nextProfiles, currentProfile.value.id)
}

async function fetchPositions() {
  loading.value = true
  try {
    const data = await positionApi.list()
    positions.value = Array.isArray(data) ? data : []
    lastLoadedAt.value = Date.now()
    hasLoadedOnce.value = true
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
}

function openCreateProfilePopup() {
  profileDraft.value = createProfileDraft()
  showProfilePopup.value = true
}

function openEditProfilePopup() {
  if (!currentProfile.value) return
  profileDraft.value = createProfileDraft(currentProfile.value)
  showProfilePopup.value = true
}

function saveProfileDraft() {
  if (!canSaveProfileDraft.value) {
    showToast('请先把方案名称填写完整，并确保目标比例合计等于100%')
    return
  }

  const normalized = normalizeAllocationProfile({
    id: profileDraft.value.id || createProfileId(),
    name: profileDraft.value.name.trim(),
    note: profileDraft.value.note?.trim() || '',
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

  persistProfiles(nextProfiles, normalized.id)
  showProfilePopup.value = false
  showToast(exists ? '配置方案已更新' : '配置方案已创建')
}

async function handleDeleteCurrentProfile() {
  if (!currentProfile.value) return
  try {
    await showConfirmDialog({ title: '删除方案', message: `确定删除“${currentProfile.value.name}”吗？` })
    const nextProfiles = profiles.value.filter(item => item.id !== currentProfile.value.id)
    persistProfiles(nextProfiles, nextProfiles[0]?.id || '')
    showToast('已删除当前方案')
  } catch {
    // cancel
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

function togglePositionInCurrentProfile(position) {
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
      assetType: guessAllocationAssetType(position),
      status: ALLOCATION_FUND_STATUSES.KEEP,
    })
  })
}

function updateFundConfig(positionId, field, value) {
  updateCurrentProfile(profile => {
    const fund = profile.funds.find(item => item.positionId === positionId)
    if (!fund) return
    fund[field] = value
  })
}

onMounted(() => {
  ensureFreshData({ force: true })
})

onActivated(() => {
  ensureFreshData()
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
.cash-input-card,
.position-card,
.bucket-summary-card,
.fund-row-card,
.suggestion-card {
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.hero-card {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 18px;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: #fff;
}

.hero-label {
  font-size: 13px;
  opacity: 0.9;
}

.hero-title {
  font-size: 22px;
  font-weight: 700;
  margin-top: 6px;
}

.hero-subtitle {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.92;
}

.hero-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
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

.bucket-row {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr 0.8fr;
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
  gap: 12px;
}

.bucket-summary-card,
.fund-row-card,
.suggestion-card,
.cash-input-card {
  padding: 14px;
}

.bucket-summary-card.low { border-left: 4px solid #f59e0b; }
.bucket-summary-card.high { border-left: 4px solid #ef4444; }
.bucket-summary-card.ok { border-left: 4px solid #10b981; }

.bucket-summary-grid,
.fund-row-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
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

.cash-input-label {
  font-size: 13px;
  color: #475569;
  margin-bottom: 6px;
}

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
  .hero-card,
  .position-top,
  .fund-row-top,
  .suggestion-top {
    flex-direction: column;
  }

  .hero-actions {
    align-items: stretch;
  }
}
</style>
