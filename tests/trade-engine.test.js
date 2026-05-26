import test from 'node:test'
import assert from 'node:assert/strict'

import { rebuildPositionFromTrades, TRADE_TYPES } from '../shared/tradeEngine.js'

test('买入后再部分卖出，按移动平均成本减少持仓并累计已实现收益', () => {
  const state = rebuildPositionFromTrades(
    { opening_quantity: 0, opening_cost: 0, opening_initial_profit: 0 },
    [
      { id: 't1', trade_type: TRADE_TYPES.BUY, quantity: 100, amount: 1000, fee: 1, trade_date: '2026-05-01' },
      { id: 't2', trade_type: TRADE_TYPES.BUY, quantity: 100, amount: 1200, fee: 1, trade_date: '2026-05-02' },
      { id: 't3', trade_type: TRADE_TYPES.SELL, quantity: 80, amount: 1000, fee: 2, trade_date: '2026-05-03' },
    ]
  )

  assert.equal(state.quantity, 120)
  assert.equal(state.cost, 1321.2)
  assert.equal(state.realized_profit, 117.2)
  assert.equal(state.total_buy_amount, 2202)
  assert.equal(state.total_sell_amount, 998)
})

test('现金分红与红利再投都能累计，红利再投增加份额但不增加剩余成本', () => {
  const state = rebuildPositionFromTrades(
    { opening_quantity: 100, opening_cost: 1000, opening_initial_profit: 0 },
    [
      { id: 't1', trade_type: TRADE_TYPES.CASH_DIVIDEND, amount: 50, trade_date: '2026-05-01' },
      { id: 't2', trade_type: TRADE_TYPES.REINVEST_DIVIDEND, quantity: 5, amount: 40, trade_date: '2026-05-02' },
    ]
  )

  assert.equal(state.quantity, 105)
  assert.equal(state.cost, 1000)
  assert.equal(state.cash_dividend, 90)
  assert.equal(state.realized_profit, 50)
})

test('转出未提供成本时按当前平均成本扣减，转入按提供成本增加', () => {
  const state = rebuildPositionFromTrades(
    { opening_quantity: 100, opening_cost: 1000, opening_initial_profit: 0 },
    [
      { id: 't1', trade_type: TRADE_TYPES.TRANSFER_OUT, quantity: 20, trade_date: '2026-05-01' },
      { id: 't2', trade_type: TRADE_TYPES.TRANSFER_IN, quantity: 10, amount: 120, trade_date: '2026-05-02' },
    ]
  )

  assert.equal(state.quantity, 90)
  assert.equal(state.cost, 920)
  assert.equal(state.realized_profit, 0)
})

test('手动校准可以把持仓重置到新的目标份额、成本和历史累计收益', () => {
  const state = rebuildPositionFromTrades(
    { opening_quantity: 100, opening_cost: 1000, opening_initial_profit: 10 },
    [
      { id: 't1', trade_type: TRADE_TYPES.BUY, quantity: 20, amount: 240, fee: 0, trade_date: '2026-05-01' },
      { id: 't2', trade_type: TRADE_TYPES.CALIBRATION, target_quantity: 88, target_cost: 950, target_initial_profit: 23, trade_date: '2026-05-02' },
    ]
  )

  assert.equal(state.quantity, 88)
  assert.equal(state.cost, 950)
  assert.equal(state.initial_profit, 23)
})
