<template>
  <section class="household-users">
    <div class="household-card">
      <div>
        <span>当前家庭</span>
        <strong>{{ me.household_name || '我的家庭' }}</strong>
        <small>{{ roleLabel(me.role) }} · {{ users.length }} 位用户</small>
      </div>
      <div class="header-actions">
        <van-button v-if="isOwner" size="small" type="primary" round @click="showInviteEditor = true">邀请家人</van-button>
        <van-button v-if="isSuperAdmin" size="small" plain type="primary" round @click="showWhitelistEditor = true">添加白名单</van-button>
      </div>
    </div>

    <div v-if="isOwner" class="section-card">
      <div class="section-title"><strong>家庭邀请</strong><span>最多邀请10位家人，受邀用户无需注册白名单</span></div>
      <div v-if="!invites.length" class="empty">暂无邀请记录</div>
      <div v-for="invite in invites" :key="invite.id" class="invite-row">
        <div><strong>{{ roleLabel(invite.role) }}</strong><span>{{ inviteStatus(invite) }} · {{ formatDate(invite.created_at) }}</span></div>
        <button v-if="inviteStatus(invite) === '等待加入'" type="button" @click="revokeInvite(invite)">撤销</button>
      </div>
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
        <van-button v-if="isOwner && !['super_admin', 'owner'].includes(user.role)" size="mini" plain type="primary" @click="editUser(user)">管理</van-button>
      </div>
    </div>

    <div v-if="isSuperAdmin" class="section-card">
      <div class="section-title"><strong>注册白名单</strong><span>白名单用户注册后会创建自己的独立家庭</span></div>
      <div v-if="!whitelist.length" class="empty">暂无待注册用户</div>
      <div v-for="entry in whitelist" :key="entry.id" class="invite-row">
        <div><strong>@{{ entry.username }}</strong><span>{{ roleLabel(entry.role) }} · {{ entry.status === 'used' ? `已由 ${entry.used_by_name || entry.username} 注册` : '等待注册' }}</span></div>
        <button v-if="entry.status === 'pending'" type="button" @click="removeWhitelist(entry)">移除</button>
      </div>
    </div>

    <van-popup v-model:show="showWhitelistEditor" position="bottom" round teleport="body" safe-area-inset-bottom class="editor-popup">
      <div class="popup-body">
        <h3>添加注册白名单</h3>
        <p>登记后对方可以注册，系统会为其创建独立家庭，不会看到你的数据。</p>
        <van-field v-model="whitelistUsername" label="用户名" placeholder="4至30位字符" maxlength="30" clearable />
        <div class="independent-note"><van-icon name="shield-o" /><span><strong>独立家庭所有者</strong>注册后拥有自己的空白家庭空间</span></div>
        <van-button block round type="primary" :loading="saving" @click="addWhitelist">确认添加</van-button>
      </div>
    </van-popup>

    <van-popup v-model:show="showInviteEditor" position="bottom" round teleport="body" safe-area-inset-bottom class="editor-popup" @closed="createdInviteLink = ''">
      <div class="popup-body">
        <h3>邀请家人加入</h3>
        <p>邀请码7天内有效且只能使用一次。家庭最多可邀请加入10位用户。</p>
        <template v-if="!createdInviteLink">
          <div class="role-options">
            <button type="button" :class="{ active: inviteRole === 'viewer' }" @click="inviteRole = 'viewer'"><strong>只读成员</strong><span>只能查看家庭数据</span></button>
            <button type="button" :class="{ active: inviteRole === 'admin' }" @click="inviteRole = 'admin'"><strong>家庭管理员</strong><span>可以维护家庭数据</span></button>
          </div>
          <van-button block round type="primary" :loading="saving" @click="createInvite">生成邀请链接</van-button>
        </template>
        <template v-else>
          <div class="invite-link"><van-icon name="passed" /><div><strong>邀请链接已生成</strong><span>{{ createdInviteLink }}</span></div></div>
          <van-button block round type="primary" @click="copyInvite">复制邀请链接</van-button>
        </template>
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
const whitelist = ref([])
const invites = ref([])
const showWhitelistEditor = ref(false)
const showInviteEditor = ref(false)
const showUserEditor = ref(false)
const whitelistUsername = ref('')
const editingUser = ref(null)
const editRole = ref('viewer')
const saving = ref(false)
const inviteRole = ref('viewer')
const createdInviteLink = ref('')
const isOwner = computed(() => ['super_admin', 'owner'].includes(me.value.role))
const isSuperAdmin = computed(() => me.value.role === 'super_admin' && String(me.value.username || '').toLowerCase() === 'admin')
const roleLabel = role => ({ super_admin: '超级管理员', owner: '家庭所有者', admin: '管理员', viewer: '只读成员' }[role] || '家庭成员')

