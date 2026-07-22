<template>
  <div class="trades-page">
    <section class="trade-hero">
      <div class="eyebrow">交易中心</div>
      <h1>今天要做什么？</h1>
      <p>只保留真实发生的三类交易，录入后自动更新持仓。</p>
      <div class="scene-grid">
        <button v-for="type in CORE_TRADE_TYPES" :key="type" type="button" class="scene-card" :class="type" @click="openTradeModal(type)">
          <span class="scene-icon">{{ TRADE_CONFIGS[type].icon }}</span>
          <strong>{{ type }}</strong>
          <small>{{ TRADE_CONFIGS[type].shortHint }}</small>
        </button>
      </div>
    </section>

    <div class="filter-bar">
      <van-dropdown-menu>
        <van-dropdown-item v-model="selectedAccount" :options="accountFilterOptions" @change="fetchTrades" />
        <van-dropdown-item v-model="selectedType" :options="typeFilterOptions" @change="fetchTrades" />
      </van-dropdown-menu>
    </div>

    <div class="trade-list">
      <div class="list-heading"><strong>交易记录</strong><span>共 {{ trades.length }} 笔</span></div>
      <div v-for="trade in trades" :key="trade.id" class="trade-card">
        <div class="trade-icon" :class="tradeUi(trade.trade_type, trade.note).className">
          {{ tradeUi(trade.trade_type, trade.note).icon }}
        </div>

        <div class="trade-info">
          <div class="trade-title-row">
            <span class="fund-name">{{ getFundName(trade) }}</span>
            <span class="trade-type" :class="tradeUi(trade.trade_type, trade.note).className">{{ tradeDisplayType(trade) }}</span>
          </div>
          <div class="trade-meta">
            <span>{{ trade.account_name || '未命名账户' }}</span>
            <span>{{ trade.fund_code }}</span>
            <span>{{ formatDate(trade.trade_date) }}</span>
          </div>
          <div v-if="trade.note" class="trade-note">备注：{{ trade.note }}</div>
        </div>

        <div class="trade-side">
          <div class="side-amount">{{ formatTradeAmount(trade) }}</div>
          <div class="side-quantity">{{ formatTradeQuantity(trade) }}</div>
          <van-button size="mini" plain type="danger" class="delete-btn" @click="handleDeleteTrade(trade)">删除</van-button>
        </div>
      </div>

      <van-empty v-if="!trades.length && !loading" description="暂无交易记录" />
    </div>

    <van-loading v-if="loading" type="spinner" class="loading" />

    <van-popup
      v-model:show="showTradeModal"
      position="bottom"
      round
      teleport="body"
      safe-area-inset-bottom
      :z-index="11000"
      :overlay-style="{ zIndex: 10999 }"
      class="trade-editor-popup"
    >
      <div class="modal-content">
        <div class="modal-title">{{ currentTradeConfig.icon }} {{ currentTradeConfig.title }}</div>

        <van-form @submit="handleTrade">
          <div v-if="formData.tradeType === '买入'" class="buy-mode-switch">
            <button type="button" :class="{ active: formData.buyMode === 'new' }" @click="setBuyMode('new')">买入新基金</button>
            <button type="button" :class="{ active: formData.buyMode === 'existing' }" @click="setBuyMode('existing')">追加已有基金</button>
          </div>
          <van-cell-group inset>
            <van-field
              v-if="!isExistingBuy"
              :model-value="formData.tradeType"
              is-link
              readonly
              label="交易类型"
              placeholder="选择交易类型"
              @click="showTypePicker = true"
              :rules="[{ required: true, message: '请选择交易类型' }]"
            />
            <van-field
              :model-value="formData.memberName"
              is-link
              readonly
              label="成员"
              placeholder="选择成员"
              @click="showMemberPicker = true"
              :rules="[{ required: true, message: '请选择成员' }]"
            />
            <van-field
              :model-value="formData.accountName"
              is-link
              readonly
              label="账户"
              placeholder="选择账户"
              @click="openAccountPicker"
              :rules="[{ required: true, message: '请选择账户' }]"
            />
            <van-field
              v-if="isExistingBuy"
              :model-value="existingFundDisplay"
              label="已有基金"
              placeholder="请选择该账户下的基金"
              readonly
              is-link
              @click="openExistingFundPicker"
              :rules="[{ required: true, message: '请选择已有基金' }]"
            />
            <van-field
              v-else
              v-model="formData.fundCode"
              :label="isConversion ? '转出基金代码' : '基金代码'"
              placeholder="如：008163"
              @blur="onFundCodeBlur"
              :rules="[{ required: true, message: '请输入基金代码' }]"
            />
            <van-field
              v-if="!isExistingBuy"
              v-model="formData.fundName"
              :label="isConversion ? '转出基金名称' : '基金名称'"
              placeholder="自动填充，也可手填"
              :readonly="isExistingBuy"
            />
            <template v-if="isConversion">
              <van-field
                v-model="formData.targetFundCode"
                label="转入基金代码"
                placeholder="请输入转入基金代码"
                :rules="[{ required: true, message: '请输入转入基金代码' }]"
              />
              <van-field v-model="formData.targetFundName" label="转入基金名称" placeholder="选填" />
              <van-field
                v-model.number="formData.targetQuantity"
                label="转入份额"
                type="number"
                placeholder="请输入确认后的转入份额"
                :rules="[{ required: true, message: '请输入转入份额' }]"
              />
            </template>
            <van-field
              v-if="requiresQuantity"
              v-model.number="formData.quantity"
              :label="quantityLabel"
              type="number"
              :placeholder="quantityPlaceholder"
              :rules="[{ required: true, message: `请输入${quantityLabel}` }]"
            />
            <van-field
              v-if="showsAmountField"
              v-model.number="formData.amount"
              :label="amountLabel"
              type="number"
              :placeholder="amountPlaceholder"
              @blur="onAmountBlur"
              :rules="amountRequired ? [{ required: true, message: `请输入${amountLabel}` }] : []"
            />
            <van-field
              v-if="showsFeeField"
              v-model.number="formData.fee"
              label="手续费"
              type="number"
              placeholder="没有可填0"
            />
            <van-field
              v-model="formData.tradeDate"
              label="交易日期"
              placeholder="选择日期"
              readonly
              @click="showDatePicker = true"
            />
            <van-field
              v-model="formData.note"
              label="备注"
              type="textarea"
              rows="2"
              autosize
              placeholder="选填：如平台名称、原因说明、转仓备注"
            />
          </van-cell-group>

          <div v-if="recommendedFunds.length && !isNewBuy && !isExistingBuy" class="quick-fund-card">
            <div class="quick-fund-title">当前账户常用基金</div>
            <div class="quick-fund-list">
              <button
                v-for="fund in recommendedFunds"
                :key="fund.fundCode"
                type="button"
                class="quick-fund-chip"
                @click="applyQuickFund(fund)"
              >
                <span class="quick-fund-name">{{ fund.fundName }}</span>
                <span class="quick-fund-code">{{ fund.fundCode }}</span>
              </button>
            </div>
          </div>

          <div v-if="showBuyEstimate" class="estimate-card">
            <div class="estimate-row">
              <span>按当前净值估算份额</span>
              <span>{{ estimatedQuantity }} 份</span>
            </div>
            <div class="estimate-row">
              <span>默认手续费估算</span>
              <span>¥{{ estimatedFee }}</span>
            </div>
          </div>

          <div class="type-hint">{{ currentTypeHint }}</div>

          <div class="modal-actions">
            <van-button round @click="closeModal">取消</van-button>
            <van-button round type="primary" native-type="submit">确认{{ formData.tradeType }}</van-button>
          </div>
        </van-form>
      </div>
    </van-popup>

    <van-popup v-model:show="showAccountPicker" position="bottom" teleport="body" safe-area-inset-bottom :z-index="12000" :overlay-style="{ zIndex: 11999 }">
      <van-picker :columns="accountPickerOptions" @confirm="onAccountConfirm" @cancel="showAccountPicker = false" />
    </van-popup>

    <van-popup v-model:show="showMemberPicker" position="bottom" teleport="body" safe-area-inset-bottom :z-index="12000" :overlay-style="{ zIndex: 11999 }">
      <van-picker :columns="memberPickerOptions" @confirm="onMemberConfirm" @cancel="showMemberPicker = false" />
    </van-popup>

    <van-popup v-model:show="showExistingFundPicker" position="bottom" teleport="body" safe-area-inset-bottom :z-index="12000" :overlay-style="{ zIndex: 11999 }">
      <van-picker :columns="existingFundPickerOptions" @confirm="onExistingFundConfirm" @cancel="showExistingFundPicker = false" />
    </van-popup>

    <van-popup v-model:show="showTypePicker" position="bottom" teleport="body" safe-area-inset-bottom :z-index="12000" :overlay-style="{ zIndex: 11999 }">
      <van-picker :columns="tradeTypePickerOptions" @confirm="onTypeConfirm" @cancel="showTypePicker = false" />
    </van-popup>

    <van-popup v-model:show="showDatePicker" position="bottom" teleport="body" safe-area-inset-bottom :z-index="12000" :overlay-style="{ zIndex: 11999 }">
      <van-date-picker
        v-model="currentDate"
        :min-date="minDate"
        :max-date="new Date()"
        @confirm="onDateConfirm"
        @cancel="showDatePicker = false"
      />
    </van-popup>
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { accountApi, marketApi, memberApi, positionApi, tradeApi } from '../api'
import { formatAmount as formatNumber, formatDateLabel as formatDate, todayDateParts } from '../utils/formatters'
import { shouldRefreshPageData } from '../utils/perfHelpers'
import { buildTradeQuickFundOptions, resolveTradeDraft } from '../utils/tradeForm'

