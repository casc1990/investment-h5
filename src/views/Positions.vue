<template>
  <div class="positions-page">
    <!-- 筛选栏 -->
    <div class="filter-bar">
      <div class="filter-dropdowns">
        <van-dropdown-menu>
          <van-dropdown-item v-model="selectedMemberId" :title="selectedMemberTitle" :options="memberOptions" @change="onMemberChange" />
          <van-dropdown-item v-model="selectedAccountId" :title="selectedAccountTitle" :options="filteredAccountOptions" @change="onAccountChange" />
          <van-dropdown-item v-model="viewOption" title="筛选排序" :options="viewOptions" />
        </van-dropdown-menu>
      </div>
      <van-button class="sync-all-btn" size="small" type="primary" :loading="syncingAll" :disabled="syncingAll" @click="handleSyncAll">
        {{ syncingAll ? syncProgressText : '同步净值' }}
      </van-button>
    </div>

    <!-- 顶部统计卡片 -->
    <div class="summary-card" v-if="summary">
      <div class="summary-header">
        <div class="summary-asset">
          <div class="summary-label">总资产(元)</div>
          <div class="summary-amount">{{ formatAmount(summary.totalMarketValue) }}</div>
        </div>
      </div>
      <div class="summary-profit-row">
        <div class="summary-profit-item">
          <div class="sp-label">日收益</div>
          <div class="sp-value" :class="{ positive: summary.totalYesterdayProfit >= 0, negative: summary.totalYesterdayProfit < 0 }">
            {{ summary.totalYesterdayProfit >= 0 ? '+' : '' }}{{ formatAmount(summary.totalYesterdayProfit) }}
          </div>
        </div>
        <div class="sp-divider"></div>
        <div class="summary-profit-item">
          <div class="sp-label">持有收益</div>
          <div class="sp-value" :class="{ positive: summary.totalHoldingProfit >= 0, negative: summary.totalHoldingProfit < 0 }">
            {{ summary.totalHoldingProfit >= 0 ? '+' : '' }}{{ formatAmount(summary.totalHoldingProfit) }}
          </div>
        </div>
        <div class="sp-divider"></div>
        <div class="summary-profit-item">
          <div class="sp-label">持仓收益率</div>
          <div class="sp-value" :class="{ positive: summary.totalProfitRate >= 0, negative: summary.totalProfitRate < 0 }">
            {{ summary.totalProfitRate >= 0 ? '+' : '' }}{{ summary.totalProfitRate }}%
          </div>
        </div>
        <div class="sp-divider"></div>
        <div class="summary-profit-item">
          <div class="sp-label">买入成本</div>
          <div class="sp-value">{{ formatAmount(summary.totalCost) }}</div>
        </div>
      </div>
    </div>

    <!-- 持仓列表 -->
    <div class="position-list">
      <!-- 表头 -->
      <div class="list-header">
        <span class="header-col header-name">名称</span>
        <span class="header-col header-center">总资产/日收益</span>
        <span class="header-col header-right">持有收益/率</span>
      </div>

      <!-- 持仓卡片 -->
      <div
        v-for="position in positions"
        :key="position.id"
        class="position-card"
        :class="{ expanded: expandedIds.includes(position.id) }"
      >
        <!-- 默认折叠显示：一行三段 -->
        <div class="fund-collapsed">
          <div class="fund-collapsed-main" @click="handleOpenDetail(position)">
            <div class="collapsed-main">
              <span class="collapsed-name">{{ position.fund_name || '未知基金' }}</span>
              <span class="collapsed-tags">
                <span v-if="position.member_name" class="member-tag">{{ position.member_emoji }} {{ position.member_name }}</span>
                <span class="account-tag">{{ position.account_name }}</span>
                <span
                  v-if="getPositionAllocationStatus(position)"
                  class="allocation-status-tag"
                  :class="`is-${getAllocationStatusTone(getPositionAllocationStatus(position))}`"
                  :title="getAllocationStatusTitle(getPositionAllocationStatus(position))"
                  @click.stop="openPositionAllocation(getPositionAllocationStatus(position))"
                >
                  {{ getPositionAllocationStatus(position).label }}
                </span>
                <span v-if="position.is_trading_day && position.show_nav_update_notice" class="nav-status-tag" :class="`is-${getPositionNavStatus(position).tone}`">
                  {{ getPositionNavStatus(position).label }}
                </span>
              </span>
            </div>
            <div class="collapsed-data">
              <div class="collapsed-center">
                <span class="collapsed-value">¥{{ formatAmount(getPositionMarketValue(position)) }}</span>
                <span class="collapsed-yesterday" :class="{ positive: Number(position.daily_profit ?? position.yesterday_profit) >= 0, negative: Number(position.daily_profit ?? position.yesterday_profit) < 0 }">
                  {{ Number(position.daily_profit ?? position.yesterday_profit) >= 0 ? '+' : '' }}{{ formatAmount(position.daily_profit ?? position.yesterday_profit) }}
                </span>
              </div>
              <div class="collapsed-right">
                <span v-if="position.is_trading_day && position.daily_profit_updated && position.show_nav_update_notice" class="profit-update-badge">
                  {{ position.daily_profit_update_text || '今日收益更新' }}
                </span>
                <span class="collapsed-profit" :class="{ positive: Number(position.current_profit) >= 0, negative: Number(position.current_profit) < 0 }">
                  {{ Number(position.current_profit) >= 0 ? '+' : '' }}{{ formatAmount(position.current_profit) }}
                </span>
                <span class="collapsed-rate" :class="{ positive: Number(position.profit_rate) >= 0, negative: Number(position.profit_rate) < 0 }">
                  {{ Number(position.profit_rate).toFixed(2) }}%
                </span>
              </div>
            </div>
          </div>
          <button class="collapsed-arrow" type="button" @click.stop="toggleExpand(position.id)">
            <van-icon :name="expandedIds.includes(position.id) ? 'arrow-up' : 'arrow-down'" />
          </button>
        </div>

        <!-- 展开内容 -->
        <div v-if="expandedIds.includes(position.id)" class="fund-expanded">
          <!-- 核心数据网格 -->
          <div class="fund-data-grid">
            <div class="data-item">
              <span class="data-label">持有份额</span>
              <span class="data-value">{{ formatNumber(position.shares) }} 份</span>
            </div>
            <div class="data-item">
              <span class="data-label">买入成本</span>
              <span class="data-value">¥{{ formatNumber(position.cost) }}</span>
            </div>
            <div class="data-item">
              <span class="data-label">持有收益</span>
              <span class="data-value profit" :class="{ positive: Number(position.current_profit) >= 0, negative: Number(position.current_profit) < 0 }">
                {{ Number(position.current_profit) >= 0 ? '+' : '' }}{{ formatNumber(position.current_profit) }}
              </span>
            </div>
            <div class="data-item">
              <span class="data-label">持有收益率</span>
              <span class="data-value profit" :class="{ positive: Number(position.profit_rate) >= 0, negative: Number(position.profit_rate) < 0 }">
                {{ Number(position.profit_rate).toFixed(2) }}%
              </span>
            </div>
            <div class="data-item">
              <span class="data-label">
                {{ position.daily_profit_label || '昨日收益' }}
                <span v-if="position.is_trading_day && position.daily_profit_updated && position.show_nav_update_notice" class="profit-update-badge inline">
                  {{ position.daily_profit_update_text || '今日收益更新' }}
                </span>
              </span>
              <span class="data-value profit" :class="{ positive: Number(position.daily_profit ?? position.yesterday_profit) >= 0, negative: Number(position.daily_profit ?? position.yesterday_profit) < 0 }">
                {{ Number(position.daily_profit ?? position.yesterday_profit) >= 0 ? '+' : '' }}{{ formatNumber(position.daily_profit ?? position.yesterday_profit) }}
              </span>
            </div>
            <div class="data-item">
              <span class="data-label">{{ position.daily_profit_rate_label || '昨日收益率' }}</span>
              <span class="data-value profit" :class="{ positive: Number(position.daily_profit_rate ?? position.yesterday_profit_rate) >= 0, negative: Number(position.daily_profit_rate ?? position.yesterday_profit_rate) < 0 }">
                {{ Number(position.daily_profit_rate ?? position.yesterday_profit_rate).toFixed(2) }}%
              </span>
            </div>
          </div>

          <!-- 基金行情 -->
          <div class="nav-info" v-if="position.nav_gsz || position.nav_dwjz">
            <div class="nav-item">
              <span class="nav-label">最新净值</span>
              <span class="nav-value">{{ Number(position.nav_gsz || position.nav_dwjz || 0).toFixed(4) }}</span>
            </div>
            <div class="nav-item">
              <span class="nav-label">日涨幅</span>
              <span v-if="position.nav_gszzl !== null && position.nav_gszzl !== undefined" class="nav-value profit" :class="{ positive: Number(position.nav_gszzl) >= 0, negative: Number(position.nav_gszzl) < 0 }">
                {{ Number(position.nav_gszzl) >= 0 ? '+' : '' }}{{ Number(position.nav_gszzl).toFixed(2) }}%
              </span>
              <span v-else class="nav-value">--</span>
            </div>
            <div class="nav-item" v-if="position.nav_jzrq">
              <span class="nav-label">净值日期</span>
              <span class="nav-value">{{ position.nav_jzrq }}</span>
            </div>
          </div>

          <!-- 基金代码 & 分红方式 -->
          <div class="fund-extra">
            <span class="fund-code-full">代码：{{ position.fund_code }}</span>
            <span v-if="position.dividend_method" class="dividend-info">
              <span class="dividend-label">分红方式：</span>
              <span class="dividend-value">{{ position.dividend_method }}</span>
            </span>
          </div>

          <!-- 操作按钮 -->
          <div class="position-actions">
            <van-button size="small" plain type="primary" @click.stop="handleOpenDetail(position)">详情</van-button>
            <van-button
              size="small"
              type="warning"
              class="sync-fund-btn"
              :class="{ syncing: syncingId === position.id }"
              :disabled="syncingId === position.id"
              @click.stop="handleSync(position)"
            >
              <span class="sync-btn-content">
                <van-icon name="replay" class="sync-btn-icon" :class="{ spinning: syncingId === position.id }" />
                <span>{{ syncingId === position.id ? '同步中...' : '同步净值' }}</span>
              </span>
            </van-button>
            <van-button size="small" type="primary" @click.stop="handleEdit(position)">编辑</van-button>
            <van-button size="small" type="danger" @click.stop="handleDelete(position)">删除</van-button>
          </div>
        </div>
      </div>

      <van-empty
        v-if="!positions.length && !loading"
        :description="positionsRaw.length ? '没有符合筛选条件的持仓' : '暂无持仓，点击下方添加'"
      />
    </div>

    <!-- 加载状态 -->
    <van-loading v-if="loading" type="spinner" class="loading" />

    <!-- 添加按钮 -->
    <div class="add-btn-wrapper">
      <van-button round type="primary" class="add-btn" @click="openAddModal">
        <span class="add-btn-content">
          <van-icon name="plus" size="16" />
          <span>新增持仓</span>
        </span>
      </van-button>
    </div>

    <!-- 添加/编辑持仓弹窗 -->
    <van-popup
      v-model:show="showAddModal"
      position="bottom"
      round
      class="position-form-popup"
      :overlay-style="{ zIndex: 10998 }"
      :z-index="10999"
      safe-area-inset-bottom
    >
      <div class="modal-content">
        <div class="modal-title">{{ editingPosition ? '✏️ 编辑持仓' : '📦 添加持仓' }}</div>
        
        <van-form @submit="handleSubmit">
          <van-cell-group inset>
            <van-field
              v-model="formData.memberName"
              is-link
              readonly
              label="成员"
              placeholder="选择成员"
              @click="showMemberPicker = true"
              :rules="[{ required: true, message: '请选择成员' }]"
            />
            <van-field
              v-model="formData.accountName"
              is-link
              readonly
              label="账户"
              placeholder="选择账户"
              @click="showAccountPicker = true"
              :rules="[{ required: true, message: '请选择账户' }]"
            />
            <van-field
              v-model="formData.fundCode"
              label="基金代码"
              placeholder="如：008163"
              :rules="[{ required: true, message: '请输入基金代码' }]"
            />
            <van-field
              v-model="formData.fundName"
              label="基金名称"
              placeholder="基金名称"
              :rules="[{ required: true, message: '请输入基金名称' }]"
            />
            <van-field
              v-model.number="formData.shares"
              label="持有份额"
              type="number"
              placeholder="持有的份额数"
              :rules="[{ required: true, message: '请输入持有份额' }]"
            />
            <van-field
              v-model.number="formData.totalAmount"
              label="总金额"
              type="number"
              placeholder="基金平台显示的总金额（成本+收益）"
              :rules="[{ required: true, message: '请输入总金额' }]"
            />
            <van-field
              v-model.number="formData.initialProfit"
              label="历史累计收益"
              type="number"
              placeholder="昨日收盘时的累计收益"
            />
            <van-field
              v-model="formData.dividendMethod"
              label="分红方式"
              placeholder="选择分红方式"
              is-link
              readonly
              @click="showDividendPicker = true"
              :rules="[{ required: true, message: '请选择分红方式' }]"
            />
          </van-cell-group>

          <div class="modal-actions">
            <van-button round @click="closeModal">取消</van-button>
            <van-button round type="primary" native-type="submit">{{ editingPosition ? '更新' : '添加' }}</van-button>
          </div>
        </van-form>
      </div>
    </van-popup>

    <!-- 成员选择器 -->
    <van-popup v-model:show="showMemberPicker" position="bottom" :overlay-style="{ zIndex: 10998 }" :z-index="10999" safe-area-inset-bottom>
      <van-picker
        :columns="memberPickerOptions"
        @confirm="onMemberConfirm"
        @cancel="showMemberPicker = false"
      />
    </van-popup>

    <!-- 账户选择器 -->
    <van-popup v-model:show="showAccountPicker" position="bottom" :overlay-style="{ zIndex: 10998 }" :z-index="10999" safe-area-inset-bottom>
      <van-picker
        :columns="accountPickerOptions"
        @confirm="onAccountConfirm"
        @cancel="showAccountPicker = false"
      />
    </van-popup>

    <!-- 分红方式选择器 -->
    <van-popup v-model:show="showDividendPicker" position="bottom" :overlay-style="{ zIndex: 10998 }" :z-index="10999" safe-area-inset-bottom>
      <van-picker
        :columns="dividendOptions"
        @confirm="onDividendConfirm"
        @cancel="showDividendPicker = false"
      />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, onActivated, onMounted, watch, onBeforeUnmount, onDeactivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { positionApi, accountApi, memberApi, marketApi, fundApi } from '../api'
