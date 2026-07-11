<template>
  <div class="home">
    <!-- 顶部卡片 - 总资产 -->
    <div class="header-card">
      <div class="header-top">
        <div class="header-title">确认总资产</div>
        <div class="header-actions">
          <button @click="amountsHidden = !amountsHidden">{{ amountsHidden ? '显示' : '隐藏' }}</button>
          <button :disabled="refreshing" @click="refreshHome">{{ refreshing ? '刷新中' : '刷新' }}</button>
          <button @click="handleLogout">退出</button>
        </div>
      </div>
      <div class="total-info">
        <div class="amount">{{ displayMoney(overview?.summary?.totalMarketValue) }}</div>
        <div class="profit" :class="profitClass(overview?.summary?.totalProfit)">
          <span class="profit-label">持有收益</span>
          <strong>{{ displaySignedMoney(overview?.summary?.totalProfit) }}</strong>
          <span class="rate">{{ displayPercent(overview?.summary?.totalProfitRate) }}</span>
          <span class="profit-freshness">{{ freshnessText }}</span>
        </div>
      </div>
    </div>

    <div class="today-grid">
      <div class="today-card">
        <div class="today-label">{{ dailyProfitLabel }}</div>
        <div class="today-value" :class="{ positive: homePositionDailyProfit > 0, negative: homePositionDailyProfit < 0 }">
          <span>{{ displaySignedMoney(homePositionDailyProfit) }}</span>
          <small>{{ displayPercent(homeDailyProfitRate) }}</small>
        </div>
      </div>
      <div class="today-card">
        <div class="today-label">持有收益</div>
        <div class="today-value" :class="{ positive: overview?.summary?.totalProfit > 0, negative: overview?.summary?.totalProfit < 0 }">
          {{ displaySignedMoney(overview?.summary?.totalProfit) }}
        </div>
      </div>
      <div class="today-card">
        <div class="today-label">累计收益</div>
        <div class="today-value" :class="profitClass(overview?.summary?.totalCumulativeProfit)">{{ displaySignedMoney(overview?.summary?.totalCumulativeProfit) }}</div>
      </div>
      <div class="today-card">
        <div class="today-label">持仓收益率</div>
        <div class="today-value" :class="profitClass(overview?.summary?.totalProfitRate)">{{ displayPercent(overview?.summary?.totalProfitRate) }}</div>
      </div>
    </div>

    <!-- 成员分布 -->
    <div v-if="contributionMemberTabs.length" class="section member-distribution-section">
      <div class="section-heading"><div><div class="section-title">成员分布</div><div class="section-subtitle">查看成员资产与账户日收益</div></div></div>
      <div class="contribution-member-tabs" role="tablist" aria-label="选择成员查看资产分布">
        <button v-for="member in contributionMemberTabs" :key="member.member_id" :class="{ active: selectedContributionMemberId === member.member_id }" role="tab" @click="selectedContributionMemberId = member.member_id">{{ member.emoji }} {{ member.member_name }}</button>
      </div>
      <div v-if="selectedOverviewMember" class="member-list">
        <div class="member-card expanded">
          <div class="member-header">
            <div class="member-identity">
              <span class="member-emoji">{{ selectedOverviewMember.emoji }}</span>
              <div class="member-title-wrap">
                <span class="member-name">{{ selectedOverviewMember.member_name }}</span>
                <span class="member-count">{{ selectedOverviewMember.accounts?.length || 0 }}个账户</span>
              </div>
            </div>
            <div class="member-overview">
              <div class="member-overview-label">日收益</div>
              <div class="member-overview-profit" :class="profitClass(selectedOverviewMember.dailyProfit)">{{ displaySignedMoney(selectedOverviewMember.dailyProfit) }}</div>
            </div>
          </div>

          <div v-if="selectedOverviewMember.accounts?.length" class="member-stats four-metrics">
            <div class="stat-item">
              <span class="stat-label">总资产</span>
              <span class="stat-value">¥{{ formatNumber(selectedOverviewMember.marketValue || 0) }}</span>
            </div>
            <div class="stat-item align-right"><span class="stat-label">日收益</span><span class="stat-value profit" :class="profitClass(selectedOverviewMember.dailyProfit)">{{ displaySignedMoney(selectedOverviewMember.dailyProfit) }}</span></div>
            <div class="stat-item"><span class="stat-label">总收益</span><span class="stat-value profit" :class="profitClass(selectedOverviewMember.profit)">{{ displaySignedMoney(selectedOverviewMember.profit) }}</span></div>
            <div class="stat-item align-right">
              <span class="stat-label">总收益率</span>
              <span class="stat-value profit" :class="profitClass(selectedOverviewMember.profit)">
                {{ selectedOverviewMember.profitRate || 0 }}%
              </span>
            </div>
          </div>

          <div v-if="selectedOverviewMember.accounts?.length" class="member-account-list">
            <button v-for="account in selectedOverviewMember.accounts" :key="account.accountId" class="member-account-item" @click="openAccount(account)">
              <div class="account-main">
                <div class="account-title-row">
                  <span class="account-name">{{ account.accountName }}</span>
                  <span v-if="account.channel" class="account-channel">{{ account.channel }}</span>
                </div>
                <div class="account-subtitle">持有金额 ¥{{ formatNumber(account.marketValue || 0) }}</div>
                <div class="account-holding-profit" :class="profitClass(account.profit)">持有收益 {{ displaySignedMoney(account.profit) }}</div>
              </div>
              <div class="account-side">
                <div class="account-daily-label">日收益</div>
                <div class="account-profit" :class="profitClass(account.dailyProfit)">
                  {{ displaySignedMoney(account.dailyProfit) }}
                </div>
                <div class="account-holding-rate" :class="profitClass(account.profitRate)">
                  持有收益率 {{ displayPercent(account.profitRate) }}
                </div>
              </div>
            </button>
          </div>

          <div v-else class="member-empty">
            <span>暂无账户或持仓</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="contributionMemberTabs.length" class="section contribution-section">
      <div class="section-heading">
        <div><div class="section-title">每日收益贡献</div><div class="section-subtitle">每个账户展示当日收益率最高和最低基金</div></div>
        <button class="section-more" @click="router.push('/positions')">全部持仓</button>
      </div>
      <div class="contribution-member-tabs" role="tablist" aria-label="选择成员查看每日收益贡献">
        <button v-for="member in contributionMemberTabs" :key="member.member_id" :class="{ active: selectedContributionMemberId === member.member_id }" role="tab" @click="selectedContributionMemberId = member.member_id">{{ member.emoji }} {{ member.member_name }}</button>
      </div>
      <div v-if="!accountContributionGroups.length" class="contribution-empty">该成员暂无基金日收益数据</div>
      <div v-for="group in accountContributionGroups" :key="group.accountId" class="contribution-account-group">
        <div class="contribution-account-head"><strong>{{ group.accountName }}</strong><span>{{ group.items.length }} 项</span></div>
        <button v-for="item in group.items" :key="`${item.accountId}:${item.fundCode}:${item.rankLabel}`" class="contribution-item" @click="openPosition(item)">
          <span class="contribution-rank" :class="item.rankType">{{ item.rankLabel }}</span>
          <div class="contribution-main"><strong>{{ item.fundName }}</strong><span>{{ item.fundCode }}</span></div>
          <div class="contribution-value" :class="profitClass(item.dailyProfit)"><strong>{{ displaySignedMoney(item.dailyProfit) }}</strong><span :class="profitClass(item.dailyChangeRate)">{{ displayPercent(item.dailyChangeRate) }}</span></div>
        </button>
      </div>
    </div>

    <!-- 无成员账户（未分配） -->
    <div v-if="unassignedAccounts?.length" class="section unassigned-callout">
      <div><div class="section-title">{{ unassignedAccounts.length }} 个账户尚未分配成员</div><div class="section-subtitle">涉及资产 {{ displayMoney(unassignedMarketValue) }}</div></div>
      <button @click="router.push('/accounts')">立即分配</button>
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
    <div v-if="loading && !overview" class="home-skeleton" aria-label="首页数据加载中">
      <div class="skeleton-hero"></div>
      <div class="skeleton-grid"><i v-for="index in 4" :key="index"></i></div>
      <div class="skeleton-section"><i></i><i></i><i></i></div>
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
const refreshing = ref(false)
const amountsHidden = ref(false)
const overview = ref(null)
const eventSyncing = ref(false)
const eventProcessing = ref(false)
const activeEventTab = ref('pending')
const eventGroups = ref({ pending: [], confirmed: [] })
const eventCounts = ref({ pending: 0, confirmed: 0 })
const selectedEvent = ref(null)
const eventDetailVisible = ref(false)
const selectedContributionMemberId = ref(null)
const lastLoadedAt = ref(0)
const hasLoadedOnce = ref(false)

