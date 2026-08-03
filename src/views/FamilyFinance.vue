<template>
  <div class="family-page">
    <header class="hero">
      <div class="hero-head">
        <div><small>家庭资产负债</small><h1>家庭财务</h1></div>
        <button :disabled="loading" @click="loadData"><van-icon name="replay" /> {{ loading ? '更新中' : '刷新' }}</button>
      </div>
      <div class="net-label">家庭净资产 <span>基金自动汇总，其他资产手工记账</span></div>
      <div class="net-value">{{ money(summary.net_worth) }}</div>
      <div class="hero-grid">
        <div><span>总资产</span><strong :class="{ positive: summary.total_assets > 0 }">{{ money(summary.total_assets) }}</strong></div>
        <div><span>应收款</span><strong :class="{ positive: summary.receivable_value > 0 }">{{ money(summary.receivable_value) }}</strong></div>
        <div><span>总负债</span><strong :class="{ negative: summary.total_liabilities > 0 }">{{ money(summary.total_liabilities) }}</strong></div>
        <div><span>可投资资产</span><strong>{{ money(summary.investable_assets) }}</strong></div>
      </div>
    </header>

    <section class="source-card">
      <div class="source-icon"><van-icon name="chart-trending-o" /></div>
      <div><strong>基金资产</strong><span>来自现有持仓，只读同步</span></div>
      <b>{{ money(summary.fund_value) }}</b>
    </section>

    <nav class="section-tabs">
      <button v-for="tab in tabs" :key="tab.key" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
        {{ tab.label }}<span>{{ tab.count }}</span>
      </button>
    </nav>

    <main class="content-card">
      <div class="section-head">
        <div><h2>{{ activeTabLabel }}</h2><p>{{ activeTabDescription }}</p></div>
        <button class="add-button" @click="openCreate"><van-icon name="plus" /> 新增</button>
      </div>

      <template v-if="activeTab === 'assets'">
        <div v-if="groupedAssets.length" class="group-list">
          <section v-for="group in groupedAssets" :key="group.key" class="asset-group">
            <div class="group-head"><span>{{ group.name }}</span><strong>{{ money(group.total) }}</strong></div>
            <article v-for="item in group.items" :key="item.id" class="finance-row">
              <span class="row-icon">{{ assetIcon(item.category_code) }}</span>
              <span class="row-main"><strong>{{ item.name }}</strong><small>{{ categoryName('assets', item.category_code) }} · {{ ownerName(item) }} · {{ item.valuation_date }}</small></span>
              <span class="row-value"><b>{{ money(item.current_value) }}</b><small>{{ item.remark || '暂无备注' }}</small></span>
              <span v-if="item.source_type === 'advisory'" class="asset-row-actions"><button type="button" @click="openAdvisory(item)">查看</button><button type="button" class="secondary" @click="openAdvisory(item, 'edit')">编辑</button><button type="button" class="secondary" @click="openAdvisory(item, 'update')">更新</button></span>
              <span v-else class="asset-row-actions"><button type="button" @click="openAssetDetail(item.id)">查看</button><button type="button" class="secondary" @click="openAssetEdit(item)">编辑</button><button type="button" class="secondary" @click="openAssetChange(item)">更新</button></span>
            </article>
          </section>
        </div>
        <EmptyState v-else text="还没有手工记录的资产" />
      </template>

      <template v-else-if="activeTab === 'receivables'">
        <div class="receivable-summary-grid">
          <div><span>应收总额</span><strong>{{ money(receivableSummary.total_amount) }}</strong></div>
          <div><span>应收笔数</span><strong>{{ receivableSummary.total_count }} 笔</strong></div>
          <div><span>已逾期金额</span><strong :class="{ warning: receivableSummary.overdue_amount > 0 }">{{ money(receivableSummary.overdue_amount) }}</strong></div>
          <div><span>已逾期笔数</span><strong :class="{ warning: receivableSummary.overdue_count > 0 }">{{ receivableSummary.overdue_count }} 笔</strong></div>
        </div>
        <div v-if="receivables.length" class="plain-list">
          <article v-for="item in receivables" :key="item.id" class="debt-row">
            <div class="debt-top"><div><strong>{{ item.name }}</strong><span>{{ categoryName('receivables', item.category_code) }} · {{ item.debtor_name || '未填债务人' }}</span></div><b>{{ money(item.outstanding_amount) }}</b></div>
            <div class="debt-meta"><span>{{ item.due_date ? `到期 ${item.due_date}` : '未设到期日' }}</span><span>{{ ownerName(item) }}</span></div>
            <div class="row-actions"><button class="ghost" @click="openReceivableEdit(item)">编辑</button><button @click="openPayment('receivable', item)">记录回款</button><button class="ghost" @click="settle('receivable', item)">结清</button></div>
          </article>
        </div>
        <EmptyState v-else text="暂无应收款" />
      </template>

      <template v-else>
        <div v-if="liabilities.length" class="plain-list">
          <article v-for="item in liabilities" :key="item.id" class="debt-row liability">
            <div class="debt-top"><div><strong>{{ item.name }}</strong><span>{{ categoryName('liabilities', item.category_code) }} · {{ item.creditor_name || '未填债权人' }}</span></div><b>{{ money(item.outstanding_principal) }}</b></div>
            <div class="debt-meta"><span>{{ item.monthly_payment ? `月供 ${money(item.monthly_payment)}` : '未设月供' }}</span><span>{{ ownerName(item) }}</span></div>
            <div class="row-actions"><button @click="openPayment('liability', item)">记录还款</button><button class="ghost" @click="settle('liability', item)">结清</button></div>
          </article>
        </div>
        <EmptyState v-else text="暂无家庭负债" />
      </template>
    </main>

    <section v-if="activeTab === 'assets'" class="trend-section">
      <div class="trend-head"><h2>资产增长趋势</h2><p>每次手工资产录入或更新都会生成坐标点</p></div>
      <TrendChart
        :points="assetTrendPoints"
        summary-label="所选节点资产"
        :formatter="money"
        :y-axis-formatter="compactMoney"
        @select="selectedAssetTrend = $event"
      />
      <div v-if="selectedAssetOperations.length" class="trend-operation-list">
        <div class="operation-title"><span>{{ selectedAssetTrend?.date }} 操作记录</span><b>{{ selectedAssetOperations.length }} 条</b></div>
        <article v-for="item in selectedAssetOperations" :key="item.id" class="trend-operation-row">
          <span class="operation-icon">{{ assetIcon(item.category_code) }}</span>
          <span class="operation-main"><strong>{{ item.asset_name }}</strong><small>{{ item.remark || '资产更新' }} · {{ item.member_emoji || '👤' }} {{ item.member_name || '未关联成员' }}</small></span>
          <b :class="changeClass(item.change_value)">{{ signedMoney(item.change_value) }}</b>
        </article>
      </div>
    </section>

    <section v-else-if="activeTab === 'receivables'" class="trend-section">
      <div class="trend-head"><h2>应收账款趋势</h2><p>新增应收和每次回款都会生成坐标点</p></div>
      <TrendChart
        :points="receivableTrendPoints"
        summary-label="所选节点应收余额"
        :formatter="money"
        :y-axis-formatter="compactMoney"
        @select="selectedReceivableTrend = $event"
      />
      <div v-if="selectedReceivableOperations.length" class="trend-operation-list">
        <div class="operation-title"><span>{{ selectedReceivableTrend?.date }} 应收操作</span><b>{{ selectedReceivableOperations.length }} 条</b></div>
        <article v-for="item in selectedReceivableOperations" :key="item.key" class="trend-operation-row">
          <span class="operation-icon">{{ item.type === 'create' ? '🤝' : '💰' }}</span>
          <span class="operation-main"><strong>{{ item.receivable_name }}</strong><small>{{ item.remark }} · {{ item.member_emoji || '👤' }} {{ item.member_name || '家庭共有' }}</small></span>
          <b :class="changeClass(item.change_value)">{{ signedMoney(item.change_value) }}</b>
        </article>
      </div>
    </section>

    <van-popup v-model:show="formVisible" position="bottom" round safe-area-inset-bottom teleport="body" class="finance-popup">
      <form class="form-sheet" @submit.prevent="submitForm">
        <div class="form-head"><div><small>{{ formEyebrow }}</small><h2>{{ formTitle }}</h2></div><button type="button" @click="formVisible = false">×</button></div>

        <template v-if="formMode === 'asset'">
          <template v-if="isChangingAsset">
            <label><span>本次金额变化</span><input v-model="form.change_value" required type="number" step="0.01" inputmode="decimal" placeholder="增加输入 100，减少输入 -100" /></label>
            <label><span>记录日期</span><input v-model="form.valuation_date" type="date" required /></label>
            <label><span>本次更新说明</span><input v-model.trim="form.update_remark" maxlength="120" placeholder="例如：7月份公积金缴存" /></label>
          </template>
          <template v-else>
            <label><span>资产大类</span><select v-model="form.asset_group" required @change="handleAssetGroupChange"><option value="" disabled>请选择大类</option><option v-for="item in assetGroups" :key="item.code" :value="item.code">{{ item.name }}</option></select></label>
            <label><span>二级分类</span><select v-model="form.category_code" required :disabled="!form.asset_group" @change="applyAssetCategoryDefault"><option value="" disabled>{{ form.asset_group ? '请选择二级分类' : '请先选择资产大类' }}</option><option v-for="item in filteredAssetCategories" :key="item.code" :value="item.code">{{ item.name }}</option></select></label>
            <label><span>资产名称</span><input v-model.trim="form.name" required maxlength="80" placeholder="例如：招商银行工资卡" /></label>
            <label v-if="!isEditingAsset"><span>当前金额</span><input v-model="form.current_value" required type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" /></label>
            <label><span>记录日期</span><input v-model="form.valuation_date" type="date" required /></label>
            <label><span>备注</span><input v-model.trim="form.remark" maxlength="200" placeholder="可填写金融机构、存放位置等附加信息" /></label>
            <label><span>所属成员</span><select v-model="form.member_id" required><option value="" disabled>请选择家庭成员</option><option v-for="item in members" :key="item.id" :value="item.id">{{ item.emoji || '👤' }} {{ item.name }}</option></select></label>
            <label class="switch-row"><span><b>计入可投资资产</b><small>受限资产通常不计入</small></span><input v-model="form.include_in_investable_assets" type="checkbox" /></label>
          </template>
        </template>

        <template v-else-if="formMode === 'receivable'">
          <label><span>应收类别</span><select v-model="form.category_code" required><option value="" disabled>请选择</option><option v-for="item in categories.receivables" :key="item.code" :value="item.code">{{ item.name }}</option></select></label>
          <label><span>应收款名称</span><input v-model.trim="form.name" required placeholder="例如：张某借款" /></label>
          <label><span>债务人 / 来源</span><input v-model.trim="form.debtor_name" placeholder="选填" /></label>
          <label><span>原始金额</span><input v-model="form.original_amount" required type="number" min="0.01" step="0.01" /></label>
          <small v-if="isEditingReceivable" class="field-tip">已回款 {{ money(receivablePaidAmount) }}，修改原始金额后将自动重算待收余额</small>
          <label><span>约定到期日</span><input v-model="form.due_date" type="date" /></label>
          <MemberSelect v-model="form.member_id" :members="members" />
        </template>

        <template v-else-if="formMode === 'liability'">
          <label><span>负债类别</span><select v-model="form.category_code" required><option value="" disabled>请选择</option><option v-for="item in categories.liabilities" :key="item.code" :value="item.code">{{ item.name }}</option></select></label>
          <label><span>负债名称</span><input v-model.trim="form.name" required placeholder="例如：自住房房贷" /></label>
          <label><span>债权人 / 机构</span><input v-model.trim="form.creditor_name" placeholder="选填" /></label>
          <label><span>当前剩余本金</span><input v-model="form.outstanding_principal" required type="number" min="0.01" step="0.01" /></label>
          <label><span>每月还款</span><input v-model="form.monthly_payment" type="number" min="0" step="0.01" placeholder="选填" /></label>
          <MemberSelect v-model="form.member_id" :members="members" />
        </template>

        <template v-else>
          <div class="payment-balance"><span>当前待结清</span><strong>{{ money(paymentBalance) }}</strong></div>
          <label><span>{{ paymentType === 'receivable' ? '本次回款' : '本次还款' }}</span><input v-model="form.amount" required type="number" min="0.01" :max="paymentBalance" step="0.01" /></label>
          <label><span>日期</span><input v-model="form.payment_date" required type="date" /></label>
          <label><span>备注</span><input v-model.trim="form.remark" placeholder="选填" /></label>
        </template>

        <div class="form-actions">
          <button v-if="isEditingAsset" type="button" class="danger" @click="removeAsset">删除</button>
          <button type="submit" class="primary" :disabled="saving">{{ saving ? '保存中...' : isEditingAsset || isEditingReceivable ? '更新' : '保存' }}</button>
        </div>
      </form>
    </van-popup>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onActivated, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { familyFinanceApi, memberApi } from '../api'