const route = useRoute()
const TRADE_DRAFT_STORAGE_KEY = 'investment-h5:trade-draft'

const TRADE_CONFIGS = {
  买入: { title: '买入', icon: '＋', className: 'buy', shortHint: '新增持仓', hint: '金额填买入成交金额，手续费单独填写；若不填份额，会按最新净值自动估算。' },
  卖出: { title: '卖出', icon: '－', className: 'sell', shortHint: '减少持仓', hint: '金额填卖出成交金额，系统会自动按移动平均成本减少持仓并累计已实现收益。' },
  转换: { title: '基金转换', icon: '⇄', className: 'convert', shortHint: '基金互转', hint: '填写转出和转入的确认份额，转换成本会在两只基金间平移，不计为一次卖出收益。' },
  现金分红: { title: '现金分红', icon: '💰', className: 'dividend', hint: '金额填实际到账分红，份额不变。' },
  红利再投: { title: '红利再投', icon: '🌱', className: 'reinvest', hint: '填写新增份额，金额可填本次红利金额用于留痕；系统会增加份额但不增加剩余持仓成本。' },
  转入: { title: '转入', icon: '↘️', className: 'transfer', hint: '用于跨账户转入或补录转仓，金额填转入后的成本。' },
  转出: { title: '转出', icon: '↗️', className: 'transfer', hint: '用于跨账户转出；若不填金额，系统会按当前平均成本自动扣减。' },
  手动校准: { title: '手动校准', icon: '🧮', className: 'calibration', hint: '当平台持仓与系统不一致时使用，直接把份额/成本校准到目标值。' },
}

