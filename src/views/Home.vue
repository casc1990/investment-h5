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

    <!-- 事件中心 -->
    <div class="section event-section">
      <div class="section-heading">
        <div class="section-title">事件中心</div>
        <span v-if="eventCounts.pending" class="event-count-badge">{{ eventCounts.pending }}</span>
      </div>
      <div class="event-tabs">
        <button :class="{ active: activeEventTab === 'pending' }" @click="activeEventTab = 'pending'">待处理 {{ eventCounts.pending }}</button>
        <button :class="{ active: activeEventTab === 'confirmed' }" @click="activeEventTab = 'confirmed'">已确认 {{ eventCounts.confirmed }}</button>
      </div>

      <div v-if="visibleEvents.length" class="event-list">
        <div v-for="event in visibleEvents" :key="event.id" class="event-card" @click="openEventDetail(event)">
          <div class="event-card-top">
            <span class="event-type-tag" :class="`type-${event.event_type}`">{{ eventTypeLabel(event.event_type) }}</span>
            <span class="event-status-tag" :class="`status-${event.status}`">{{ eventStatusLabel(event.status) }}</span>
          </div>
          <div class="event-title">{{ event.title }}</div>
          <div class="event-time">◷ {{ formatEventTime(event.event_time) }}</div>
          <div class="event-description">{{ event.description }}</div>
          <div class="event-detail-link">查看详情 <span>›</span></div>
        </div>
      </div>

      <div v-else class="event-empty">
        <div class="event-empty-title">{{ activeEventTab === 'pending' ? '暂无待处理事件' : '暂无已确认事件' }}</div>
        <div class="event-empty-desc">新的净值、分红和份额变动会出现在这里。</div>
      </div>
    </div>

    <van-popup
      v-model:show="eventDetailVisible"
      position="bottom"
      round
      teleport="body"
      :z-index="1000"
      :overlay-style="{ zIndex: 999 }"
      safe-area-inset-bottom
      class="event-detail-popup"
    >
      <div v-if="selectedEvent" class="event-detail-sheet">
        <div class="event-detail-head"><strong>事件详情</strong><button @click="eventDetailVisible = false">×</button></div>
        <div class="event-detail-badges">
          <span class="event-type-tag" :class="`type-${selectedEvent.event_type}`">{{ eventTypeLabel(selectedEvent.event_type) }}</span>
          <span class="event-status-tag" :class="`status-${selectedEvent.status}`">{{ eventStatusLabel(selectedEvent.status) }}</span>
        </div>
        <h3>{{ selectedEvent.fund_name || selectedEvent.title }}</h3>
        <div class="event-detail-row"><span>基金代码</span><b>{{ selectedEvent.fund_code || '—' }}</b></div>
        <div v-if="selectedEvent.account_name" class="event-detail-row"><span>所属账户</span><b>{{ selectedEvent.account_name }}</b></div>
        <div class="event-detail-row"><span>事件时间</span><b>{{ formatEventDateTime(selectedEvent.event_time) }}</b></div>
        <template v-if="selectedEvent.event_type === 'nav_update'">
          <div class="event-detail-row"><span>目标净值日期</span><b>{{ selectedEvent.detail?.target_nav_date || '—' }}</b></div>
          <div class="event-detail-row"><span>当前净值日期</span><b>{{ selectedEvent.detail?.current_nav_date || '—' }}</b></div>
        </template>
        <template v-else-if="selectedEvent.event_type === 'dividend' && selectedEvent.source_type === 'dividend_announcement'">
          <div class="event-detail-row"><span>权益登记日</span><b>{{ selectedEvent.detail?.record_date || '—' }}</b></div>
          <div class="event-detail-row"><span>除息日</span><b>{{ selectedEvent.detail?.ex_date || '—' }}</b></div>
          <div class="event-detail-row"><span>每份分红</span><b>{{ formatDividendPerShare(selectedEvent.detail?.dividend_per_share) }} 元</b></div>
          <div class="event-detail-row"><span>红利发放日</span><b>{{ selectedEvent.detail?.payment_date || '—' }}</b></div>
          <template v-for="account in selectedEvent.dividend_preview?.accounts || []" :key="account.position_id">
            <div class="event-detail-row"><span>所属账户</span><b>{{ account.account_name || '—' }}</b></div>
            <div class="event-detail-row"><span>分红方式</span><b>{{ account.dividend_method }}</b></div>
            <div v-if="account.dividend_method === '红利再投'" class="event-detail-row"><span>预计新增份额</span><b>{{ formatShareQuantity(account.added_quantity) }} 份</b></div>
            <div v-if="account.dividend_method === '红利再投'" class="event-detail-row"><span>份额折算净值</span><b>{{ formatDividendPerShare(account.reinvest_nav) }}</b></div>
            <div v-else class="event-detail-row"><span>预计现金分红</span><b>{{ formatNumber(account.amount) }} 元</b></div>
          </template>
          <div v-if="selectedEvent.dividend_preview?.error" class="event-detail-note">{{ selectedEvent.dividend_preview.error }}</div>
        </template>
        <template v-else>
          <div class="event-detail-row"><span>业务类型</span><b>{{ selectedEvent.detail?.trade_type || '—' }}</b></div>
          <div v-if="isReinvestDividendEvent(selectedEvent)" class="event-detail-row"><span>新增分红份额</span><b>{{ formatShareQuantity(selectedEvent.detail?.quantity) }} 份</b></div>
          <div v-if="isReinvestDividendEvent(selectedEvent)" class="event-detail-row"><span>折算分红金额</span><b>{{ formatNumber(selectedEvent.detail?.amount || 0) }} 元</b></div>
          <div v-else class="event-detail-row"><span>{{ selectedEvent.event_type === 'dividend' ? '现金分红金额' : '变动份额' }}</span><b>{{ selectedEvent.event_type === 'dividend' ? `${formatNumber(selectedEvent.detail?.amount || 0)} 元` : `${formatNumber(selectedEvent.detail?.quantity || 0)} 份` }}</b></div>
        </template>
        <div class="event-detail-description">{{ eventDetailDescription(selectedEvent) }}</div>
        <div v-if="selectedEvent.handle_note" class="event-detail-note">处理备注：{{ selectedEvent.handle_note }}</div>
        <div class="event-detail-actions">
          <template v-if="selectedEvent.status === 'pending'">
            <button class="secondary" @click="changeEventStatus('ignored')">忽略事件</button>
            <button v-if="selectedEvent.event_type === 'nav_update'" class="outline" :disabled="eventSyncing" @click="syncSelectedEvent">{{ eventSyncing ? '同步中...' : '立即补同步' }}</button>
            <button
              class="primary"
              :disabled="eventProcessing"
              @click="selectedEvent.source_type === 'dividend_announcement' ? processDividendEvent() : changeEventStatus('processed')"
            >{{ eventProcessing ? '处理中...' : selectedEvent.source_type === 'dividend_announcement' ? '立即处理' : '标记已处理' }}</button>
          </template>
          <button v-else class="outline full" @click="changeEventStatus('pending')">重新打开</button>
        </div>
      </div>
    </van-popup>

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
import { authApi, eventApi, fundApi, statsApi } from '../api'
import { formatAmount as formatNumber } from '../utils/formatters'
import { shouldRefreshPageData } from '../utils/perfHelpers'