import { readPageCache, writePageCache } from '../utils/pageCache'
import TrendChart from '../components/TrendChart.vue'

const EmptyState = defineComponent({ props: { text: String }, setup: props => () => h('div', { class: 'empty-state' }, [h('span', '🏡'), h('strong', props.text), h('small', '点击右上角新增开始记账')]) })
const MemberSelect = defineComponent({
  props: { modelValue: String, members: Array }, emits: ['update:modelValue'],
  setup: (props, { emit }) => () => h('label', { class: 'member-select' }, [h('span', '所属成员'), h('select', { value: props.modelValue, onChange: event => emit('update:modelValue', event.target.value) }, [h('option', { value: '' }, '家庭共有'), ...(props.members || []).map(item => h('option', { value: item.id }, `${item.emoji || '👤'} ${item.name}`))])])
})

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
const router = useRouter()
const loading = ref(false), saving = ref(false), formVisible = ref(false)
const activeTab = ref('assets'), formMode = ref('asset'), editingAssetId = ref(''), editingReceivableId = ref(''), paymentType = ref(''), paymentItem = ref(null)
const assetAction = ref('create')
const members = ref([]), assets = ref([]), receivables = ref([]), liabilities = ref([]), advisoryProducts = ref([]), assetTrend = ref([]), receivableTrend = ref([])
const selectedAssetTrend = ref(null)
const selectedReceivableTrend = ref(null)
const summary = reactive({ fund_value: 0, advisory_value: 0, total_assets: 0, receivable_value: 0, total_liabilities: 0, net_worth: 0, investable_assets: 0 })
const receivableSummary = reactive({ total_amount: 0, total_count: 0, overdue_amount: 0, overdue_count: 0 })
const categories = reactive({ assets: [], receivables: [], liabilities: [] })
const form = reactive({})

