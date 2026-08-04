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
      <div class="section-title"><strong>家庭邀请</strong><span>已加入 {{ invitedUserCount }}/10 位家人 · 受邀用户无需注册白名单</span></div>
      <div v-if="!currentInvites.length" class="empty">暂无等待或已加入的邀请</div>
      <div v-if="currentInvites.length" class="invite-table-wrap">
        <div class="invite-table">
          <div class="invite-table-row invite-table-head">
            <span>时间</span><span>权限</span><span>受邀用户</span><span>资产成员</span><span>状态</span><span>操作</span>
          </div>
          <div v-for="invite in currentInvites" :key="invite.id" class="invite-table-row">
            <span>{{ formatShortDate(invite.created_at) }}</span>
            <span>{{ shortRoleLabel(invite.role) }}</span>
            <strong>{{ invite.used_by_name || '待注册' }}</strong>
            <span>{{ inviteMemberLabel(invite) }}</span>
            <em :class="`status-${inviteStatusCode(invite)}`">{{ inviteStatusLabel(invite) }}</em>
            <button v-if="inviteStatusCode(invite) === 'waiting'" type="button" class="danger-action" @click="revokeInvite(invite)">撤销</button>
            <button v-else type="button" @click="viewInvite(invite)">查看</button>
          </div>
          <template v-if="showInviteHistory">
            <div v-for="invite in historicalInvites" :key="invite.id" class="invite-table-row historical">
              <span>{{ formatShortDate(invite.created_at) }}</span>
              <span>{{ shortRoleLabel(invite.role) }}</span>
              <strong>{{ invite.used_by_name || '-' }}</strong>
              <span>{{ inviteMemberLabel(invite) }}</span>
              <em :class="`status-${inviteStatusCode(invite)}`">{{ inviteStatusLabel(invite) }}</em>
              <span>-</span>
            </div>
          </template>
        </div>
      </div>
      <button v-if="historicalInvites.length" type="button" class="history-toggle" @click="showInviteHistory = !showInviteHistory">
        <span>历史邀请 {{ historicalInvites.length }} 条</span><van-icon :name="showInviteHistory ? 'arrow-up' : 'arrow-down'" />
      </button>
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
        <van-button v-if="isOwner && (user.id === me.id || !['super_admin', 'owner'].includes(user.role))" size="mini" plain type="primary" @click="editUser(user)">{{ user.id === me.id ? '关联' : '管理' }}</van-button>
      </div>
    </div>

    <div v-if="isSuperAdmin" class="section-card">
      <div class="section-title"><strong>注册白名单</strong><span>白名单用户注册后会创建自己的独立家庭</span></div>
      <div v-if="!whitelist.length" class="empty">暂无待注册用户</div>
      <div v-for="entry in whitelist" :key="entry.id" class="invite-row">
        <div><strong>@{{ entry.username }}</strong><span>{{ entry.status === 'used' ? `已注册独立家庭 · ${formatDate(entry.used_at)}` : `等待注册 · ${formatDate(entry.created_at)}` }}</span></div>
        <div class="row-actions">
          <button type="button" @click="viewWhitelist(entry)">查看</button>
          <button v-if="entry.status === 'pending'" type="button" class="danger-action" @click="removeWhitelist(entry)">撤销</button>
        </div>
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
        <p>邀请码7天内有效且只能使用一次。家庭最多邀请10位家人。</p>
        <template v-if="!createdInviteLink">
          <div class="role-options">
            <button type="button" :class="{ active: inviteRole === 'viewer' }" @click="inviteRole = 'viewer'"><strong>只读成员</strong><span>只能查看家庭数据</span></button>
            <button type="button" :class="{ active: inviteRole === 'admin' }" @click="inviteRole = 'admin'"><strong>家庭管理员</strong><span>可以维护家庭数据</span></button>
          </div>
          <div class="field-label">资产成员</div>
          <div class="role-options member-mode-options">
            <button type="button" :class="{ active: inviteMemberMode === 'existing' }" @click="inviteMemberMode = 'existing'"><strong>关联已有成员</strong><span>由家庭所有者指定</span></button>
            <button type="button" :class="{ active: inviteMemberMode === 'create' }" @click="inviteMemberMode = 'create'"><strong>创建新成员</strong><span>注册时填写资料</span></button>
          </div>
          <div v-if="inviteMemberMode === 'existing'" class="member-options">
            <button v-for="member in members" :key="member.id" type="button" :disabled="!memberAvailable(member)" :class="{ active: inviteMemberId === member.id }" @click="memberAvailable(member) && (inviteMemberId = member.id)">
              <span>{{ member.emoji || '👤' }}</span><div><strong>{{ member.name }}</strong><small>{{ member.linked_username ? `已绑定 @${member.linked_username}` : member.has_pending_invite ? '邀请中' : member.relation || '未绑定' }}</small></div>
            </button>
            <div v-if="!members.length" class="empty">暂无资产成员，请选择注册时创建</div>
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
        <div v-if="!['super_admin', 'owner'].includes(editingUser?.role)" class="role-options">
          <button type="button" :class="{ active: editRole === 'viewer' }" @click="editRole = 'viewer'"><strong>只读成员</strong><span>只能查看</span></button>
          <button type="button" :class="{ active: editRole === 'admin' }" @click="editRole = 'admin'"><strong>管理员</strong><span>可以维护数据</span></button>
        </div>
        <div class="field-label">关联资产成员</div>
        <div class="member-options compact">
          <button type="button" :class="{ active: editMemberId === '' }" @click="editMemberId = ''"><span>👤</span><div><strong>暂不关联</strong><small>稍后处理</small></div></button>
          <button v-for="member in linkableMembers" :key="member.id" type="button" :class="{ active: editMemberId === member.id }" @click="editMemberId = member.id"><span>{{ member.emoji || '👤' }}</span><div><strong>{{ member.name }}</strong><small>{{ member.relation || '家庭成员' }}</small></div></button>
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
import { computed, onActivated, onMounted, ref } from 'vue'
import { showConfirmDialog, showDialog, showToast } from 'vant'
import { authApi, householdApi } from '../api'