async function load() {
  me.value = await authApi.me()
  const userData = await householdApi.users()
  users.value = userData.users || []
  if (isOwner.value) {
    const inviteData = await householdApi.invites()
    invites.value = inviteData.invites || []
  }
  if (isSuperAdmin.value) {
    const whitelistData = await householdApi.whitelist()
    whitelist.value = whitelistData.whitelist || []
  }
}

async function createInvite() {
  saving.value = true
  try {
    const data = await householdApi.createInvite({ role: inviteRole.value })
    createdInviteLink.value = `${window.location.origin}/register?invite=${encodeURIComponent(data.invite_code)}`
    await load()
  } catch (error) { showToast(error?.response?.data?.message || '生成邀请失败') }
  finally { saving.value = false }
}

async function copyInvite() {
  try { await navigator.clipboard.writeText(createdInviteLink.value); showToast('邀请链接已复制') }
  catch { showToast('复制失败，请长按链接复制') }
}

const inviteStatus = invite => invite.used_at ? `已由${invite.used_by_name || '家庭成员'}加入` : invite.revoked_at ? '已撤销' : Number(invite.expires_at || 0) <= Date.now() / 1000 ? '已过期' : '等待加入'
const formatDate = value => value ? new Date(Number(value) * 1000).toLocaleDateString('zh-CN') : ''

async function revokeInvite(invite) {
  await showConfirmDialog({ title: '撤销邀请', message: '撤销后该邀请链接将立即失效。' })
  await householdApi.revokeInvite(invite.id)
  showToast('邀请已撤销')
  await load()
}

async function addWhitelist() {
  const username = whitelistUsername.value.trim()
  if (!username) return showToast('请输入用户名')
  saving.value = true
  try {
    await householdApi.addWhitelist({ username })
    showToast('已加入注册白名单')
    showWhitelistEditor.value = false
    whitelistUsername.value = ''
    await load()
  } catch (error) { showToast(error?.response?.data?.message || '添加失败') }
  finally { saving.value = false }
}
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

async function removeWhitelist(entry) {
  await showConfirmDialog({ title: '移出白名单', message: `移除 @${entry.username} 后，该用户名将无法注册。` })
  await householdApi.removeWhitelist(entry.id)
  showToast('已移出白名单')
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
.header-actions { display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
.household-card strong { margin:3px 0; color:#172033; font-size:20px; }
.section-title { margin-bottom:8px; }.section-title strong { color:#263247; font-size:17px; }.section-title span { margin-top:3px; }
.user-row { display:flex; align-items:center; gap:11px; padding:13px 0; border-top:1px solid #edf0f5; }
.avatar { display:grid; place-items:center; width:42px; height:42px; flex:none; border-radius:13px; background:#f1f6ff; font-size:22px; }
.user-info { flex:1; gap:2px; }.user-info strong { color:#253044; font-size:15px; }.user-info em { margin-left:6px; padding:2px 5px; border-radius:6px; background:#e8f3ff; color:#1e80ff; font-size:9px; font-style:normal; }
.invite-row { display:flex; justify-content:space-between; padding:12px 0; border-top:1px solid #edf0f5; }.invite-row button { border:0; background:transparent; color:#ee5d5d; }
.empty { padding:18px 0 4px; text-align:center; color:#a0a9b8; font-size:13px; }
.editor-popup { max-height:82vh; }.popup-body { padding:24px 20px calc(24px + env(safe-area-inset-bottom)); }.popup-body h3 { font-size:22px; }.popup-body p { margin:5px 0 18px; color:#8b96a8; font-size:13px; }
.role-options { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:18px; }.role-options button { display:flex; flex-direction:column; gap:4px; padding:14px; border:1px solid #e1e7ef; border-radius:13px; background:#fff; color:#334057; text-align:left; }.role-options button span { color:#919cad; font-size:11px; }.role-options button.active { border-color:#1e80ff; background:#edf6ff; color:#1e80ff; }
.independent-note { display:flex; align-items:center; gap:9px; margin:0 0 8px; padding:13px; border-radius:13px; background:#eef7ff; color:#2580df; font-size:18px; }.independent-note span { display:flex; flex-direction:column; color:#7d8a9d; font-size:12px; }.independent-note strong { margin-bottom:2px; color:#33445d; font-size:14px; }
.invite-link { display:flex; gap:10px; padding:14px; border-radius:13px; background:#eff8f3; color:#20a66a; }.invite-link>.van-icon { margin-top:2px; font-size:20px; }.invite-link div { display:flex; flex-direction:column; min-width:0; gap:4px; }.invite-link strong { color:#304559; }.invite-link span { overflow-wrap:anywhere; color:#6f8192; font-size:12px; line-height:1.5; }
.popup-body :deep(.van-field) { margin-bottom:14px; padding:13px 14px; border:1px solid #e1e7ef; border-radius:13px; background:#f8fafc; }
:deep(.van-button) { margin-top:10px; }
</style>
