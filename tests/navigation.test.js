import test from 'node:test'
import assert from 'node:assert/strict'

import { KEEP_ALIVE_ROUTE_NAMES } from '../src/utils/appShell.js'
import { MAIN_TABS, MAIN_TAB_INDEX_MAP, resolveMainTabIndex } from '../src/utils/navigation.js'

test('底部主导航包含独立配置入口，且位于持仓后面', () => {
  const allocationTab = MAIN_TABS.find(tab => tab.to === '/allocation')
  const positionsIndex = MAIN_TABS.findIndex(tab => tab.to === '/positions')
  const allocationIndex = MAIN_TABS.findIndex(tab => tab.to === '/allocation')

  assert.ok(allocationTab)
  assert.equal(allocationTab.label, '配置')
  assert.equal(MAIN_TAB_INDEX_MAP['/allocation'], allocationIndex)
  assert.equal(allocationIndex, positionsIndex + 1)
})

test('底部主导航暂时隐藏顾投入口', () => {
  assert.equal(MAIN_TABS.some(tab => tab.to === '/advisory'), false)
})

test('资产配置页面仍在 keep-alive 白名单中', () => {
  assert.ok(KEEP_ALIVE_ROUTE_NAMES.includes('AllocationStrategies'))
  assert.ok(KEEP_ALIVE_ROUTE_NAMES.includes('Allocation'))
})

test('统计相关别名路由仍映射到统计菜单高亮', () => {
  assert.equal(MAIN_TAB_INDEX_MAP['/ledger'], MAIN_TAB_INDEX_MAP['/stats'])
})

test('策略详情页和分类基金页仍映射到配置菜单高亮', () => {
  assert.equal(resolveMainTabIndex('/allocation/demo'), MAIN_TAB_INDEX_MAP['/allocation'])
  assert.equal(resolveMainTabIndex('/allocation/demo/bucket/pure_bond/select'), MAIN_TAB_INDEX_MAP['/allocation'])
  assert.equal(resolveMainTabIndex('/allocation/demo/bucket/pure_bond/holdings'), MAIN_TAB_INDEX_MAP['/allocation'])
})
