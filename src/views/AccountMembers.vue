<template>
  <div class="account-members-page">
    <div class="management-header">
      <div>
        <div class="management-title">成员与账户</div>
        <div class="management-subtitle">统一管理家庭成员及其名下投资账户</div>
      </div>
      <div class="summary-pill">{{ members.length }} 位成员 · {{ accounts.length }} 个账户</div>
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
import { accountApi, memberApi } from '../api'
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
  background: #f5f5f5;
  padding-top: 12px;
}

.management-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 12px 10px;
  padding: 15px 16px;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(135deg, #1e80ff, #5b67e8);
}

.management-title {
  font-size: 19px;
  font-weight: 700;
}

.management-subtitle {
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.82;
}

.summary-pill {
  flex-shrink: 0;
  padding: 6px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  font-size: 11px;
}

.management-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin: 0 12px;
  padding: 4px;
  border-radius: 12px;
  background: #e9edf3;
}

.management-tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 42px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #64748b;
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
  box-shadow: 0 2px 8px rgba(37, 59, 91, 0.1);
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
  .summary-pill { font-size: 10px; }
}
</style>
