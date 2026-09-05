import test from 'node:test'
import assert from 'node:assert/strict'

import { appendCurrentFamilySnapshot, buildFamilySummary, validateFamilyAsset } from '../shared/familyFinance.js'

test('家庭资产汇总将顾投计入增值资产并扣除负债', () => {
  const summary = buildFamilySummary({
    fundValue: 100000,
    advisoryValue: 30000,
    assets: [
      { category_code: 'bank_demand', current_value: 30000, include_in_net_worth: 1, include_in_investable_assets: 1 },
      { category_code: 'provident_fund', current_value: 50000, include_in_net_worth: 1, include_in_investable_assets: 0 },
      { category_code: 'stock', current_value: 9999, include_in_net_worth: 1, include_in_investable_assets: 1, status: 'archived' },
    ],
    receivables: [{ outstanding_amount: 20000, status: 'normal' }, { outstanding_amount: 1000, status: 'settled' }],
    liabilities: [{ outstanding_principal: 40000, status: 'normal' }],
  })
  assert.equal(summary.total_assets, 230000)
  assert.equal(summary.total_liabilities, 40000)
  assert.equal(summary.net_worth, 190000)
  assert.equal(summary.investable_assets, 160000)
  assert.equal(summary.groups.fund, 100000)
  assert.equal(summary.groups.investment, 30000)
  assert.equal(summary.advisory_value, 30000)
})

test('普通资产不允许基金类别或负数余额', () => {
  assert.deepEqual(validateFamilyAsset({ name: '工资卡', category_code: 'bank_demand', current_value: 10 }), [])
  assert.ok(validateFamilyAsset({ name: '', category_code: 'fund', current_value: -1 }).length >= 3)
  assert.ok(validateFamilyAsset({ name: '异常资产', category_code: 'bank_demand', current_value: 'abc' }).includes('当前金额必须大于或等于0'))
})

test('顾投关闭计入可投资资产后仍保留在总资产和净资产', () => {
  const summary = buildFamilySummary({ fundValue: 100000, advisoryValue: 30000, advisoryInvestableValue: 0 })
  assert.equal(summary.total_assets, 130000)
  assert.equal(summary.net_worth, 130000)
  assert.equal(summary.investable_assets, 100000)
  assert.equal(summary.advisory_investable_value, 0)
})

test('家庭趋势没有当日变动时补充含最新基金市值的今日展示点', () => {
  const snapshots = [{ date: '2026-08-28', net_worth: 1178386.09, fund_value: 559301.34 }]
  const result = appendCurrentFamilySnapshot(
    snapshots,
    { net_worth: 1179766.75, fund_value: 560682 },
    '2026-09-05',
  )

  assert.deepEqual(result.at(-1), {
    date: '2026-09-05', net_worth: 1179766.75, fund_value: 560682, is_current: true,
  })
  assert.equal(snapshots.length, 1)
})

test('家庭趋势已有今日快照时以最新汇总替换且不重复日期', () => {
  const result = appendCurrentFamilySnapshot(
    [{ date: '2026-09-05', net_worth: 1179000, fund_value: 559900 }],
    { net_worth: 1179766.75, fund_value: 560682 },
    '2026-09-05',
  )

  assert.equal(result.length, 1)
  assert.equal(result[0].net_worth, 1179766.75)
  assert.equal(result[0].fund_value, 560682)
  assert.equal(result[0].is_current, true)
})
