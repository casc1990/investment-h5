<template>
  <div class="detail-page">
    <van-nav-bar title="资产详情" left-arrow fixed placeholder @click-left="router.push('/family-finance')" />

    <template v-if="asset">
      <section class="asset-hero">
        <div class="hero-title"><span>{{ assetIcon(asset.category_code) }}</span><div><small>{{ category?.groupName || '家庭资产' }} · {{ category?.name || '其他资产' }}</small><h1>{{ asset.name }}</h1></div></div>
        <div class="amount-label">当前金额</div>
        <div class="amount-value">{{ money(asset.current_value) }}</div>
        <div class="hero-meta"><span>{{ asset.member_emoji || '👤' }} {{ asset.member_name || '未关联成员' }}</span><span>记录日期 {{ asset.valuation_date }}</span></div>
      </section>

      <section class="overview-card">
        <div class="section-head"><div><h2>资产总览</h2><p>当前登记信息</p></div><button @click="openEdit">更新资产</button></div>
        <div class="overview-grid">
          <div><span>资产大类</span><strong>{{ category?.groupName || '其他资产' }}</strong></div>
          <div><span>二级分类</span><strong>{{ category?.name || '其他' }}</strong></div>
          <div><span>所属成员</span><strong>{{ asset.member_name || '未关联' }}</strong></div>
          <div><span>可投资资产</span><strong>{{ asset.include_in_investable_assets ? '计入' : '不计入' }}</strong></div>
        </div>
        <div class="remark"><span>备注</span><p>{{ asset.remark || '暂无备注' }}</p></div>
      </section>

      <section class="records-card">
        <div class="section-head"><div><h2>资产记录</h2><p>录入及每次更新都会留痕</p></div><b>{{ records.length }} 条</b></div>
        <div v-if="records.length" class="record-list">
          <article v-for="record in records" :key="record.id" class="record-row">
            <div class="record-line"><strong>{{ record.remark || '资产更新' }}</strong><time>{{ record.record_date }}</time></div>
            <div class="record-values"><span>{{ money(record.previous_value) }} → {{ money(record.current_value) }}</span><b :class="changeClass(record.change_value)">{{ signedMoney(record.change_value) }}</b></div>
          </article>
        </div>
        <van-empty v-else description="暂无资产记录" />
      </section>
    </template>
    <van-loading v-else-if="loading" class="page-loading" type="spinner" />

    <van-popup v-model:show="editVisible" position="bottom" round safe-area-inset-bottom teleport="body" :z-index="12000" class="asset-popup">
      <form class="edit-sheet" @submit.prevent="saveAsset">
        <div class="form-head"><div><small>家庭财务记账</small><h2>更新资产</h2></div><button type="button" @click="editVisible = false">×</button></div>
        <label><span>资产大类</span><select v-model="form.asset_group" required @change="handleGroupChange"><option value="" disabled>请选择大类</option><option v-for="item in assetGroups" :key="item.code" :value="item.code">{{ item.name }}</option></select></label>
        <label><span>二级分类</span><select v-model="form.category_code" required :disabled="!form.asset_group" @change="applyCategoryDefault"><option value="" disabled>请选择二级分类</option><option v-for="item in filteredCategories" :key="item.code" :value="item.code">{{ item.name }}</option></select></label>
        <label><span>资产名称</span><input v-model.trim="form.name" required maxlength="80" /></label>
        <label><span>当前金额</span><input v-model="form.current_value" required type="number" min="0" step="0.01" inputmode="decimal" /></label>
        <label><span>记录日期</span><input v-model="form.valuation_date" required type="date" /></label>
        <label><span>备注</span><input v-model.trim="form.remark" maxlength="200" placeholder="可填写金融机构、存放位置等附加信息" /></label>
        <label><span>本次更新说明</span><input v-model.trim="form.update_remark" maxlength="120" placeholder="例如：更新8月份账户余额" /></label>
        <label><span>所属成员</span><select v-model="form.member_id" required><option value="" disabled>请选择家庭成员</option><option v-for="item in members" :key="item.id" :value="item.id">{{ item.emoji || '👤' }} {{ item.name }}</option></select></label>
        <label class="switch-row"><span><b>计入可投资资产</b><small>受限资产通常不计入</small></span><input v-model="form.include_in_investable_assets" type="checkbox" /></label>
        <div class="form-actions"><button type="button" class="danger" @click="removeAsset">删除资产</button><button type="submit" class="primary" :disabled="saving">{{ saving ? '保存中...' : '保存更新' }}</button></div>
      </form>
    </van-popup>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { familyFinanceApi, memberApi } from '../api'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const editVisible = ref(false)
