<template>
  <div class="advisory-page">
    <van-nav-bar :title="selectedProduct ? '顾投详情' : '顾投资产'" left-arrow fixed placeholder @click-left="goBack" />

    <template v-if="selectedProduct">
      <section class="detail-hero">
        <div class="hero-heading"><span class="hero-icon">🤖</span><div><small>增值资产 · 顾投</small><h1>{{ selectedProduct.product_name }}</h1></div></div>
        <span class="amount-label">当前金额</span>
        <strong class="hero-amount">¥{{ formatAmount(selectedProduct.total_amount) }}</strong>
        <div class="hero-meta"><span>{{ selectedProduct.member_emoji || '👤' }} {{ selectedProduct.member_name || '家庭共有' }}</span><span>记录日期 {{ selectedProduct.snapshot_date || '暂无' }}</span></div>
      </section>

      <section class="content-card">
        <div class="section-head"><div><h2>资产总览</h2><p>当前顾投组合信息</p></div><div class="head-actions"><button class="ghost" @click="openEdit(selectedProduct)">编辑</button><button @click="openUpdate(selectedProduct)">更新</button></div></div>
        <div class="overview-grid">
          <div><span>当日收益</span><strong :class="profitClass(selectedProduct.daily_profit)">{{ signedAmount(selectedProduct.daily_profit) }}</strong></div>
          <div><span>持有收益</span><strong :class="profitClass(selectedProduct.current_profit)">{{ signedAmount(selectedProduct.current_profit) }}</strong></div>
          <div><span>持有收益率</span><strong :class="profitClass(selectedProduct.profit_rate)">{{ signedRate(selectedProduct.profit_rate) }}</strong></div>
          <div><span>归属账户</span><strong>{{ selectedProduct.account_name || '未绑定' }}</strong></div>
        </div>
        <div class="remark-box"><span>备注</span><p>{{ selectedProduct.remark || '暂无备注' }}</p></div>
      </section>

      <section class="content-card records-card">
        <div class="section-head"><div><h2>更新记录</h2><p>每次金额更新都会保留日报</p></div><b>{{ snapshots.length }} 条</b></div>
        <div v-if="snapshots.length" class="record-list">
          <article v-for="record in snapshots" :key="record.id" class="record-row">
            <div><strong>{{ record.snapshot_date }}</strong><small>账户总金额</small></div>
            <div class="record-total">¥{{ formatAmount(record.total_amount) }}</div>
            <div class="record-profit"><span>当日 {{ signedAmount(record.daily_profit) }}</span><span :class="profitClass(record.current_profit)">持有 {{ signedAmount(record.current_profit) }}</span></div>
          </article>
        </div>
        <van-empty v-else description="暂无更新记录" />
      </section>
    </template>

    <template v-else>
      <section class="page-intro">
        <div><small>家庭财务 · 增值资产</small><h1>顾投资产</h1><p>记录组合金额与收益，自动纳入家庭资产汇总。</p></div>
        <button @click="openAdd">＋ 新增</button>
      </section>

      <main class="product-list">
        <article v-for="product in products" :key="product.id" class="product-card">
          <div class="product-head"><div><h2>{{ product.product_name }}</h2><p>{{ product.account_name || '未绑定账户' }} · {{ product.snapshot_date || '暂无记录' }}</p></div><strong>¥{{ formatAmount(product.total_amount) }}</strong></div>
          <div class="profit-line"><span>当日收益 <b :class="profitClass(product.daily_profit)">{{ signedAmount(product.daily_profit) }}</b></span><span>持有收益 <b :class="profitClass(product.current_profit)">{{ signedAmount(product.current_profit) }}</b></span></div>
          <div class="card-actions"><button @click="viewProduct(product)">查看</button><button class="secondary" @click="openEdit(product)">编辑</button><button class="secondary" @click="openUpdate(product)">更新</button></div>
        </article>
        <van-empty v-if="!products.length && !loading" description="暂无顾投资产" />
      </main>
    </template>

    <van-loading v-if="loading" type="spinner" class="loading" />

    <van-popup v-model:show="showModal" position="bottom" round safe-area-inset-bottom teleport="body" class="editor-popup">
      <form class="editor-sheet" @submit.prevent="submitForm">
        <div class="form-head"><div><small>家庭财务 · 顾投资产</small><h2>{{ modalTitle }}</h2></div><button type="button" @click="closeModal">×</button></div>

        <template v-if="modalMode !== 'update'">
          <label><span>组合名称</span><input v-model.trim="form.productName" required maxlength="80" placeholder="例如：长钱账户" /></label>
          <label><span>归属账户</span><button type="button" class="select-field" @click="showAccountPicker = true">{{ form.accountName || '请选择（可选）' }} <b>›</b></button></label>
          <label><span>备注</span><input v-model.trim="form.remark" maxlength="200" placeholder="可填写组合策略等附加信息" /></label>
        </template>

        <template v-if="modalMode !== 'edit'">
          <label><span>记录日期</span><input v-model="form.snapshotDate" required type="date" /></label>
          <label><span>当前总金额</span><input v-model="form.totalAmount" required type="number" step="0.01" inputmode="decimal" placeholder="0.00" /></label>
          <div class="field-pair"><label><span>当日收益</span><input v-model="form.dailyProfit" type="number" step="0.01" inputmode="decimal" placeholder="0.00" /></label><label><span>持有收益</span><input v-model="form.currentProfit" type="number" step="0.01" inputmode="decimal" placeholder="0.00" /></label></div>
          <label><span>持有收益率（%）</span><input v-model="form.profitRate" type="number" step="0.01" inputmode="decimal" placeholder="可不填，自动计算" /></label>
        </template>

        <div class="form-actions"><button v-if="modalMode === 'edit'" type="button" class="danger" @click="removeProduct">删除</button><button type="submit" class="primary" :disabled="saving">{{ saving ? '保存中…' : modalMode === 'add' ? '保存新增' : modalMode === 'edit' ? '保存修改' : '保存更新' }}</button></div>
      </form>
    </van-popup>

    <van-popup v-model:show="showAccountPicker" position="bottom" teleport="body">
      <van-picker :columns="accountOptions" @confirm="onAccountConfirm" @cancel="showAccountPicker = false" />
    </van-popup>
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showSuccessToast, showToast } from 'vant'
import { accountApi, advisoryApi } from '../api'
import { formatAmount, formatPercent, profitClass } from '../utils/formatters'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const showModal = ref(false)
const showAccountPicker = ref(false)
const modalMode = ref('update')
const products = ref([])
const accounts = ref([])
const selectedProduct = ref(null)
const snapshots = ref([])
const form = reactive({})
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())

