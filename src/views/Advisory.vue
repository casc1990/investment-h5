<template>
  <div class="advisory-page">
    <div class="tips-card">
      <div class="tips-title">🤖 顾投组合日报录入</div>
      <div class="tips-text">每个组合每天录一次：总金额、当日收益、总收益、收益率。日报会自动按成员/账户汇总。</div>
    </div>

    <div class="product-list">
      <div v-for="product in products" :key="product.id" class="product-card">
        <div class="card-header">
          <div>
            <div class="product-name">{{ product.product_name }}</div>
            <div class="product-meta">{{ product.account_name || '未绑定账户' }} · {{ product.snapshot_date || '未录入快照' }}</div>
          </div>
          <div class="product-status">{{ product.status || '正常' }}</div>
        </div>

        <div class="stats-grid">
          <div class="stat-box">
            <div class="label">总金额</div>
            <div class="value">¥{{ formatAmount(product.total_amount) }}</div>
          </div>
          <div class="stat-box">
            <div class="label">当日收益</div>
            <div class="value" :class="profitClass(product.daily_profit)">{{ signedAmount(product.daily_profit) }}</div>
          </div>
          <div class="stat-box">
            <div class="label">总收益</div>
            <div class="value" :class="profitClass(product.current_profit)">{{ signedAmount(product.current_profit) }}</div>
          </div>
          <div class="stat-box">
            <div class="label">收益率</div>
            <div class="value" :class="profitClass(product.profit_rate)">{{ signedRate(product.profit_rate) }}</div>
          </div>
        </div>

        <div v-if="product.remark" class="remark">📝 {{ product.remark }}</div>

        <div class="card-actions">
          <van-button size="small" type="primary" @click="handleEdit(product)">编辑</van-button>
          <van-button size="small" type="danger" @click="handleDelete(product)">删除</van-button>
        </div>
      </div>

      <van-empty v-if="!products.length && !loading" description="暂无顾投组合，点击下方添加" />
    </div>

    <van-loading v-if="loading" type="spinner" class="loading" />

    <div class="add-btn-wrapper">
      <van-button round type="primary" size="large" class="add-btn" @click="openAddModal">➕ 添加顾投组合</van-button>
    </div>

    <van-popup v-model:show="showModal" position="bottom" round>
      <div class="modal-content">
        <div class="modal-title">{{ editingProduct ? '✏️ 编辑顾投组合' : '➕ 添加顾投组合' }}</div>

        <van-form @submit="handleSubmit">
          <van-cell-group inset>
            <van-field
              v-model="formData.productName"
              label="组合名称"
              placeholder="如：长钱账户"
              :rules="[{ required: true, message: '请输入组合名称' }]"
            />
            <van-field
              v-model="formData.accountName"
              is-link
              readonly
              label="归属账户"
              placeholder="选择账户（可选）"
              @click="showAccountPicker = true"
            />
            <van-field v-model="formData.snapshotDate" label="快照日期" type="date" />
            <van-field v-model="formData.totalAmount" label="总金额" type="number" placeholder="如：22895.33" />
            <van-field v-model="formData.dailyProfit" label="当日收益" type="number" placeholder="如：41.55" />
            <van-field v-model="formData.currentProfit" label="总收益" type="number" placeholder="页面展示的累计/当前总收益" />
            <van-field v-model="formData.profitRate" label="收益率(%)" type="number" placeholder="可不填，自动按总收益推算" />
            <van-field
              v-model="formData.remark"
              label="备注"
              placeholder="选填"
              rows="2"
              autosize
              type="textarea"
            />
          </van-cell-group>

          <div class="modal-actions">
            <van-button round @click="closeModal">取消</van-button>
            <van-button round type="primary" native-type="submit">保存</van-button>
          </div>
        </van-form>
      </div>
    </van-popup>

    <van-popup v-model:show="showAccountPicker" position="bottom">
      <van-picker
        :columns="accountOptions"
        @confirm="onAccountConfirm"
        @cancel="showAccountPicker = false"
      />
    </van-popup>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { showConfirmDialog, showSuccessToast, showToast } from 'vant'
import { accountApi, advisoryApi } from '../api'

const loading = ref(false)
const showModal = ref(false)
const showAccountPicker = ref(false)
const editingProduct = ref(null)
const products = ref([])
const accounts = ref([])

const today = () => new Date().toISOString().slice(0, 10)

const formData = ref({
  productName: '',
  accountId: '',
  accountName: '',
  snapshotDate: today(),
  totalAmount: '',
  dailyProfit: '',
  currentProfit: '',
  profitRate: '',
  remark: '',
})

const accountOptions = computed(() => [
  { text: '不绑定账户', value: '', accountName: '' },
  ...accounts.value.map(account => ({
    text: `${account['账户名称']}（${account['渠道']}）`,
    value: account.id,
    accountName: account['账户名称'],
  })),
])

