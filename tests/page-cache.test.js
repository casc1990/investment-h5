import test from 'node:test'
import assert from 'node:assert/strict'

import { clearPageCaches, readPageCache, writePageCache } from '../src/utils/pageCache.js'

test('页面缓存可在重新打开页面时立即恢复上次成功数据', () => {
  const values = new Map()
  global.localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }

  writePageCache('home', { overview: { summary: { totalMarketValue: 123 } } })
  const cached = readPageCache('home')

  assert.equal(cached.overview.summary.totalMarketValue, 123)
  assert.ok(cached.savedAt > 0)
  delete global.localStorage
})

test('超过有效期的页面缓存不会继续使用', () => {
  global.localStorage = {
    getItem: () => JSON.stringify({ savedAt: Date.now() - 1000, data: 'stale' }),
    setItem: () => {},
  }

  assert.equal(readPageCache('stats', { maxAge: 100 }), null)
  delete global.localStorage
})

test('退出登录时只清理页面缓存', () => {
  const values = new Map([
    ['investment_page_cache_v1:home', '{}'],
    ['auth_token', 'keep-by-helper'],
  ])
  global.localStorage = {
    get length() { return values.size },
    key: index => [...values.keys()][index] || null,
    removeItem: key => values.delete(key),
  }

  clearPageCaches()
  assert.equal(values.has('investment_page_cache_v1:home'), false)
  assert.equal(values.has('auth_token'), true)
  delete global.localStorage
})