import { setAppTabbarVisible } from '../utils/appShell'
import { shouldRefreshPageData } from '../utils/perfHelpers'
import { filterAndSortPositions, getPositionMarketValue, getPositionNavStatus } from '../utils/positionList'
import { ALLOCATION_FUND_STATUSES, buildPositionAllocationStatusMap } from '../utils/allocation'
import {
  ALLOCATION_PROFILES_UPDATED_EVENT,
  fetchAllocationProfiles,
  loadAllocationProfiles,
} from '../utils/allocationStorage'
import { readPageCache, writePageCache } from '../utils/pageCache'

const router = useRouter()
const route = useRoute()
const cachedPositions = readPageCache('positions')

const syncingId = ref(null)
const syncingAll = ref(false)
const loading = ref(false)
const positionsRaw = ref(cachedPositions?.positions || [])
const viewOption = ref('market_value_desc')
const syncProgressText = ref('同步中...')
const viewModeConfig = computed(() => ({
  abnormal: { status: 'abnormal', sort: 'market_value_desc' },
  loss: { status: 'loss', sort: 'market_value_desc' },
  profit: { status: 'profit', sort: 'market_value_desc' },
  market_value_desc: { status: 'all', sort: 'market_value_desc' },
  daily_profit_desc: { status: 'all', sort: 'daily_profit_desc' },
  holding_profit_desc: { status: 'all', sort: 'holding_profit_desc' },
  profit_rate_desc: { status: 'all', sort: 'profit_rate_desc' },
  name_asc: { status: 'all', sort: 'name_asc' },
}[viewOption.value] || { status: 'all', sort: 'market_value_desc' }))
const positions = computed(() => filterAndSortPositions(positionsRaw.value, {
  status: viewModeConfig.value.status,
  sort: viewModeConfig.value.sort,
}))
const expandedIds = ref([])
const lastLoadedAt = ref(cachedPositions?.savedAt || 0)
const hasLoadedOnce = ref(Boolean(cachedPositions?.positions?.length))
const metaLastLoadedAt = ref(cachedPositions?.savedAt || 0)
const metaLoadedOnce = ref(Boolean(cachedPositions?.accounts || cachedPositions?.members))
const accounts = ref(cachedPositions?.accounts || [])
const members = ref(cachedPositions?.members || [])
const allocationProfiles = ref(loadAllocationProfiles())
const allocationLastLoadedAt = ref(0)
const selectedMemberId = ref(null)
const selectedAccountId = ref(null)
const showAddModal = ref(false)
const showMemberPicker = ref(false)
const showAccountPicker = ref(false)
const showDividendPicker = ref(false)
const editingPosition = ref(null)
const viewOptions = [
  { text: '按市值排序', value: 'market_value_desc' },
  { text: '按日收益排序', value: 'daily_profit_desc' },
  { text: '按持有收益排序', value: 'holding_profit_desc' },
  { text: '按收益率排序', value: 'profit_rate_desc' },
  { text: '按基金名称排序', value: 'name_asc' },
  { text: '净值异常', value: 'abnormal' },
  { text: '仅看亏损', value: 'loss' },
  { text: '仅看盈利', value: 'profit' },
]

