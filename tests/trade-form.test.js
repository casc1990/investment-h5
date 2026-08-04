import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildTradeQuickFundOptions, resolveTradeDraft } from '../src/utils/tradeForm.js'

const tradesSource = readFileSync(new URL('../src/views/Trades.vue', import.meta.url), 'utf8')

test('resolveTradeDraft 优先使用路由交易类型和偏好账户', () => {
  const result = resolveTradeDraft({
    accounts: [
      { id: 'a1', account_name: '长辈账户' },
      { id: 'a2', account_name: '我的账户' },
    ],
    preferredAccountId: 'a2',
    preferredTradeType: '卖出',
    routeType: 'buy',
  })

  assert.deepEqual(result, {
    tradeType: '买入',
    accountId: 'a2',
    accountName: '我的账户',
  })
})

test('resolveTradeDraft 在偏好账户不存在时回退到首个账户', () => {
  const result = resolveTradeDraft({
    accounts: [
      { id: 'a1', account_name: '默认账户' },
    ],
    preferredAccountId: 'missing',
    preferredTradeType: '红利再投',
  })

  assert.equal(result.tradeType, '买入')
  assert.equal(result.accountId, 'a1')
  assert.equal(result.accountName, '默认账户')
})

test('resolveTradeDraft 支持转换路由并收敛旧交易类型', () => {
  assert.equal(resolveTradeDraft({ routeType: 'convert' }).tradeType, '转换')
  assert.equal(resolveTradeDraft({ preferredTradeType: '现金分红' }).tradeType, '买入')
})

test('buildTradeQuickFundOptions 按账户过滤、去重并按市值排序', () => {
  const result = buildTradeQuickFundOptions([
    { account_id: 'a1', fund_code: '001', fund_name: '基金A', cost: 100, current_profit: 50 },
    { account_id: 'a1', fund_code: '002', fund_name: '基金B', cost: 500, current_profit: 20 },
    { account_id: 'a1', fund_code: '001', fund_name: '基金A重复', cost: 999, current_profit: 999 },
    { account_id: 'a2', fund_code: '003', fund_name: '基金C', cost: 1000, current_profit: 300 },
  ], 'a1', 5)

  assert.deepEqual(result, [
    { fundCode: '002', fundName: '基金B' },
    { fundCode: '001', fundName: '基金A' },
  ])
})

test('交易提交期间显示处理中状态并阻止重复请求', () => {
  assert.match(tradesSource, /const submitting = ref\(false\)/)
  assert.match(tradesSource, /if \(submitting\.value\) return/)
  assert.match(tradesSource, /:loading="submitting"/)
  assert.match(tradesSource, /:disabled="submitting"/)
  assert.match(tradesSource, /loading-text="处理中\.\.\."/)
  assert.match(tradesSource, /finally \{\s*submitting\.value = false\s*\}/)
})