const applyOverviewData = data => {
  Object.assign(summary, data.summary || {})
  assets.value = data.assets || []
  receivables.value = data.receivables || []
  liabilities.value = data.liabilities || []
  advisoryProducts.value = data.advisory_products || []
  assetTrend.value = data.asset_trend || []
  receivableTrend.value = data.receivable_trend || []
  Object.assign(receivableSummary, data.receivable_summary || {})
  Object.assign(categories, data.categories || {})
}
const cacheFamilyFinance = () => writePageCache('family-finance', {
  overview: {
    summary: { ...summary },
    assets: assets.value,
    receivables: receivables.value,
    liabilities: liabilities.value,
    asset_trend: assetTrend.value,
    receivable_trend: receivableTrend.value,
    receivable_summary: { ...receivableSummary },
    categories: { ...categories },
  },
  members: members.value,
})
const cachedFamilyFinance = readPageCache('family-finance')
if (cachedFamilyFinance?.overview) applyOverviewData(cachedFamilyFinance.overview)
if (cachedFamilyFinance?.members) members.value = cachedFamilyFinance.members

const tabs = computed(() => [
  { key: 'assets', label: '资产', count: assets.value.length + advisoryProducts.value.length },
  { key: 'receivables', label: '应收', count: receivables.value.length },
  { key: 'liabilities', label: '负债', count: liabilities.value.length },
])
const activeTabLabel = computed(() => tabs.value.find(item => item.key === activeTab.value)?.label || '')
const activeTabDescription = computed(() => ({ assets: '手工记录银行、股票、公积金等余额', receivables: '跟踪借出和待收回的款项', liabilities: '记录家庭剩余待还本金' }[activeTab.value]))
const isEditingAsset = computed(() => formMode.value === 'asset' && assetAction.value === 'edit')
const isChangingAsset = computed(() => formMode.value === 'asset' && assetAction.value === 'change')
const isEditingReceivable = computed(() => formMode.value === 'receivable' && Boolean(editingReceivableId.value))
const receivablePaidAmount = computed(() => Math.max(0, Number(form.original_amount_at_edit || 0) - Number(form.outstanding_amount_at_edit || 0)))
const hasSelectedAsset = computed(() => formMode.value === 'asset' && Boolean(editingAssetId.value))
const formTitle = computed(() => formMode.value === 'payment' ? (paymentType.value === 'receivable' ? '记录回款' : '记录还款') : isEditingAsset.value ? '编辑资产' : isChangingAsset.value ? '更新资产金额' : isEditingReceivable.value ? '编辑应收款' : `新增${activeTabLabel.value}`)
const formEyebrow = computed(() => formMode.value === 'payment' ? paymentItem.value?.name : '家庭财务记账')
const paymentBalance = computed(() => Number(paymentType.value === 'receivable' ? paymentItem.value?.outstanding_amount : paymentItem.value?.outstanding_principal) || 0)
const assetGroups = computed(() => {
  const groups = new Map()
  categories.assets.forEach(item => {
    if (!groups.has(item.group)) groups.set(item.group, { code: item.group, name: item.groupName })
  })
  return [...groups.values()]
})
const filteredAssetCategories = computed(() => categories.assets.filter(item => item.group === form.asset_group))

