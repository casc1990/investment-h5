import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDataHealthReport, buildPeriodReconciliations } from '../src/utils/statsReconciliation.js'

const snapshots = [
  {
    date: '2026-08-14', captured_at: Date.parse('2026-08-14T15:00:00+08:00'),
    positions: [
      { id: 'p1', account_id: 'ali', fund_code: 'A', fund_name: '基金A', member_id: 'me', cost: 500000, current_profit: 57260.95, shares: 500000 },
      { id: 'advisory-1', account_id: 'adv', fund_code: 'advisory-1', cost: 33000, current_profit: 100 },
    ],
  },
  {
    date: '2026-08-20', captured_at: Date.parse('2026-08-20T23:00:00+08:00'),
    positions: [
      { id: 'p1', account_id: 'ali', fund_code: 'A', fund_name: '基金A', member_id: 'me', cost: 501000, current_profit: 57283.63, shares: 500972.73 },
      { id: 'advisory-1', account_id: 'adv', fund_code: 'advisory-1', cost: 33000, current_profit: 100 },
    ],
  },
]

const periodRows = [{
  period_key: '2026-08-17', period_label: '2026-08-17 周', start_date: '2026-08-17', end_date: '2026-08-20',
  total_market_value: 558283.63, period_profit: 22.68,
}]

test('周期对账按期初、资金变动、收益和期末生成可核验公式', () => {
  const rows = buildPeriodReconciliations({
    periodRows,
    dailyRows: [{ date: '2026-08-20', daily_profit: 22.68 }],
    snapshots,
    trades: [{ id: 't1', account_id: 'ali', fund_code: 'A', fund_name: '基金A', trade_type: '买入', trade_date: '2026-08-18', amount: 998.8, fee: 1.2 }],
  })

  assert.equal(rows[0].opening_market_value, 557260.95)
  assert.equal(rows[0].net_capital_flow, 1000)
  assert.equal(rows[0].investment_profit, 22.68)
  assert.equal(rows[0].closing_market_value, 558283.63)
  assert.equal(rows[0].is_balanced, true)
  assert.equal(rows[0].ledger_entries.some(item => item.category === '资金流入'), true)
})

test('延迟录入的红利再投按实际入账时间进入当期对账', () => {
  const rows = buildPeriodReconciliations({
    periodRows,
    dailyRows: [{ date: '2026-08-20', daily_profit: 4.88 }],
    snapshots,
    trades: [
      { id: 'b1', account_id: 'ali', fund_code: 'A', fund_name: '基金A', trade_type: '买入', trade_date: '2026-08-18', amount: 998.8, fee: 1.2 },
      {
        id: 'd1', account_id: 'ali', fund_code: 'A', fund_name: '基金A', trade_type: '红利再投',
        trade_date: '2026-08-10', created_at: Date.parse('2026-08-17T10:00:00+08:00') / 1000,
        quantity: 15.93, amount: 17.8,
      },
    ],
  })

  assert.equal(rows[0].ledger_entries.some(item => item.category === '分红收益'), true)
  assert.equal(rows[0].net_capital_flow, 1000)
  assert.equal(rows[0].investment_profit, 22.68)
  assert.equal(rows[0].confirmation_adjustment, 0)
  assert.equal(rows[0].is_balanced, true)
})

test('缺少周期期初快照时从首个可用快照起算', () => {
  const rows = buildPeriodReconciliations({
    periodRows: [{ ...periodRows[0], period_key: '2026', start_date: '2026-01-01' }],
    dailyRows: [{ date: '2026-08-14', daily_profit: 100 }, { date: '2026-08-20', daily_profit: 22.68 }],
    snapshots,
    trades: [{ id: 'old', account_id: 'ali', fund_code: 'A', trade_type: '买入', trade_date: '2026-01-10', amount: 5000 }],
  })

  assert.equal(rows[0].coverage_start_date, '2026-08-14')
  assert.equal(rows[0].opening_market_value, 557260.95)
  assert.equal(rows[0].explicit_capital_flow, 0)
  assert.equal(rows[0].net_capital_flow, 1000)
  assert.equal(rows[0].confirmed_profit, 22.68)
})

test('延迟补录交易只归属实际入账周期，不按旧交易日重复计算', () => {
  const earlySnapshot = {
    ...snapshots[0],
    date: '2026-08-09',
    captured_at: Date.parse('2026-08-09T15:00:00+08:00'),
  }
  const rows = buildPeriodReconciliations({
    periodRows: [
      { ...periodRows[0], period_key: '2026-08-10', start_date: '2026-08-10', end_date: '2026-08-14' },
      periodRows[0],
    ],
    snapshots: [earlySnapshot, ...snapshots],
    trades: [{
      id: 'late-dividend', account_id: 'ali', fund_code: 'A', trade_type: '红利再投',
      trade_date: '2026-08-10', created_at: Date.parse('2026-08-18T10:00:00+08:00') / 1000,
      amount: 17.8,
    }],
  })

  assert.equal(rows[0].ledger_entries.some(item => item.category === '分红收益'), false)
  assert.equal(rows[1].ledger_entries.some(item => item.category === '分红收益'), true)
})

test('数据健康报告同时检查快照、跨页面市值和周期对账', () => {
  const reconciliations = buildPeriodReconciliations({ periodRows, snapshots, trades: [] })
  const report = buildDataHealthReport({
    snapshots,
    overview: { summary: { totalMarketValue: 558283.63, totalFundCount: 1, updatedFundCount: 1, staleFundCount: 0 } },
    reconciliations,
    pendingEvents: [],
  })

  assert.equal(report.status, 'warning')
  assert.equal(report.checks.find(item => item.key === 'cross-page').status, 'passed')
  assert.equal(report.checks.find(item => item.key === 'unmatched-adjustments').status, 'warning')
  assert.equal(report.history_rebuild.status, 'completed')
})
