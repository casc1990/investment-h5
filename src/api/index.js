/**
 * API 封装
 * 统一处理所有与后端的请求
 */

import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,  // 增加到30秒
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截
apiClient.interceptors.request.use(
  config => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`)
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截
apiClient.interceptors.response.use(
  response => {
    if (response.data?.code === 0) {
      return response.data.data
    }
    return response.data
  },
  error => {
    console.error('[API Error]', error.message)
    return Promise.reject(error)
  }
)

// ============ 账户 API ============

export const accountApi = {
  list: () => apiClient.get('/accounts'),
  get: (id) => apiClient.get(`/accounts/${id}`),
  create: (data) => apiClient.post('/accounts', data),
  update: (id, data) => apiClient.put(`/accounts/${id}`, data),
  delete: (id) => apiClient.delete(`/accounts/${id}`),
}

// ============ 持仓 API ============

export const positionApi = {
  list: (accountId) => apiClient.get('/positions', { params: { accountId } }),
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
  sync: () => apiClient.post('/market/sync'),
}

// ============ 统计 API ============

export const statsApi = {
  overview: (accountId) => apiClient.get('/stats/overview', { params: { accountId } }),
  positionDetail: (id) => apiClient.get(`/stats/position/${id}`),
  history: (params) => apiClient.get('/stats/history', { params }),
}

export default apiClient
