import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ALLOCATION_PROFILES_UPDATED_EVENT,
  loadAllocationProfiles,
  loadSelectedAllocationProfileId,
  saveAllocationProfiles,
  saveSelectedAllocationProfileId,
} from '../src/utils/allocationStorage.js'

function createStorageMock() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

test('保存配置方案和当前选中方案时会派发刷新事件', () => {
  const originalLocalStorage = globalThis.localStorage
  const originalWindow = globalThis.window
  const originalCustomEvent = globalThis.CustomEvent

  const storage = createStorageMock()
  const eventTarget = new EventTarget()
  const received = []

  globalThis.localStorage = storage
  globalThis.window = eventTarget
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) {
      super(type)
      this.detail = options.detail
    }
  }

  eventTarget.addEventListener(ALLOCATION_PROFILES_UPDATED_EVENT, event => {
    received.push(event.detail)
  })

  saveAllocationProfiles([{ id: 'p1', name: '稳健策略', totalAsset: 100000, buckets: [] }])
  saveSelectedAllocationProfileId('p1')

  assert.equal(received.length, 2)
  assert.deepEqual(received[0], { type: 'profiles' })
  assert.deepEqual(received[1], { type: 'selected', profileId: 'p1' })
  assert.equal(loadAllocationProfiles()[0].id, 'p1')
  assert.equal(loadSelectedAllocationProfileId(), 'p1')

  globalThis.localStorage = originalLocalStorage
  globalThis.window = originalWindow
  globalThis.CustomEvent = originalCustomEvent
})