const categoryName = (type, code) => categories[type].find(item => item.code === code)?.name || '其他'
const ownerName = item => item.member_name ? `${item.member_emoji || '👤'} ${item.member_name}` : '家庭共有'
const money = value => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const compactMoney = value => {
  const amount = Number(value || 0)
  if (Math.abs(amount) >= 10000) return `¥${(amount / 10000).toFixed(1)}万`
  if (Math.abs(amount) >= 1000) return `¥${(amount / 1000).toFixed(1)}千`
  return `¥${amount.toFixed(0)}`
}
const signedMoney = value => `${Number(value || 0) > 0 ? '+' : ''}${money(value)}`
const changeClass = value => Number(value || 0) > 0 ? 'increase' : Number(value || 0) < 0 ? 'decrease' : 'unchanged'
const assetIcon = code => ({ advisory: '🤖', stock: '📈', bank_wealth: '🏦', bond: '📜', gold: '🪙', bank_demand: '💳', bank_fixed: '🏦', cash: '💵', provident_fund: '🏠', medical_account: '🏥', pension_account: '👵', property: '🏡', vehicle: '🚗' }[code] || '📦')
const groupedAssets = computed(() => {
  const map = new Map()
  const advisoryAssets = advisoryProducts.value.map(item => ({
    id: `advisory-${item.id}`,
    advisory_id: item.id,
    account_id: item.account_id,
    source_type: 'advisory',
    category_code: 'advisory',
    name: item.product_name,
    current_value: item.total_amount,
    valuation_date: item.snapshot_date || '暂无记录',
    member_name: item.member_name,
    member_emoji: item.member_emoji,
    remark: item.remark || '顾投组合日报',
  }))
  for (const item of [...advisoryAssets, ...assets.value]) {
    const category = categories.assets.find(categoryItem => categoryItem.code === item.category_code)
    const key = category?.group || 'other', name = category?.groupName || '其他资产'
    if (!map.has(key)) map.set(key, { key, name, total: 0, items: [] })
    const group = map.get(key); group.total += Number(item.current_value || 0); group.items.push(item)
  }
  return [...map.values()]
})
const assetTrendPoints = computed(() => assetTrend.value.map(item => ({
  key: item.key,
  date: item.date,
  value: Number(item.total_value || 0),
  raw: item,
})))
const selectedAssetOperations = computed(() => selectedAssetTrend.value?.operations || [])
const receivableTrendPoints = computed(() => receivableTrend.value.map(item => ({
  key: item.key,
  date: item.date,
  value: Number(item.total_value || 0),
  raw: item,
})))
const selectedReceivableOperations = computed(() => selectedReceivableTrend.value?.operations || [])