const me = ref({})
const users = ref([])
const whitelist = ref([])
const invites = ref([])
const members = ref([])
const showWhitelistEditor = ref(false)
const showInviteEditor = ref(false)
const showUserEditor = ref(false)
const showInviteHistory = ref(false)
const whitelistUsername = ref('')
const editingUser = ref(null)
const editRole = ref('viewer')
const saving = ref(false)
const inviteRole = ref('viewer')
const inviteMemberMode = ref('create')
const inviteMemberId = ref('')
const createdInviteLink = ref('')
const editMemberId = ref('')
const isOwner = computed(() => ['super_admin', 'owner'].includes(me.value.role))
const isSuperAdmin = computed(() => me.value.role === 'super_admin' && String(me.value.username || '').toLowerCase() === 'admin')
const invitedUserCount = computed(() => users.value.filter(user => !['super_admin', 'owner'].includes(user.role)).length)
const roleLabel = role => ({ super_admin: '超级管理员', owner: '家庭所有者', admin: '管理员', viewer: '只读成员' }[role] || '家庭成员')
let lastLoadStartedAt = 0

async function load() {
  lastLoadStartedAt = Date.now()
  me.value = await authApi.me()
  const userData = await householdApi.users()
  users.value = userData.users || []
  if (isOwner.value) {
    const inviteData = await householdApi.invites()
    invites.value = inviteData.invites || []
    members.value = inviteData.members || []
  }
  if (isSuperAdmin.value) {
    const whitelistData = await householdApi.whitelist()
    whitelist.value = whitelistData.whitelist || []
  }
}

