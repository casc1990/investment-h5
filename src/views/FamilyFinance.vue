<template>
  <div class="family-page">
    <header class="hero">
      <div class="hero-head">
        <div><small>FAMILY BALANCE SHEET</small><h1>家庭财务</h1></div>
        <button :disabled="loading" @click="loadData"><van-icon name="replay" /> {{ loading ? '更新中' : '刷新' }}</button>
      </div>
      <div class="net-label">家庭净资产 <span>基金自动汇总，其他资产手工记账</span></div>
      <div class="net-value">{{ money(summary.net_worth) }}</div>
      <div class="hero-grid">
        <div><span>总资产</span><strong>{{ money(summary.total_assets) }}</strong></div>
        <div><span>总负债</span><strong>{{ money(summary.total_liabilities) }}</strong></div>
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
            <button v-for="item in group.items" :key="item.id" class="finance-row" @click="openAssetEdit(item)">
              <span class="row-icon">{{ assetIcon(item.category_code) }}</span>
              <span class="row-main"><strong>{{ item.name }}</strong><small>{{ categoryName('assets', item.category_code) }} · {{ ownerName(item) }} · {{ item.valuation_date }}</small></span>
              <span class="row-value"><b>{{ money(item.current_value) }}</b><small>点击更新</small></span>
            </button>
          </section>
        </div>
        <EmptyState v-else text="还没有手工记录的资产" />
      </template>

      <template v-else-if="activeTab === 'receivables'">
        <div v-if="receivables.length" class="plain-list">
          <article v-for="item in receivables" :key="item.id" class="debt-row">
            <div class="debt-top"><div><strong>{{ item.name }}</strong><span>{{ categoryName('receivables', item.category_code) }} · {{ item.debtor_name || '未填债务人' }}</span></div><b>{{ money(item.outstanding_amount) }}</b></div>
            <div class="debt-meta"><span>{{ item.due_date ? `到期 ${item.due_date}` : '未设到期日' }}</span><span>{{ ownerName(item) }}</span></div>
            <div class="row-actions"><button @click="openPayment('receivable', item)">记录回款</button><button class="ghost" @click="settle('receivable', item)">结清</button></div>
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

    <section class="snapshot-card">
      <div><h2>净资产档案</h2><p>建议每月余额更新后保存一次</p></div>
      <button :disabled="saving" @click="captureSnapshot">保存今日快照</button>
      <div v-if="snapshots.length" class="snapshot-list">
        <div v-for="item in snapshots.slice(-6).reverse()" :key="item.date"><span>{{ item.date }}</span><strong>{{ money(item.net_worth) }}</strong></div>
      </div>
    </section>

    <van-popup v-model:show="formVisible" position="bottom" round safe-area-inset-bottom teleport="body" :z-index="12000" class="finance-popup">
      <form class="form-sheet" @submit.prevent="submitForm">
        <div class="form-head"><div><small>{{ formEyebrow }}</small><h2>{{ formTitle }}</h2></div><button type="button" @click="formVisible = false">×</button></div>

        <template v-if="formMode === 'asset'">
          <label><span>资产类别</span><select v-model="form.category_code" required @change="applyAssetCategoryDefault"><option value="" disabled>请选择</option><option v-for="item in categories.assets" :key="item.code" :value="item.code">{{ item.groupName }} · {{ item.name }}</option></select></label>
          <label><span>资产名称</span><input v-model.trim="form.name" required maxlength="80" placeholder="例如：招商银行工资卡" /></label>
          <label><span>当前金额</span><input v-model="form.current_value" required type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" /></label>
          <label><span>金融机构 / 存放位置</span><input v-model.trim="form.institution" maxlength="80" placeholder="选填" /></label>
          <label><span>估值日期</span><input v-model="form.valuation_date" type="date" required /></label>
          <label v-if="isEditingAsset"><span>本次更新说明</span><input v-model.trim="form.update_remark" maxlength="120" placeholder="例如：7月份公积金缴存后余额" /></label>
          <label><span>所属成员</span><select v-model="form.member_id"><option value="">家庭共有</option><option v-for="item in members" :key="item.id" :value="item.id">{{ item.emoji || '👤' }} {{ item.name }}</option></select></label>
          <label class="switch-row"><span><b>计入可投资资产</b><small>受限资产通常不计入</small></span><input v-model="form.include_in_investable_assets" type="checkbox" /></label>
        </template>

        <template v-else-if="formMode === 'receivable'">
          <label><span>应收类别</span><select v-model="form.category_code" required><option value="" disabled>请选择</option><option v-for="item in categories.receivables" :key="item.code" :value="item.code">{{ item.name }}</option></select></label>
          <label><span>应收款名称</span><input v-model.trim="form.name" required placeholder="例如：张某借款" /></label>
          <label><span>债务人 / 来源</span><input v-model.trim="form.debtor_name" placeholder="选填" /></label>
          <label><span>原始金额</span><input v-model="form.original_amount" required type="number" min="0.01" step="0.01" /></label>
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
          <button type="submit" class="primary" :disabled="saving">{{ saving ? '保存中...' : '保存' }}</button>
        </div>
      </form>
    </van-popup>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, reactive, ref } from 'vue'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { familyFinanceApi, memberApi } from '../api'