const loadData = async () => {
  if (loading.value) return
  loading.value = true
  const memberRefresh = memberApi.list()
    .then(memberData => {
      members.value = memberData.members || []
      cacheFamilyFinance()
    })
    .catch(error => console.warn('家庭成员刷新失败，保留现有数据:', error.message || error))
  try {
    const data = await familyFinanceApi.overview()
    applyOverviewData(data)
    cacheFamilyFinance()
  } catch (error) { showFailToast(error.response?.data?.message || error.message || '加载失败') }
  finally { loading.value = false }
  await memberRefresh
}

const resetForm = values => { Object.keys(form).forEach(key => delete form[key]); Object.assign(form, values) }
const applyAssetCategoryDefault = () => { form.include_in_investable_assets = Boolean(categories.assets.find(item => item.code === form.category_code)?.investable) }
const handleAssetGroupChange = () => {
  form.category_code = ''
  form.include_in_investable_assets = false
}
const openCreate = () => {
  editingAssetId.value = ''; editingReceivableId.value = ''; assetAction.value = 'create'; formMode.value = activeTab.value === 'assets' ? 'asset' : activeTab.value === 'receivables' ? 'receivable' : 'liability'
  if (formMode.value === 'asset') resetForm({ asset_group: '', category_code: '', name: '', current_value: '', valuation_date: today(), member_id: '', include_in_investable_assets: false, remark: '' })
  if (formMode.value === 'receivable') resetForm({ category_code: '', name: '', debtor_name: '', original_amount: '', due_date: '', member_id: '' })
  if (formMode.value === 'liability') resetForm({ category_code: '', name: '', creditor_name: '', outstanding_principal: '', monthly_payment: '', member_id: '' })
  formVisible.value = true
}
const openAssetEdit = item => {
  formMode.value = 'asset'; assetAction.value = 'edit'; editingAssetId.value = item.id
  const category = categories.assets.find(categoryItem => categoryItem.code === item.category_code)
  resetForm({ ...item, asset_group: category?.group || '', member_id: item.member_id || '', include_in_investable_assets: Boolean(item.include_in_investable_assets) })
  delete form.current_value
  formVisible.value = true
}
const openAssetChange = item => {
  formMode.value = 'asset'; assetAction.value = 'change'; editingAssetId.value = item.id
  resetForm({ change_value: '', valuation_date: today(), update_remark: '' })
  formVisible.value = true
}
const openAssetDetail = id => router.push(`/family-finance/assets/${id}`)
const openAdvisory = (item, action = '') => router.push({ path: '/advisory', query: { product_id: item.advisory_id, ...(action ? { action } : {}) } })
const openReceivableEdit = item => {
  formMode.value = 'receivable'
  editingReceivableId.value = item.id
  resetForm({ category_code: item.category_code, name: item.name, debtor_name: item.debtor_name || '', original_amount: item.original_amount, original_amount_at_edit: item.original_amount, outstanding_amount_at_edit: item.outstanding_amount, due_date: item.due_date || '', member_id: item.member_id || '' })
  formVisible.value = true
}
const openPayment = (type, item) => { formMode.value = 'payment'; paymentType.value = type; paymentItem.value = item; resetForm({ amount: '', payment_date: today(), remark: '' }); formVisible.value = true }