async function createInvite() {
  if (inviteMemberMode.value === 'existing' && !inviteMemberId.value) return showToast('请选择要关联的资产成员')
  saving.value = true
  try {
    const data = await householdApi.createInvite({ role: inviteRole.value, member_mode: inviteMemberMode.value, member_id: inviteMemberId.value || undefined })
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
const inviteStatusCode = invite => invite.used_at ? 'joined' : invite.revoked_at ? 'revoked' : Number(invite.expires_at || 0) <= Date.now() / 1000 ? 'expired' : 'waiting'
const inviteStatusLabel = invite => ({ joined: '已加入', revoked: '已撤销', expired: '已过期', waiting: '等待中' }[inviteStatusCode(invite)])
const currentInvites = computed(() => invites.value.filter(invite => invite.used_at || inviteStatus(invite) === '等待加入'))
const historicalInvites = computed(() => invites.value.filter(invite => !invite.used_at && inviteStatus(invite) !== '等待加入'))
const shortRoleLabel = role => role === 'admin' ? '管理员' : '只读'
const inviteMemberLabel = invite => invite.member_name ? `${invite.member_emoji || '👤'} ${invite.member_name}` : '注册时创建'
const inviteMemberDescription = invite => invite.member_mode === 'existing'
  ? `关联成员：${invite.member_name || '未知成员'}`
  : invite.used_at ? '注册时已创建并关联资产成员' : '注册时创建资产成员'
const formatDate = value => value ? new Date(Number(value) * 1000).toLocaleDateString('zh-CN') : ''
const formatShortDate = value => value ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }).format(new Date(Number(value) * 1000)) : '-'
const memberAvailable = member => !member.linked_username && !Number(member.has_pending_invite || 0)
const linkableMembers = computed(() => members.value.filter(member => memberAvailable(member) || member.id === editingUser.value?.linked_member_id))

async function revokeInvite(invite) {
  await showConfirmDialog({ title: '撤销邀请', message: '撤销后该邀请链接将立即失效。' })
  await householdApi.revokeInvite(invite.id)
  showToast('邀请已撤销')
  await load()
}

function viewInvite(invite) {
  showDialog({
    title: '邀请详情',
    message: `关联用户：${invite.used_by_name || '家庭成员'}\n家庭权限：${roleLabel(invite.role)}\n${inviteMemberDescription(invite)}\n加入日期：${formatDate(invite.used_at)}`
  })
}

