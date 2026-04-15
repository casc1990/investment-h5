/**
 * 路由配置
 */

import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue'),
  },
  {
    path: '/accounts',
    name: 'Accounts',
    component: () => import('../views/Accounts.vue'),
  },
  {
    path: '/positions',
    name: 'Positions',
    component: () => import('../views/Positions.vue'),
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
    path: '/members',
    name: 'Members',
    component: () => import('../views/Members.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