const router = useRouter()
const loading = ref(false)
const overview = ref(null)
const expandedMemberIds = ref([])
const eventSyncing = ref(false)
const eventProcessing = ref(false)
const activeEventTab = ref('pending')
const eventGroups = ref({ pending: [], confirmed: [] })
const eventCounts = ref({ pending: 0, confirmed: 0 })
const selectedEvent = ref(null)
const eventDetailVisible = ref(false)
const lastLoadedAt = ref(0)
const hasLoadedOnce = ref(false)

// 未分配到成员的账户（直接使用后端返回的 unassignedAccounts）
const unassignedAccounts = computed(() => {
  return overview.value?.unassignedAccounts || []
})

const homePositionDailyProfit = computed(() => (
  Number(overview.value?.summary?.totalPositionYesterdayProfit ?? overview.value?.summary?.totalYesterdayProfit) || 0
))

const visibleEvents = computed(() => eventGroups.value[activeEventTab.value] || [])

const isMemberExpanded = (memberId) => expandedMemberIds.value.includes(memberId)

const toggleMember = (memberId) => {
  expandedMemberIds.value = isMemberExpanded(memberId)
    ? expandedMemberIds.value.filter(id => id !== memberId)
    : [...expandedMemberIds.value, memberId]
}

const fetchEvents = async () => {
  const [pending, confirmed] = await Promise.all([
    eventApi.list({ group: 'pending', limit: 5 }),
    eventApi.list({ group: 'confirmed', limit: 5 }),
  ])
  eventGroups.value = {
    pending: pending?.events || [],
    confirmed: confirmed?.events || [],
  }
  eventCounts.value = pending?.counts || confirmed?.counts || { pending: 0, confirmed: 0 }
}

