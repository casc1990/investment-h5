<template>
  <div class="trades-page">
    <!-- 筛选栏 -->
    <div class="filter-bar">
      <van-dropdown-menu>
        <van-dropdown-item v-model="selectedAccount" :options="accountOptions" @change="fetchTrades" />
        <van-dropdown-item v-model="selectedType" :options="typeOptions" @change="fetchTrades" />
      </van-dropdown-menu>
    </div>

    <!-- 交易列表 -->
    <div class="trade-list">
      <div v-for="trade in trades" :key="trade.id" class="trade-card">
        <div class="trade-icon" :class="trade['交易类型'] === '买入' ? 'buy' : 'sell'">
          {{ trade['交易类型'] === '买入' ? '📥' : '📤' }}
        </div>
        <div class="trade-info">
          <div class="trade-title">
            <span class="fund-name">{{ getFundName(trade['基金代码']) }}</span>
            <span class="trade-type" :class="trade['交易类型'] === '买入' ? 'buy' : 'sell'">
              {{ trade['交易类型'] }}
            </span>
          </div>
          <div class="trade-meta">
            <span class="fund-code">{{ trade['基金代码'] }}</span>
            <span class="trade-date">{{ formatDate(trade['交易日期']) }}</span>
          </div>
        </div>
        <div class="trade-amount">
          <div class="amount">¥{{ formatNumber(trade['交易金额']) }}</div>
          <div class="quantity">{{ trade['交易数量'] }}份</div>
        </div>
      </div>

      <van-empty v-if="!trades.length && !loading" description="暂无交易记录" />
    </div>

    <!-- 加载状态 -->
    <van-loading v-if="loading" type="spinner" class="loading" />

    <!-- 浮动按钮 -->
    <div class="fab-wrapper">
      <van-button round type="primary" class="fab buy-fab" @click="openTradeModal('买入')">
        💵 买入
      </van-button>
      <van-button round type="default" class="fab sell-fab" @click="openTradeModal('卖出')">
        💰 卖出
      </van-button>
    </div>

    <!-- 交易弹窗 -->
    <van-popup v-model:show="showTradeModal" position="bottom" round>
      <div class="modal-content">
        <div class="modal-title">{{ tradeType === '买入' ? '📥 买入' : '📤 卖出' }}</div>
        
        <van-form @submit="handleTrade">
          <van-cell-group inset>
            <van-field
              v-model="formData.accountId"
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
              @blur="onFundCodeBlur"
              :rules="[{ required: true, message: '请输入基金代码' }]"
            />
            <van-field
              v-model="formData.fundName"
              label="基金名称"
              placeholder="自动填充"
              readonly
            />
            <van-field
              v-model.number="formData.amount"
              label="交易金额"
              type="number"
              placeholder="买入金额"
              @blur="calculateQuantity"
              v-if="tradeType === '买入'"
              :rules="[{ required: true, message: '请输入交易金额' }]"
            />
            <van-field
              v-model.number="formData.quantity"
              label="交易份额"
              type="number"
              placeholder="卖出的份额"
              v-if="tradeType === '卖出'"
              :rules="[{ required: true, message: '请输入交易份额' }]"
            />
            <van-field
              v-model.number="formData.fee"
              label="手续费"
              type="number"
              placeholder="手续费（选填）"
            />
            <van-field
              v-model="formData.tradeDate"
              label="交易日期"
              placeholder="选择日期"
              readonly
              @click="showDatePicker = true"
            />
          </van-cell-group>

          <!-- 费用估算 -->
          <div class="fee-estimate" v-if="formData.amount && tradeType === '买入'">
            <div class="estimate-row">
              <span>估算份额：</span>
              <span class="value">{{ estimatedQuantity }} 份</span>
            </div>
            <div class="estimate-row">
              <span>手续费：</span>
              <span class="value">约 ¥{{ estimatedFee }}</span>
            </div>
            <div class="estimate-row">
              <span>实付总额：</span>
              <span class="value total">¥{{ (parseFloat(formData.amount) + estimatedFee).toFixed(2) }}</span>
            </div>
          </div>

          <div class="modal-actions">
            <van-button round @click="closeModal">取消</van-button>
            <van-button round type="primary" native-type="submit">确认{{ tradeType }}</van-button>
          </div>
        </van-form>
      </div>
    </van-popup>

    <!-- 账户选择器 -->
    <van-popup v-model:show="showAccountPicker" position="bottom">
      <van-picker
        :columns="accountOptions"
        @confirm="onAccountConfirm"
        @cancel="showAccountPicker = false"
      />
    </van-popup>

    <!-- 日期选择器 -->
    <van-popup v-model:show="showDatePicker" position="bottom">
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
import { ref, onMounted, computed } from 'vue'
import { showToast, showSuccessToast } from 'vant'
import { tradeApi, accountApi, marketApi, positionApi } from '../api'

const loading = ref(false)
const trades = ref([])
const accounts = ref([])
const selectedAccount = ref(null)
const selectedType = ref(null)
const showTradeModal = ref(false)
const showAccountPicker = ref(false)
const showDatePicker = ref(false)
const tradeType = ref('买入')
const marketCache = ref({})
const positions = ref([])

const formData = ref({
  accountId: '',
  fundCode: '',
  fundName: '',
  amount: null,
  quantity: null,
  fee: null,
  tradeDate: new Date().toISOString().split('T')[0],
})

