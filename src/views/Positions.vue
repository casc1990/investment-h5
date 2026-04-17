<template>
  <div class="positions-page">
    <!-- 筛选栏 -->
    <div class="filter-bar">
      <van-dropdown-menu>
        <van-dropdown-item v-model="selectedMemberId" title="全部成员" :options="memberOptions" @change="onMemberChange" />
        <van-dropdown-item v-model="selectedAccountId" title="全部账户" :options="filteredAccountOptions" @change="onAccountChange" />
      </van-dropdown-menu>
    </div>

    <!-- 顶部统计卡片 -->
    <div class="summary-card" v-if="summary">
      <div class="summary-asset">
        <div class="summary-label">总资产(元)</div>
        <div class="summary-amount">{{ formatAmount(summary.totalMarketValue) }}</div>
      </div>
      <div class="summary-profit-row">
        <div class="summary-profit-item">
          <div class="sp-label">昨日收益</div>
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
      </div>
    </div>

    <!-- 持仓列表 -->
    <div class="position-list">
      <!-- 表头 -->
      <div class="list-header">
        <span class="header-col header-name">名称</span>
        <span class="header-col header-center">金额/昨日收益</span>
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
        <div class="fund-collapsed" @click="toggleExpand(position.id)">
          <div class="collapsed-main">
            <span class="collapsed-name">{{ position.fund_name || '未知基金' }}</span>
            <span class="collapsed-tags">
              <span v-if="position.member_name" class="member-tag">{{ position.member_emoji }} {{ position.member_name }}</span>
              <span class="account-tag">{{ position.account_name }}</span>
            </span>
          </div>
          <div class="collapsed-data">
            <div class="collapsed-center">
              <span class="collapsed-value">¥{{ formatAmount(position.cost) }}</span>
              <span class="collapsed-yesterday" :class="{ positive: Number(position.yesterday_profit) >= 0, negative: Number(position.yesterday_profit) < 0 }">
                {{ Number(position.yesterday_profit) >= 0 ? '+' : '' }}{{ formatAmount(position.yesterday_profit) }}
              </span>
            </div>
            <div class="collapsed-right">
              <span class="collapsed-profit" :class="{ positive: Number(position.current_profit) >= 0, negative: Number(position.current_profit) < 0 }">
                {{ Number(position.current_profit) >= 0 ? '+' : '' }}{{ formatAmount(position.current_profit) }}
              </span>
              <span class="collapsed-rate" :class="{ positive: Number(position.profit_rate) >= 0, negative: Number(position.profit_rate) < 0 }">
                {{ Number(position.profit_rate) >= 0 ? '+' : '' }}{{ position.profit_rate }}%
              </span>
            </div>
          </div>
          <div class="collapsed-arrow">
            <van-icon :name="expandedIds.includes(position.id) ? 'arrow-up' : 'arrow-down'" />
          </div>
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
              <span class="data-label">持有金额</span>
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
                {{ Number(position.profit_rate) >= 0 ? '+' : '' }}{{ position.profit_rate }}%
              </span>
            </div>
            <div class="data-item">
              <span class="data-label">昨日收益</span>
              <span class="data-value profit" :class="{ positive: Number(position.yesterday_profit) >= 0, negative: Number(position.yesterday_profit) < 0 }">
                {{ Number(position.yesterday_profit) >= 0 ? '+' : '' }}{{ formatNumber(position.yesterday_profit) }}
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
            <van-button size="small" type="warning" @click.stop="handleSync(position)">同步净值</van-button>
            <van-button size="small" type="primary" @click.stop="handleEdit(position)">编辑</van-button>
            <van-button size="small" type="danger" @click.stop="handleDelete(position)">删除</van-button>
          </div>
        </div>
      </div>

      <van-empty v-if="!positions.length && !loading" description="暂无持仓，点击下方添加" />
    </div>

    <!-- 加载状态 -->
    <van-loading v-if="loading" type="spinner" class="loading" />

    <!-- 添加按钮 -->
    <div class="add-btn-wrapper">
      <van-button round type="primary" size="large" class="add-btn" @click="openAddModal">
        ➕ 添加持仓
      </van-button>
    </div>

    <!-- 添加/编辑持仓弹窗 -->
    <van-popup v-model:show="showAddModal" position="bottom" round>
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
              v-model.number="formData.amount"
              label="持有金额"
              type="number"
              placeholder="持有金额（成本）"
              :rules="[{ required: true, message: '请输入持有金额' }]"
            />
            <van-field
              v-model.number="formData.initialProfit"
              label="历史累计收益"
              type="number"
              placeholder="买入至今的累计收益"
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
    <van-popup v-model:show="showMemberPicker" position="bottom">
      <van-picker
        :columns="memberPickerOptions"
        @confirm="onMemberConfirm"
        @cancel="showMemberPicker = false"
      />
    </van-popup>

    <!-- 账户选择器 -->
    <van-popup v-model:show="showAccountPicker" position="bottom">
      <van-picker
        :columns="accountPickerOptions"
        @confirm="onAccountConfirm"
        @cancel="showAccountPicker = false"
      />
    </van-popup>

    <!-- 分红方式选择器 -->
    <van-popup v-model:show="showDividendPicker" position="bottom">
      <van-picker
        :columns="dividendOptions"
        @confirm="onDividendConfirm"
        @cancel="showDividendPicker = false"
      />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { showConfirmDialog, showToast, showSuccessToast } from 'vant'
