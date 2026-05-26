<template>
  <div class="app">
    <!-- 路由视图 -->
    <div class="app-content">
      <router-view v-slot="{ Component, route: currentRoute }">
        <keep-alive :include="keepAliveInclude">
          <component
            v-if="Component && keepAliveInclude.includes(currentRoute.name)"
            :is="Component"
            :key="currentRoute.name"
          />
        </keep-alive>
        <component
          v-if="Component && !keepAliveInclude.includes(currentRoute.name)"
          :is="Component"
          :key="currentRoute.fullPath"
        />
      </router-view>
    </div>

    <!-- 底部导航（仅登录后显示） -->
    <van-tabbar v-if="isLoggedIn" v-model="activeTab" route fixed class="app-tabbar">
      <van-tabbar-item
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="app-tabbar-item"
      >
        <template #icon="props">
          <div class="tab-icon-shell" :class="{ active: props.active }">
            <van-icon :name="tab.icon" />
          </div>
        </template>
        <span class="tab-label">{{ tab.label }}</span>
      </van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { KEEP_ALIVE_ROUTE_NAMES } from './utils/appShell'

const route = useRoute()
const activeTab = ref(0)
const isLoggedIn = computed(() => !!localStorage.getItem('auth_token'))
const keepAliveInclude = KEEP_ALIVE_ROUTE_NAMES

const tabs = [
  { to: '/', label: '首页', icon: 'wap-home-o' },
  { to: '/positions', label: '持仓', icon: 'bag-o' },
  { to: '/trades', label: '交易', icon: 'balance-o' },
  { to: '/stats', label: '统计', icon: 'chart-trending-o' },
  { to: '/accounts', label: '账户', icon: 'friends-o' },
  { to: '/advisory', label: '顾投', icon: 'apps-o' },
  { to: '/members', label: '成员', icon: 'contact-o' },
]

const tabMap = Object.fromEntries(tabs.map((tab, index) => [tab.to, index]))
tabMap['/ledger'] = tabMap['/stats']

watch(() => route.path, (path) => {
  activeTab.value = tabMap[path] ?? 0
}, { immediate: true })
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
}

html, body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #f5f5f5;
  overflow: hidden;
}

.app {
  height: 100vh;
  overflow: hidden;
}

.app-content {
  position: relative;
  z-index: 1;
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
}

:root {
  --app-tabbar-space: calc(96px + env(safe-area-inset-bottom));
  --app-floating-bottom: calc(108px + env(safe-area-inset-bottom));
  --app-floating-page-space: calc(170px + env(safe-area-inset-bottom));
}

/* 统一等宽字体 */
.mono {
  font-family: 'Courier New', Courier, monospace;
}

.app-tabbar {
  z-index: 9999 !important;
  pointer-events: auto;
  left: 10px !important;
  right: 10px !important;
  bottom: calc(10px + env(safe-area-inset-bottom)) !important;
  width: auto !important;
  height: 74px !important;
  padding: 8px 6px 10px !important;
  border-radius: 28px !important;
  background: rgba(255, 255, 255, 0.92) !important;
  backdrop-filter: blur(18px);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.14), 0 3px 10px rgba(99, 102, 241, 0.12);
  border-top: none !important;
  overflow: hidden;
}

.app-tabbar::after {
  display: none !important;
}

.app-tabbar .van-tabbar-item {
  min-width: 0;
  color: #94a3b8;
}

.app-tabbar .van-tabbar-item__icon {
  margin-bottom: 4px;
}

.app-tabbar .van-tabbar-item__text {
  width: 100%;
  text-align: center;
}

.app-tabbar .van-tabbar-item--active {
  background: transparent !important;
  color: #4f46e5;
}

.tab-icon-shell {
  width: 28px;
  height: 28px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  transition: all 0.2s ease;
}

.tab-icon-shell.active {
  width: 36px;
  height: 36px;
  border-radius: 14px;
  color: #ffffff;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  box-shadow: 0 8px 18px rgba(99, 102, 241, 0.3);
}

.tab-label {
  display: block;
  width: 100%;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.1;
  white-space: nowrap;
}

.app-tabbar .van-tabbar-item--active .tab-label {
  color: #4338ca;
}

@media (max-width: 380px) {
  .app-tabbar {
    left: 6px !important;
    right: 6px !important;
    padding: 8px 2px 10px !important;
  }

  .tab-label {
    font-size: 10px;
  }

  .tab-icon-shell.active {
    width: 34px;
    height: 34px;
  }
}
</style>