const currentDate = ref(['2026', '04', '09'])
const minDate = new Date(2020, 0, 1)

const typeOptions = [
  { text: '全部类型', value: null },
  { text: '买入', value: '买入' },
  { text: '卖出', value: '卖出' },
]

const accountOptions = computed(() => [
  { text: '全部账户', value: null },
  ...accounts.value.map(a => ({ text: a['账户名称'], value: a['账户名称'] })),
])

const estimatedQuantity = computed(() => {
  if (!formData.value.amount || !marketCache.value[formData.value.fundCode]) return '0.00'
  const nav = marketCache.value[formData.value.fundCode]?.nav || 1
  return ((formData.value.amount / nav) * 0.999).toFixed(2) // 扣除手续费约0.1%
})

const estimatedFee = computed(() => {
  if (!formData.value.amount) return '0.00'
  return (formData.value.amount * 0.001).toFixed(2) // 约0.1%手续费
})

const formatNumber = (num) => {
  return parseFloat(num || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const formatDate = (timestamp) => {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const getFundName = (fundCode) => {
  const pos = positions.value.find(p => p['基金代码'] === fundCode)
  return pos?.['基金名称'] || fundCode || '未知基金'
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
  try {
    const data = await positionApi.list()
    positions.value = data?.positions || []
  } catch (error) {
    console.error('Failed to fetch positions:', error)
  }
}

const fetchTrades = async () => {
  loading.value = true
  try {
    const params = {}
    if (selectedAccount.value) params.accountId = selectedAccount.value
    if (selectedType.value) params.tradeType = selectedType.value
    const data = await tradeApi.list(params)
    trades.value = data?.trades || []
  } catch (error) {
    console.error('Failed to fetch trades:', error)
    showToast('加载失败')
  } finally {
    loading.value = false
  }
}

const onFundCodeBlur = async () => {
  if (!formData.value.fundCode) return
  try {
    const market = await marketApi.get(formData.value.fundCode)
    if (market?.fundName) {
      formData.value.fundName = market.fundName
      marketCache.value[formData.value.fundCode] = market
    }
  } catch (error) {
    console.error('Failed to fetch fund info:', error)
  }
}

const calculateQuantity = () => {
  // 买入时金额转份额的估算会自动在 computed 中处理
}

const openTradeModal = (type) => {
  tradeType.value = type
  showTradeModal.value = true
}

const handleTrade = async () => {
  try {
    await tradeApi.create({
      accountId: formData.value.accountId,
      fundCode: formData.value.fundCode,
      tradeType: tradeType.value,
      quantity: formData.value.quantity || estimatedQuantity.value,
      amount: formData.value.amount,
      fee: formData.value.fee || estimatedFee.value,
      tradeDate: formData.value.tradeDate,
    })
    showSuccessToast(`${tradeType.value}成功`)
    closeModal()
    fetchTrades()
  } catch (error) {
    showToast(`${tradeType.value}失败`)
  }
}

const onAccountConfirm = ({ selectedOptions }) => {
  formData.value.accountId = selectedOptions[0].value
  showAccountPicker.value = false
}

const onDateConfirm = ({ selectedValues }) => {
  formData.value.tradeDate = selectedValues.join('-')
  showDatePicker.value = false
}

const closeModal = () => {
  showTradeModal.value = false
  formData.value = {
    accountId: '',
    fundCode: '',
    fundName: '',
    amount: null,
    quantity: null,
    fee: null,
    tradeDate: new Date().toISOString().split('T')[0],
  }
}

onMounted(() => {
  fetchAccounts()
  fetchPositions()
  fetchTrades()
})
</script>

<style scoped>
.trades-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 100px;
}

.filter-bar {
  background: white;
}

.trade-list {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trade-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.trade-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.trade-icon.buy {
  background: #e6f7ed;
}

.trade-icon.sell {
  background: #fff2e6;
}

.trade-info {
  flex: 1;
}

.trade-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fund-name {
  font-weight: 500;
  color: #333;
}

.trade-type {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.trade-type.buy {
  background: #e6f7ed;
  color: #07c160;
}

.trade-type.sell {
  background: #fff2e6;
  color: #ff6034;
}

.trade-meta {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.fund-code, .trade-date {
  font-size: 13px;
  color: #999;
  font-family: 'Courier New', monospace;
}

.trade-amount {
  text-align: right;
}

.trade-amount .amount {
  font-weight: 600;
  font-family: 'Courier New', monospace;
  color: #333;
}

.trade-amount .quantity {
  font-size: 13px;
  color: #999;
  margin-top: 2px;
}

.loading {
  display: block;
  margin: 40px auto;
}

.fab-wrapper {
  position: fixed;
  bottom: 70px;
  left: 12px;
  right: 12px;
  display: flex;
  gap: 12px;
}

.fab {
  flex: 1;
  height: 48px;
  font-size: 16px;
}

.buy-fab {
  background: linear-gradient(135deg, #07c160 0%, #04a750 100%);
  border: none;
}

.sell-fab {
  background: linear-gradient(135deg, #ff6034 0%, #ee0a24 100%);
  border: none;
  color: white;
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

.fee-estimate {
  margin: 16px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
}

.estimate-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 14px;
  color: #666;
}

.estimate-row .value {
  font-weight: 500;
  font-family: 'Courier New', monospace;
}

.estimate-row .value.total {
  color: #07c160;
  font-size: 16px;
}

.modal-actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
