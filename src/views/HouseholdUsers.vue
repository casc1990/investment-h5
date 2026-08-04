<template>
  <section class="household-users">
    <div class="household-card">
      <div>
        <span>当前家庭</span>
        <strong>{{ me.household_name || '我的家庭' }}</strong>
        <small>{{ roleLabel(me.role) }} · {{ users.length }} 位用户</small>
      </div>
      <van-button v-if="isOwner" size="small" type="primary" round @click="showInvite = true">邀请用户</van-button>
    </div>

    <div class="section-card">
      <div class="section-title"><strong>家庭用户</strong><span>登录用户与资产归属成员相互独立</span></div>
      <div v-for="user in users" :key="user.id" class="user-row">
        <div class="avatar">{{ user.linked_member_emoji || '👤' }}</div>
        <div class="user-info">
          <strong>{{ user.display_name || user.username }}<em v-if="user.id === me.id">当前</em></strong>
          <span>@{{ user.username }} · {{ roleLabel(user.role) }}</span>
          <small>{{ user.status === 'disabled' ? '已停用' : user.linked_member_name ? `关联成员：${user.linked_member_name}` : '未关联资产成员' }}</small>
        </div>
        <van-button v-if="isOwner && user.role !== 'owner'" size="mini" plain type="primary" @click="editUser(user)">管理</van-button>
      </div>
    </div>

    <div v-if="isOwner" class="section-card">
      <div class="section-title"><strong>邀请记录</strong><span>邀请码7天有效且只能使用一次</span></div>
      <div v-if="!invites.length" class="empty">暂无邀请记录</div>
      <div v-for="invite in invites" :key="invite.id" class="invite-row">
        <div><strong>{{ roleLabel(invite.role) }}</strong><span>{{ inviteStatus(invite) }}</span></div>
        <button v-if="inviteStatus(invite) === '待使用'" type="button" @click="revokeInvite(invite)">撤销</button>
      </div>
    </div>

    <van-popup v-model:show="showInvite" position="bottom" round teleport="body" safe-area-inset-bottom class="editor-popup">
      <div class="popup-body">
        <h3>邀请家庭用户</h3>
        <p>选择加入后的权限。邀请码只会完整显示这一次。</p>
        <div class="role-options">
          <button type="button" :class="{ active: inviteRole === 'viewer' }" @click="inviteRole = 'viewer'"><strong>只读成员</strong><span>只能查看家庭数据</span></button>
          <button type="button" :class="{ active: inviteRole === 'admin' }" @click="inviteRole = 'admin'"><strong>管理员</strong><span>可以维护财务数据</span></button>
        </div>
        <div v-if="createdCode" class="code-box"><span>邀请码</span><strong>{{ createdCode }}</strong><button type="button" @click="copyCode">复制</button></div>
        <van-button v-if="!createdCode" block round type="primary" :loading="saving" @click="createInvite">生成邀请码</van-button>
        <van-button v-else block round type="primary" @click="closeInvite">完成</van-button>
      </div>
    </van-popup>

    <van-popup v-model:show="showUserEditor" position="bottom" round teleport="body" safe-area-inset-bottom class="editor-popup">
      <div class="popup-body">
        <h3>管理 {{ editingUser?.display_name }}</h3>
        <p>停用后该用户所有登录会话会立即失效。</p>
        <div class="role-options">
          <button type="button" :class="{ active: editRole === 'viewer' }" @click="editRole = 'viewer'"><strong>只读成员</strong><span>只能查看</span></button>
          <button type="button" :class="{ active: editRole === 'admin' }" @click="editRole = 'admin'"><strong>管理员</strong><span>可以维护数据</span></button>
        </div>
        <van-button block round type="primary" :loading="saving" @click="saveUser">保存权限</van-button>
        <van-button block round :type="editingUser?.status === 'disabled' ? 'success' : 'danger'" plain :loading="saving" @click="toggleUser">
          {{ editingUser?.status === 'disabled' ? '恢复用户' : '停用用户' }}
        </van-button>
      </div>
    </van-popup>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import { authApi, householdApi } from '../api'

const me = ref({})
const users = ref([])
const invites = ref([])
const showInvite = ref(false)
const showUserEditor = ref(false)
const inviteRole = ref('viewer')
const createdCode = ref('')
const editingUser = ref(null)
const editRole = ref('viewer')
const saving = ref(false)
const isOwner = computed(() => me.value.role === 'owner')
const roleLabel = role => ({ owner: '家庭所有者', admin: '管理员', viewer: '只读成员' }[role] || '家庭成员')

function inviteStatus(invite) {
  if (invite.used_at) return `已由 ${invite.used_by_name || '家庭用户'} 使用`
  if (invite.revoked_at) return '已撤销'
  if (Number(invite.expires_at || 0) * 1000 <= Date.now()) return '已过期'
  return '待使用'
}