const dividendOptions = [
  { text: '红利再投', value: '红利再投' },
  { text: '现金分红', value: '现金分红' },
]

const allocationStatusMap = computed(() => buildPositionAllocationStatusMap(allocationProfiles.value))
const getPositionAllocationStatus = position => allocationStatusMap.value.get(position?.id) || null
const getAllocationStatusTone = meta => {
  if (meta?.conflict) return 'conflict'
  if (meta?.status === ALLOCATION_FUND_STATUSES.KEEP) return 'keep'
  if (meta?.status === ALLOCATION_FUND_STATUSES.WATCH) return 'watch'
  if (meta?.status === ALLOCATION_FUND_STATUSES.REDUCE) return 'reduce'
  return 'forbid'
}
const getAllocationStatusTitle = meta => {
  if (!meta) return ''
  if (meta.conflict) return `同时纳入：${meta.entries.map(item => item.profileName).join('、')}`
  return `${meta.profileName} · ${meta.status}`
}
const openPositionAllocation = meta => {
  if (!meta) return
  router.push(meta.conflict || !meta.profileId ? '/allocation' : `/allocation/${meta.profileId}`)
}

const formData = ref({
  memberName: '',
  memberId: '',
  accountName: '',
  accountId: '',
  fundCode: '',
  fundName: '',
  shares: null,
  totalAmount: null,
  initialProfit: null,
  dividendMethod: '红利再投',
})

