<template>
  <div class="app">
    <!-- 路由视图 -->
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>

    <!-- 底部导航 -->
    <van-tabbar v-model="activeTab" route fixed placeholder>
      <van-tabbar-item to="/" icon="wap-home">
        首页
      </van-tabbar-item>
      <van-tabbar-item to="/accounts" icon="user-o">
        账户
      </van-tabbar-item>
      <van-tabbar-item to="/positions" icon="bars">
        持仓
      </van-tabbar-item>
      <van-tabbar-item to="/trades" icon="orders-o">
        交易
      </van-tabbar-item>
      <van-tabbar-item to="/stats" icon="chart-trending-o">
        统计
      </van-tabbar-item>
      <van-tabbar-item to="/members" icon="friends-o">
        成员
      </van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activeTab = ref(0)

const tabMap = {
  '/': 0,
  '/accounts': 1,
  '/positions': 2,
  '/trades': 3,
  '/stats': 4,
  '/members': 5,
}

watch(() => route.path, (path) => {
  activeTab.value = tabMap[path] ?? 0
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #f5f5f5;
}

.app {
  min-height: 100vh;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 统一等宽字体 */
.mono {
  font-family: 'Courier New', Courier, monospace;
}
</style>