const submitForm = async () => {
  saving.value = true
  try {
    if (formMode.value === 'asset') hasSelectedAsset.value ? await familyFinanceApi.updateAsset(editingAssetId.value, form) : await familyFinanceApi.createAsset(form)
    else if (formMode.value === 'receivable') isEditingReceivable.value ? await familyFinanceApi.updateReceivable(editingReceivableId.value, form) : await familyFinanceApi.createReceivable(form)
    else if (formMode.value === 'liability') await familyFinanceApi.createLiability({ ...form, original_amount: form.outstanding_principal })
    else if (paymentType.value === 'receivable') await familyFinanceApi.receivePayment(paymentItem.value.id, form)
    else await familyFinanceApi.repayLiability(paymentItem.value.id, form)
    formVisible.value = false; showSuccessToast('已保存'); loadData()
  } catch (error) { showFailToast(error.response?.data?.message || error.message || '保存失败') }
  finally { saving.value = false }
}

const removeAsset = async () => {
  try { await showConfirmDialog({ title: '删除资产', message: '历史更新会保留，资产将不再计入汇总。' }); await familyFinanceApi.deleteAsset(editingAssetId.value); formVisible.value = false; await loadData(); showSuccessToast('已删除') } catch (error) { if (error !== 'cancel') showFailToast(error.message || '删除失败') }
}
const settle = async (type, item) => {
  try { await showConfirmDialog({ title: '确认结清', message: `确认将“${item.name}”的剩余金额设为0？` }); type === 'receivable' ? await familyFinanceApi.settleReceivable(item.id) : await familyFinanceApi.settleLiability(item.id); await loadData(); showSuccessToast('已结清') } catch (error) { if (error !== 'cancel') showFailToast(error.message || '操作失败') }
}
onMounted(loadData)
onActivated(loadData)
</script>

<style scoped>
.family-page {
  min-height: 100vh;
  padding: 12px 12px var(--app-floating-page-space);
  background: #f5f5f5;
  color: #1f2937;
}

.hero {
  padding: 18px 20px 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1e80ff 0%, #0066cc 100%);
  color: #fff;
}

.hero-head,
.section-head,
.group-head,
.debt-top,
.debt-meta,
.operation-title,
.form-head,
.payment-balance {
  display: flex;
  justify-content: space-between;
}

.hero-head { align-items: flex-start; }
.hero-head small { font-size: 12px; font-weight: 500; opacity: .82; }
.hero h1 { margin-top: 3px; font-size: 18px; font-weight: 700; }
.hero-head button {
  height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, .3);
  border-radius: 999px;
  background: rgba(255, 255, 255, .12);
  color: #fff;
  font-size: 11px;
}

.net-label { margin-top: 17px; font-size: 13px; opacity: .86; }
.net-label span { margin-left: 6px; font-size: 11px; opacity: .82; }
.net-value {
  margin-top: 4px;
  font-family: 'Courier New', monospace;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -1px;
}