const advisoryChannels = new Set(['雪球顾投'])
const visibleAccounts = computed(() => accounts.value.filter(a => !advisoryChannels.has(a.channel)))

// 成员选项（筛选栏）
const memberOptions = computed(() => [
  { text: '全部成员', value: null },
  ...members.value.map(m => ({ text: `${m.emoji || '👤'} ${m.name}`, value: m.id }))
])

// 筛选后的账户选项（受成员筛选影响）
const filteredAccountOptions = computed(() => {
  const filtered = selectedMemberId.value
    ? visibleAccounts.value.filter(a => a.member_id === selectedMemberId.value)
    : visibleAccounts.value
  return [
    { text: '全部账户', value: null },
    ...filtered.map(a => ({ text: a.account_name, value: a.id }))
  ]
})

const selectedMemberTitle = computed(() => {
  if (!selectedMemberId.value) return '全部成员'
  const m = members.value.find(m => m.id === selectedMemberId.value)
  return m ? `${m.emoji || '👤'} ${m.name}` : '全部成员'
})

const selectedAccountTitle = computed(() => {
  if (!selectedAccountId.value) return '全部账户'
  const a = accounts.value.find(a => a.id === selectedAccountId.value)
  return a ? a.account_name : '全部账户'
})

// 成员选择器选项
const memberPickerOptions = computed(() =>
  members.value.map(m => ({ text: `${m.emoji || '👤'} ${m.name}`, value: m.id }))
)

