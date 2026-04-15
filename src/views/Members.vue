<template>
  <div class="members-page">
    <!-- 成员列表 -->
    <div class="member-list">
      <div v-for="member in members" :key="member.id" class="member-card">
        <div class="member-main">
          <div class="member-avatar">👤</div>
          <div class="member-info">
            <div class="member-name">{{ member.name }}</div>
            <div class="member-meta">
              创建于 {{ formatDate(member.created_at) }}
            </div>
          </div>
          <div class="member-stats">
            <div class="stat-item">
              <div class="stat-value">{{ memberStats[member.id]?.accountCount || 0 }}</div>
              <div class="stat-label">账户</div>
            </div>
          </div>
        </div>
        <div class="member-actions">
          <van-button size="small" type="primary" @click="handleEdit(member)">编辑</van-button>
          <van-button size="small" type="danger" @click="handleDelete(member)">删除</van-button>
        </div>
      </div>

      <van-empty v-if="!members.length && !loading" description="暂无成员，点击下方添加" />
    </div>

    <!-- 加载状态 -->
    <van-loading v-if="loading" type="spinner" class="loading" />

    <!-- 添加按钮 -->
    <div class="add-btn-wrapper">
      <van-button round type="primary" size="large" class="add-btn" @click="openAddModal">
        ➕ 添加成员
      </van-button>
    </div>

    <!-- 添加/编辑弹窗 -->
    <van-popup v-model:show="showModal" position="bottom" round>
      <div class="modal-content">
        <div class="modal-title">{{ editingMember ? '✏️ 编辑成员' : '➕ 添加成员' }}</div>

        <van-form @submit="handleSubmit">
          <van-cell-group inset>
            <van-field
              v-model="formData.name"
              label="成员名称"
              placeholder="如：媳妇、本人"
              :rules="[{ required: true, message: '请输入成员名称' }]"
            />
          </van-cell-group>

          <div class="modal-actions">
            <van-button round @click="closeModal">取消</van-button>
            <van-button round type="primary" native-type="submit">保存</van-button>
          </div>
        </van-form>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showConfirmDialog, showToast, showSuccessToast } from 'vant'
import { memberApi, accountApi } from '../api'

const loading = ref(false)
const members = ref([])
const memberStats = ref({})
const showModal = ref(false)
const editingMember = ref(null)

const formData = ref({
  name: '',
})

const formatDate = (timestamp) => {
  if (!timestamp) return '-'
  const date = new Date(timestamp * 1000)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const fetchMembers = async () => {
  loading.value = true
  try {
    const data = await memberApi.list()
    members.value = data?.members || []

    // 获取每个成员的账户统计
    const accountsData = await accountApi.list()
    const accounts = accountsData?.accounts || []

    const stats = {}
    members.value.forEach(m => {
      const memberAccounts = accounts.filter(a => a.member_id === m.id)
      stats[m.id] = {
        accountCount: memberAccounts.length,
      }
    })
    memberStats.value = stats
  } catch (error) {
    console.error('Failed to fetch members:', error)
    showToast('加载失败')
  } finally {
    loading.value = false
  }
}

const openAddModal = () => {
  editingMember.value = null
  formData.value = { name: '' }
  showModal.value = true
}

const handleEdit = (member) => {
  editingMember.value = member
  formData.value = {
    name: member.name,
  }
  showModal.value = true
}

const handleDelete = async (member) => {
  const memberAccounts = memberStats.value[member.id]?.accountCount || 0
  let message = `确定要删除成员 "${member.name}" 吗？`
  if (memberAccounts > 0) {
    message += ` 该成员有 ${memberAccounts} 个关联账户，删除后账户将变为"未分配"状态。`
  }

  try {
    await showConfirmDialog({
      title: '确认删除',
      message,
    })
    await memberApi.delete(member.id)
    showSuccessToast('删除成功')
    fetchMembers()
  } catch (error) {
    if (error !== 'cancel') {
      showToast('删除失败')
    }
  }
}

const handleSubmit = async () => {
  if (!formData.value.name?.trim()) {
    showToast('请输入成员名称')
    return
  }

  try {
    if (editingMember.value) {
      await memberApi.update(editingMember.value.id, {
        name: formData.value.name.trim(),
      })
      showSuccessToast('更新成功')
    } else {
      await memberApi.create({
        name: formData.value.name.trim(),
      })
      showSuccessToast('添加成功')
    }
    closeModal()
    fetchMembers()
  } catch (error) {
    console.error('提交失败:', error)
    showToast(editingMember.value ? '更新失败' : '添加失败')
  }
}

const closeModal = () => {
  showModal.value = false
  editingMember.value = null
  formData.value = { name: '' }
}

onMounted(() => {
  fetchMembers()
})
</script>

<style scoped>
.members-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 12px;
  padding-bottom: 80px;
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
}

.member-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.member-avatar {
  font-size: 48px;
  line-height: 1;
}

.member-info {
  flex: 1;
}

.member-name {
  font-weight: 600;
  font-size: 17px;
  color: #333;
}

.member-meta {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.member-stats {
  display: flex;
  gap: 16px;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-weight: 600;
  font-size: 14px;
  color: #333;
}

.stat-label {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

.member-actions {
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