const modalTitle = computed(() => modalMode.value === 'add' ? '新增顾投资产' : modalMode.value === 'edit' ? '编辑顾投资产' : '更新顾投资产')
const accountOptions = computed(() => [{ text: '不绑定账户', value: '', accountName: '' }, ...accounts.value.map(item => ({ text: `${item.account_name}（${item.channel}）`, value: item.id, accountName: item.account_name }))])
const signedAmount = value => `${Number(value || 0) >= 0 ? '+' : '-'}¥${formatAmount(Math.abs(Number(value || 0)))}`
const signedRate = value => `${Number(value || 0) >= 0 ? '+' : ''}${formatPercent(Number(value || 0))}`
const numberValue = value => value === '' || value === null || value === undefined ? 0 : Number(value)

const resetForm = values => {
  Object.keys(form).forEach(key => delete form[key])
  Object.assign(form, { productId: '', productName: '', accountId: '', accountName: '', remark: '', snapshotDate: today(), totalAmount: '', dailyProfit: '', currentProfit: '', profitRate: '' }, values)
}

const loadDetail = async id => {
  const data = await advisoryApi.detail(id)
  selectedProduct.value = data.product
  snapshots.value = data.snapshots || []
  return data.product
}

const loadData = async () => {
  if (loading.value) return
  loading.value = true
  try {
    const [accountData, productData] = await Promise.all([accountApi.list(), advisoryApi.list()])
    accounts.value = accountData?.accounts || []
    products.value = productData?.products || []
    if (route.query.product_id) {
      const product = await loadDetail(route.query.product_id)
      if (route.query.action === 'edit') openEdit(product)
      if (route.query.action === 'update') openUpdate(product)
    } else {
      selectedProduct.value = null
      snapshots.value = []
    }
  } catch (error) {
    showToast(error?.response?.data?.message || '顾投资产加载失败')
  } finally { loading.value = false }
}