const asset = ref(null)
const category = ref(null)
const records = ref([])
const categories = ref([])
const members = ref([])
const form = reactive({})

const money = value => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const signedMoney = value => `${Number(value || 0) > 0 ? '+' : ''}${money(value)}`
const changeClass = value => Number(value || 0) > 0 ? 'increase' : Number(value || 0) < 0 ? 'decrease' : 'unchanged'
const assetIcon = code => ({ stock: '📈', bank_wealth: '🏦', bond: '📜', gold: '🪙', bank_demand: '💳', bank_fixed: '🏦', cash: '💵', provident_fund: '🏠', medical_account: '🏥', pension_account: '👵', property: '🏡', vehicle: '🚗' }[code] || '📦')
const assetGroups = computed(() => {
  const groups = new Map()
  categories.value.forEach(item => { if (!groups.has(item.group)) groups.set(item.group, { code: item.group, name: item.groupName }) })
  return [...groups.values()]
})
const filteredCategories = computed(() => categories.value.filter(item => item.group === form.asset_group))

const loadDetail = async () => {
  loading.value = true
  try {
    const detail = await familyFinanceApi.assetDetail(route.params.id)
    asset.value = detail.asset
    category.value = detail.category
    records.value = detail.records || []
    categories.value = detail.categories || []
    memberApi.list()
      .then(memberData => { members.value = memberData.members || [] })
      .catch(error => console.warn('家庭成员刷新失败:', error.message || error))
  } catch (error) { showFailToast(error.response?.data?.message || error.message || '资产详情加载失败') }
  finally { loading.value = false }
}
const openEdit = () => {
  Object.keys(form).forEach(key => delete form[key])
  Object.assign(form, { ...asset.value, asset_group: category.value?.group || '', current_value: Number(asset.value.current_value), member_id: asset.value.member_id || '', include_in_investable_assets: Boolean(asset.value.include_in_investable_assets), update_remark: '' })
  editVisible.value = true
}
const handleGroupChange = () => { form.category_code = ''; form.include_in_investable_assets = false }
const applyCategoryDefault = () => { form.include_in_investable_assets = Boolean(categories.value.find(item => item.code === form.category_code)?.investable) }
const saveAsset = async () => {
  saving.value = true
  try {
    await familyFinanceApi.updateAsset(route.params.id, form)
    editVisible.value = false
    await loadDetail()
    showSuccessToast('资产已更新')
  } catch (error) { showFailToast(error.response?.data?.message || error.message || '更新失败') }
  finally { saving.value = false }
}
const removeAsset = async () => {
  try {
    await showConfirmDialog({ title: '删除资产', message: '资产将不再计入家庭财务汇总，历史记录仍会保留。' })
    await familyFinanceApi.deleteAsset(route.params.id)
    showSuccessToast('资产已删除')
    router.replace('/family-finance')
  } catch (error) { if (error !== 'cancel') showFailToast(error.response?.data?.message || error.message || '删除失败') }
}

onMounted(loadDetail)
</script>