const CORE_TRADE_TYPES = ['买入', '卖出', '转换']

const loading = ref(false)
const trades = ref([])
const accounts = ref([])
const members = ref([])
const positions = ref([])
const marketCache = ref({})
const selectedAccount = ref(null)
const selectedType = ref(null)
const showTradeModal = ref(false)
const showAccountPicker = ref(false)
const showMemberPicker = ref(false)
const showExistingFundPicker = ref(false)
const showTypePicker = ref(false)
const showDatePicker = ref(false)
const currentDate = ref(todayDateParts())
const minDate = new Date(2020, 0, 1)
const lastLoadedAt = ref(0)
const hasLoadedOnce = ref(false)

const formData = ref(createEmptyForm())

function readTradeDraftPreference() {
  try {
    return JSON.parse(localStorage.getItem(TRADE_DRAFT_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveTradeDraftPreference() {
  try {
    localStorage.setItem(TRADE_DRAFT_STORAGE_KEY, JSON.stringify({
      accountId: formData.value.accountId || '',
      memberId: formData.value.memberId || '',
      tradeType: formData.value.tradeType || '买入',
    }))
  } catch {
    // ignore localStorage errors
  }
}

function createEmptyForm() {
  return {
    tradeType: '买入',
    buyMode: 'new',
    memberId: '',
    memberName: '',
    accountId: '',
    accountName: '',
    fundCode: '',
    fundName: '',
    quantity: null,
    amount: null,
    fee: 0,
    tradeDate: new Date().toISOString().split('T')[0],
    note: '',
    targetFundCode: '',
    targetFundName: '',
    targetQuantity: null,
  }
}

const accountFilterOptions = computed(() => [
  { text: '全部账户', value: null },
  ...accounts.value.map(account => ({ text: getAccountName(account), value: getAccountId(account) })),
])

const typeFilterOptions = computed(() => [
  { text: '全部类型', value: null },
  { text: '买入', value: '买入' },
  { text: '卖出', value: '卖出' },
])

const memberPickerOptions = computed(() => members.value.map(member => ({
  text: `${member.emoji || '👤'} ${member.name}`,
  value: member.id,
})))

const accountPickerOptions = computed(() => accounts.value
  .filter(account => account.member_id === formData.value.memberId)
  .map(account => ({
  text: getAccountName(account),
  value: getAccountId(account),
})))

const existingFundPickerOptions = computed(() => positions.value
  .filter(position => position.account_id === formData.value.accountId && Number(position.shares ?? position.quantity ?? 0) > 0)
  .map(position => ({
    text: `${position.fund_name || position.fund_code} · ${position.fund_code}`,
    value: position.fund_code,
    fundName: position.fund_name || '',
  })))
const existingFundDisplay = computed(() => {
  if (!formData.value.fundCode) return ''
  const position = positions.value.find(item => item.account_id === formData.value.accountId && item.fund_code === formData.value.fundCode)
  return `${position?.fund_name || formData.value.fundName || formData.value.fundCode} · ${formData.value.fundCode}`
})

const tradeTypePickerOptions = computed(() => CORE_TRADE_TYPES.map(type => ({ text: type, value: type })))
const recommendedFunds = computed(() => buildTradeQuickFundOptions(positions.value, formData.value.accountId || selectedAccount.value || ''))

const currentTradeConfig = computed(() => TRADE_CONFIGS[formData.value.tradeType] || TRADE_CONFIGS.买入)
const isConversion = computed(() => formData.value.tradeType === '转换')
const isExistingBuy = computed(() => formData.value.tradeType === '买入' && formData.value.buyMode === 'existing')
const isNewBuy = computed(() => formData.value.tradeType === '买入' && formData.value.buyMode === 'new')
const currentTypeHint = computed(() => isExistingBuy.value
  ? '只需填写本次新增份额和手续费；买入成本按该基金最新净值自动计算，提交后更新原持仓。'
  : currentTradeConfig.value.hint)
const requiresQuantity = computed(() => ['买入', '卖出', '转换'].includes(formData.value.tradeType))
const showsAmountField = computed(() => ['买入', '卖出', '转换'].includes(formData.value.tradeType) && !isExistingBuy.value)
const showsFeeField = computed(() => ['买入', '卖出'].includes(formData.value.tradeType))
const amountRequired = computed(() => ['买入', '卖出', '转换'].includes(formData.value.tradeType) && !isExistingBuy.value)
const showBuyEstimate = computed(() => formData.value.tradeType === '买入' && formData.value.amount && formData.value.fundCode)

const quantityLabel = computed(() => {
  if (formData.value.tradeType === '手动校准') return '目标份额'
  if (formData.value.tradeType === '红利再投') return '新增份额'
  if (formData.value.tradeType === '转换') return '转出份额'
  if (isExistingBuy.value) return '买入份额'
  return '交易份额'
})

const quantityPlaceholder = computed(() => {
  if (isExistingBuy.value) return '请输入本次新增份额'
  switch (formData.value.tradeType) {
    case '买入': return '可不填，系统会按净值估算'
    case '卖出': return '请输入卖出份额'
    case '红利再投': return '请输入新增份额'
    case '转入': return '请输入转入份额'
    case '转出': return '请输入转出份额'
    case '转换': return '请输入确认后的转出份额'
    case '手动校准': return '请输入校准后的总份额'
    default: return '请输入份额'
  }
})

const amountLabel = computed(() => {
  switch (formData.value.tradeType) {
    case '买入': return '买入金额'
    case '卖出': return '卖出金额'
    case '现金分红': return '分红金额'
    case '红利再投': return '红利金额'
    case '转入': return '转入成本'
    case '转出': return '转出成本'
    case '手动校准': return '目标成本'
    case '转换': return '转换成本'
    default: return '金额'
  }
})

const amountPlaceholder = computed(() => {
  switch (formData.value.tradeType) {
    case '红利再投': return '选填：本次红利金额'
    case '转出': return '选填：不填则按平均成本自动扣减'
    case '手动校准': return '请输入校准后的总成本'
    case '转换': return '请输入转出份额对应的持仓成本'
    default: return `请输入${amountLabel.value}`
  }
})

const estimatedQuantity = computed(() => {
  if (!formData.value.amount || !formData.value.fundCode) return '0.00'
  const nav = marketCache.value[formData.value.fundCode]?.nav || marketCache.value[formData.value.fundCode]?.confirmed_nav
  if (!nav) return '0.00'
  return (Number(formData.value.amount) / Number(nav)).toFixed(2)
})

const estimatedFee = computed(() => {
  if (!formData.value.amount) return '0.00'
  return (Number(formData.value.amount) * 0.001).toFixed(2)
})

function getAccountId(account) {
  return account?.id || ''
}

function getAccountName(account) {
  return account?.name || account?.account_name || account?.['账户名称'] || ''
}

function applyMemberForAccount(accountId) {
  const account = accounts.value.find(item => getAccountId(item) === accountId)
  const member = members.value.find(item => item.id === account?.member_id)
  formData.value.memberId = member?.id || ''
  formData.value.memberName = member ? `${member.emoji || '👤'} ${member.name}` : ''
}

function tradeUi(type, note = '') {
  if ((type === '转入' || type === '转出') && note.startsWith('[转换:')) return TRADE_CONFIGS.转换
  return TRADE_CONFIGS[type] || { icon: '📝', className: 'default', title: type, hint: '' }
}

function tradeDisplayType(trade) {
  if ((trade.trade_type === '转入' || trade.trade_type === '转出') && trade.note?.startsWith('[转换:')) {
    return trade.trade_type === '转出' ? '转换·转出' : '转换·转入'
  }
  return trade.trade_type
}

function getFundName(trade) {
  if (trade?.fund_name) return trade.fund_name
  const position = positions.value.find(item => item.account_id === trade?.account_id && item.fund_code === trade?.fund_code)
  return position?.fund_name || trade?.fund_code || '未知基金'
}

function formatTradeAmount(trade) {
  if (trade.trade_type === '手动校准') {
    return `成本 ¥${formatNumber(trade.target_cost ?? trade.amount ?? 0)}`
  }
  return `¥${formatNumber(trade.amount || 0)}`
}

function formatTradeQuantity(trade) {
  if (trade.trade_type === '现金分红') return '份额不变'
  if (trade.trade_type === '手动校准') return `目标 ${formatNumber(trade.target_quantity ?? trade.quantity ?? 0)}份`
  return `${formatNumber(trade.quantity || 0)}份`
}

async function fetchAccounts() {
  try {
    const data = await accountApi.list()
    accounts.value = data?.accounts || []
    const preferredDraft = readTradeDraftPreference()
    const defaults = resolveTradeDraft({
      accounts: accounts.value,
      preferredAccountId: preferredDraft.accountId,
      preferredTradeType: preferredDraft.tradeType,
      routeType: route.query.type,
    })
    if (!selectedAccount.value && defaults.accountId) {
      selectedAccount.value = defaults.accountId
    }
    if (!formData.value.accountId && defaults.accountId) {
      formData.value.accountId = defaults.accountId
      formData.value.accountName = defaults.accountName
      applyMemberForAccount(defaults.accountId)
    }
    if (!formData.value.tradeType || formData.value.tradeType === '买入') {
      formData.value.tradeType = defaults.tradeType
    }
  } catch (error) {
    console.error('Failed to fetch accounts:', error)
  }
}

async function fetchMembers() {
  try {
    const data = await memberApi.list()
    members.value = data?.members || []
    if (formData.value.accountId) applyMemberForAccount(formData.value.accountId)
  } catch (error) {
    console.error('Failed to fetch members:', error)
  }
}

async function fetchPositions() {
  try {
    const data = await positionApi.list()
    positions.value = data?.positions || []
  } catch (error) {
    console.error('Failed to fetch positions:', error)
  }
}

async function fetchTrades() {
  loading.value = true
  try {
    const params = {}
    if (selectedAccount.value) params.account_id = selectedAccount.value
    if (selectedType.value) params.trade_type = selectedType.value
    const data = await tradeApi.list(params)
    trades.value = data?.trades || []
  } catch (error) {
    console.error('Failed to fetch trades:', error)
    showToast('加载失败')
  } finally {
    loading.value = false
  }
}

async function ensureFreshData({ force = false } = {}) {
  if (!shouldRefreshPageData({ hasData: hasLoadedOnce.value, lastLoadedAt: lastLoadedAt.value, force })) {
    return
  }
  await Promise.all([fetchMembers(), fetchAccounts(), fetchPositions(), fetchTrades()])
  if (formData.value.accountId) applyMemberForAccount(formData.value.accountId)
  hasLoadedOnce.value = true
  lastLoadedAt.value = Date.now()
}

async function onFundCodeBlur() {
  const fundCode = (formData.value.fundCode || '').trim()
  if (!fundCode) return

  const matchedPosition = positions.value.find(item => item.account_id === formData.value.accountId && item.fund_code === fundCode)
  if (matchedPosition?.fund_name && !formData.value.fundName) {
    formData.value.fundName = matchedPosition.fund_name
  }

  try {
    const market = await marketApi.get(fundCode)
    const fundName = market?.fund_name || market?.fundName || ''
    if (fundName) {
      formData.value.fundName = fundName
      marketCache.value[fundCode] = market
    }
  } catch (error) {
    console.error('Failed to fetch fund info:', error)
  }
}

function onAmountBlur() {
  if (formData.value.tradeType === '买入' && (!formData.value.quantity || Number(formData.value.quantity) <= 0) && Number(estimatedQuantity.value) > 0) {
    formData.value.quantity = Number(estimatedQuantity.value)
  }
  if (['买入', '卖出'].includes(formData.value.tradeType) && (!formData.value.fee || Number(formData.value.fee) === 0) && Number(estimatedFee.value) > 0) {
    formData.value.fee = Number(estimatedFee.value)
  }
}

function openTradeModal(type = '买入') {
  const preferredDraft = readTradeDraftPreference()
  const defaults = resolveTradeDraft({
    accounts: accounts.value,
    preferredAccountId: formData.value.accountId || preferredDraft.accountId,
    preferredTradeType: type || formData.value.tradeType || preferredDraft.tradeType,
  })
  formData.value.tradeType = type
  if (!formData.value.accountId && defaults.accountId) {
    formData.value.accountId = defaults.accountId
    formData.value.accountName = defaults.accountName
  }
  if (formData.value.accountId) applyMemberForAccount(formData.value.accountId)
  currentDate.value = todayDateParts(new Date(formData.value.tradeDate || Date.now()))
  showTradeModal.value = true
}

function setBuyMode(mode) {
  if (formData.value.buyMode === mode) return
  formData.value.buyMode = mode
  formData.value.fundCode = ''
  formData.value.fundName = ''
  formData.value.quantity = null
  formData.value.amount = null
}

function applyQuickFund(fund) {
  formData.value.fundCode = fund.fundCode
  formData.value.fundName = fund.fundName
  onFundCodeBlur()
}

async function handleTrade() {
  if (!formData.value.memberId) {
    showToast('请选择成员')
    return
  }
  if (!formData.value.accountId) {
    showToast('请选择账户')
    return
  }
  if (!formData.value.fundCode?.trim()) {
    showToast('请输入基金代码')
    return
  }
  if (requiresQuantity.value && (formData.value.quantity === null || formData.value.quantity === '')) {
    showToast(`请输入${quantityLabel.value}`)
    return
  }
  if (amountRequired.value && (formData.value.amount === null || formData.value.amount === '')) {
    showToast(`请输入${amountLabel.value}`)
    return
  }
  if (isConversion.value) {
    if (!formData.value.targetFundCode?.trim() || !formData.value.targetQuantity) {
      showToast('请填写转入基金和转入份额')
      return
    }
    if (formData.value.targetFundCode.trim() === formData.value.fundCode.trim()) {
      showToast('转出和转入基金不能相同')
      return
    }
  }

  try {
    if (isConversion.value) {
      await tradeApi.convert({
        accountId: formData.value.accountId,
        fromFundCode: formData.value.fundCode.trim(),
        fromFundName: formData.value.fundName?.trim(),
        fromQuantity: Number(formData.value.quantity),
        toFundCode: formData.value.targetFundCode.trim(),
        toFundName: formData.value.targetFundName?.trim(),
        toQuantity: Number(formData.value.targetQuantity),
        amount: Number(formData.value.amount),
        tradeDate: formData.value.tradeDate,
        note: formData.value.note?.trim(),
      })
      saveTradeDraftPreference()
      showToast('转换成功')
      closeModal()
      await Promise.all([fetchTrades(), fetchPositions()])
      return
    }
    let resolvedAmount = Number(formData.value.amount || 0)
    if (isExistingBuy.value) {
      const position = positions.value.find(item => item.account_id === formData.value.accountId && item.fund_code === formData.value.fundCode)
      let nav = Number(position?.nav_dwjz || position?.nav_gsz || 0)
      if (nav <= 0) {
        const market = await marketApi.get(formData.value.fundCode.trim())
        nav = Number(market?.confirmed_nav || market?.nav || 0)
      }
      if (nav <= 0) throw new Error('该基金暂无可用净值，暂时无法计算买入成本')
      resolvedAmount = Number((Number(formData.value.quantity) * nav).toFixed(4))
    }
    const payload = {
      accountId: formData.value.accountId,
      account_id: formData.value.accountId,
      fundCode: formData.value.fundCode.trim(),
      fund_code: formData.value.fundCode.trim(),
      fundName: formData.value.fundName?.trim(),
      fund_name: formData.value.fundName?.trim(),
      tradeType: formData.value.tradeType,
      trade_type: formData.value.tradeType,
      quantity: requiresQuantity.value ? Number(formData.value.quantity || 0) : null,
      amount: formData.value.tradeType === '买入' ? resolvedAmount : (showsAmountField.value ? Number(formData.value.amount || 0) : null),
      fee: showsFeeField.value ? Number(formData.value.fee || 0) : 0,
      tradeDate: formData.value.tradeDate,
      trade_date: formData.value.tradeDate,
      note: formData.value.note?.trim(),
      targetQuantity: formData.value.tradeType === '手动校准' ? Number(formData.value.quantity || 0) : null,
      targetCost: formData.value.tradeType === '手动校准' ? Number(formData.value.amount || 0) : null,
    }

    await tradeApi.create(payload)
    saveTradeDraftPreference()
    showToast(`${formData.value.tradeType}成功`)
    closeModal()
    await Promise.all([fetchTrades(), fetchPositions()])
  } catch (error) {
    console.error('Trade submit failed:', error)
    const message = error?.response?.data?.message || error?.message || `${formData.value.tradeType}失败`
    showToast(message)
  }
}

async function handleDeleteTrade(trade) {
  try {
    await showConfirmDialog({
      title: '删除交易',
      message: `确定删除 ${getFundName(trade)} 的“${trade.trade_type}”记录吗？`,
    })
    await tradeApi.delete(trade.id)
    showToast('删除成功')
    await Promise.all([fetchTrades(), fetchPositions()])
  } catch (error) {
    if (error !== 'cancel') {
      const message = error?.response?.data?.message || '删除失败'
      showToast(message)
    }
  }
}

function onAccountConfirm({ selectedOptions }) {
  formData.value.accountId = selectedOptions[0].value
  formData.value.accountName = selectedOptions[0].text
  formData.value.fundCode = ''
  formData.value.fundName = ''
  saveTradeDraftPreference()
  showAccountPicker.value = false
}

function openAccountPicker() {
  if (!formData.value.memberId) {
    showToast('请先选择成员')
    return
  }
  if (!accountPickerOptions.value.length) {
    showToast('该成员名下暂无账户')
    return
  }
  showAccountPicker.value = true
}

function openExistingFundPicker() {
  if (!formData.value.accountId) {
    showToast('请先选择成员和账户')
    return
  }
  if (!existingFundPickerOptions.value.length) {
    showToast('该账户下暂无可追加的基金')
    return
  }
  showExistingFundPicker.value = true
}

function onMemberConfirm({ selectedOptions }) {
  const selected = selectedOptions[0]
  formData.value.memberId = selected.value
  formData.value.memberName = selected.text
  formData.value.accountId = ''
  formData.value.accountName = ''
  formData.value.fundCode = ''
  formData.value.fundName = ''
  showMemberPicker.value = false
  if (!accountPickerOptions.value.length) showToast('该成员名下暂无账户')
}

function onExistingFundConfirm({ selectedOptions }) {
  const selected = selectedOptions[0]
  const position = positions.value.find(item => item.account_id === formData.value.accountId && item.fund_code === selected.value)
  formData.value.fundCode = selected.value
  formData.value.fundName = position?.fund_name || selected.fundName || selected.text.split(' · ')[0]
  showExistingFundPicker.value = false
  onFundCodeBlur()
}

function onTypeConfirm({ selectedOptions }) {
  formData.value.tradeType = selectedOptions[0].value
  saveTradeDraftPreference()
  showTypePicker.value = false
}

function onDateConfirm({ selectedValues }) {
  formData.value.tradeDate = selectedValues.join('-')
  currentDate.value = selectedValues
  showDatePicker.value = false
}

function syncTradeTypeFromRoute() {
  const preferredDraft = readTradeDraftPreference()
  const defaults = resolveTradeDraft({
    accounts: accounts.value,
    preferredAccountId: preferredDraft.accountId,
    preferredTradeType: preferredDraft.tradeType,
    routeType: route.query.type,
  })
  formData.value.tradeType = defaults.tradeType
  if (!formData.value.accountId && defaults.accountId) {
    formData.value.accountId = defaults.accountId
    formData.value.accountName = defaults.accountName
  }
}

function closeModal() {
  showTradeModal.value = false
  const preferredDraft = readTradeDraftPreference()
  const defaults = resolveTradeDraft({
    accounts: accounts.value,
    preferredAccountId: preferredDraft.accountId,
    preferredTradeType: preferredDraft.tradeType,
    routeType: route.query.type,
  })
  formData.value = {
    ...createEmptyForm(),
    tradeType: defaults.tradeType,
    accountId: defaults.accountId,
    accountName: defaults.accountName,
  }
  if (formData.value.accountId) applyMemberForAccount(formData.value.accountId)
  currentDate.value = todayDateParts()
}

onMounted(async () => {
  syncTradeTypeFromRoute()
  await ensureFreshData({ force: true })
})

onActivated(() => {
  ensureFreshData()
})

watch(() => route.query.type, () => {
  syncTradeTypeFromRoute()
})
</script>

<style scoped>
.trades-page {
  min-height: 100vh;
  background: #f4f7fb;
  padding-bottom: calc(84px + env(safe-area-inset-bottom));
}

.trade-hero {
  margin: 12px;
  padding: 18px;
  color: #fff;
  border-radius: 20px;
  background: linear-gradient(135deg, #1e80ff 0%, #0969da 100%);
  box-shadow: 0 14px 34px rgba(30, 128, 255, .22);
}

.eyebrow { font-size: 11px; letter-spacing: 2px; color: #dbeafe; }
.trade-hero h1 { margin: 5px 0 3px; font-size: 22px; }
.trade-hero p { margin: 0; color: #cbd5e1; font-size: 12px; }

.scene-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 16px;
}

.scene-card {
  display: grid;
  justify-items: start;
  gap: 3px;
  min-width: 0;
  padding: 12px 10px;
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 13px;
  background: rgba(255, 255, 255, .09);
  color: #fff;
  text-align: left;
}

.scene-card:active { transform: scale(.97); background: rgba(255, 255, 255, .16); }
.scene-icon { font-size: 20px; line-height: 1; color: #dbeafe; }
.scene-card strong { font-size: 14px; }
.scene-card small { color: #cbd5e1; font-size: 10px; }

.list-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 2px 0;
  color: #0f172a;
}
.list-heading span { color: #94a3b8; font-size: 12px; }

.filter-bar {
  margin: 0 12px 10px;
  overflow: hidden;
  background: white;
  border-radius: 12px;
}

.quick-type-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 10px 12px 2px;
}

.quick-type-chip,
.quick-fund-chip {
  border: none;
  background: white;
  color: #334155;
  border-radius: 999px;
  padding: 9px 12px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
}

.quick-type-chip {
  font-size: 13px;
}

.tips-card {
  margin: 12px;
  background: linear-gradient(135deg, #eef7ff, #f7fbff);
  border-radius: 12px;
  padding: 12px 14px;
  color: #334155;
}

.tips-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.tips-text {
  font-size: 12px;
  line-height: 1.5;
}

.trade-list {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trade-card {
  background: white;
  border-radius: 13px;
  padding: 12px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.trade-icon {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.trade-icon.buy,
.trade-type.buy {
  background: #e8f7ee;
  color: #16a34a;
}

.trade-icon.sell,
.trade-type.sell {
  background: #fff1f2;
  color: #ef4444;
}

.trade-icon.dividend,
.trade-type.dividend {
  background: #fff7e6;
  color: #d97706;
}

.trade-icon.reinvest,
.trade-type.reinvest {
  background: #eef2ff;
  color: #4f46e5;
}

.trade-icon.transfer,
.trade-type.transfer {
  background: #ecfeff;
  color: #0891b2;
}

.trade-icon.calibration,
.trade-type.calibration {
  background: #f3e8ff;
  color: #9333ea;
}

.trade-icon.convert,
.trade-type.convert {
  background: #ecfeff;
  color: #0e7490;
}

.trade-icon.default,
.trade-type.default {
  background: #f3f4f6;
  color: #475569;
}

.trade-info {
  flex: 1;
  min-width: 0;
}

.trade-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.fund-name {
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}

.trade-type {
  font-size: 12px;
  border-radius: 999px;
  padding: 2px 8px;
}

.trade-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
}

.trade-note {
  margin-top: 6px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
}

.trade-side {
  min-width: 96px;
  text-align: right;
}

.side-amount {
  color: #111827;
  font-weight: 600;
  font-size: 14px;
}

.side-quantity {
  margin-top: 4px;
  color: #6b7280;
  font-size: 12px;
}

.delete-btn {
  margin-top: 8px;
}

.loading {
  text-align: center;
  margin-top: 32px;
}

.fab-wrapper {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: var(--app-floating-bottom);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  z-index: 20;
}

.fab {
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
}

.modal-content {
  max-height: min(90vh, 760px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 0 calc(28px + env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}

.trade-editor-popup {
  max-height: 92vh;
  overflow: hidden;
}

.buy-mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: 0 16px 12px;
  padding: 4px;
  border-radius: 12px;
  background: #eff6ff;
}

.buy-mode-switch button {
  border: 0;
  border-radius: 9px;
  padding: 10px 8px;
  background: transparent;
  color: #64748b;
  font-size: 13px;
}

.buy-mode-switch button.active {
  background: #fff;
  color: #1677ff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(30, 128, 255, .12);
}

.modal-title {
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
}

.estimate-card {
  margin: 14px 16px 0;
  padding: 12px;
  border-radius: 12px;
  background: #f8fafc;
}

.quick-fund-card {
  margin: 14px 16px 0;
  padding: 12px;
  border-radius: 12px;
  background: #f8fbff;
}

.quick-fund-title {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 10px;
}

.quick-fund-list {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.quick-fund-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 96px;
}

.quick-fund-name {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}

.quick-fund-code {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}

.estimate-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #475569;
  line-height: 1.8;
}

.type-hint {
  margin: 12px 16px 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  gap: 12px;
  padding: 18px 16px 0;
}

.modal-actions .van-button {
  flex: 1;
}
</style>