// 账户选择器选项（受成员筛选影响）
const accountPickerOptions = computed(() => {
  const filtered = formData.value.memberId
    ? visibleAccounts.value.filter(a => a.member_id === formData.value.memberId)
    : visibleAccounts.value
  return filtered.map(a => ({ text: a.account_name, value: a.id }))
})

const formatNumber = (num) => {
  return parseFloat(num || 0).toFixed(2)
}

// 金额格式化：保留2位小数，千分位分隔
const formatAmount = (num) => {
  const val = parseFloat(num || 0)
  if (isNaN(val)) return '0.00'
  const [int, dec] = val.toFixed(2).split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${formatted}.${dec}`
}

const onMemberChange = (memberId) => {
  selectedMemberId.value = memberId
  // 成员变化时，重置账户筛选
  selectedAccountId.value = null
  fetchPositions()
}

const onAccountChange = () => {
  fetchPositions()
}

const summary = computed(() => {
  if (!positions.value.length) {
    return null
  }
  let totalMarketValue = 0
  let totalYesterdayProfit = 0
  let totalHoldingProfit = 0
  let totalCost = 0

  positions.value.forEach(pos => {
    const cost = parseFloat(pos.cost) || 0
    const currentProfit = parseFloat(pos.current_profit) || 0
    const yesterdayProfit = parseFloat(pos.yesterday_profit) || 0
    totalCost += cost
    totalMarketValue += getPositionMarketValue(pos)
    totalYesterdayProfit += yesterdayProfit
    totalHoldingProfit += currentProfit
  })

  const totalProfitRate = totalCost > 0 ? (totalHoldingProfit / totalCost * 100) : 0

  return {
    totalMarketValue: Number(totalMarketValue.toFixed(2)),
    totalYesterdayProfit: Number(totalYesterdayProfit.toFixed(2)),
    totalHoldingProfit: Number(totalHoldingProfit.toFixed(2)),
    totalProfitRate: Number(totalProfitRate.toFixed(2)),
    totalCost: Number(totalCost.toFixed(2)),
  }
})

const fetchMembers = async () => {
  try {
    const data = await memberApi.list()
    members.value = data?.members || []
    writePageCache('positions', { positions: positionsRaw.value, accounts: accounts.value, members: members.value })
  } catch (error) {
    console.error('Failed to fetch members:', error)
  }
}

const fetchAccounts = async () => {
  try {
    const data = await accountApi.list()
    accounts.value = data?.accounts || []
    writePageCache('positions', { positions: positionsRaw.value, accounts: accounts.value, members: members.value })
  } catch (error) {
    console.error('Failed to fetch accounts:', error)
  }
}

const ensureFreshMetaData = async ({ force = false } = {}) => {
  if (!shouldRefreshPageData({ hasData: metaLoadedOnce.value, lastLoadedAt: metaLastLoadedAt.value, force, ttl: 5 * 60 * 1000 })) {
    return
  }

  try {
    await Promise.all([fetchMembers(), fetchAccounts()])
    metaLoadedOnce.value = true
    metaLastLoadedAt.value = Date.now()
  } catch (error) {
    console.error('Failed to refresh meta data:', error)
  }
}

const refreshAllocationProfiles = async ({ force = false } = {}) => {
  if (!shouldRefreshPageData({
    hasData: allocationProfiles.value.length > 0,
    lastLoadedAt: allocationLastLoadedAt.value,
    force,
    ttl: 5 * 60 * 1000,
  })) return

  try {
    allocationProfiles.value = await fetchAllocationProfiles()
    allocationLastLoadedAt.value = Date.now()
  } catch (error) {
    console.error('Failed to fetch allocation profiles:', error)
  }
}

const handleAllocationProfilesUpdated = () => {
  allocationProfiles.value = loadAllocationProfiles()
}

const fetchPositions = async () => {
  loading.value = true
  try {
    const data = await positionApi.list({ member_id: selectedMemberId.value, account_id: selectedAccountId.value })
    positionsRaw.value = (data?.positions || []).filter(position => position.account_channel !== '雪球顾投')
    if (!selectedMemberId.value && !selectedAccountId.value) {
      writePageCache('positions', { positions: positionsRaw.value, accounts: accounts.value, members: members.value })
    }
  } catch (error) {
    console.error('Failed to fetch positions:', error)
    showToast('加载失败')
  } finally {
    loading.value = false
  }
}

const buildPositionSignatureMap = (list) => new Map(
  (list || []).map(item => [
    item.id,
    JSON.stringify({
      yesterday_profit: item.yesterday_profit,
      current_profit: item.current_profit,
      nav_dwjz: item.nav_dwjz,
      nav_jzrq: item.nav_jzrq,
    }),
  ])
)

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const refreshPositionsUntilChanged = async (previousPositions, maxAttempts = 4) => {
  const previousMap = buildPositionSignatureMap(previousPositions)

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await wait(2000 * attempt)
    }

    const data = await positionApi.list({ member_id: selectedMemberId.value, account_id: selectedAccountId.value })
    const nextPositions = data?.positions || []
    const nextMap = buildPositionSignatureMap(nextPositions)
    const hasChanged = nextPositions.some(item => nextMap.get(item.id) !== previousMap.get(item.id))

    positionsRaw.value = nextPositions

    if (hasChanged || nextPositions.length !== previousPositions.length || attempt === maxAttempts - 1) {
      return hasChanged
    }
  }

  return false
}

const handleSubmit = async () => {
  if (!formData.value.accountId) {
    showToast('请选择账户')
    return
  }
  if (!formData.value.fundCode?.trim()) {
    showToast('请输入基金代码')
    return
  }
  if (!formData.value.fundName?.trim()) {
    showToast('请输入基金名称')
    return
  }
  if (formData.value.shares === null || formData.value.shares === '') {
    showToast('请输入持有份额')
    return
  }
  if (formData.value.totalAmount === null || formData.value.totalAmount === '') {
    showToast('请输入总金额')
    return
  }

  try {
    const payload = {
      accountId: formData.value.accountId,
      fundCode: formData.value.fundCode.trim(),
      fundName: formData.value.fundName.trim(),
      shares: parseFloat(formData.value.shares),
      // 持有金额 = 总金额 - 历史累计收益
      amount: parseFloat((formData.value.totalAmount - (parseFloat(formData.value.initialProfit) || 0)).toFixed(4)),
      initialProfit: parseFloat(formData.value.initialProfit) || 0,
      dividendMethod: formData.value.dividendMethod,
    }
    
    if (editingPosition.value) {
      await positionApi.update(editingPosition.value.id, payload)
    } else {
      await positionApi.create(payload)
    }
    await fetchPositions()
    closeModal()
    showToast(editingPosition.value ? '更新成功' : '添加成功')
  } catch (error) {
    console.error('提交失败:', error)
    showToast(editingPosition.value ? '更新失败' : '添加失败')
  }
}

const handleEdit = (position) => {
  editingPosition.value = position
  formData.value = {
    memberId: position.member_id || '',
    memberName: position.member_name || '',
    accountId: position.account_id,
    accountName: position.account_name || '',
    fundCode: position.fund_code,
    fundName: position.fund_name,
    shares: position.shares,
    totalAmount: (parseFloat(position.cost) || 0) + (parseFloat(position.initial_profit) || 0),
    initialProfit: position.initial_profit || 0,
    dividendMethod: position.dividend_method || '红利再投',
  }
  showAddModal.value = true
}

const handleSync = async (position) => {
  if (syncingId.value === position.id) return
  syncingId.value = position.id
  try {
    const previousPositions = positionsRaw.value.map(item => ({ ...item }))
    await marketApi.syncFund(position.fund_code)
    const changed = await refreshPositionsUntilChanged(previousPositions, 3)
    showToast(changed ? '同步成功，净值已刷新' : '同步已提交，数据可能稍后更新')
  } catch (error) {
    console.error('同步失败:', error)
    showToast('同步失败')
  } finally {
    syncingId.value = null
  }
}

const handleSyncAll = async () => {
  if (syncingAll.value) return
  syncingAll.value = true
  syncProgressText.value = '检查待更新...'
  try {
    const previousPositions = positionsRaw.value.map(item => ({ ...item }))
    let totalSynced = 0
    let totalPending = 0
    for (let batch = 0; batch < 12; batch += 1) {
      const result = await fundApi.syncPending({ mode: 'night', includeQdii: true, batchSize: 3 })
      if (batch === 0) totalPending = Number(result?.total_pending_before_sync || 0)
      totalSynced += Number(result?.synced || 0)
      syncProgressText.value = totalPending > 0 ? `${Math.min(totalSynced, totalPending)}/${totalPending}` : '已是最新'
      const advanced = Object.values(result?.results || {}).filter(item => item?.advanced).length
      if (Number(result?.still_pending_count || 0) === 0 || advanced === 0) break
    }
    const changed = await refreshPositionsUntilChanged(previousPositions, 4)
    showToast(changed ? `已同步 ${totalSynced} 只基金` : '已检查，暂无可更新净值')
  } catch (error) {
    console.error('同步所有失败:', error)
    showToast('同步所有失败')
  } finally {
    syncingAll.value = false
    syncProgressText.value = '同步中...'
  }
}

const toggleExpand = (id) => {
  const idx = expandedIds.value.indexOf(id)
  if (idx >= 0) {
    expandedIds.value.splice(idx, 1)
  } else {
    expandedIds.value.push(id)
  }
}

const handleOpenDetail = (position) => {
  if (!position?.id) return
  router.push(`/positions/${position.id}`)
}

const handleDelete = async (position) => {
  try {
    const tradeCount = Number(position.trade_count || 0)
    await showConfirmDialog({
      title: '删除持仓及交易记录',
      message: tradeCount > 0
        ? `删除“${position.fund_name}”将同时永久删除 ${tradeCount} 条关联交易记录，且无法恢复。确定继续吗？`
        : `确定永久删除“${position.fund_name}”持仓吗？此操作无法恢复。`,
      confirmButtonText: '确认删除',
      confirmButtonColor: '#ee0a24',
    })
    await positionApi.delete(position.id)
    showToast('删除成功')
    fetchPositions()
  } catch (error) {
    if (error !== 'cancel') {
      showToast('删除失败')
    }
  }
}

const onMemberConfirm = ({ selectedOptions }) => {
  const memberId = selectedOptions[0].value
  formData.value.memberId = memberId
  const member = members.value.find(m => m.id === memberId)
  formData.value.memberName = member ? `${member.emoji || '👤'} ${member.name}` : ''
  // 重置账户选择
  formData.value.accountId = ''
  formData.value.accountName = ''
  showMemberPicker.value = false
}

const onAccountConfirm = ({ selectedOptions }) => {
  formData.value.accountId = selectedOptions[0].value
  formData.value.accountName = selectedOptions[0].text
  showAccountPicker.value = false
}

const onDividendConfirm = ({ selectedOptions }) => {
  formData.value.dividendMethod = selectedOptions[0].value
  showDividendPicker.value = false
}

const openAddModal = () => {
  editingPosition.value = null
  formData.value = {
    memberName: '',
    memberId: '',
    accountName: '',
    accountId: '',
    fundCode: '',
    fundName: '',
    shares: null,
    amount: null,
    initialProfit: null,
    dividendMethod: '红利再投',
  }
  showAddModal.value = true
  // 确保账户列表已加载；若为空则立即刷新
  if (!accounts.value.length) {
    fetchAccounts()
  }
}

const closeModal = () => {
  showAddModal.value = false
  editingPosition.value = null
  formData.value = {
    memberName: '',
    memberId: '',
    accountName: '',
    accountId: '',
    fundCode: '',
    fundName: '',
    shares: null,
    totalAmount: null,
    initialProfit: null,
    dividendMethod: '红利再投',
  }
}

const ensureFreshData = async ({ force = false } = {}) => {
  refreshAllocationProfiles({ force }).catch(() => {})
  if (!shouldRefreshPageData({ hasData: hasLoadedOnce.value, lastLoadedAt: lastLoadedAt.value, force })) {
    ensureFreshMetaData().catch(() => {})
    return
  }
  // 并行加载持仓和元数据（成员/账户），确保添加弹窗能立即拿到账户列表
  await Promise.all([fetchPositions(), ensureFreshMetaData({ force })])
  hasLoadedOnce.value = true
  lastLoadedAt.value = Date.now()
}

const applyRouteFilters = () => {
  selectedAccountId.value = route.query.account_id ? String(route.query.account_id) : null
  selectedMemberId.value = route.query.member_id ? String(route.query.member_id) : null
}

onMounted(() => {
  window.addEventListener(ALLOCATION_PROFILES_UPDATED_EVENT, handleAllocationProfilesUpdated)
  applyRouteFilters()
  ensureFreshData({ force: true })
})

onActivated(() => {
  applyRouteFilters()
  ensureFreshData()
})

watch(
  [showAddModal, showMemberPicker, showAccountPicker, showDividendPicker],
  ([addOpen, memberOpen, accountOpen, dividendOpen]) => {
    const hasBottomPopupOpen = addOpen || memberOpen || accountOpen || dividendOpen
    setAppTabbarVisible(!hasBottomPopupOpen)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener(ALLOCATION_PROFILES_UPDATED_EVENT, handleAllocationProfilesUpdated)
  setAppTabbarVisible(true)
})

onDeactivated(() => {
  setAppTabbarVisible(true)
})
</script>

<style scoped>
.positions-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: var(--app-floating-page-space);
}

.filter-bar {
  background: white;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-dropdowns {
  flex: 1;
  min-width: 0;
}

.filter-dropdowns .van-dropdown-menu {
  height: 36px;
}

.filter-dropdowns :deep(.van-dropdown-menu__item) {
  min-width: 0;
}

.filter-dropdowns :deep(.van-dropdown-menu__title) {
  max-width: 92px;
  padding: 0 10px 0 4px;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync-all-btn {
  height: 36px !important;
  line-height: 36px !important;
  flex-shrink: 0;
  padding: 0 10px !important;
}

/* 顶部统计卡片 */
.summary-card {
  background: linear-gradient(135deg, #1E80FF 0%, #0066CC 100%);
  padding: 18px 20px 14px;
  color: white;
  margin: 0 12px;
  border-radius: 12px;
  margin-top: 12px;
}

.summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.summary-asset {
  text-align: left;
  flex: 1;
}

.summary-toggle-icon {
  font-size: 18px;
  opacity: 0.95;
}

.summary-hint {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.82;
}

.summary-label {
  font-size: 13px;
  opacity: 0.85;
  margin-bottom: 4px;
}

.summary-amount {
  font-size: 30px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  letter-spacing: -1px;
}

.summary-profit-row {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 12px 0;
  margin-top: 14px;
}

.summary-profit-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.sp-label {
  font-size: 12px;
  opacity: 0.8;
}

.sp-value {
  font-size: 13px;
  font-weight: 600;
  font-family: 'Courier New', monospace;
  white-space: nowrap;
}

.sp-divider {
  width: 1px;
  height: 28px;
  background: rgba(255, 255, 255, 0.25);
}

/* 颜色 */
.positive { color: #FF6B6B; }
.negative { color: #7DDF64; }

.position-list {
  padding: 0 12px 112px;
}

/* 表头 */
.list-header {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  margin-bottom: 2px;
}

.header-col {
  font-size: 12px;
  color: #999;
  font-weight: 400;
}

.header-name {
  flex: 1;
  text-align: left;
}

.header-center {
  text-align: center;
  width: 110px;
}

.header-right {
  text-align: right;
  width: 90px;
}

.position-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 10px;
}

/* 折叠行 - 三列布局 */
.fund-collapsed {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  user-select: none;
}

.fund-collapsed-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.fund-collapsed-main:active {
  background: #fafafa;
}

/* 左：基金名称 */
.collapsed-main {
  flex: 1;
  min-width: 0;
  max-width: calc(100% - 190px);
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-right: 8px;
}

.collapsed-name {
  font-weight: 600;
  font-size: 15px;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.collapsed-tags {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.nav-status-tag {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1.5;
  white-space: nowrap;
}

.allocation-status-tag {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;
}

.allocation-status-tag.is-keep { color: #166534; background: #dcfce7; }
.allocation-status-tag.is-watch { color: #92400e; background: #fef3c7; }
.allocation-status-tag.is-reduce { color: #b91c1c; background: #fee2e2; }
.allocation-status-tag.is-forbid { color: #374151; background: #e5e7eb; }
.allocation-status-tag.is-conflict { color: #6d28d9; background: #ede9fe; }

.nav-status-tag.is-success {
  color: #198754;
  background: #eaf8f0;
}

.nav-status-tag.is-warning {
  color: #b26a00;
  background: #fff3d6;
}

.nav-status-tag.is-danger {
  color: #d93025;
  background: #fdecea;
}

/* 中：持有金额 / 昨日收益 */
.collapsed-data {
  display: flex;
  align-items: flex-end;
  gap: 0;
  flex-shrink: 0;
}

.collapsed-center {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 90px;
  padding-right: 10px;
}

.collapsed-value {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
  font-family: 'Courier New', monospace;
  white-space: nowrap;
  line-height: 1.3;
}

.collapsed-yesterday {
  font-size: 12px;
  font-family: 'Courier New', monospace;
  white-space: nowrap;
  line-height: 1.3;
}

/* 右：持有收益 / 持有收益率 */
.collapsed-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 80px;
}

.profit-update-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-end;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1.5;
  color: #1677ff;
  background: #e8f3ff;
  border: 1px solid #bfdbff;
  white-space: nowrap;
  margin-bottom: 2px;
}

.profit-update-badge.inline {
  align-self: flex-start;
  margin-left: 0;
  margin-bottom: 0;
  vertical-align: middle;
}

.collapsed-profit {
  font-size: 15px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  white-space: nowrap;
  line-height: 1.3;
}

.collapsed-rate {
  font-size: 12px;
  font-family: 'Courier New', monospace;
  white-space: nowrap;
  line-height: 1.3;
}

/* 颜色 */
.collapsed-profit.positive,
.collapsed-yesterday.positive,
.collapsed-rate.positive {
  color: #ee0a24;
}

.collapsed-profit.negative,
.collapsed-yesterday.negative,
.collapsed-rate.negative {
  color: #07c160;
}

.collapsed-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #ccc;
  flex-shrink: 0;
  margin-left: 6px;
}

/* 展开内容 */
.fund-expanded {
  padding: 0 16px 16px;
  border-top: 1px solid #f0f0f0;
}

/* 旧样式已移除 */

/* 折叠行内的标签样式 */
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

.fund-data-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 12px 0 4px;
}

.data-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.data-label {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  color: #999;
}

.data-value {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  font-family: 'Courier New', monospace;
}

.data-value.profit.positive {
  color: #ee0a24;
}

.data-value.profit.negative {
  color: #07c160;
}

.dividend-info {
  margin-top: 8px;
  font-size: 13px;
  color: #666;
  display: flex;
  gap: 8px;
}

.dividend-label {
  color: #999;
}

.fund-extra {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid #f5f5f5;
  margin-top: 8px;
  flex-wrap: wrap;
}

.fund-code-full {
  font-size: 12px;
  color: #999;
  font-family: 'Courier New', monospace;
}

.nav-info {
  display: flex;
  gap: 16px;
  padding: 4px 0;
  flex-wrap: wrap;
}

.nav-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-label {
  font-size: 11px;
  color: #999;
}

.nav-value {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  font-family: 'Courier New', monospace;
}

.nav-value.profit.positive {
  color: #ee0a24;
}

.nav-value.profit.negative {
  color: #07c160;
}

.position-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.sync-fund-btn {
  min-width: 94px;
}

.sync-fund-btn.syncing {
  opacity: 0.92;
}

.sync-btn-content {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.sync-btn-icon.spinning {
  animation: sync-spin 0.9s linear infinite;
}

.loading {
  display: block;
  margin: 40px auto;
}

.add-btn-wrapper {
  position: fixed;
  right: 14px;
  bottom: var(--app-floating-bottom);
  z-index: 20;
}

.add-btn {
  height: 42px;
  padding: 0 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  box-shadow: 0 10px 24px rgba(102, 126, 234, 0.28);
}

.add-btn-content {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
}

@keyframes sync-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

:deep(.position-form-popup) {
  max-height: min(88vh, calc(100vh - 24px));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.modal-content {
  padding: 20px 20px calc(28px + env(safe-area-inset-bottom));
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 20px;
  text-align: center;
}

.modal-actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