// 未分配到成员的账户（直接使用后端返回的 unassignedAccounts）
const unassignedAccounts = computed(() => {
  return overview.value?.unassignedAccounts || []
})

const homePositionDailyProfit = computed(() => (
  Number(overview.value?.summary?.totalPositionYesterdayProfit ?? overview.value?.summary?.totalYesterdayProfit) || 0
))
const homeDailyProfitRate = computed(() => {
  const summary = overview.value?.summary || {}
  const profitBase = Number(summary.totalMarketValue || 0) - Number(summary.totalProfit || 0)
  return profitBase > 0 ? (homePositionDailyProfit.value / profitBase) * 100 : 0
})

const visibleEvents = computed(() => eventGroups.value[activeEventTab.value] || [])
const contributionMemberTabs = computed(() => overview.value?.members || [])
const selectedOverviewMember = computed(() => contributionMemberTabs.value.find(member => member.member_id === selectedContributionMemberId.value) || null)
const accountContributionGroups = computed(() => {
  const groups = new Map()
  const memberId = selectedContributionMemberId.value
  for (const item of (overview.value?.dailyContributions || []).filter(row => !memberId || row.memberId === memberId)) {
    const key = item.accountId || 'unassigned'
    if (!groups.has(key)) groups.set(key, { accountId: key, accountName: item.accountName || '未命名账户', funds: [] })
    groups.get(key).funds.push(item)
  }
  return [...groups.values()].map(group => {
    const sorted = [...group.funds].sort((a, b) => Number(b.dailyChangeRate || 0) - Number(a.dailyChangeRate || 0))
    const highest = sorted[0]
    const lowest = sorted[sorted.length - 1]
    const items = highest ? [{ ...highest, rankLabel: '最高', rankType: 'highest' }] : []
    if (lowest && lowest.fundCode !== highest?.fundCode) items.push({ ...lowest, rankLabel: '最低', rankType: 'lowest' })
    return { accountId: group.accountId, accountName: group.accountName, items }
  }).sort((a, b) => a.accountName.localeCompare(b.accountName, 'zh-CN'))
})
const unassignedMarketValue = computed(() => unassignedAccounts.value.reduce((sum, account) => sum + Number(account.marketValue || 0), 0))
const dailyProfitLabel = computed(() => {
  const date = overview.value?.summary?.dailyProfitDate
  if (!date) return '最近日收益'
  const today = new Date().toLocaleDateString('en-CA')
  return date === today ? '今日收益' : `${date.slice(5).replace('-', '/')} 收益`
})
const freshnessText = computed(() => {
  const summary = overview.value?.summary || {}
  if (!summary.totalFundCount) return '暂无持仓净值'
  return summary.staleFundCount > 0
    ? `${summary.updatedFundCount}/${summary.totalFundCount} 只已更新`
    : `${summary.totalFundCount} 只基金已更新`
})

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
      const memberIds = (overview.value?.members || []).map(member => member.member_id)
      if (!selectedContributionMemberId.value || !memberIds.includes(selectedContributionMemberId.value)) {
        selectedContributionMemberId.value = memberIds[0] || null
      }
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
const profitClass = value => ({ positive: Number(value || 0) > 0, negative: Number(value || 0) < 0, neutral: Number(value || 0) === 0 })
const displayMoney = value => amountsHidden.value ? '¥••••••' : `¥${formatNumber(value || 0)}`
const displaySignedMoney = value => {
  if (amountsHidden.value) return '¥••••'
  const amount = Number(value || 0)
  return `${amount >= 0 ? '+' : '-'}¥${formatNumber(Math.abs(amount))}`
}
const displayPercent = value => {
  const amount = Number(value || 0)
  return `${amount >= 0 ? '+' : ''}${amount.toFixed(2)}%`
}
const openPosition = item => item.positionId ? router.push(`/positions/${item.positionId}`) : router.push('/positions')
const openAccount = account => router.push({ path: '/positions', query: { account_id: account.accountId } })
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

