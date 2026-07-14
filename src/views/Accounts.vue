<template>
  <div class="accounts-page">
    <!-- 账户列表 -->
    <div class="account-list">
      <div v-for="account in accounts" :key="account.id" class="account-card">
        <div class="account-header">
          <div class="account-icon"><span>{{ getChannelIcon(account.channel) }}</span></div>
          <div class="account-info">
            <div class="account-name">{{ account.account_name }}</div>
            <div class="account-channel">{{ account.channel }}</div>
          </div>
          <div class="account-status" :class="account.status === '正常' ? 'active' : 'inactive'"><i></i>{{ account.status }}</div>
        </div>
        <div class="account-details">
          <span class="member-tag" :class="{ unassigned: !account.member_name }">{{ account.member_name ? `${getMemberEmoji(account.member_id)} ${account.member_name}` : '未分配成员' }}</span>
          <span v-if="account.remark" class="account-remark"><van-icon name="notes-o" />{{ account.remark }}</span>
        </div>
        <div class="account-actions">
          <button class="card-action edit" @click="handleEdit(account)"><van-icon name="edit" />编辑</button>
          <button class="card-action delete" @click="handleDelete(account)"><van-icon name="delete-o" />删除</button>
        </div>
      </div>

      <van-empty v-if="!accounts.length && !loading" description="暂无账户，点击下方添加" />
    </div>

    <!-- 加载状态 -->
    <van-loading v-if="loading" type="spinner" class="loading" />

    <!-- 添加按钮 -->
    <div class="add-btn-wrapper">
      <van-button round type="primary" class="add-btn" @click="openAddModal">
        <span class="add-btn-content">
          <van-icon name="plus" size="16" />
          <span>新增账户</span>
        </span>
      </van-button>
    </div>

    <!-- 添加/编辑弹窗 -->
    <van-popup v-model:show="showAddModal" position="bottom" round>
      <div class="modal-content">
        <div class="modal-title">{{ editingAccount ? '✏️ 编辑账户' : '➕ 添加账户' }}</div>

        <van-form @submit="handleSubmit">
          <van-cell-group inset>
            <van-field
              v-model="formData.accountName"
              label="账户名称"
              placeholder="如：支付宝-主账户"
              :rules="[{ required: true, message: '请输入账户名称' }]"
            />
            <van-field
              v-model="formData.channel"
              is-link
              readonly
              label="渠道"
              placeholder="选择渠道"
              @click="showChannelPicker = true"
              :rules="[{ required: true, message: '请选择渠道' }]"
            />
            <van-field
              v-model="formData.memberName"
              is-link
              readonly
              label="归属成员"
              placeholder="选择成员（可选）"
              @click="showMemberPicker = true"
            />
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

    <!-- 渠道选择器 -->
    <van-popup v-model:show="showChannelPicker" position="bottom">
      <van-picker
        :columns="channelOptions"
        @confirm="onChannelConfirm"
        @cancel="showChannelPicker = false"
      />
    </van-popup>

    <!-- 成员选择器 -->
    <van-popup v-model:show="showMemberPicker" position="bottom">
      <van-picker
        :columns="memberOptions"
        @confirm="onMemberConfirm"
        @cancel="showMemberPicker = false"
      />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, onActivated, onMounted } from 'vue'
import { showConfirmDialog, showToast, showSuccessToast } from 'vant'
import { accountApi, memberApi } from '../api'
import { shouldRefreshPageData } from '../utils/perfHelpers'

const emit = defineEmits(['data-loaded'])

const loading = ref(false)
const accounts = ref([])
const members = ref([])
const lastLoadedAt = ref(0)
const hasLoadedOnce = ref(false)
const showAddModal = ref(false)
const showChannelPicker = ref(false)
const showMemberPicker = ref(false)
const editingAccount = ref(null)
const editingAccountMemberId = ref(null)

const formData = ref({
  accountName: '',
  channel: '',
  memberId: '',
  memberName: '',
  remark: '',
})

const channelOptions = [
  { text: '支付宝', value: '支付宝' },
  { text: '天天基金', value: '天天基金' },
  { text: '微信理财', value: '微信理财' },
  { text: '雪球顾投', value: '雪球顾投' },
  { text: '银行', value: '银行' },
  { text: '京东金融', value: '京东金融' },
  { text: '其他', value: '其他' },
]

const memberOptions = computed(() => {
  return members.value.map(m => ({
    text: m.name,
    value: m.id,
  }))
})

const getChannelIcon = (channel) => {
  const icons = {
    '支付宝': '💙',
    '天天基金': '💚',
    '微信理财': '💜',
    '雪球顾投': '🤖',
    '银行': '🏦',
    '京东金融': '🟠',
    '其他': '📦',
  }
  return icons[channel] || '📦'
}

const getMemberEmoji = (memberId) => {
  const member = members.value.find(m => m.id === memberId)
  return member?.emoji || '👤'
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
  loading.value = true
  try {
    const data = await accountApi.list()
    accounts.value = data?.accounts || []
    emit('data-loaded', accounts.value)
  } catch (error) {
    console.error('Failed to fetch accounts:', error)
    showToast('加载失败')
  } finally {
    loading.value = false
  }
}

