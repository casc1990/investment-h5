<template>
  <div class="positions-page">
    <!-- 账户筛选 -->
    <div class="filter-bar">
      <van-dropdown-menu>
        <van-dropdown-item v-model="selectedAccountId" :options="accountOptions" @change="fetchPositions" />
      </van-dropdown-menu>
    </div>

    <!-- 持仓列表 -->
    <div class="position-list">
      <div v-for="position in positions" :key="position.id" class="position-card">
        <!-- 基金信息头部 -->
        <div class="fund-header">
          <div class="fund-basic">
            <div class="fund-name">{{ position['基金名称'] || '未知基金' }}</div>
            <div class="fund-code">{{ position['基金代码'] }}</div>
          </div>
          <div class="fund-profit" :class="{ positive: getProfit(position) >= 0, negative: getProfit(position) < 0 }">
            <div class="profit-amount">
              {{ getProfit(position) >= 0 ? '+' : '' }}{{ formatNumber(getProfit(position)) }}
            </div>
            <div class="profit-rate">
              {{ getProfitRate(position) >= 0 ? '+' : '' }}{{ getProfitRate(position) }}%
            </div>
          </div>
        </div>

        <!-- 核心数据 -->
        <div class="fund-data-grid">
          <div class="data-item">
            <span class="data-label">持有份额</span>
            <span class="data-value">{{ formatNumber(position['持有份额']) }} 份</span>
          </div>
          <div class="data-item">
            <span class="data-label">昨日净值</span>
            <span class="data-value">{{ formatNav(position['昨日净值']) }}</span>
          </div>
          <div class="data-item">
            <span class="data-label">累计净值</span>
            <span class="data-value">{{ formatNav(position['累计净值']) }}</span>
          </div>
          <div class="data-item">
            <span class="data-label">单位净值</span>
            <span class="data-value">{{ formatNav(position['单位净值']) }}</span>
          </div>
        </div>

        <!-- 收益数据 -->
        <div class="profit-data-grid">
          <div class="data-item">
            <span class="data-label">日涨跌幅</span>
            <span class="data-value" :class="{ positive: getDailyChange(position) >= 0, negative: getDailyChange(position) < 0 }">
              {{ getDailyChange(position) >= 0 ? '+' : '' }}{{ getDailyChange(position) }}%
            </span>
          </div>
          <div class="data-item">
            <span class="data-label">当日市值</span>
            <span class="data-value">¥{{ formatNumber(getMarketValue(position)) }}</span>
          </div>
          <div class="data-item">
            <span class="data-label">持有收益率</span>
            <span class="data-value" :class="{ positive: getProfitRate(position) >= 0, negative: getProfitRate(position) < 0 }">
              {{ getProfitRate(position) >= 0 ? '+' : '' }}{{ getProfitRate(position) }}%
            </span>
          </div>
          <div class="data-item">
            <span class="data-label">持仓成本价</span>
            <span class="data-value">¥{{ formatNav(position['成本价']) }}</span>
          </div>
        </div>

        <!-- 分红方式 -->
        <div class="dividend-info" v-if="position['分红方式']">
          <span class="dividend-label">分红方式：</span>
          <span class="dividend-value">{{ position['分红方式'] }}</span>
        </div>

        <!-- 操作按钮 -->
        <div class="position-actions">
          <van-button size="small" type="primary" @click="handleEdit(position)">编辑</van-button>
          <van-button size="small" type="danger" @click="handleDelete(position)">删除</van-button>
        </div>
      </div>

      <van-empty v-if="!positions.length && !loading" description="暂无持仓，点击下方添加" />
    </div>

    <!-- 加载状态 -->
    <van-loading v-if="loading" type="spinner" class="loading" />

    <!-- 添加按钮 -->
    <div class="add-btn-wrapper">
      <van-button round type="primary" size="large" class="add-btn" @click="showAddModal = true">
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
              v-model="formData.accountName"
              is-link
              readonly
              label="所属账户"
              placeholder="选择账户"
              @click="showAccountPicker = true"
              :rules="[{ required: true, message: '请选择所属账户' }]"
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
              placeholder="持有金额"
              :rules="[{ required: true, message: '请输入持有金额' }]"
            />
            <van-field
              v-model.number="formData.currentProfit"
              label="当前收益"
              type="number"
              placeholder="当前收益金额"
              :rules="[{ required: true, message: '请输入当前收益' }]"
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

    <!-- 账户选择器 -->
    <van-popup v-model:show="showAccountPicker" position="bottom">
      <van-picker
        :columns="accountOptions"
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
import { ref, onMounted } from 'vue'
import { showConfirmDialog, showToast, showSuccessToast } from 'vant'
import { positionApi, accountApi } from '../api'

const loading = ref(false)
const positions = ref([])
const accounts = ref([])
const selectedAccountId = ref(null)
const showAddModal = ref(false)
const showAccountPicker = ref(false)
const showDividendPicker = ref(false)
const editingPosition = ref(null)