async function load() {
  me.value = await authApi.me()
  const userData = await householdApi.users()
  users.value = userData.users || []
  if (me.value.role === 'owner') {
    const inviteData = await householdApi.invites()
    invites.value = inviteData.invites || []
  }
}

async function createInvite() {
  saving.value = true
  try {
    const data = await householdApi.createInvite({ role: inviteRole.value })
    createdCode.value = data.invite_code
    await load()
  } catch (error) { showToast(error?.response?.data?.message || '生成失败') }
  finally { saving.value = false }
}

async function copyCode() {
  await navigator.clipboard.writeText(createdCode.value)
  showToast('邀请码已复制')
}

function closeInvite() { showInvite.value = false; createdCode.value = ''; inviteRole.value = 'viewer' }
function editUser(user) { editingUser.value = user; editRole.value = user.role; showUserEditor.value = true }

async function saveUser() {
  saving.value = true
  try { await householdApi.updateUser(editingUser.value.id, { role: editRole.value }); showToast('权限已更新'); showUserEditor.value = false; await load() }
  catch (error) { showToast(error?.response?.data?.message || '保存失败') }
  finally { saving.value = false }
}

async function toggleUser() {
  const disabling = editingUser.value.status !== 'disabled'
  if (disabling) await showConfirmDialog({ title: '停用用户', message: '停用后该用户会立即退出所有设备，确定继续吗？' })
  saving.value = true
  try { await householdApi.updateUser(editingUser.value.id, { status: disabling ? 'disabled' : 'active' }); showToast(disabling ? '用户已停用' : '用户已恢复'); showUserEditor.value = false; await load() }
  catch (error) { if (error !== 'cancel') showToast(error?.response?.data?.message || '操作失败') }
  finally { saving.value = false }
}

async function revokeInvite(invite) {
  await showConfirmDialog({ title: '撤销邀请', message: '撤销后该邀请码立即失效。' })
  await householdApi.revokeInvite(invite.id)
  showToast('邀请码已撤销')
  await load()
}

onMounted(() => load().catch(error => showToast(error?.response?.data?.message || '家庭用户加载失败')))
</script>

<style scoped>
.household-users { padding: 10px 12px 26px; }
.household-card,.section-card { margin-bottom: 12px; padding: 16px; border: 1px solid #e5ebf3; border-radius: 17px; background: #fff; box-shadow: 0 8px 24px rgba(44,72,110,.06); }
.household-card { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.household-card div,.section-title,.user-info,.invite-row div { display:flex; flex-direction:column; min-width:0; }
.household-card span,.section-title span,.user-info span,.user-info small,.invite-row span { color:#8a96a8; font-size:12px; }
.household-card strong { margin:3px 0; color:#172033; font-size:20px; }
.section-title { margin-bottom:8px; }.section-title strong { color:#263247; font-size:17px; }.section-title span { margin-top:3px; }
.user-row { display:flex; align-items:center; gap:11px; padding:13px 0; border-top:1px solid #edf0f5; }
.avatar { display:grid; place-items:center; width:42px; height:42px; flex:none; border-radius:13px; background:#f1f6ff; font-size:22px; }
.user-info { flex:1; gap:2px; }.user-info strong { color:#253044; font-size:15px; }.user-info em { margin-left:6px; padding:2px 5px; border-radius:6px; background:#e8f3ff; color:#1e80ff; font-size:9px; font-style:normal; }
.invite-row { display:flex; justify-content:space-between; padding:12px 0; border-top:1px solid #edf0f5; }.invite-row button { border:0; background:transparent; color:#ee5d5d; }
.empty { padding:18px 0 4px; text-align:center; color:#a0a9b8; font-size:13px; }
.editor-popup { max-height:82vh; }.popup-body { padding:24px 20px calc(24px + env(safe-area-inset-bottom)); }.popup-body h3 { font-size:22px; }.popup-body p { margin:5px 0 18px; color:#8b96a8; font-size:13px; }
.role-options { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:18px; }.role-options button { display:flex; flex-direction:column; gap:4px; padding:14px; border:1px solid #e1e7ef; border-radius:13px; background:#fff; color:#334057; text-align:left; }.role-options button span { color:#919cad; font-size:11px; }.role-options button.active { border-color:#1e80ff; background:#edf6ff; color:#1e80ff; }
.code-box { display:grid; grid-template-columns:1fr auto; gap:6px; margin-bottom:16px; padding:14px; border-radius:13px; background:#f2f7ff; }.code-box span { grid-column:1/-1; color:#8490a3; font-size:11px; }.code-box strong { overflow-wrap:anywhere; color:#1d5f9e; }.code-box button { border:0; background:transparent; color:#1e80ff; }
:deep(.van-button) { margin-top:10px; }
</style>