const EmptyState = defineComponent({ props: { text: String }, setup: props => () => h('div', { class: 'empty-state' }, [h('span', '🏡'), h('strong', props.text), h('small', '点击右上角新增开始记账')]) })
const MemberSelect = defineComponent({
  props: { modelValue: String, members: Array }, emits: ['update:modelValue'],
  setup: (props, { emit }) => () => h('label', [h('span', '所属成员'), h('select', { value: props.modelValue, onChange: event => emit('update:modelValue', event.target.value) }, [h('option', { value: '' }, '家庭共有'), ...(props.members || []).map(item => h('option', { value: item.id }, `${item.emoji || '👤'} ${item.name}`))])])
})

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
const loading = ref(false), saving = ref(false), formVisible = ref(false)
const activeTab = ref('assets'), formMode = ref('asset'), editingAssetId = ref(''), paymentType = ref(''), paymentItem = ref(null)
const members = ref([]), assets = ref([]), receivables = ref([]), liabilities = ref([]), snapshots = ref([])
const summary = reactive({ fund_value: 0, total_assets: 0, total_liabilities: 0, net_worth: 0, investable_assets: 0 })
const categories = reactive({ assets: [], receivables: [], liabilities: [] })
const form = reactive({})

const tabs = computed(() => [
  { key: 'assets', label: '资产', count: assets.value.length },
  { key: 'receivables', label: '应收', count: receivables.value.length },
  { key: 'liabilities', label: '负债', count: liabilities.value.length },
])
const activeTabLabel = computed(() => tabs.value.find(item => item.key === activeTab.value)?.label || '')
const activeTabDescription = computed(() => ({ assets: '手工记录银行、股票、公积金等余额', receivables: '跟踪借出和待收回的款项', liabilities: '记录家庭剩余待还本金' }[activeTab.value]))
const isEditingAsset = computed(() => formMode.value === 'asset' && Boolean(editingAssetId.value))
const formTitle = computed(() => formMode.value === 'payment' ? (paymentType.value === 'receivable' ? '记录回款' : '记录还款') : isEditingAsset.value ? '更新资产' : `新增${activeTabLabel.value}`)
const formEyebrow = computed(() => formMode.value === 'payment' ? paymentItem.value?.name : '家庭财务记账')
const paymentBalance = computed(() => Number(paymentType.value === 'receivable' ? paymentItem.value?.outstanding_amount : paymentItem.value?.outstanding_principal) || 0)

