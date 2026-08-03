import test from 'node:test'
import assert from 'node:assert/strict'

import { isStaleAssetLoadError, recoverFromStalePwaAssets } from '../src/utils/pwaRecovery.js'
import { readFileSync } from 'node:fs'

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')

test('PWA 自愈只识别分片、模块和样式资源加载错误', () => {
  assert.equal(isStaleAssetLoadError(new Error('Failed to fetch dynamically imported module: /assets/Home-old.js')), true)
  assert.equal(isStaleAssetLoadError(new Error('Unable to preload CSS for /assets/Home-old.css')), true)
  assert.equal(isStaleAssetLoadError(new Error('普通业务接口请求失败')), false)
})

test('PWA 自愈会注销旧 Service Worker、清缓存并仅刷新一次', async () => {
  const calls = []
  const storage = new Map()
  const windowRef = {
    sessionStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    location: { reload: () => calls.push('reload') },
  }
  const navigatorRef = {
    serviceWorker: {
      getRegistrations: async () => [{ unregister: async () => calls.push('unregister') }],
    },
  }
  const cachesRef = {
    keys: async () => ['workbox-precache-v1'],
    delete: async key => calls.push(`delete:${key}`),
  }

  assert.equal(await recoverFromStalePwaAssets({ windowRef, navigatorRef, cachesRef, now: 1000 }), true)
  assert.deepEqual(calls, ['unregister', 'delete:workbox-precache-v1', 'reload'])
  assert.equal(await recoverFromStalePwaAssets({ windowRef, navigatorRef, cachesRef, now: 2000 }), false)
  assert.deepEqual(calls, ['unregister', 'delete:workbox-precache-v1', 'reload'])
})

test('新 Service Worker 接管后自动刷新当前页面', () => {
  assert.match(mainSource, /serviceWorker\.addEventListener\('controllerchange'/)
  assert.match(mainSource, /reloadingForServiceWorker = true\s*window\.location\.reload\(\)/)
  assert.match(mainSource, /onRegisteredSW\(_swUrl, registration\)[\s\S]*?registration\.update\(\)/)
})
