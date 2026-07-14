<template>
  <div class="members-page">
    <!-- 成员列表 -->
    <div class="member-list">
      <div v-for="member in members" :key="member.id" class="member-card">
        <div class="member-main">
          <div class="member-avatar"><span>{{ member.emoji || '👤' }}</span></div>
          <div class="member-info">
            <div class="member-name">{{ member.name }}</div>
            <div class="member-meta">创建于 {{ formatDate(member.created_at) }}</div>
          </div>
          <div class="member-stats">
            <div class="stat-item">
              <div class="stat-value">{{ memberStats[member.id]?.accountCount || 0 }}</div>
              <div class="stat-label">账户</div>
            </div>
          </div>
        </div>
        <div class="member-actions">
          <button class="card-action edit" @click="handleEdit(member)"><van-icon name="edit" />编辑</button>
          <button class="card-action delete" @click="handleDelete(member)"><van-icon name="delete-o" />删除</button>
        </div>
      </div>

      <van-empty v-if="!members.length && !loading" description="暂无成员，点击下方添加" />
    </div>

    <!-- 加载状态 -->
    <van-loading v-if="loading" type="spinner" class="loading" />

    <!-- 添加按钮 -->
    <div class="add-btn-wrapper">
      <van-button round type="primary" class="add-btn" @click="openAddModal">
        <span class="add-btn-content">
          <van-icon name="plus" size="16" />
          <span>新增成员</span>
        </span>
      </van-button>
    </div>

    <!-- 添加/编辑弹窗 -->
    <van-popup v-model:show="showModal" position="bottom" round teleport="body" safe-area-inset-bottom :z-index="11000" :overlay-style="{ zIndex: 10999 }" class="management-editor-popup">
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
            <van-cell title="选择头像">
              <template #value>
                <div class="emoji-picker">
                  <button
                    v-for="emoji in emojiList"
                    :key="emoji"
                    type="button"
                    class="emoji-option"
                    :class="{ selected: formData.emoji === emoji }"
                    @click="formData.emoji = emoji"
                  >{{ emoji }}</button>
                </div>
              </template>
            </van-cell>
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
import { ref, onActivated, onMounted } from 'vue'
import { showConfirmDialog, showToast, showSuccessToast } from 'vant'
import { memberApi, accountApi, default as apiClient } from '../api'
import { shouldRefreshPageData } from '../utils/perfHelpers'

const emit = defineEmits(['data-loaded'])

const loading = ref(false)
const members = ref([])
const memberStats = ref({})
const lastLoadedAt = ref(0)
const hasLoadedOnce = ref(false)
const showModal = ref(false)
const editingMember = ref(null)

const formData = ref({
  name: '',
  emoji: '👤',
})

const emojiList = ['👤', '🧑', '👨', '👩', '👴', '👵', '👦', '👧', '👨‍💼', '👩‍💼', '👨‍🎓', '👩‍🎓', '🧔', '👱‍♀️', '🦸', '🧚', '🐱', '🐶', '🦊', '🐼']

const formatDate = (timestamp) => {
  if (!timestamp) return '-'
  const date = new Date(timestamp * 1000)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const fetchMembers = async () => {
  loading.value = true
  try {
    const [membersData, accountsData] = await Promise.all([
      memberApi.list(),
      accountApi.list(),
    ])
    members.value = membersData?.members || []

    const accounts = accountsData?.accounts || []
    emit('data-loaded', { members: members.value, accounts })
    const stats = {}
    members.value.forEach(m => {
      const memberAccounts = accounts.filter(a => a.member_id === m.id)
      stats[m.id] = {
        accountCount: memberAccounts.length,
      }
    })
    memberStats.value = stats
    hasLoadedOnce.value = true
    lastLoadedAt.value = Date.now()
  } catch (error) {
    console.error('Failed to fetch members:', error)
    showToast('加载失败')
  } finally {
    loading.value = false
  }
}

const ensureFreshData = async ({ force = false } = {}) => {
  if (!shouldRefreshPageData({ hasData: hasLoadedOnce.value, lastLoadedAt: lastLoadedAt.value, force })) {
    return
  }
  await fetchMembers()
}

const openAddModal = () => {
  editingMember.value = null
  formData.value = { name: '', emoji: '👤' }
  showModal.value = true
}

const handleEdit = (member) => {
  editingMember.value = member
  formData.value = {
    name: member.name,
    emoji: member.emoji || '👤',
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
        emoji: formData.value.emoji,
      })
      showSuccessToast('更新成功')
    } else {
      await memberApi.create({
        name: formData.value.name.trim(),
        emoji: formData.value.emoji,
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
  formData.value = { name: '', emoji: '👤' }
}

onMounted(() => {
  // 确保数据库结构是最新的
  apiClient.post('/migrate').catch(() => {})
  ensureFreshData({ force: true })
})

onActivated(() => {
  ensureFreshData()
})
</script>

<style scoped>
.members-page {
  min-height: 100vh;
  background: transparent;
  padding: 12px;
  padding-bottom: var(--app-floating-page-space);
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.member-card {
  background: white;
  border: 1px solid #e9edf3;
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 5px 18px rgba(45, 69, 100, 0.05);
}

.member-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.member-avatar {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 15px;
  background: #f1f6ff;
  font-size: 27px;
}

.member-info {
  flex: 1;
}

.member-name {
  font-weight: 600;
  font-size: 17px;
  color: #20293a;
}

.member-meta {
  font-size: 12px;
  color: #8b96a8;
  margin-top: 4px;
}

.member-stats {
  display: flex;
  gap: 8px;
}

.stat-item {
  text-align: center;
  min-width: 48px;
  padding: 7px 9px;
  border-radius: 11px;
  background: #f4f8ff;
}

.stat-value {
  font-weight: 600;
  font-size: 14px;
  color: #1e80ff;
}

.stat-label {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

.member-actions {
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
  max-height: min(82vh, 720px);
  overflow-y: auto;
  padding: 20px 20px calc(22px + env(safe-area-inset-bottom));
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 20px;
  text-align: center;
}

.emoji-picker {
  display: grid;
  grid-template-columns: repeat(4, 42px);
  justify-content: end;
  gap: 8px;
  padding: 8px 0;
}

.emoji-option {
  width: 42px;
  height: 42px;
  border: 1px solid #e8edf4;
  font-size: 23px;
  cursor: pointer;
  padding: 0;
  border-radius: 12px;
  background: #f6f8fb;
  transition: background 0.2s;
}

.emoji-option:hover {
  background: #f5f5f5;
}

.emoji-option.selected {
  border-color: #1e80ff;
  background: #eaf4ff;
  box-shadow: 0 0 0 2px rgba(30, 128, 255, 0.12);
}

.modal-actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