const fetchData = async () => {
  loading.value = true
  try {
    const [overviewResult, eventsResult] = await Promise.allSettled([
      statsApi.overview(),
      fetchEvents(),
    ])

    if (overviewResult.status === 'fulfilled') {
      overview.value = overviewResult.value
    } else {
      throw overviewResult.reason
    }

    if (eventsResult.status === 'rejected') {
      console.error('Failed to fetch events:', eventsResult.reason)
      eventGroups.value = { pending: [], confirmed: [] }
    }

    hasLoadedOnce.value = true
    lastLoadedAt.value = Date.now()
  } catch (error) {
    console.error('Failed to fetch overview:', error)
    showToast('数据加载失败: ' + (error.message || '网络错误'))
  } finally {
    loading.value = false
  }
}

const eventTypeLabel = type => ({ nav_update: '净值更新', dividend: '分红', share_change: '份额变动' }[type] || '其他')
const eventStatusLabel = status => ({ pending: '待处理', processed: '已处理', ignored: '已忽略' }[status] || status)
const eventDate = timestamp => new Date(Number(timestamp || 0) * 1000)
const formatEventTime = timestamp => {
  const date = eventDate(timestamp)
  const today = new Date()
  const day = date.toLocaleDateString('zh-CN') === today.toLocaleDateString('zh-CN') ? '今天' : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  return `${day} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}
const formatEventDateTime = timestamp => eventDate(timestamp).toLocaleString('zh-CN', { hour12: false })
const formatDividendPerShare = value => Number(value || 0).toFixed(4)
const formatShareQuantity = value => Number(value || 0).toFixed(4)
const isReinvestDividendEvent = event => event?.event_type === 'dividend' && ['红利再投', '分红再投'].includes(event?.detail?.trade_type)
const eventDetailDescription = event => {
  if (event?.source_type !== 'dividend_announcement' || !event?.dividend_preview?.accounts?.length) return event?.description || ''
  const addedQuantity = Number(event.dividend_preview.total_added_quantity || 0)
  const cashAmount = Number(event.dividend_preview.total_cash_amount || 0)
  if (addedQuantity > 0 && cashAmount > 0) return `预计红利再投新增 ${addedQuantity.toFixed(4)} 份，现金分红 ${formatNumber(cashAmount)} 元。`
  if (addedQuantity > 0) return `该持仓采用红利再投，预计新增 ${addedQuantity.toFixed(4)} 份。`
  return `该持仓采用现金分红，预计到账 ${formatNumber(cashAmount)} 元。`
}

const openEventDetail = async event => {
  selectedEvent.value = event
  eventDetailVisible.value = true
  try { selectedEvent.value = await eventApi.get(event.id) } catch (error) { console.error('Failed to fetch event detail:', error) }
}

const changeEventStatus = async status => {
  if (!selectedEvent.value) return
  try {
    const result = await eventApi.updateStatus(selectedEvent.value.id, { status })
    eventDetailVisible.value = false
    await fetchEvents()
    activeEventTab.value = status === 'pending' ? 'pending' : 'confirmed'
    const bookingCount = Number(result?.booking_result?.created || 0)
    showToast(status === 'pending' ? '事件已重新打开' : status === 'ignored' ? '事件已忽略' : bookingCount > 0 ? `事件已处理，已生成 ${bookingCount} 笔分红流水` : '事件已处理')
  } catch (error) {
    showToast('状态更新失败: ' + (error.message || '网络错误'))
  }
}

const processDividendEvent = async () => {
  if (!selectedEvent.value || eventProcessing.value) return
  eventProcessing.value = true
  try {
    const result = await eventApi.updateStatus(selectedEvent.value.id, { status: 'processed' })
    const bookings = result?.booking_result?.bookings || []
    const reinvestQuantity = bookings.reduce((sum, item) => sum + Number(item.added_quantity || 0), 0)
    const cashAmount = bookings
      .filter(item => item.trade_type === '现金分红')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    eventDetailVisible.value = false
    await fetchEvents()
    activeEventTab.value = 'confirmed'
    if (reinvestQuantity > 0) {
      showToast(`处理成功，红利再投新增 ${reinvestQuantity.toFixed(4)} 份`)
    } else if (cashAmount > 0) {
      showToast(`处理成功，现金分红 ${formatNumber(cashAmount)} 元`)
    } else {
      showToast('分红事件已处理')
    }
  } catch (error) {
    showToast('处理失败: ' + (error.message || '网络错误'))
  } finally {
    eventProcessing.value = false
  }
}

const syncSelectedEvent = async () => {
  if (!selectedEvent.value || eventSyncing.value) return
  eventSyncing.value = true
  try {
    const result = await fundApi.syncPending({ mode: 'night', includeQdii: false, batchSize: 5 })
    await eventApi.updateStatus(selectedEvent.value.id, { status: 'processed', note: '净值补同步完成' })
    eventDetailVisible.value = false
    await fetchEvents()
    activeEventTab.value = 'confirmed'
    showToast(`已补同步 ${result?.synced || 0} 只，剩余 ${result?.still_pending_count || 0} 只`)
  } catch (error) {
    console.error('Failed to sync pending funds:', error)
    showToast('补同步失败: ' + (error.message || '网络错误'))
  } finally {
    eventSyncing.value = false
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

/* 事件中心 */
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.section-heading .section-title {
  margin-bottom: 0;
}

.event-count-badge {
  width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%;
  background: #f59e0b; color: white; font-size: 12px; font-weight: 700;
}
.event-tabs { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 14px; border: 1px solid #e5e7eb; border-radius: 9px; overflow: hidden; }
.event-tabs button { padding: 11px; border: 0; background: #fff; color: #64748b; font-size: 14px; }
.event-tabs button.active { background: #eff6ff; color: #2563eb; font-weight: 700; box-shadow: inset 0 -2px #2563eb; }

.event-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.event-card {
  border-radius: 12px; border: 1px solid #e8edf3; background: #fff; overflow: hidden; cursor: pointer;
  box-shadow: 0 4px 14px rgba(15, 23, 42, .05);
}

.event-card-top { display: flex; justify-content: space-between; padding: 13px 14px 0; }

.event-main {
  min-width: 0;
  flex: 1;
}

.event-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.event-title { padding: 10px 14px 0; font-size: 15px; font-weight: 700; color: #111827; }

.event-type-tag, .event-status-tag { display: inline-flex; padding: 4px 9px; border-radius: 6px; font-size: 12px; font-weight: 600; }
.type-nav_update { color: #2563eb; background: #eff6ff; }
.type-dividend { color: #ea580c; background: #fff7ed; }
.type-share_change { color: #7c3aed; background: #f5f3ff; }
.status-pending { color: #d97706; background: #fffbeb; border: 1px solid #fde68a; }
.status-processed { color: #16a34a; background: #f0fdf4; }
.status-ignored { color: #64748b; background: #f1f5f9; }
.event-time { padding: 8px 14px 0; font-size: 12px; color: #64748b; }

.event-description { padding: 7px 14px 12px; font-size: 13px; line-height: 1.55; color: #64748b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.event-detail-link { border-top: 1px solid #f1f5f9; padding: 10px 14px; color: #2563eb; font-size: 13px; display: flex; justify-content: space-between; }

.event-actions {
  margin-top: 12px;
}

.event-action-btn {
  width: 100%;
  border: none;
  border-radius: 12px;
  padding: 11px 14px;
  font-size: 14px;
  font-weight: 600;
}

.event-action-btn.primary {
  background: #4f46e5;
  color: white;
}

.event-action-btn:disabled {
  opacity: 0.7;
}

.event-empty {
  padding: 8px 0 2px;
}

.event-empty-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.event-empty-desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: #94a3b8;
}
.event-detail-popup { max-height: 88dvh; overflow-y: auto; }
.event-detail-sheet { min-height: 0; padding: 18px 18px calc(24px + env(safe-area-inset-bottom)); color: #0f172a; }
.event-detail-head { display: flex; align-items: center; justify-content: space-between; font-size: 18px; }
.event-detail-head button { border: 0; background: transparent; color: #64748b; font-size: 28px; }
.event-detail-badges { display: flex; justify-content: space-between; margin-top: 20px; }
.event-detail-sheet h3 { margin: 16px 0; font-size: 19px; }
.event-detail-row { display: flex; justify-content: space-between; gap: 24px; padding: 12px 0; border-top: 1px solid #f1f5f9; font-size: 13px; }
.event-detail-row span { color: #64748b; }
.event-detail-row b { text-align: right; font-weight: 500; }
.event-detail-description, .event-detail-note { margin-top: 14px; padding: 14px; border-radius: 10px; background: #f8fafc; font-size: 13px; line-height: 1.6; color: #475569; }
.event-detail-actions { display: flex; gap: 8px; margin-top: 20px; }
.event-detail-actions button { flex: 1; min-height: 44px; border-radius: 8px; font-size: 13px; font-weight: 600; }
.event-detail-actions .secondary { background: #fff; border: 1px solid #cbd5e1; color: #475569; }
.event-detail-actions .outline { background: #fff; border: 1px solid #2563eb; color: #2563eb; }
.event-detail-actions .primary { background: #2563eb; border: 1px solid #2563eb; color: #fff; }
.event-detail-actions .full { flex-basis: 100%; }

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