const ensureFreshData = async ({ force = false } = {}) => {
  if (!shouldRefreshPageData({ hasData: hasLoadedOnce.value, lastLoadedAt: lastLoadedAt.value, force })) {
    return
  }
  await Promise.all([fetchMembers(), fetchAccounts()])
  hasLoadedOnce.value = true
  lastLoadedAt.value = Date.now()
}

const openAddModal = () => {
  editingAccount.value = null
  editingAccountMemberId.value = null
  formData.value = {
    accountName: '',
    channel: '',
    memberId: '',
    memberName: '',
    remark: '',
  }
  showAddModal.value = true
}

const handleEdit = (account) => {
  editingAccount.value = account
  editingAccountMemberId.value = account.member_id || null
  formData.value = {
    accountName: account.account_name,
    channel: account.channel,
    memberId: account.member_id || '',
    memberName: account.member_name || '',
    remark: account.remark || '',
  }
  showAddModal.value = true
}

const handleDelete = async (account) => {
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: `确定要删除账户 "${account.account_name}" 吗？`,
    })
    await accountApi.delete(account.id)
    showSuccessToast('删除成功')
    fetchAccounts()
  } catch (error) {
    if (error !== 'cancel') {
      showToast('删除失败')
    }
  }
}

const handleSubmit = async () => {
  if (!formData.value.accountName?.trim()) {
    showToast('请输入账户名称')
    return
  }
  if (!formData.value.channel) {
    showToast('请选择渠道')
    return
  }

  try {
    if (editingAccount.value) {
      await accountApi.update(editingAccount.value.id, {
        accountName: formData.value.accountName.trim(),
        channel: formData.value.channel,
        remark: formData.value.remark?.trim() || '',
        member_id: formData.value.memberId || null,
      })
      showSuccessToast('更新成功')
    } else {
      await accountApi.create({
        accountName: formData.value.accountName.trim(),
        channel: formData.value.channel,
        remark: formData.value.remark?.trim() || '',
        member_id: formData.value.memberId || null,
      })
      showSuccessToast('添加成功')
    }
    closeModal()
    fetchAccounts()
  } catch (error) {
    console.error('提交失败:', error)
    const msg = error?.response?.data?.message || error?.message || '网络错误'
    showToast(editingAccount.value ? `更新失败: ${msg}` : `添加失败: ${msg}`)
  }
}

const onChannelConfirm = ({ selectedOptions }) => {
  formData.value.channel = selectedOptions[0].value
  showChannelPicker.value = false
}

const onMemberConfirm = ({ selectedOptions }) => {
  formData.value.memberId = selectedOptions[0].value
  formData.value.memberName = selectedOptions[0].text
  showMemberPicker.value = false
}

const closeModal = () => {
  showAddModal.value = false
  editingAccount.value = null
  editingAccountMemberId.value = null
  formData.value = { accountName: '', channel: '', memberId: '', memberName: '', remark: '' }
}

onMounted(() => {
  ensureFreshData({ force: true })
})

onActivated(() => {
  ensureFreshData()
})
</script>

<style scoped>
.accounts-page {
  min-height: 100vh;
  background: transparent;
  padding: 12px;
  padding-bottom: var(--app-floating-page-space);
}

.account-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.account-card {
  background: white;
  border: 1px solid #e9edf3;
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 5px 18px rgba(45, 69, 100, 0.05);
}

.account-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.account-icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 14px;
  background: #f1f6ff;
  font-size: 25px;
}

.account-info {
  flex: 1;
}

.account-name {
  font-weight: 600;
  font-size: 16px;
  color: #20293a;
}

.account-channel {
  font-size: 13px;
  color: #8b96a8;
  margin-top: 2px;
}

.account-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
}

.account-status i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

.account-status.active {
  background: #e6f7ed;
  color: #07c160;
}

.account-status.inactive {
  background: #f5f5f5;
  color: #999;
}

.account-details {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 11px;
  padding-left: 58px;
  min-width: 0;
}

.member-tag {
  display: inline-block;
  padding: 4px 9px;
  background: #edf5ff;
  color: #1a73e8;
  border-radius: 999px;
  font-size: 12px;
}

.member-tag.unassigned { color: #8b96a8; background: #f1f3f6; }

.account-remark {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  color: #8b96a8;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-actions {
  margin-top: 13px;
  padding-top: 10px;
  border-top: 1px solid #f0f2f5;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.card-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  padding: 4px 7px;
  background: transparent;
  font-size: 12px;
}

.card-action.edit { color: #397ee8; }
.card-action.delete { color: #a1a9b5; }

.loading {
  display: block;
  margin: 40px auto;
}

.add-btn-wrapper {
  position: fixed;
  right: 14px;
  bottom: var(--app-floating-bottom);
  z-index: 20;
}

.add-btn {
  height: 42px;
  padding: 0 14px;
  background: linear-gradient(135deg, #1e80ff 0%, #536be9 100%);
  border: none;
  box-shadow: 0 10px 24px rgba(30, 128, 255, 0.25);
}

.add-btn-content {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
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
