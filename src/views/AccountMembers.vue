<template>
  <div class="account-members-page">
    <div class="management-header">
      <div class="header-copy">
        <div class="header-eyebrow">资产归属管理</div>
        <div class="management-title">成员与账户</div>
        <div class="management-subtitle">统一管理家庭成员及其名下投资账户</div>
      </div>
      <div class="management-summary">
        <div><strong>{{ members.length }}</strong><span>成员</span></div>
        <i></i>
        <div><strong>{{ accounts.length }}</strong><span>账户</span></div>
      </div>
    </div>

    <div class="management-tabs" role="tablist" aria-label="成员与账户管理">
      <button :class="{ active: activeTab === 'accounts' }" role="tab" @click="switchTab('accounts')">
        <van-icon name="friends-o" />账户
        <span>{{ accounts.length }}</span>
      </button>
      <button :class="{ active: activeTab === 'members' }" role="tab" @click="switchTab('members')">
        <van-icon name="contact-o" />成员
        <span>{{ members.length }}</span>
      </button>
    </div>

    <Accounts v-if="activeTab === 'accounts'" @data-loaded="accounts = $event" />
    <Members v-else @data-loaded="members = $event.members; accounts = $event.accounts" />
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import apiClient, { accountApi, memberApi } from '../api'
import Accounts from './Accounts.vue'
import Members from './Members.vue'

const route = useRoute()
const router = useRouter()
const activeTab = ref(route.path === '/members' || route.query.tab === 'members' ? 'members' : 'accounts')
const accounts = ref([])
const members = ref([])

const switchTab = (tab) => {
  activeTab.value = tab
  router.replace({ path: '/accounts', query: tab === 'members' ? { tab: 'members' } : {} })
}

watch(() => [route.path, route.query.tab], ([path, tab]) => {
  activeTab.value = path === '/members' || tab === 'members' ? 'members' : 'accounts'
})

onMounted(async () => {
  try {
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
  background: linear-gradient(180deg, #eef5ff 0, #f6f7f9 210px);
  padding-top: 10px;
}

.management-header {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 12px;
  margin: 0 12px 12px;
  padding: 18px;
  border: 1px solid rgba(116, 159, 219, 0.18);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
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
  background: #f4f8ff;
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
  grid-template-columns: 1fr 1fr;
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

@media (max-width: 380px) {
  .management-subtitle { display: none; }
  .management-header { padding: 15px; }
}
</style>