import { positionApi, accountApi, memberApi, marketApi } from '../api'

const loading = ref(false)
const positions = ref([])
const expandedIds = ref([])
const summary = ref(null)
const accounts = ref([])
const members = ref([])
const selectedMemberId = ref(null)
const selectedAccountId = ref(null)
const showAddModal = ref(false)
const showMemberPicker = ref(false)
const showAccountPicker = ref(false)
const showDividendPicker = ref(false)
const editingPosition = ref(null)

const dividendOptions = [
  { text: '红利再投', value: '红利再投' },
  { text: '现金分红', value: '现金分红' },
]

const formData = ref({
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
})

// 成员选项（筛选栏）
const memberOptions = computed(() => [
  { text: '全部成员', value: null },
  ...members.value.map(m => ({ text: `${m.emoji || '👤'} ${m.name}`, value: m.id }))
])

// 筛选后的账户选项（受成员筛选影响）
const filteredAccountOptions = computed(() => {
  const filtered = selectedMemberId.value
    ? accounts.value.filter(a => a.member_id === selectedMemberId.value)
    : accounts.value
  return [
    { text: '全部账户', value: null },
    ...filtered.map(a => ({ text: a['账户名称'], value: a.id }))
  ]
})

// 成员选择器选项
const memberPickerOptions = computed(() =>
  members.value.map(m => ({ text: `${m.emoji || '👤'} ${m.name}`, value: m.id }))
)

