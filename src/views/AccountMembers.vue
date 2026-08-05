<template>
  <div class="account-members-page">
    <section class="identity-card">
      <div class="identity-avatar">{{ authIdentity.linked_member_emoji || '👤' }}</div>
      <div class="identity-copy">
        <span>当前登录身份</span>
        <strong>{{ authIdentity.display_name || authIdentity.username || '家庭用户' }}</strong>
        <small>@{{ authIdentity.username || '-' }} · {{ roleLabel(authIdentity.role) }} · {{ authIdentity.household_name || '我的家庭' }}</small>
        <em v-if="authIdentity.linked_member_id">关联资产成员：{{ authIdentity.linked_member_emoji || '👤' }} {{ authIdentity.linked_member_name }}</em>
        <em v-else class="unlinked">尚未关联资产成员</em>
      </div>
      <button v-if="!authIdentity.linked_member_id" type="button" @click="switchTab('users')">去关联</button>
    </section>
    <div class="management-header">
      <div class="header-copy">
        <div class="header-eyebrow">资产归属管理</div>
        <div class="management-title">资产成员与账户</div>
        <div class="management-subtitle">统一管理资产成员、资产账户及受邀用户</div>
      </div>
      <div class="management-summary">
        <div><strong>{{ members.length }}</strong><span>资产成员</span></div>
        <i></i>
        <div><strong>{{ accounts.length }}</strong><span>资产账户</span></div>
      </div>
    </div>

    <div class="management-tabs" role="tablist" aria-label="资产归属管理">
      <button :class="{ active: activeTab === 'members' }" role="tab" @click="switchTab('members')">
        <van-icon name="contact-o" />资产成员
        <span>{{ members.length }}</span>
      </button>
      <button :class="{ active: activeTab === 'accounts' }" role="tab" @click="switchTab('accounts')">
        <van-icon name="friends-o" />资产账户
        <span>{{ accounts.length }}</span>
      </button>
      <button :class="{ active: activeTab === 'users' }" role="tab" @click="switchTab('users')">
        <van-icon name="manager-o" />受邀用户
      </button>
    </div>

    <Accounts v-if="activeTab === 'accounts'" @data-loaded="accounts = $event" />
    <Members v-else-if="activeTab === 'members'" @data-loaded="members = $event.members; accounts = $event.accounts" />
    <HouseholdUsers v-else />
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import apiClient, { accountApi, memberApi } from '../api'
import Accounts from './Accounts.vue'
import Members from './Members.vue'
import HouseholdUsers from './HouseholdUsers.vue'
import { authIdentity, loadAuthIdentity } from '../utils/authIdentity'

const route = useRoute()
const router = useRouter()
const activeTab = ref(route.query.tab === 'users' ? 'users' : route.path === '/members' || route.query.tab === 'members' ? 'members' : 'accounts')
const accounts = ref([])
const members = ref([])
const roleLabel = role => ({ super_admin: '超级管理员', owner: '家庭所有者', admin: '管理员', viewer: '只读成员' }[role] || '家庭成员')

const switchTab = (tab) => {
  activeTab.value = tab
  router.replace({ path: '/accounts', query: tab === 'accounts' ? {} : { tab } })
}

watch(() => [route.path, route.query.tab], ([path, tab]) => {
  activeTab.value = tab === 'users' ? 'users' : path === '/members' || tab === 'members' ? 'members' : 'accounts'
})

onMounted(async () => {
  try {
    await loadAuthIdentity({ force: true }).catch(() => {})
    await apiClient.post('/migrate')
    const [accountData, memberData] = await Promise.all([accountApi.list(), memberApi.list()])
    accounts.value = accountData?.accounts || []
    members.value = memberData?.members || []
  } catch {
    // 子页面仍会展示自己的加载反馈。
  }
})
</script>

