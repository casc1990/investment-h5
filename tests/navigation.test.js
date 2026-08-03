import test from 'node:test'
import assert from 'node:assert/strict'

import { KEEP_ALIVE_ROUTE_NAMES } from '../src/utils/appShell.js'
import { MAIN_TABS, MAIN_TAB_INDEX_MAP, resolveMainTabIndex } from '../src/utils/navigation.js'

test('底部主导航收敛为五个家庭资产入口', () => {
  assert.deepEqual(MAIN_TABS.map(tab => tab.label), ['首页', '家庭财务', '基金', '统计', '我的'])
  assert.equal(MAIN_TABS.length, 5)
})

test('家庭财务保持独立入口', () => {
  assert.equal(MAIN_TABS.find(tab => tab.to === '/family-finance')?.label, '家庭财务')
  assert.ok(MAIN_TABS.some(tab => tab.to === '/stats'))
  assert.ok(KEEP_ALIVE_ROUTE_NAMES.includes('FamilyFinance'))
  assert.equal(resolveMainTabIndex('/family-finance'), MAIN_TAB_INDEX_MAP['/family-finance'])
  assert.equal(resolveMainTabIndex('/family-finance/assets/demo'), MAIN_TAB_INDEX_MAP['/family-finance'])
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

test('成员和账户合并到我的入口', () => {
  const managementTab = MAIN_TABS.find(tab => tab.to === '/accounts')
  assert.equal(managementTab?.label, '我的')
  assert.equal(MAIN_TABS.some(tab => tab.to === '/members'), false)
  assert.equal(resolveMainTabIndex('/members'), MAIN_TAB_INDEX_MAP['/accounts'])
})

test('持仓、交易、配置及下钻页面统一映射到基金菜单', () => {
  const fundIndex = MAIN_TAB_INDEX_MAP['/positions']
  assert.equal(resolveMainTabIndex('/positions/demo'), fundIndex)
  assert.equal(resolveMainTabIndex('/trades'), fundIndex)
  assert.equal(resolveMainTabIndex('/allocation/demo'), fundIndex)
  assert.equal(resolveMainTabIndex('/allocation/demo/bucket/pure_bond/select'), fundIndex)
  assert.equal(resolveMainTabIndex('/allocation/demo/bucket/pure_bond/holdings'), fundIndex)
})
