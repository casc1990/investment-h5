<template>
  <nav class="fund-section-nav" aria-label="基金功能导航">
    <button
      v-for="item in items"
      :key="item.to"
      type="button"
      :class="{ active: isActive(item) }"
      @click="router.push(item.to)"
    >
      <van-icon :name="item.icon" />
      <span>{{ item.label }}</span>
    </button>
  </nav>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const items = [
  { to: '/positions', label: '持仓', icon: 'bag-o' },
  { to: '/trades', label: '交易', icon: 'balance-o' },
  { to: '/allocation', label: '配置', icon: 'setting-o' },
]

const isActive = item => item.to === '/allocation'
  ? route.path === '/allocation' || route.path.startsWith('/allocation/')
  : route.path === item.to || route.path.startsWith(`${item.to}/`)
</script>

<style scoped>
.fund-section-nav {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin: 10px 12px 12px;
  padding: 4px;
  border: 1px solid #e4eaf2;
  border-radius: 14px;
  background: rgba(239, 243, 248, 0.94);
}

.fund-section-nav button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #758196;
  font-size: 14px;
  font-weight: 600;
}

.fund-section-nav button.active {
  background: #fff;
  color: #1e80ff;
  box-shadow: 0 3px 10px rgba(37, 59, 91, 0.09);
}
</style>