.hero-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  margin-top: 14px;
  padding: 2px 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, .12);
}
.hero-grid div { padding: 8px; text-align: center; }
.hero-grid div:nth-child(even) { border-left: 1px solid rgba(255, 255, 255, .24); }
.hero-grid div:nth-child(n + 3) { border-top: 1px solid rgba(255, 255, 255, .24); }
.hero-grid span,
.hero-grid strong { display: block; }
.hero-grid span { font-size: 11px; opacity: .8; }
.hero-grid strong { margin-top: 4px; font-family: 'Courier New', monospace; font-size: 13px; }
.hero-grid strong.positive { color: #ff8a8a; }
.hero-grid strong.negative { color: #7ddf64; }

.source-card,
.content-card,
.trend-section {
  background: #fff;
  border-radius: 12px;
}
.source-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0;
  padding: 12px 14px;
}
.source-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 10px;
  background: #e8f3ff;
  color: #1e80ff;
  font-size: 20px;
}
.source-card div:nth-child(2) { display: flex; flex: 1; flex-direction: column; }
.source-card strong { font-size: 15px; }
.source-card span { margin-top: 3px; color: #94a3b8; font-size: 12px; }
.source-card b { font-family: 'Courier New', monospace; font-size: 15px; }
.source-card b small { margin-left: 3px; color: #1e80ff; font-family: inherit; font-size: 10px; }

.section-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 4px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f1f5f9;
}
.section-tabs button {
  height: 40px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #64748b;
  font-size: 14px;
}
.section-tabs button span {
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: 999px;
  background: #e2e8f0;
  font-size: 10px;
}
.section-tabs button.active {
  background: #fff;
  color: #1e80ff;
  font-weight: 700;
  box-shadow: 0 3px 10px rgba(37, 59, 91, .08);
}
.section-tabs button.active span { background: #1e80ff; color: #fff; }

.content-card,
.trend-section { margin-top: 12px; padding: 16px; }
.section-head { align-items: center; }
.section-head h2,
.trend-section h2 { color: #222; font-size: 16px; font-weight: 700; }
.section-head p,
.trend-section p { margin-top: 5px; color: #94a3b8; font-size: 12px; }
.add-button {
  border: 0;
  border-radius: 9px;
  padding: 9px 12px;
  background: #1e80ff;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.asset-group { margin-top: 16px; }
.group-head { padding: 0 2px 8px; color: #64748b; font-size: 12px; }
.group-head strong { color: #334155; font-family: 'Courier New', monospace; }
.finance-row {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid #f1f5f9;
  background: #fff;
}
.row-icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: none;
  place-items: center;
  border-radius: 10px;
  background: #f8fbff;
  font-size: 19px;
}
.row-main { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.row-main strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.row-main small,
.row-value small { margin-top: 4px; color: #94a3b8; font-size: 11px; }
.row-value { display: flex; flex-direction: column; text-align: right; }
.row-value b { font-family: 'Courier New', monospace; font-size: 14px; }
.row-value small { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-row-actions { display: flex; flex: 0 0 100%; justify-content: flex-end; gap: 6px; padding-left: 48px; }
.asset-row-actions button { border: 0; border-radius: 7px; padding: 6px 8px; background: #1e80ff; color: #fff; font-size: 11px; }
.asset-row-actions .secondary { background: #e8f3ff; color: #1e80ff; }

.plain-list { display: grid; gap: 10px; margin-top: 14px; }
.receivable-summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 14px; }
.receivable-summary-grid div { padding: 11px; border-radius: 10px; background: #f8fafc; }
.receivable-summary-grid span,.receivable-summary-grid strong { display: block; }
.receivable-summary-grid span { color: #94a3b8; font-size: 11px; }
.receivable-summary-grid strong { margin-top: 5px; color: #334155; font-family: 'Courier New', monospace; font-size: 13px; }
.receivable-summary-grid strong.warning { color: #ea580c; }
.debt-row { padding: 14px; border: 1px solid #e8edf3; border-radius: 12px; background: #fff; }
.debt-top { gap: 10px; }
.debt-top div { display: flex; min-width: 0; flex-direction: column; }
.debt-top strong { font-size: 14px; }
.debt-top span { margin-top: 4px; color: #64748b; font-size: 12px; }
.debt-top > b { color: #ea580c; font-family: 'Courier New', monospace; font-size: 16px; }
.liability .debt-top > b { color: #dc2626; }
.debt-meta { margin-top: 10px; color: #94a3b8; font-size: 11px; }
.row-actions { display: flex; gap: 8px; margin-top: 12px; }
.row-actions button {
  flex: 1;
  border: 0;
  border-radius: 8px;
  padding: 8px;
  background: #e8f3ff;
  color: #1e80ff;
  font-size: 12px;
  font-weight: 600;
}
.row-actions .ghost { background: #f3f4f6; color: #64748b; }
.field-tip { display: block; margin-top: 6px; color: #94a3b8; font-size: 11px; line-height: 1.5; }

.empty-state { display: flex; align-items: center; flex-direction: column; padding: 42px 0 30px; color: #94a3b8; }
.empty-state span { font-size: 34px; }
.empty-state strong { margin-top: 8px; color: #64748b; font-size: 14px; }
.empty-state small { margin-top: 5px; font-size: 12px; }

.trend-head { margin-bottom: 12px; }
.trend-operation-list { margin-top: 14px; }
.operation-title { padding: 0 2px 8px; color: #64748b; font-size: 12px; }
.operation-title b { color: #94a3b8; font-size: 11px; }
.trend-operation-row { display: flex; align-items: center; gap: 9px; padding: 11px 2px; border-top: 1px solid #f1f5f9; }
.operation-icon { display: grid; width: 34px; height: 34px; flex: none; place-items: center; border-radius: 9px; background: #f8fbff; font-size: 17px; }
.operation-main { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.operation-main strong { overflow: hidden; color: #1f2937; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.operation-main small { margin-top: 4px; overflow: hidden; color: #94a3b8; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.trend-operation-row > b { font-family: 'Courier New', monospace; font-size: 12px; white-space: nowrap; }
.trend-operation-row > b.increase { color: #dc2626; }
.trend-operation-row > b.decrease { color: #16a34a; }
.trend-operation-row > b.unchanged { color: #64748b; }

.finance-popup { max-height: 90vh; overflow-y: auto; }
.form-sheet { padding: 20px 18px 26px; }
.form-head { align-items: flex-start; margin-bottom: 17px; }
.form-head small { color: #1e80ff; font-size: 11px; font-weight: 600; }
.form-head h2 { margin-top: 3px; font-size: 20px; }
.form-head button {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: #f3f4f6;
  color: #64748b;
  font-size: 22px;
}
.form-sheet label { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.form-sheet label > span { color: #64748b; font-size: 12px; font-weight: 600; }
.form-sheet input:not([type=checkbox]),
.form-sheet select {
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border: 1px solid #dfe4ec;
  border-radius: 10px;
  background: #fff;
  color: #1f2937;
  font-size: 14px;
}
:deep(.member-select) { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
:deep(.member-select > span) { color: #64748b; font-size: 12px; font-weight: 600; }
:deep(.member-select select) { box-sizing: border-box; width: 100%; height: 44px; padding: 0 12px; border: 1px solid #dfe4ec; border-radius: 10px; background: #fff; color: #1f2937; font-size: 14px; }
:deep(.member-select select:focus) { border-color: #1e80ff; outline: none; box-shadow: 0 0 0 3px rgba(30, 128, 255, .1); }
.form-sheet input:focus,
.form-sheet select:focus { border-color: #1e80ff; outline: none; box-shadow: 0 0 0 3px rgba(30, 128, 255, .1); }
.switch-row { flex-direction: row !important; align-items: center; justify-content: space-between; padding: 10px 0; }
.switch-row span { display: flex; flex-direction: column; }
.switch-row small { margin-top: 3px; color: #94a3b8; font-weight: 400; }
.switch-row input { width: 22px; height: 22px; accent-color: #1e80ff; }
.form-actions { display: flex; gap: 9px; margin-top: 20px; }
.form-actions button { height: 46px; border: 0; border-radius: 10px; font-size: 14px; font-weight: 700; }
.form-actions .primary { flex: 1; background: #1e80ff; color: #fff; }
.form-actions .danger { width: 82px; background: #fef2f2; color: #dc2626; }
.payment-balance { padding: 14px; border-radius: 10px; background: #f8fbff; }
.payment-balance span { color: #64748b; font-size: 12px; }
.payment-balance strong { color: #1e80ff; font-family: 'Courier New', monospace; font-size: 16px; }

@media (max-width: 380px) {
  .family-page { padding-right: 10px; padding-left: 10px; }
  .hero { padding: 16px; }
  .net-value { font-size: 28px; }
  .hero-grid div { padding: 0 4px; }
  .hero-grid strong { font-size: 12px; }
  .net-label span { display: none; }
}
</style>