<style scoped>
.account-members-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at 92% 2%, rgba(121, 91, 244, .13), transparent 28%),
    linear-gradient(180deg, #edf5ff 0, #f5f6fa 280px);
  padding-top: 10px;
}
.identity-card { position:relative; display:flex; align-items:center; gap:12px; overflow:hidden; margin:0 12px 12px; padding:17px; border-radius:20px; background:linear-gradient(135deg,#237ff0 0%,#536be9 58%,#7457dc 100%); box-shadow:0 12px 28px rgba(54,91,201,.22); }
.identity-card::after { position:absolute; right:-30px; top:-42px; width:130px; height:130px; border:1px solid rgba(255,255,255,.15); border-radius:50%; content:""; }
.identity-avatar { z-index:1; display:grid; place-items:center; width:52px; height:52px; flex:none; border:1px solid rgba(255,255,255,.36); border-radius:17px; background:rgba(255,255,255,.2); font-size:28px; box-shadow:inset 0 1px rgba(255,255,255,.22); }
.identity-copy { z-index:1; display:flex; flex:1; min-width:0; flex-direction:column; }
.identity-copy>span { color:rgba(255,255,255,.72); font-size:10px; font-weight:700; letter-spacing:.5px; }
.identity-copy strong { margin:2px 0; color:#fff; font-size:19px; }
.identity-copy small { overflow:hidden; color:rgba(255,255,255,.72); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
.identity-copy em { margin-top:5px; color:#fff; font-size:11px; font-style:normal; }
.identity-copy em.unlinked { color:#fff1c7; }
.identity-card>button { z-index:1; flex:none; padding:7px 10px; border:1px solid rgba(255,255,255,.55); border-radius:999px; background:rgba(255,255,255,.14); color:#fff; font-size:11px; }

.management-header {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 12px;
  margin: 0 12px 12px;
  padding: 18px;
  border: 1px solid rgba(125, 139, 224, 0.16);
  border-radius: 18px;
  background: linear-gradient(135deg, #f5f1ff 0%, #edf7ff 100%);
  box-shadow: 0 10px 30px rgba(55, 94, 145, 0.08);
}

.header-copy {
  min-width: 0;
}

.header-eyebrow {
  margin-bottom: 5px;
  color: #1e80ff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
}

.management-title {
  color: #172033;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
}

.management-subtitle {
  margin-top: 4px;
  color: #8490a3;
  font-size: 12px;
}

.management-summary {
  display: flex;
  align-items: center;
  align-self: center;
  gap: 10px;
  flex-shrink: 0;
  padding: 9px 11px;
  border-radius: 13px;
  background: rgba(255, 255, 255, .68);
}

.management-summary div {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 30px;
}

.management-summary strong {
  color: #1e80ff;
  font-size: 18px;
  line-height: 1;
}

.management-summary span {
  margin-top: 4px;
  color: #8b96a8;
  font-size: 10px;
}

.management-summary i {
  width: 1px;
  height: 24px;
  background: #dce6f4;
}

.management-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin: 0 12px 2px;
  padding: 4px;
  border: 1px solid #e4eaf2;
  border-radius: 14px;
  background: rgba(239, 243, 248, 0.9);
}

.management-tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: #758196;
  font-size: 15px;
  font-weight: 600;
}

.management-tabs button span {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #dbe2eb;
  font-size: 11px;
}

.management-tabs button.active {
  background: #fff;
  color: #1e80ff;
  box-shadow: 0 3px 10px rgba(37, 59, 91, 0.09);
}

.management-tabs button.active span {
  color: #fff;
  background: #1e80ff;
}

:deep(.accounts-page),
:deep(.members-page) {
  min-height: auto;
  padding-top: 10px;
}

:deep(.account-card),
:deep(.member-card) {
  border-color: rgba(116, 145, 190, .14);
  background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(242,247,255,.96));
  box-shadow: 0 7px 20px rgba(49, 76, 116, .07);
}

:deep(.account-card:nth-child(even)),
:deep(.member-card:nth-child(even)) {
  background: linear-gradient(145deg, #fff, #f7f3ff);
}

@media (max-width: 380px) {
  .management-subtitle { display: none; }
  .management-header { padding: 15px; }
}
</style>