const viewProduct = product => router.push({ path: '/advisory', query: { product_id: product.id } })
const openAdd = () => { modalMode.value = 'add'; resetForm(); showModal.value = true }
const openEdit = product => {
  modalMode.value = 'edit'
  resetForm({ productId: product.id, productName: product.product_name || '', accountId: product.account_id || '', accountName: product.account_name || '', remark: product.remark || '' })
  showModal.value = true
}
const openUpdate = product => {
  modalMode.value = 'update'
  resetForm({ productId: product.id, snapshotDate: today(), totalAmount: product.total_amount ?? '', dailyProfit: '', currentProfit: product.current_profit ?? '', profitRate: product.profit_rate ?? '' })
  showModal.value = true
}
const closeModal = () => { showModal.value = false; resetForm() }

const submitForm = async () => {
  saving.value = true
  try {
    let productId = form.productId
    if (modalMode.value === 'add') {
      const created = await advisoryApi.createProduct({ product_name: form.productName, account_id: form.accountId || null, remark: form.remark, status: '正常', platform: 'xueqiu' })
      productId = created.id
    } else if (modalMode.value === 'edit') {
      await advisoryApi.updateProduct(productId, { product_name: form.productName, account_id: form.accountId || null, remark: form.remark, status: '正常', platform: 'xueqiu' })
    }
    if (modalMode.value !== 'edit') {
      await advisoryApi.saveSnapshot({ product_id: productId, snapshot_date: form.snapshotDate, total_amount: numberValue(form.totalAmount), daily_profit: numberValue(form.dailyProfit), current_profit: numberValue(form.currentProfit), profit_rate: form.profitRate === '' ? null : numberValue(form.profitRate) })
    }
    showSuccessToast(modalMode.value === 'add' ? '新增成功' : modalMode.value === 'edit' ? '资料已更新' : '金额已更新')
    closeModal()
    if (route.query.action) await router.replace({ path: '/advisory', query: { product_id: productId } })
    else await loadData()
  } catch (error) {
    showToast(error?.response?.data?.message || error?.message || '保存失败')
  } finally { saving.value = false }
}

const removeProduct = async () => {
  try {
    await showConfirmDialog({ title: '删除顾投资产', message: `确定删除“${form.productName}”及其全部更新记录吗？` })
    await advisoryApi.deleteProduct(form.productId)
    closeModal()
    showSuccessToast('已删除')
    router.replace('/family-finance')
  } catch (error) { if (error !== 'cancel') showToast('删除失败') }
}

const onAccountConfirm = ({ selectedOptions }) => {
  const option = selectedOptions[0]
  form.accountId = option.value
  form.accountName = option.accountName
  showAccountPicker.value = false
}
const goBack = () => router.push('/family-finance')

onMounted(loadData)
onActivated(loadData)
watch(() => [route.query.product_id, route.query.action], loadData)
</script>