const formatAmount = (num) => Number(num || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signedAmount = (num) => `${Number(num || 0) >= 0 ? '+' : ''}¥${formatAmount(num)}`
const signedRate = (num) => `${Number(num || 0) >= 0 ? '+' : ''}${Number(num || 0).toFixed(2)}%`
const profitClass = (num) => ({ positive: Number(num || 0) >= 0, negative: Number(num || 0) < 0 })
const toNumber = (value) => value === '' || value === null || value === undefined ? 0 : Number(value)

const fetchAccounts = async () => {
  const data = await accountApi.list()
  accounts.value = data?.accounts || []
}

const fetchProducts = async () => {
  loading.value = true
  try {
    const data = await advisoryApi.list()
    products.value = data?.products || []
  } catch (error) {
    console.error('Failed to fetch advisory products:', error)
    showToast('顾投组合加载失败')
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  formData.value = {
    productName: '',
    accountId: '',
    accountName: '',
    snapshotDate: today(),
    totalAmount: '',
    dailyProfit: '',
    currentProfit: '',
    profitRate: '',
    remark: '',
  }
}

const openAddModal = () => {
  editingProduct.value = null
  resetForm()
  showModal.value = true
}

const handleEdit = (product) => {
  editingProduct.value = product
  formData.value = {
    productName: product.product_name || '',
    accountId: product.account_id || '',
    accountName: product.account_name || '',
    snapshotDate: product.snapshot_date || today(),
    totalAmount: product.total_amount ?? '',
    dailyProfit: product.daily_profit ?? '',
    currentProfit: product.current_profit ?? '',
    profitRate: product.profit_rate ?? '',
    remark: product.remark || '',
  }
  showModal.value = true
}

const handleDelete = async (product) => {
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: `确定删除顾投组合“${product.product_name}”吗？`,
    })
    await advisoryApi.deleteProduct(product.id)
    showSuccessToast('删除成功')
    fetchProducts()
  } catch (error) {
    if (error !== 'cancel') {
      showToast('删除失败')
    }
  }
}

const handleSubmit = async () => {
  if (!formData.value.productName.trim()) {
    showToast('请输入组合名称')
    return
  }
  try {
    let productId = editingProduct.value?.id
    const payload = {
      product_name: formData.value.productName.trim(),
      account_id: formData.value.accountId || null,
      remark: formData.value.remark?.trim() || '',
      status: '正常',
      platform: 'xueqiu',
    }

    if (editingProduct.value) {
      await advisoryApi.updateProduct(productId, payload)
    } else {
      const created = await advisoryApi.createProduct(payload)
      productId = created?.id
    }

    await advisoryApi.saveSnapshot({
      product_id: productId,
      snapshot_date: formData.value.snapshotDate || today(),
      total_amount: toNumber(formData.value.totalAmount),
      daily_profit: toNumber(formData.value.dailyProfit),
      current_profit: toNumber(formData.value.currentProfit),
      profit_rate: formData.value.profitRate === '' ? null : toNumber(formData.value.profitRate),
    })

    showSuccessToast(editingProduct.value ? '更新成功' : '添加成功')
    closeModal()
    fetchProducts()
  } catch (error) {
    console.error('Failed to save advisory product:', error)
    const msg = error?.response?.data?.message || error?.message || '网络错误'
    showToast(`保存失败: ${msg}`)
  }
}

const onAccountConfirm = ({ selectedOptions }) => {
  const option = selectedOptions[0]
  formData.value.accountId = option.value
  formData.value.accountName = option.accountName
  showAccountPicker.value = false
}

const closeModal = () => {
  showModal.value = false
  editingProduct.value = null
  resetForm()
}

onMounted(async () => {
  await fetchAccounts()
  await fetchProducts()
})
</script>

<style scoped>
.advisory-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 12px;
  padding-bottom: 80px;
}

.tips-card,
.product-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}

.tips-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.tips-text,
.product-meta,
.remark {
  color: #666;
  font-size: 13px;
  line-height: 1.6;
}

.card-header,
.card-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.product-name {
  font-size: 16px;
  font-weight: 600;
  color: #222;
  margin-bottom: 6px;
}

.product-status {
  font-size: 12px;
  color: #1989fa;
  background: #ecf5ff;
  padding: 4px 10px;
  border-radius: 999px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin: 14px 0;
}

.stat-box {
  background: #f8f8f8;
  border-radius: 10px;
  padding: 12px;
}

.label {
  font-size: 12px;
  color: #999;
  margin-bottom: 6px;
}

.value {
  font-size: 15px;
  font-weight: 600;
  font-family: 'Courier New', monospace;
  color: #333;
}

.positive { color: #f87171; }
.negative { color: #4ade80; }

.card-actions {
  margin-top: 14px;
}

.loading {
  margin: 24px auto;
  display: flex;
  justify-content: center;
}

.add-btn-wrapper {
  position: sticky;
  bottom: 12px;
}

.add-btn {
  width: 100%;
}

.modal-content {
  padding: 20px 0 28px;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 16px;
}

.modal-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 16px 0;
}

.modal-actions .van-button {
  flex: 1;
}
</style>