function viewWhitelist(entry) {
  const message = entry.status === 'used'
    ? `白名单用户：@${entry.username}\n注册账号：@${entry.registered_username || entry.username}\n显示名称：${entry.used_by_name || '-'}\n独立家庭：${entry.registered_household_name || '-'}\n账号状态：${entry.registered_status === 'disabled' ? '已停用' : '正常'}\n注册日期：${formatDate(entry.used_at)}`
    : `白名单用户：@${entry.username}\n状态：等待注册\n添加日期：${formatDate(entry.created_at)}\n注册后将创建独立家庭`
  showDialog({ title: '白名单详情', message })
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
function editUser(user) { editingUser.value = user; editRole.value = user.role; editMemberId.value = user.linked_member_id || ''; showUserEditor.value = true }

async function saveUser() {
  saving.value = true
  try {
    const payload = { linked_member_id: editMemberId.value || null }
    if (!['super_admin', 'owner'].includes(editingUser.value.role)) payload.role = editRole.value
    await householdApi.updateUser(editingUser.value.id, payload); showToast('用户资料已更新'); showUserEditor.value = false; await load()
  }
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
  await showConfirmDialog({ title: '撤销白名单', message: `撤销 @${entry.username} 后，该用户名将无法注册。` })
  await householdApi.removeWhitelist(entry.id)
  showToast('白名单已撤销')
  await load()
}

onMounted(() => load().catch(error => showToast(error?.response?.data?.message || '家庭用户加载失败')))
onActivated(() => {
  if (Date.now() - lastLoadStartedAt < 1000) return
  load().catch(error => showToast(error?.response?.data?.message || '家庭用户刷新失败'))
})
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
.invite-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 0; border-top:1px solid #edf0f5; }.invite-row>div:first-child { flex:1; }.invite-row button { padding:4px 0 4px 9px; border:0; background:transparent; color:#2580df; white-space:nowrap; }.invite-row button.danger-action { color:#ee5d5d; }.invite-row.historical { opacity:.72; }
.row-actions { display:flex; flex-direction:row !important; align-items:center; flex:none; }.history-toggle { display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 0 2px; border:0; border-top:1px solid #edf0f5; background:transparent; color:#7c899c; font-size:13px; }
.invite-table-wrap { margin-top:10px; overflow-x:auto; border:1px solid #e8edf4; border-radius:12px; }.invite-table { min-width:460px; }.invite-table-row { display:grid; grid-template-columns:58px 54px minmax(74px,1fr) minmax(88px,1.2fr) 58px 42px; align-items:center; min-height:43px; border-top:1px solid #edf1f6; color:#647187; font-size:11px; }.invite-table-row:first-child { border-top:0; }.invite-table-row>* { min-width:0; padding:7px 5px; overflow:hidden; text-align:left; text-overflow:ellipsis; white-space:nowrap; }.invite-table-row strong { color:#28364b; font-size:12px; }.invite-table-row em { font-style:normal; }.invite-table-row button { border:0; background:transparent; color:#2580df; font-size:11px; }.invite-table-row button.danger-action { color:#ee5d5d; }.invite-table-head { min-height:34px; background:#f6f8fb; color:#8a96a8; font-weight:600; }.invite-table-row.historical { opacity:.7; }.invite-table-row .status-joined { color:#24a36a; }.invite-table-row .status-waiting { color:#e79a22; }.invite-table-row .status-revoked,.invite-table-row .status-expired { color:#9aa4b2; }
.empty { padding:18px 0 4px; text-align:center; color:#a0a9b8; font-size:13px; }
.editor-popup { max-height:82vh; }.popup-body { padding:24px 20px calc(24px + env(safe-area-inset-bottom)); }.popup-body h3 { font-size:22px; }.popup-body p { margin:5px 0 18px; color:#8b96a8; font-size:13px; }
.role-options { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:18px; }.role-options button { display:flex; flex-direction:column; gap:4px; padding:14px; border:1px solid #e1e7ef; border-radius:13px; background:#fff; color:#334057; text-align:left; }.role-options button span { color:#919cad; font-size:11px; }.role-options button.active { border-color:#1e80ff; background:#edf6ff; color:#1e80ff; }
.field-label { margin:2px 2px 9px; color:#59677c; font-size:13px; font-weight:600; }.member-mode-options { margin-bottom:10px; }.member-options { display:grid; gap:8px; max-height:210px; margin-bottom:14px; overflow:auto; }.member-options button { display:flex; align-items:center; gap:10px; padding:11px 12px; border:1px solid #e1e7ef; border-radius:12px; background:#fff; color:#29364a; text-align:left; }.member-options button>span { font-size:22px; }.member-options button div { display:flex; flex-direction:column; }.member-options button small { margin-top:2px; color:#909bad; }.member-options button.active { border-color:#1e80ff; background:#edf6ff; }.member-options button:disabled { opacity:.48; background:#f5f6f8; }.member-options.compact { grid-template-columns:1fr 1fr; max-height:180px; }
.independent-note { display:flex; align-items:center; gap:9px; margin:0 0 8px; padding:13px; border-radius:13px; background:#eef7ff; color:#2580df; font-size:18px; }.independent-note span { display:flex; flex-direction:column; color:#7d8a9d; font-size:12px; }.independent-note strong { margin-bottom:2px; color:#33445d; font-size:14px; }
.invite-link { display:flex; gap:10px; padding:14px; border-radius:13px; background:#eff8f3; color:#20a66a; }.invite-link>.van-icon { margin-top:2px; font-size:20px; }.invite-link div { display:flex; flex-direction:column; min-width:0; gap:4px; }.invite-link strong { color:#304559; }.invite-link span { overflow-wrap:anywhere; color:#6f8192; font-size:12px; line-height:1.5; }
.popup-body :deep(.van-field) { margin-bottom:14px; padding:13px 14px; border:1px solid #e1e7ef; border-radius:13px; background:#f8fafc; }
:deep(.van-button) { margin-top:10px; }
</style>
