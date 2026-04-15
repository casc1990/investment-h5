<template>
  <div class="accounts-page">
    <!-- 账户列表 -->
    <div class="account-list">
      <div v-for="account in accounts" :key="account.id" class="account-card">
        <div class="account-header">
          <div class="account-icon">{{ getChannelIcon(account['渠道']) }}</div>
          <div class="account-info">
            <div class="account-name">{{ account['账户名称'] }}</div>
            <div class="account-channel">{{ account['渠道'] }}</div>
          </div>
          <div class="account-status" :class="account['账户状态'] === '正常' ? 'active' : 'inactive'">
            {{ account['账户状态'] }}
          </div>
        </div>
        <div class="account-remark" v-if="account['备注']">
          📝 {{ account['备注'] }}
        </div>
        <!-- 成员标签 -->
        <div class="account-member" v-if="account.member">
          <span class="member-tag">{{ account.member.emoji }} {{ account.member.name }}</span>
        </div>
        <div class="account-actions">
          <van-button size="small" type="primary" @click="handleEdit(account)">编辑</van-button>
          <van-button size="small" type="danger" @click="handleDelete(account)">删除</van-button>
        </div>
      </div>

      <van-empty v-if="!accounts.length && !loading" description="暂无账户，点击下方添加" />
    </div>

    <!-- 加载状态 -->
    <van-loading v-if="loading" type="spinner" class="loading" />

    <!-- 添加按钮 -->
    <div class="add-btn-wrapper">
      <van-button round type="primary" size="large" class="add-btn" @click="openAddModal">
        ➕ 添加账户
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
              placeholder="选择成员"
              @click="showMemberPicker = true"
              :rules="[{ required: true, message: '请选择成员' }]"
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
import { ref, computed, onMounted } from 'vue'
import { showConfirmDialog, showToast, showSuccessToast } from 'vant'
import { accountApi, memberApi } from '../api'

const loading = ref(false)
const accounts = ref([])
const members = ref([])
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
  { text: '银行', value: '银行' },
  { text: '其他', value: '其他' },
]

const memberOptions = computed(() => {
  return members.value.map(m => ({
    text: `${m.emoji} ${m.name}`,
    value: m.id,
  }))
})

const getChannelIcon = (channel) => {
  const icons = {
    '支付宝': '💙',
    '天天基金': '💚',
    '微信理财': '💜',
    '银行': '🏦',
    '其他': '📦',
  }
  return icons[channel] || '📦'
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
  } catch (error) {
    console.error('Failed to fetch accounts:', error)
    showToast('加载失败')
  } finally {
    loading.value = false
  }
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
    accountName: account['账户名称'],
    channel: account['渠道'],
    memberId: account.member_id || '',
    memberName: account.member ? `${account.member.emoji} ${account.member.name}` : '',
    remark: account['备注'] || '',
  }
  showAddModal.value = true
}

const handleDelete = async (account) => {
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: `确定要删除账户 "${account['账户名称']}" 吗？`,
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
  // 前端检查
  if (!formData.value.accountName?.trim()) {
    showToast('请输入账户名称')
    return
  }
  if (!formData.value.channel) {
    showToast('请选择渠道')
    return
  }
  if (!formData.value.memberId) {
    showToast('请选择归属成员')
    return
  }

  try {
    if (editingAccount.value) {
      await accountApi.update(editingAccount.value.id, {
        accountName: formData.value.accountName.trim(),
        channel: formData.value.channel,
        remark: formData.value.remark?.trim() || '',
        member_id: formData.value.memberId,
      })
      showSuccessToast('更新成功')
    } else {
      await accountApi.create({
        accountName: formData.value.accountName.trim(),
        channel: formData.value.channel,
        remark: formData.value.remark?.trim() || '',
        member_id: formData.value.memberId,
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
  fetchMembers()
  fetchAccounts()
})
</script>

<style scoped>
.accounts-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 12px;
  padding-bottom: 80px;
}

.account-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.account-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
}

.account-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.account-icon {
  font-size: 36px;
}

.account-info {
  flex: 1;
}

.account-name {
  font-weight: 600;
  font-size: 16px;
  color: #333;
}

.account-channel {
  font-size: 13px;
  color: #999;
  margin-top: 2px;
}

.account-status {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
}

.account-status.active {
  background: #e6f7ed;
  color: #07c160;
}

.account-status.inactive {
  background: #f5f5f5;
  color: #999;
}

.account-remark {
  margin-top: 10px;
  font-size: 13px;
  color: #666;
  padding-left: 48px;
}

.account-member {
  margin-top: 8px;
  padding-left: 48px;
}

.member-tag {
  display: inline-block;
  padding: 2px 8px;
  background: #e8f0fe;
  color: #1a73e8;
  border-radius: 4px;
  font-size: 12px;
}

.account-actions {
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