<style scoped>
.advisory-page { min-height: 100vh; padding: 12px 12px var(--app-floating-page-space); background: #f5f5f5; color: #1f2937; }
.detail-hero { padding: 18px 20px 16px; border-radius: 12px; color: #fff; background: linear-gradient(135deg, #1e80ff, #0066cc); }
.hero-heading { display: flex; align-items: center; gap: 11px; }
.hero-icon { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 12px; background: rgba(255,255,255,.17); font-size: 23px; }
.hero-heading small { color: rgba(255,255,255,.72); font-size: 12px; }
.hero-heading h1 { margin: 3px 0 0; font-size: 19px; }
.amount-label { display: block; margin-top: 18px; color: rgba(255,255,255,.72); font-size: 12px; }
.hero-amount { display: block; margin-top: 4px; font: 700 30px/1.2 'Courier New', monospace; }
.hero-meta { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.18); font-size: 12px; }
.content-card, .page-intro, .product-card { margin-top: 12px; padding: 16px; border-radius: 12px; background: #fff; }
.section-head, .product-head, .card-actions, .form-head, .form-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.section-head h2, .page-intro h1, .product-head h2 { margin: 0; font-size: 17px; }
.section-head p, .page-intro p, .product-head p { margin: 4px 0 0; color: #94a3b8; font-size: 12px; }
.head-actions, .card-actions { display: flex; gap: 8px; }
button { border: 0; border-radius: 9px; padding: 9px 13px; color: #fff; background: #1e80ff; font-size: 13px; font-weight: 600; }
button.secondary, button.ghost { color: #1e80ff; background: #edf5ff; }
.overview-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 14px; }
.overview-grid div { padding: 12px; border-radius: 10px; background: #f7f9fc; }
.overview-grid span, .remark-box span { display: block; color: #94a3b8; font-size: 12px; }
.overview-grid strong { display: block; margin-top: 5px; font-size: 14px; }
.positive { color: #ef4444 !important; }.negative { color: #16a34a !important; }
.remark-box { margin-top: 10px; padding: 12px; border-radius: 10px; background: #f7f9fc; }
.remark-box p { margin: 5px 0 0; font-size: 13px; }
.record-list { margin-top: 10px; }
.record-row { display: grid; grid-template-columns: 1fr auto; gap: 5px 12px; padding: 12px 0; border-top: 1px solid #eef2f7; }
.record-row small { display: block; margin-top: 3px; color: #94a3b8; font-size: 11px; }
.record-total { font: 600 14px 'Courier New', monospace; }
.record-profit { grid-column: 1 / -1; display: flex; justify-content: space-between; color: #94a3b8; font-size: 12px; }
.page-intro { display: flex; align-items: center; justify-content: space-between; margin-top: 0; }
.page-intro small { color: #1e80ff; font-size: 12px; }
.page-intro h1 { margin-top: 4px; }
.product-head strong { font: 700 16px 'Courier New', monospace; }
.profit-line { display: flex; justify-content: space-between; margin: 14px 0; padding: 11px 12px; border-radius: 10px; background: #f7f9fc; color: #64748b; font-size: 12px; }
.profit-line b { margin-left: 4px; }
.card-actions { justify-content: flex-end; }
.loading { display: flex; justify-content: center; margin: 28px auto; }
.editor-popup { max-height: 88vh; overflow-y: auto; }
.editor-sheet { padding: 20px 18px calc(22px + env(safe-area-inset-bottom)); }
.form-head { margin-bottom: 16px; }.form-head small { color: #1e80ff; font-size: 12px; }.form-head h2 { margin: 3px 0 0; font-size: 20px; }.form-head > button { padding: 4px 10px; color: #64748b; background: #f1f5f9; font-size: 23px; }
label { display: block; margin-top: 14px; }label > span { display: block; margin-bottom: 7px; color: #64748b; font-size: 13px; font-weight: 600; }
input, .select-field { box-sizing: border-box; width: 100%; min-height: 46px; border: 1px solid #dbe2ea; border-radius: 10px; padding: 0 13px; color: #1f2937; background: #fff; font-size: 14px; text-align: left; }
.select-field { display: flex; align-items: center; justify-content: space-between; font-weight: 400; }
.field-pair { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.form-actions { margin-top: 22px; }.form-actions button { flex: 1; min-height: 44px; }.form-actions .danger { color: #ef4444; background: #fff1f2; }
</style>
