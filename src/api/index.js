/**
 * API 封装
 * 统一处理所有与后端的请求
 */

import axios from 'axios'
import { shouldLogApi } from '../utils/appShell.js'
import { unwrapApiPayload } from '../utils/apiResponse.js'

const APP_ENV = import.meta.env || {}
const BASE_URL = APP_ENV.VITE_API_BASE_URL || '/api'
const ENABLE_API_LOG = shouldLogApi(APP_ENV)

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 12000,
  headers: {
    'Content-Type': 'application/json',
  },
})

const pendingGetRequests = new Map()
const dedupedGet = (url, config = {}) => {
  const key = `${url}?${JSON.stringify(config.params || {})}`
  if (pendingGetRequests.has(key)) return pendingGetRequests.get(key)
  const request = apiClient.get(url, config).finally(() => pendingGetRequests.delete(key))
  pendingGetRequests.set(key, request)
  return request
}

// 请求拦截：注入 token
apiClient.interceptors.request.use(
  config => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    if (ENABLE_API_LOG) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`)
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截
apiClient.interceptors.response.use(
  response => {
    if (ENABLE_API_LOG) {
      console.log('[API Response]', response.config.url, 'status:', response.status, 'data:', JSON.stringify(response.data)?.slice(0, 200))
    }
    if (response.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_username')
      window.location.href = '/login'
      return Promise.reject(new Error('请先登录'))
    }
    return unwrapApiPayload(response.data)
  },
  error => {
    if (ENABLE_API_LOG) {
      console.error('[API Error]', error.config?.url, error.message, 'status:', error.response?.status, 'data:', JSON.stringify(error.response?.data)?.slice(0, 200))
    }
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_username')
      window.location.href = '/login'
    }
    const config = error.config
    const retryableStatus = [502, 503, 504].includes(Number(error.response?.status || 0))
    const retryableNetworkError = !error.response || error.code === 'ECONNABORTED'
    if (config?.method === 'get' && !config.__retried && (retryableStatus || retryableNetworkError)) {
      config.__retried = true
      return apiClient.request(config)
    }
    return Promise.reject(error)
  }
)

// ============ 认证 API ============

export const authApi = {
  status: () => apiClient.get('/auth/status'),
  login: (data) => apiClient.post('/auth/login', data),
  setup: (data) => apiClient.post('/auth/setup', data),
  logout: () => apiClient.post('/auth/logout'),
}

// ============ 账户 API ============

export const accountApi = {
  list: () => dedupedGet('/accounts'),
  get: (id) => apiClient.get(`/accounts/${id}`),
  create: (data) => apiClient.post('/accounts', data),
  update: (id, data) => apiClient.put(`/accounts/${id}`, data),
  delete: (id) => apiClient.delete(`/accounts/${id}`),
}

// ============ 持仓 API ============

export const positionApi = {
  list: (params) => dedupedGet('/positions', { params }),
  get: (id) => apiClient.get(`/positions/${id}`),
  create: (data) => apiClient.post('/positions', data),
  update: (id, data) => apiClient.put(`/positions/${id}`, data),
  delete: (id) => apiClient.delete(`/positions/${id}`),
}

// ============ 交易 API ============

export const tradeApi = {
  list: (params) => apiClient.get('/trades', { params }),
  create: (data) => apiClient.post('/trades', data),
  delete: (id) => apiClient.delete(`/trades/${id}`),
}

// ============ 行情 API ============

export const marketApi = {
  list: (fundCode) => apiClient.get('/market', { params: { fundCode } }),
  get: (fundCode) => apiClient.get(`/market/${fundCode}`),
  sync: () => apiClient.get('/fund/sync'),
  syncFund: (fundCode) => apiClient.get(`/fund/sync/${fundCode}`),
}

export const fundApi = {
  detail: (fundCode) => apiClient.get(`/funds/${fundCode}/detail`),
  pending: (params) => apiClient.get('/fund/pending', { params }),
  syncPending: (params) => apiClient.get('/fund/sync/pending', { params }),
}

export const eventApi = {
  list: (params) => dedupedGet('/events', { params }),
  reconcile: () => apiClient.post('/events/reconcile'),
  get: (id) => apiClient.get(`/events/${id}`),
  updateStatus: (id, data) => apiClient.patch(`/events/${id}/status`, data),
}

// ============ 成员 API ============

export const memberApi = {
  list: () => dedupedGet('/members'),
  get: (id) => apiClient.get(`/members/${id}`),
  create: (data) => apiClient.post('/members', data),
  update: (id, data) => apiClient.put(`/members/${id}`, data),
  delete: (id) => apiClient.delete(`/members/${id}`),
}

// ============ 顾投组合 API ============

export const advisoryApi = {
  list: (params) => dedupedGet('/advisory-products', { params }),
  createProduct: (data) => apiClient.post('/advisory-products', data),
  updateProduct: (id, data) => apiClient.put(`/advisory-products/${id}`, data),
  deleteProduct: (id) => apiClient.delete(`/advisory-products/${id}`),
  saveSnapshot: (data) => apiClient.post('/advisory-snapshots', data),
}

// ============ 统计 API ============

export const statsApi = {
  overview: () => dedupedGet('/stats/overview'),
  positionDetail: (id) => apiClient.get(`/stats/position/${id}`),
  history: (params) => apiClient.get('/stats/history', { params }),
}

export const allocationProfileApi = {
  list: () => apiClient.get('/allocation-profiles'),
  save: (profile) => apiClient.put(`/allocation-profiles/${profile.id}`, { profile, expectedVersion: Number(profile.version || 0) }),
  delete: (id, version) => apiClient.delete(`/allocation-profiles/${id}`, { params: { version } }),
  listDeleted: () => apiClient.get('/allocation-profiles', { params: { deleted: true } }),
  restore: (id) => apiClient.post(`/allocation-profiles/${id}/restore`),
  auditLogs: (id) => apiClient.get(`/allocation-profiles/${id}/audit-logs`),
}

export const profitSnapshotApi = {
  list: () => dedupedGet('/profit-snapshots'),
  save: (snapshot) => apiClient.put(`/profit-snapshots/${snapshot.date}`, { snapshot }),
}

export default apiClient