const refreshHome = async () => {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await ensureFreshData({ force: true })
    showToast('首页数据已刷新')
  } finally {
    refreshing.value = false
  }
}

const handleLogout = async () => {
  try {
    await showConfirmDialog({
      title: '确认退出',
      message: '确定要退出登录吗？',
    })
    await authApi.logout()
  } catch (e) {
    return
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
  padding-bottom: calc(88px + env(safe-area-inset-bottom));
}

.header-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px 20px 18px;
  color: white;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.header-title { font-size: 14px; font-weight: 500; letter-spacing: .04em; opacity: .86; }
.header-actions { display: flex; gap: 7px; justify-content: flex-end; }
.header-actions button {
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.28);
  color: white;
  border-radius: 999px;
  min-width: 44px;
  height: 30px;
  padding: 0 9px;
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
}

.total-info {
  margin-top: 14px;
  text-align: left;
}

.total-info .amount {
  font-size: clamp(30px, 8vw, 38px);
  line-height: 1.12;
  font-weight: 700;
  letter-spacing: .015em;
  font-variant-numeric: tabular-nums;
}

.total-info .profit {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin-top: 10px;
  font-size: 14px;
  white-space: nowrap;
}
.total-info .profit-label { color: rgba(255,255,255,.72); font-size: 12px; }
.total-info .profit strong { font-size: 15px; font-variant-numeric: tabular-nums; }

.total-info .profit.positive {
  color: #f87171;
}

.total-info .profit.negative {
  color: #4ade80;
}

