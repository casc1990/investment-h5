<template>
  <div class="allocation-strategies-page">
    <div class="hero-card">
      <div>
        <div class="hero-label">🎯 策略配置</div>
        <div class="hero-title">先选策略，再看详情</div>
        <div class="hero-subtitle">默认展示全部策略，点击后进入策略详情页</div>
      </div>
      <van-button size="small" round type="primary" @click="openCreateProfilePopup">新建策略</van-button>
    </div>

    <div v-if="!profiles.length" class="section empty-section">
      <van-empty description="还没有配置策略">
        <van-button round type="primary" @click="openCreateProfilePopup">创建第一个策略</van-button>
      </van-empty>
    </div>

    <div v-else class="strategy-list">
      <button
        v-for="profile in profiles"
        :key="profile.id"
        type="button"
        class="strategy-card"
        @click="goToProfile(profile.id)"
      >
        <div class="strategy-top">
          <div>
            <div class="strategy-name">{{ profile.name }}</div>
            <div class="strategy-note">{{ profile.note || '未填写备注' }}</div>
          </div>
          <div class="strategy-arrow">›</div>
        </div>
        <div class="strategy-meta">
          <span>总资产 ¥{{ formatAmount(profile.totalAsset || 0) }}</span>
          <span>已纳入 {{ profile.funds?.length || 0 }} 只基金</span>
          <span>{{ formatDate(profile.updatedAt || profile.createdAt) }}</span>
        </div>
      </button>
    </div>

    <van-popup v-model:show="showProfilePopup" position="bottom" round class="profile-popup" safe-area-inset-bottom>
      <div class="popup-content">
        <div class="popup-title">新建配置策略</div>
        <van-field v-model="profileDraft.name" label="策略名称" placeholder="请输入策略名称，例如：稳健策略" />
        <van-field v-model="profileDraft.note" label="备注" placeholder="请输入备注信息（选填）" />
        <van-field v-model.number="profileDraft.totalAsset" label="组合总资产" type="number" placeholder="请输入组合总资产，例如：80000" />
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
          <van-button round type="primary" :disabled="!canSaveProfileDraft" @click="saveProfileDraft">创建并进入</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { computed, onActivated, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import {
  ALLOCATION_ASSET_TYPE_LABELS,
  createDefaultAllocationBuckets,
  normalizeAllocationProfile,
} from '../utils/allocation'
import {
  ALLOCATION_PROFILES_UPDATED_EVENT,
  loadAllocationProfiles,
  saveAllocationProfiles,
  saveSelectedAllocationProfileId,
} from '../utils/allocationStorage'

const router = useRouter()
const profiles = ref(loadAllocationProfiles())
const showProfilePopup = ref(false)
const profileDraft = ref(createProfileDraft())

const profileDraftTotal = computed(() => round2(profileDraft.value.buckets.reduce((sum, item) => sum + (Number(item.targetPct) || 0), 0)))
const canSaveProfileDraft = computed(() => (
  Boolean(profileDraft.value.name?.trim())
  && (Number(profileDraft.value.totalAsset) || 0) > 0
  && profileDraftTotal.value === 100
))

function round2(value) {
  return Number((Number(value) || 0).toFixed(2))
}

function formatPercent(value) {
  return `${round2(value)}%`
}

function formatAmount(value) {
  const num = Number(value) || 0
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(value) {
  if (!value) return '刚创建'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '最近更新'
  return `${date.getMonth() + 1}月${String(date.getDate()).padStart(2, '0')}日更新`
}

function createProfileDraft() {
  return {
    name: '',
    note: '',
    totalAsset: null,
    buckets: createDefaultAllocationBuckets().map(bucket => ({
      ...bucket,
      targetPct: null,
      maxDeviationPct: null,
    })),
  }
}

function createProfileId() {
  return `allocation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getAssetTypeLabel(assetType) {
  return ALLOCATION_ASSET_TYPE_LABELS[assetType] || '其他基金'
}

function openCreateProfilePopup() {
  profileDraft.value = createProfileDraft()
  showProfilePopup.value = true
}

function syncProfilesFromStorage() {
  profiles.value = loadAllocationProfiles()
}

function handleProfilesUpdated() {
  syncProfilesFromStorage()
}

function goToProfile(profileId) {
  saveSelectedAllocationProfileId(profileId)
  router.push(`/allocation/${profileId}`)
}

function saveProfileDraft() {
  if (!canSaveProfileDraft.value) {
    showToast('请先填写策略名称、组合总资产，并确保目标比例合计等于100%')
    return
  }

  const profile = normalizeAllocationProfile({
    id: createProfileId(),
    name: profileDraft.value.name.trim(),
    note: profileDraft.value.note?.trim() || '',
    totalAsset: Number(profileDraft.value.totalAsset) || 0,
    buckets: profileDraft.value.buckets.map(item => ({
      assetType: item.assetType,
      targetPct: Number(item.targetPct) || 0,
      maxDeviationPct: Number(item.maxDeviationPct) || 0,
    })),
    funds: [],
    defaultFundByType: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const nextProfiles = [...profiles.value, profile]
  profiles.value = nextProfiles
  saveAllocationProfiles(nextProfiles)
  saveSelectedAllocationProfileId(profile.id)
  showProfilePopup.value = false
  showToast('策略已创建')
  router.push(`/allocation/${profile.id}`)
}

onMounted(() => {
  syncProfilesFromStorage()
  if (typeof window !== 'undefined') {
    window.addEventListener(ALLOCATION_PROFILES_UPDATED_EVENT, handleProfilesUpdated)
  }
})

onActivated(() => {
  syncProfilesFromStorage()
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener(ALLOCATION_PROFILES_UPDATED_EVENT, handleProfilesUpdated)
  }
})
</script>

<style scoped>
.allocation-strategies-page {
  min-height: 100vh;
  background: #f5f7fb;
  padding: 16px 16px calc(var(--app-tabbar-space) + 20px);
}

.hero-card,
.strategy-card,
.empty-section {
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
}

.hero-card,
.empty-section {
  padding: 18px 16px;
  margin-bottom: 16px;
}

.hero-card {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
}

.hero-label {
  color: #4f46e5;
  font-size: 13px;
  font-weight: 700;
}

.hero-title {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 700;
  color: #111827;
}

.hero-subtitle,
.strategy-note,
.strategy-meta,
.draft-summary {
  margin-top: 8px;
  color: #6b7280;
  font-size: 12px;
}

.strategy-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.strategy-card {
  border: none;
  display: block;
  width: 100%;
  padding: 16px;
  text-align: left;
}

.strategy-top,
.strategy-meta,
.popup-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.strategy-name {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.strategy-arrow {
  font-size: 28px;
  color: #94a3b8;
  line-height: 1;
}

.strategy-meta {
  margin-top: 14px;
}

.profile-popup {
  overflow: hidden;
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

.draft-summary.invalid {
  color: #b91c1c;
}

.draft-bucket-row {
  padding: 14px 0;
  border-bottom: 1px solid #eef2f7;
}

.draft-bucket-label {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.draft-bucket-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}

.draft-bucket-inputs input {
  width: 100%;
  border: 1px solid #dbe3ef;
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
  background: #fff;
}

.popup-actions {
  margin-top: 18px;
}

.popup-actions :deep(.van-button) {
  flex: 1;
}
</style>
