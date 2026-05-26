import test from 'node:test'
import assert from 'node:assert/strict'

import { KEEP_ALIVE_ROUTE_NAMES, shouldLogApi } from '../src/utils/appShell.js'

test('keep-alive 路由白名单覆盖底部 tab 页面', () => {
  assert.deepEqual(KEEP_ALIVE_ROUTE_NAMES, [
    'Home',
    'Accounts',
    'Positions',
    'Trades',
    'Stats',
    'Advisory',
    'Members',
  ])
})

test('仅开发环境启用 API 调试日志', () => {
  assert.equal(shouldLogApi({ DEV: true }), true)
  assert.equal(shouldLogApi({ DEV: false }), false)
  assert.equal(shouldLogApi({}), false)
})
