/**
 * 路由配置
 */

import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue'),
  },
  {
    path: '/accounts',
    name: 'Accounts',
    component: () => import('../views/AccountMembers.vue'),
  },
  {
    path: '/positions',
    name: 'Positions',
    component: () => import('../views/Positions.vue'),
  },
  {
    path: '/positions/:id',
    name: 'PositionDetail',
    component: () => import('../views/PositionDetail.vue'),
  },
  {
    path: '/trades',
    name: 'Trades',
    component: () => import('../views/Trades.vue'),
  },
  {
    path: '/stats',
    name: 'Stats',
    component: () => import('../views/Stats.vue'),
  },
  {
    path: '/allocation',
    name: 'AllocationStrategies',
    component: () => import('../views/AllocationStrategies.vue'),
  },
  {
    path: '/allocation/:profileId',
    name: 'Allocation',
    component: () => import('../views/Allocation.vue'),
  },
  {
    path: '/allocation/:profileId/bucket/:assetType',
    redirect: to => `/allocation/${to.params.profileId}/bucket/${to.params.assetType}/select`,
  },
  {
    path: '/allocation/:profileId/bucket/:assetType/select',
    name: 'AllocationBucketSelector',
    component: () => import('../views/AllocationBucketSelector.vue'),
  },
  {
    path: '/allocation/:profileId/bucket/:assetType/suggestion',
    name: 'AllocationBucketSuggestion',
    component: () => import('../views/AllocationBucketSuggestion.vue'),
  },
  {
    path: '/allocation/:profileId/bucket/:assetType/holdings',
    name: 'AllocationBucketHoldings',
    component: () => import('../views/AllocationBucketHoldings.vue'),
  },
  {
    path: '/ledger',
    name: 'ProfitLedger',
    redirect: '/stats',
  },
  {
    path: '/members',
    name: 'Members',
    component: () => import('../views/AccountMembers.vue'),
  },
  {
    path: '/advisory',
    name: 'Advisory',
    component: () => import('../views/Advisory.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 路由守卫：未登录跳转登录页
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('auth_token')
  if (to.meta?.public) {
    next()
  } else if (!token) {
    next('/login')
  } else {
    next()
  }
})

export default router
