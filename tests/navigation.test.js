import test from 'node:test'
import assert from 'node:assert/strict'

import { KEEP_ALIVE_ROUTE_NAMES } from '../src/utils/appShell.js'
import { MAIN_TABS, MAIN_TAB_INDEX_MAP } from '../src/utils/navigation.js'

test('底部主导航包含独立配置入口', () => {
  const allocationTab = MAIN_TABS.find(tab => tab.to === '/allocation')

  assert.ok(allocationTab)
  assert.equal(allocationTab.label, '配置')
  assert.equal(MAIN_TAB_INDEX_MAP['/allocation'], MAIN_TABS.indexOf(allocationTab))
})

test('资产配置页面仍在 keep-alive 白名单中', () => {
  assert.ok(KEEP_ALIVE_ROUTE_NAMES.includes('Allocation'))
})

test('统计相关别名路由仍映射到统计菜单高亮', () => {
  assert.equal(MAIN_TAB_INDEX_MAP['/ledger'], MAIN_TAB_INDEX_MAP['/stats'])
})