const categoryName = (type, code) => categories[type].find(item => item.code === code)?.name || '其他'
const ownerName = item => item.member_name ? `${item.member_emoji || '👤'} ${item.member_name}` : '家庭共有'
const money = value => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const assetIcon = code => ({ stock: '📈', bank_wealth: '🏦', bond: '📜', gold: '🪙', bank_demand: '💳', bank_fixed: '🏦', cash: '💵', provident_fund: '🏠', medical_account: '🏥', pension_account: '👵', property: '🏡', vehicle: '🚗' }[code] || '📦')
const groupedAssets = computed(() => {
  const map = new Map()
  for (const item of assets.value) {
    const category = categories.assets.find(categoryItem => categoryItem.code === item.category_code)
    const key = category?.group || 'other', name = category?.groupName || '其他资产'
    if (!map.has(key)) map.set(key, { key, name, total: 0, items: [] })
    const group = map.get(key); group.total += Number(item.current_value || 0); group.items.push(item)
  }
  return [...map.values()]
})

const loadData = async () => {
  loading.value = true
  try {
    const [data, memberData] = await Promise.all([familyFinanceApi.overview(), memberApi.list()])
    Object.assign(summary, data.summary || {})
    assets.value = data.assets || []; receivables.value = data.receivables || []; liabilities.value = data.liabilities || []
    snapshots.value = data.snapshots || []; Object.assign(categories, data.categories || {})
    members.value = memberData.members || []
  } catch (error) { showFailToast(error.response?.data?.message || error.message || '加载失败') }
  finally { loading.value = false }
}

const resetForm = values => { Object.keys(form).forEach(key => delete form[key]); Object.assign(form, values) }
const applyAssetCategoryDefault = () => { form.include_in_investable_assets = Boolean(categories.assets.find(item => item.code === form.category_code)?.investable) }
const openCreate = () => {
  editingAssetId.value = ''; formMode.value = activeTab.value === 'assets' ? 'asset' : activeTab.value === 'receivables' ? 'receivable' : 'liability'
  if (formMode.value === 'asset') resetForm({ category_code: '', name: '', current_value: '', institution: '', valuation_date: today(), member_id: '', include_in_investable_assets: false, remark: '' })
  if (formMode.value === 'receivable') resetForm({ category_code: '', name: '', debtor_name: '', original_amount: '', due_date: '', member_id: '' })
  if (formMode.value === 'liability') resetForm({ category_code: '', name: '', creditor_name: '', outstanding_principal: '', monthly_payment: '', member_id: '' })
  formVisible.value = true
}
const openAssetEdit = item => {
  formMode.value = 'asset'; editingAssetId.value = item.id
  resetForm({ ...item, current_value: Number(item.current_value), member_id: item.member_id || '', include_in_investable_assets: Boolean(item.include_in_investable_assets), update_remark: '' })
  formVisible.value = true
}
const openPayment = (type, item) => { formMode.value = 'payment'; paymentType.value = type; paymentItem.value = item; resetForm({ amount: '', payment_date: today(), remark: '' }); formVisible.value = true }

const submitForm = async () => {
  saving.value = true
  try {
    if (formMode.value === 'asset') isEditingAsset.value ? await familyFinanceApi.updateAsset(editingAssetId.value, form) : await familyFinanceApi.createAsset(form)
    else if (formMode.value === 'receivable') await familyFinanceApi.createReceivable(form)
    else if (formMode.value === 'liability') await familyFinanceApi.createLiability({ ...form, original_amount: form.outstanding_principal })
    else if (paymentType.value === 'receivable') await familyFinanceApi.receivePayment(paymentItem.value.id, form)
    else await familyFinanceApi.repayLiability(paymentItem.value.id, form)
    formVisible.value = false; await loadData(); showSuccessToast('已保存')
  } catch (error) { showFailToast(error.response?.data?.message || error.message || '保存失败') }
  finally { saving.value = false }
}