.total-info .rate {
  font-size: 12px;
  opacity: .9;
}
.profit-freshness { margin-left: auto; color: rgba(255,255,255,.86); font-size: 12px; font-weight: 500; }

.today-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
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
.today-value small { margin-left: 6px; font-size: 11px; font-weight: 600; color: inherit; }

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

.section-subtitle { margin-top: -6px; font-size: 12px; color: #94a3b8; }
.section-heading .section-subtitle { margin-top: 5px; line-height: 1.5; }
.section-more { border: 0; background: transparent; color: #2563eb; font-size: 13px; }
.contribution-member-tabs { display: flex; gap: 8px; margin: 12px -4px 4px; padding: 0 4px 8px; overflow-x: auto; scrollbar-width: none; }
.contribution-member-tabs::-webkit-scrollbar { display: none; }
.contribution-member-tabs button { flex-shrink: 0; border: 1px solid #e2e8f0; border-radius: 999px; background: #fff; color: #64748b; padding: 7px 12px; font-size: 12px; }
.contribution-member-tabs button.active { border-color: #6366f1; background: #eef2ff; color: #4f46e5; font-weight: 700; }
.contribution-empty { padding: 22px 0 10px; text-align: center; color: #94a3b8; font-size: 12px; }
.contribution-account-group + .contribution-account-group { margin-top: 14px; }
.contribution-account-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 0 7px; color: #334155; }
.contribution-account-head strong { font-size: 13px; }
.contribution-account-head span { font-size: 11px; color: #94a3b8; }
.contribution-item { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 0; border: 0; border-top: 1px solid #f1f5f9; background: transparent; text-align: left; }
.contribution-rank { flex-shrink: 0; padding: 3px 6px; border-radius: 5px; font-size: 10px; font-weight: 700; }
.contribution-rank.highest { color: #dc2626; background: #fef2f2; }
.contribution-rank.lowest { color: #15803d; background: #f0fdf4; }
.contribution-main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 5px; text-align: left; }
.contribution-main strong { max-width: 190px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #1f2937; font-size: 13px; }
.contribution-main span, .contribution-value span { color: #94a3b8; font-size: 11px; }
.contribution-value { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.positive { color: #ef4444 !important; }
.negative { color: #16a34a !important; }
.neutral { color: #64748b !important; }

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
.member-overview-label { margin-bottom: 4px; font-size: 10px; color: #94a3b8; }

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
.member-stats.four-metrics { display: grid; grid-template-columns: repeat(2, 1fr); row-gap: 14px; }

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
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.88);
  border-radius: 14px;
  border: 1px solid #edf2ff;
  text-align: left;
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
.account-holding-profit { margin-top: 5px; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; }

.account-side {
  text-align: right;
  flex-shrink: 0;
}
.account-daily-label { margin-bottom: 3px; font-size: 10px; color: #94a3b8; }

.account-profit,
.account-holding-rate {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  font-weight: 700;
}

.account-holding-rate {
  margin-top: 4px;
  font-size: 10px;
}

.account-profit.positive,
.account-holding-profit.positive,
.account-holding-rate.positive {
  color: #f87171;
}

.account-profit.negative,
.account-holding-profit.negative,
.account-holding-rate.negative {
  color: #4ade80;
}

.member-empty {
  font-size: 12px;
  color: #999;
  text-align: center;
  padding: 8px 0 2px;
}

.unassigned-callout { display: flex; align-items: center; justify-content: space-between; gap: 14px; background: #fff7ed; border: 1px solid #fed7aa; }
.unassigned-callout .section-title { margin-bottom: 8px; font-size: 14px; }
.unassigned-callout button { flex-shrink: 0; border: 0; border-radius: 9px; background: #f97316; color: white; padding: 9px 12px; font-weight: 600; }
.home-skeleton { position: fixed; inset: 0 0 calc(68px + env(safe-area-inset-bottom)); z-index: 30; padding: 18px 12px; background: #f5f5f5; }
.home-skeleton i, .skeleton-hero { display: block; border-radius: 12px; background: linear-gradient(90deg, #e9edf3 25%, #f7f9fc 50%, #e9edf3 75%); background-size: 200% 100%; animation: skeleton-wave 1.25s infinite; }
.skeleton-hero { height: 150px; }
.skeleton-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.skeleton-grid i { height: 76px; }
.skeleton-section { margin-top: 12px; padding: 16px; border-radius: 12px; background: white; }
.skeleton-section i { height: 48px; margin-bottom: 10px; }
@keyframes skeleton-wave { to { background-position: -200% 0; } }
@media (max-width: 360px) {
  .header-card { padding-left: 16px; padding-right: 16px; }
  .header-actions { gap: 4px; }
  .header-actions button { min-width: 40px; padding: 0 7px; }
  .contribution-main strong { max-width: 145px; }
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
