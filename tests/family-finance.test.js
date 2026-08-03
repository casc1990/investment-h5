import test from 'node:test'
import assert from 'node:assert/strict'

import { buildFamilySummary, validateFamilyAsset } from '../shared/familyFinance.js'

test('家庭资产汇总计算基金、顾投并扣除负债', () => {
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
  assert.equal(summary.groups.advisory, 30000)
  assert.equal(summary.advisory_value, 30000)
})

test('普通资产不允许基金类别或负数余额', () => {
  assert.deepEqual(validateFamilyAsset({ name: '工资卡', category_code: 'bank_demand', current_value: 10 }), [])
  assert.ok(validateFamilyAsset({ name: '', category_code: 'fund', current_value: -1 }).length >= 3)
  assert.ok(validateFamilyAsset({ name: '异常资产', category_code: 'bank_demand', current_value: 'abc' }).includes('当前金额必须大于或等于0'))
})