<style scoped>
.detail-page { min-height: 100vh; padding: 12px 12px var(--app-floating-page-space); background: #f5f5f5; color: #1f2937; }
.asset-hero { padding: 18px 20px 16px; border-radius: 12px; background: linear-gradient(135deg, #1e80ff 0%, #0066cc 100%); color: #fff; }
.hero-title { display: flex; align-items: center; gap: 10px; }
.hero-title > span { font-size: 32px; }
.hero-title small { font-size: 11px; opacity: .82; }
.hero-title h1 { margin-top: 3px; font-size: 18px; }
.amount-label { margin-top: 20px; font-size: 12px; opacity: .82; }
.amount-value { margin-top: 4px; font-family: 'Courier New', monospace; font-size: 30px; font-weight: 700; }
.hero-meta { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.22); font-size: 11px; }
.overview-card,.records-card { margin-top: 12px; padding: 16px; border-radius: 12px; background: #fff; }
.section-head { display: flex; align-items: center; justify-content: space-between; }
.section-head h2 { font-size: 16px; }
.section-head p { margin-top: 4px; color: #94a3b8; font-size: 12px; }
.section-head button { border: 0; border-radius: 9px; padding: 9px 12px; background: #1e80ff; color: #fff; font-size: 12px; }
.section-head > b { color: #64748b; font-size: 12px; }
.overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
.overview-grid div { padding: 11px; border-radius: 9px; background: #f8fafc; }
.overview-grid span,.overview-grid strong { display: block; }
.overview-grid span { color: #94a3b8; font-size: 11px; }
.overview-grid strong { margin-top: 5px; font-size: 13px; }
.remark { margin-top: 12px; padding: 12px; border-radius: 9px; background: #f8fafc; }
.remark span { color: #94a3b8; font-size: 11px; }
.remark p { margin-top: 5px; color: #475569; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
.record-list { margin-top: 12px; }
.record-row { padding: 13px 0; border-top: 1px solid #f1f5f9; }
.record-line,.record-values { display: flex; justify-content: space-between; gap: 12px; }
.record-line strong { font-size: 13px; }
.record-line time { color: #94a3b8; font-size: 11px; }
.record-values { margin-top: 7px; color: #64748b; font-family: 'Courier New', monospace; font-size: 12px; }
.record-values b.increase { color: #dc2626; }
.record-values b.decrease { color: #16a34a; }
.record-values b.unchanged { color: #64748b; }
.page-loading { display: flex; justify-content: center; padding: 80px 0; }
.asset-popup { max-height: 90vh; overflow-y: auto; }
.edit-sheet { padding: 20px 18px 26px; }
.form-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 17px; }
.form-head small { color: #1e80ff; font-size: 11px; font-weight: 600; }
.form-head h2 { margin-top: 3px; font-size: 20px; }
.form-head button { width: 32px; height: 32px; border: 0; border-radius: 50%; background: #f3f4f6; color: #64748b; font-size: 22px; }
.edit-sheet label { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.edit-sheet label > span { color: #64748b; font-size: 12px; font-weight: 600; }
.edit-sheet input:not([type=checkbox]),.edit-sheet select { width: 100%; height: 44px; padding: 0 12px; border: 1px solid #dfe4ec; border-radius: 10px; background: #fff; color: #1f2937; font-size: 14px; }
.edit-sheet input:focus,.edit-sheet select:focus { border-color: #1e80ff; outline: none; box-shadow: 0 0 0 3px rgba(30,128,255,.1); }
.switch-row { flex-direction: row !important; align-items: center; justify-content: space-between; padding: 10px 0; }
.switch-row span { display: flex; flex-direction: column; }
.switch-row small { margin-top: 3px; color: #94a3b8; font-weight: 400; }
.switch-row input { width: 22px; height: 22px; accent-color: #1e80ff; }
.form-actions { display: flex; gap: 9px; margin-top: 20px; }
.form-actions button { height: 46px; border: 0; border-radius: 10px; font-size: 14px; font-weight: 700; }
.form-actions .danger { width: 96px; background: #fff0f1; color: #dc2626; }
.form-actions .primary { flex: 1; background: #1e80ff; color: #fff; }
</style>
