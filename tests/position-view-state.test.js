import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizePositionViewState,
  readPositionViewState,
  writePositionViewState,
} from '../src/utils/positionViewState.js'

const createStorage = () => {
  const values = new Map()
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('持仓筛选状态可以跨页面持久化和恢复', () => {
  const storage = createStorage()
  writePositionViewState({ memberId: 'member-1', accountId: 'account-1', viewOption: 'profit' }, storage)

  assert.deepEqual(readPositionViewState(storage), {
    memberId: 'member-1',
    accountId: 'account-1',
    viewOption: 'profit',
  })
})

test('非法或损坏的持仓筛选状态安全回退默认值', () => {
  assert.deepEqual(normalizePositionViewState({ viewOption: 'unknown' }), {
    memberId: null,
    accountId: null,
    viewOption: 'market_value_desc',
  })

  assert.deepEqual(readPositionViewState({ getItem: () => '{broken' }), {
    memberId: null,
    accountId: null,
    viewOption: 'market_value_desc',
  })
})