const dividendOptions = [
  { text: '红利再投', value: '红利再投' },
  { text: '现金分红', value: '现金分红' },
]

const formData = ref({
  accountName: '',
  accountId: '',
  fundCode: '',
  fundName: '',
  shares: null,
  amount: null,
  currentProfit: null,
  dividendMethod: '',
})

const accountOptions = computed(() => [
  { text: '全部账户', value: null },
  ...accounts.value.map(a => ({ text: a['账户名称'], value: a.id, channel: a['渠道'] })),
])

const formatNumber = (num) => {
  return parseFloat(num || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const formatNav = (num) => {
  return parseFloat(num || 0).toFixed(4)
}

const getMarketValue = (position) => {
  const shares = parseFloat(position['持有份额']) || 0
  const nav = parseFloat(position['单位净值']) || 0
  return shares * nav
}

const getDailyChange = (position) => {
  const yesterdayNav = parseFloat(position['昨日净值']) || 0
  const currentNav = parseFloat(position['单位净值']) || 0
  if (yesterdayNav === 0) return '0.00'
  return ((currentNav - yesterdayNav) / yesterdayNav * 100).toFixed(2)
}

const getCostPrice = (position) => {
  return parseFloat(position['成本价']) || parseFloat(position['买入净值']) || 0
}

const getProfit = (position) => {
  const shares = parseFloat(position['持有份额']) || 0
  const currentNav = parseFloat(position['单位净值']) || 0
  const costPrice = getCostPrice(position)
  if (costPrice === 0) return 0
  return (currentNav - costPrice) * shares
}

const getProfitRate = (position) => {
  const costPrice = getCostPrice(position)
  const currentNav = parseFloat(position['单位净值']) || 0
  if (costPrice === 0) return '0.00'
  return ((currentNav - costPrice) / costPrice * 100).toFixed(2)
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
    const data = await positionApi.list()
    positions.value = data?.positions || []
  } catch (error) {
    console.error('Failed to fetch positions:', error)
    showToast('加载失败')
  } finally {
    loading.value = false
  }
}

const handleSubmit = async () => {
  try {
    const payload = {
      accountId: formData.value.accountId,
      fundCode: formData.value.fundCode,
      fundName: formData.value.fundName,
      shares: formData.value.shares,
      amount: formData.value.amount,
      currentProfit: formData.value.currentProfit,
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
    showToast(editingPosition.value ? '更新失败' : '添加失败')
  }
}

const handleEdit = (position) => {
  editingPosition.value = position
  formData.value = {
    accountName: position['所属账户'] || position['账户'],
    accountId: position['账户ID'] || position['accountId'],
    fundCode: position['基金代码'],
    fundName: position['基金名称'],
    shares: position['持有份额'],
    amount: position['持有金额'],
    currentProfit: position['当前收益'],
    dividendMethod: position['分红方式'] || '红利再投',
  }
  showAddModal.value = true
}

const handleDelete = async (position) => {
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: `确定要删除 "${position['基金名称']}" 持仓吗？`,
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

const onAccountConfirm = ({ selectedOptions }) => {
  formData.value.accountName = selectedOptions[0].text
  formData.value.accountId = selectedOptions[0].value
  showAccountPicker.value = false
}

const onDividendConfirm = ({ selectedOptions }) => {
  formData.value.dividendMethod = selectedOptions[0].value
  showDividendPicker.value = false
}

const closeModal = () => {
  showAddModal.value = false
  editingPosition.value = null
  formData.value = {
    accountName: '',
    accountId: '',
    fundCode: '',
    fundName: '',
    shares: null,
    amount: null,
    currentProfit: null,
    dividendMethod: '',
  }
}

onMounted(() => {
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

.position-list {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.position-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
}

.fund-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.fund-basic {
  flex: 1;
}

.fund-name {
  font-weight: 600;
  font-size: 16px;
  color: #333;
}

.fund-code {
  font-size: 13px;
  color: #999;
  margin-top: 2px;
  font-family: 'Courier New', monospace;
}

.fund-profit {
  text-align: right;
}

.fund-profit.positive {
  color: #07c160;
}

.fund-profit.negative {
  color: #ee0a24;
}

.profit-amount {
  font-weight: 600;
  font-size: 16px;
  font-family: 'Courier New', monospace;
}

.profit-rate {
  font-size: 13px;
  margin-top: 2px;
}

.fund-data-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 12px 0;
  border-top: 1px solid #f5f5f5;
  border-bottom: 1px solid #f5f5f5;
}

.profit-data-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 12px 0;
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

.data-value.positive {
  color: #07c160;
}

.data-value.negative {
  color: #ee0a24;
}

.dividend-info {
  margin-top: 8px;
  font-size: 13px;
  color: #666;
}

.dividend-label {
  color: #999;
}

.dividend-value {
  color: #333;
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