// 账户选择器选项（受成员筛选影响）
const accountPickerOptions = computed(() => {
  const filtered = formData.value.memberId
    ? accounts.value.filter(a => a.member_id === formData.value.memberId)
    : accounts.value
  return filtered.map(a => ({ text: a['账户名称'], value: a.id }))
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

const updateSummary = () => {
  if (!positions.value.length) {
    summary.value = null
    return
  }
  let totalMarketValue = 0
  let totalYesterdayProfit = 0
  let totalHoldingProfit = 0

  positions.value.forEach(pos => {
    const cost = parseFloat(pos.cost) || 0
    const currentProfit = parseFloat(pos.current_profit) || 0
    const yesterdayProfit = parseFloat(pos.yesterday_profit) || 0
    totalMarketValue += cost + currentProfit  // 当前市值 = 成本 + 持有收益
    totalYesterdayProfit += yesterdayProfit
    totalHoldingProfit += currentProfit
  })

  const totalProfitRate = totalMarketValue > 0 ? (totalHoldingProfit / (totalMarketValue - totalHoldingProfit) * 100) : 0

  summary.value = {
    totalMarketValue: Number(totalMarketValue.toFixed(2)),
    totalYesterdayProfit: Number(totalYesterdayProfit.toFixed(2)),
    totalHoldingProfit: Number(totalHoldingProfit.toFixed(2)),
    totalProfitRate: Number(totalProfitRate.toFixed(2)),
  }
}

const fetchMembers = async () => {
  try {
    const data = await memberApi.list()
    members.value = data?.members || []
  } catch (error) {
    console.error('Failed to fetch members:', error)
  }
}

const fetchAccounts = async () => {
  try {
    const data = await accountApi.list()
    accounts.value = data?.accounts || []
  } catch (error) {
    console.error('Failed to fetch accounts:', error)
  }
}

const fetchPositions = async () => {
  loading.value = true
  try {
    const data = await positionApi.list({ member_id: selectedMemberId.value, account_id: selectedAccountId.value })
    positions.value = data?.positions || []
    updateSummary()
  } catch (error) {
    console.error('Failed to fetch positions:', error)
    showToast('加载失败')
  } finally {
    loading.value = false
  }
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
  if (formData.value.amount === null || formData.value.amount === '') {
    showToast('请输入持有金额')
    return
  }

  try {
    const payload = {
      accountId: formData.value.accountId,
      fundCode: formData.value.fundCode.trim(),
      fundName: formData.value.fundName.trim(),
      shares: parseFloat(formData.value.shares),
      amount: parseFloat(formData.value.amount),
      initialProfit: parseFloat(formData.value.initialProfit) || 0,
      dividendMethod: formData.value.dividendMethod,
    }
    
    if (editingPosition.value) {
      await positionApi.update(editingPosition.value.id, payload)
      showSuccessToast('更新成功')
    } else {
      await positionApi.create(payload)
      showSuccessToast('添加成功')
    }
    closeModal()
    fetchPositions()
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
    amount: position.cost,
    initialProfit: position.initial_profit || 0,
    dividendMethod: position.dividend_method || '红利再投',
  }
  // 设置成员信息
  if (position.member_id) {
    const member = members.value.find(m => m.id === position.member_id)
    if (member) {
      formData.value.memberName = `${member.emoji || '👤'} ${member.name}`
    }
  }
  showAddModal.value = true
}

const handleSync = async (position) => {
  try {
    await marketApi.syncFund(position.fund_code)
    showSuccessToast('同步成功')
    fetchPositions()
  } catch (error) {
    console.error('同步失败:', error)
    showToast('同步失败')
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

const handleDelete = async (position) => {
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: `确定要删除 "${position.fund_name}" 持仓吗？`,
    })
    await positionApi.delete(position.id)
    showSuccessToast('删除成功')
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
    amount: null,
    initialProfit: null,
    dividendMethod: '红利再投',
  }
}

onMounted(() => {
  fetchMembers()
  fetchAccounts()
  fetchPositions()
})
</script>

<style scoped>
.positions-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 80px;
}

.filter-bar {
  background: white;
  padding: 0 12px;
}

/* 顶部统计卡片 */
.summary-card {
  background: linear-gradient(135deg, #1E80FF 0%, #0066CC 100%);
  padding: 20px 20px 16px;
  color: white;
  margin: 0 12px;
  border-radius: 12px;
  margin-top: 12px;
}

.summary-asset {
  text-align: center;
  margin-bottom: 16px;
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
  font-size: 15px;
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
  padding: 0 12px 80px;
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
  cursor: pointer;
  user-select: none;
}

.fund-collapsed:active {
  background: #fafafa;
}

/* 左：基金名称 */
.collapsed-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
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

/* 中：持有金额 / 昨日收益 */
.collapsed-data {
  display: flex;
  align-items: flex-end;
  gap: 0;
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
}

.loading {
  display: block;
  margin: 40px auto;
}

.add-btn-wrapper {
  position: fixed;
  bottom: 70px;
  left: 12px;
  right: 12px;
}

.add-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
}

.modal-content {
  padding: 20px;
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