const removeAsset = async () => {
  try { await showConfirmDialog({ title: '删除资产', message: '历史更新会保留，资产将不再计入汇总。' }); await familyFinanceApi.deleteAsset(editingAssetId.value); formVisible.value = false; await loadData(); showSuccessToast('已删除') } catch (error) { if (error !== 'cancel') showFailToast(error.message || '删除失败') }
}
const settle = async (type, item) => {
  try { await showConfirmDialog({ title: '确认结清', message: `确认将“${item.name}”的剩余金额设为0？` }); type === 'receivable' ? await familyFinanceApi.settleReceivable(item.id) : await familyFinanceApi.settleLiability(item.id); await loadData(); showSuccessToast('已结清') } catch (error) { if (error !== 'cancel') showFailToast(error.message || '操作失败') }
}
const captureSnapshot = async () => { saving.value = true; try { await familyFinanceApi.captureSnapshot({ snapshot_date: today() }); await loadData(); showSuccessToast('今日快照已保存') } catch (error) { showFailToast(error.message || '保存失败') } finally { saving.value = false } }

onMounted(loadData)
</script>

<style scoped>
.family-page{min-height:100vh;padding:12px 12px 24px;background:linear-gradient(180deg,#eaf0ff 0,#f5f7fa 360px);color:#172033}.hero{padding:20px;border-radius:24px;background:linear-gradient(145deg,#18275b,#3549a8 58%,#6657d9);color:#fff;box-shadow:0 18px 40px rgba(40,56,132,.25)}.hero-head{display:flex;justify-content:space-between;align-items:flex-start}.hero-head small{font-size:9px;letter-spacing:1.6px;color:#b9c7ff}.hero h1{margin:3px 0 0;font-size:23px}.hero-head button{border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:7px 10px;background:rgba(255,255,255,.12);color:#fff}.net-label{margin-top:26px;font-size:12px;color:#ced6ff}.net-label span{margin-left:5px;font-size:9px;opacity:.7}.net-value{margin-top:6px;font-size:34px;font-weight:800;letter-spacing:-1px}.hero-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:19px}.hero-grid div{padding:9px;border-radius:12px;background:rgba(255,255,255,.1)}.hero-grid span,.hero-grid strong{display:block}.hero-grid span{font-size:9px;color:#ced6ff}.hero-grid strong{margin-top:4px;font-size:12px}.source-card{display:flex;align-items:center;gap:10px;margin:12px 0;padding:13px;border:1px solid #e1e7f3;border-radius:17px;background:#fff}.source-icon{display:grid;width:38px;height:38px;place-items:center;border-radius:12px;background:#eef2ff;color:#5366d9;font-size:20px}.source-card div:nth-child(2){display:flex;flex:1;flex-direction:column}.source-card strong{font-size:14px}.source-card span{margin-top:2px;color:#8c97aa;font-size:10px}.source-card b{font-size:15px}.section-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;padding:4px;border-radius:15px;background:#e6eaf2}.section-tabs button{height:40px;border:0;border-radius:11px;background:transparent;color:#717d91;font-weight:700}.section-tabs button span{margin-left:4px;padding:1px 5px;border-radius:999px;background:#d4dae5;font-size:10px}.section-tabs button.active{background:#fff;color:#4f5fc5;box-shadow:0 3px 10px rgba(32,48,86,.09)}.section-tabs button.active span{background:#596bd5;color:#fff}.content-card,.snapshot-card{margin-top:10px;padding:16px;border:1px solid #e4e8ef;border-radius:20px;background:#fff}.section-head{display:flex;align-items:center;justify-content:space-between}.section-head h2,.snapshot-card h2{font-size:18px}.section-head p,.snapshot-card p{margin-top:3px;color:#929daf;font-size:10px}.add-button,.snapshot-card>button{border:0;border-radius:11px;padding:9px 12px;background:#5365d3;color:#fff;font-weight:700}.asset-group{margin-top:16px}.group-head{display:flex;justify-content:space-between;padding:0 2px 7px;color:#778398;font-size:11px}.group-head strong{color:#3c4658}.finance-row{display:flex;width:100%;align-items:center;gap:10px;padding:11px 0;border:0;border-top:1px solid #edf0f4;background:#fff;text-align:left}.row-icon{display:grid;width:38px;height:38px;flex:none;place-items:center;border-radius:12px;background:#f1f4f9;font-size:19px}.row-main{display:flex;min-width:0;flex:1;flex-direction:column}.row-main strong{overflow:hidden;font-size:14px;text-overflow:ellipsis;white-space:nowrap}.row-main small,.row-value small{margin-top:3px;color:#929daf;font-size:9px}.row-value{display:flex;flex-direction:column;text-align:right}.row-value b{font-size:14px}.plain-list{display:grid;gap:10px;margin-top:14px}.debt-row{padding:14px;border:1px solid #e8edf5;border-radius:15px;background:#fbfcff}.debt-top{display:flex;justify-content:space-between;gap:10px}.debt-top div{display:flex;min-width:0;flex-direction:column}.debt-top strong{font-size:14px}.debt-top span{margin-top:3px;color:#8994a7;font-size:10px}.debt-top>b{color:#d06742;font-size:16px}.liability .debt-top>b{color:#b34e5c}.debt-meta{display:flex;justify-content:space-between;margin-top:10px;color:#7d899d;font-size:10px}.row-actions{display:flex;gap:8px;margin-top:11px}.row-actions button{flex:1;border:0;border-radius:9px;padding:7px;background:#eef1ff;color:#4e5fc2;font-weight:700}.row-actions .ghost{background:#f3f4f6;color:#747f91}.empty-state{display:flex;align-items:center;flex-direction:column;padding:42px 0 30px;color:#929cad}.empty-state span{font-size:34px}.empty-state strong{margin-top:8px;color:#667185;font-size:13px}.empty-state small{margin-top:4px;font-size:10px}.snapshot-card{position:relative}.snapshot-card>button{position:absolute;top:16px;right:16px}.snapshot-list{margin-top:14px}.snapshot-list div{display:flex;justify-content:space-between;padding:9px 0;border-top:1px solid #edf0f4;font-size:11px}.finance-popup{max-height:90vh;overflow-y:auto}.form-sheet{padding:20px 18px 26px}.form-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:17px}.form-head small{color:#6878d8;font-size:9px;font-weight:800;letter-spacing:1px}.form-head h2{margin-top:3px;font-size:21px}.form-head button{width:32px;height:32px;border:0;border-radius:50%;background:#f0f2f6;color:#596477;font-size:22px}.form-sheet label{display:flex;flex-direction:column;gap:6px;margin-top:12px}.form-sheet label>span{color:#687487;font-size:11px;font-weight:700}.form-sheet input:not([type=checkbox]),.form-sheet select{width:100%;height:44px;padding:0 12px;border:1px solid #dfe4ec;border-radius:11px;background:#f9fafc;color:#1b2433;font-size:14px}.switch-row{flex-direction:row!important;align-items:center;justify-content:space-between;padding:10px 0}.switch-row span{display:flex;flex-direction:column}.switch-row small{margin-top:3px;color:#96a0b1;font-weight:400}.switch-row input{width:22px;height:22px}.form-actions{display:flex;gap:9px;margin-top:20px}.form-actions button{height:46px;border:0;border-radius:12px;font-weight:800}.form-actions .primary{flex:1;background:#5365d3;color:#fff}.form-actions .danger{width:82px;background:#fff0f1;color:#c94e5c}.payment-balance{display:flex;justify-content:space-between;padding:15px;border-radius:13px;background:#f0f3ff}.payment-balance span{color:#6f7b90;font-size:12px}.payment-balance strong{color:#4659c4;font-size:17px}@media(max-width:380px){.hero{padding:17px}.net-value{font-size:30px}.hero-grid div{padding:7px 5px}.hero-grid strong{font-size:11px}.net-label span{display:none}}
</style>
