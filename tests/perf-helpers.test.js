import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSnapshotPayloadFromApis, shouldRefreshPageData } from '../src/utils/perfHelpers.js'

test('页面数据在首次进入、超时或强制刷新时才重新拉取', () => {
  assert.equal(shouldRefreshPageData({ hasData: false, lastLoadedAt: 0, now: 30_000 }), true)
  assert.equal(shouldRefreshPageData({ hasData: true, lastLoadedAt: 10_000, now: 20_000, ttl: 30_000 }), false)
  assert.equal(shouldRefreshPageData({ hasData: true, lastLoadedAt: 10_000, now: 41_000, ttl: 30_000 }), true)
  assert.equal(shouldRefreshPageData({ hasData: true, lastLoadedAt: 10_000, now: 20_000, ttl: 30_000, force: true }), true)
})

test('统计快照构造函数只整理展示与台账需要的数据', () => {
  const payload = buildSnapshotPayloadFromApis({
    overviewData: { summary: { totalMarketValue: 1000, totalYesterdayProfit: 20 } },
    positionsData: {
      positions: [
        {
          id: 'p1',
          fund_name: '基金A',
          fund_code: '000001',
          account_name: '支付宝',
          member_name: '本人',
          member_emoji: '👤',
          cost: 900,
          current_profit: 100,
          yesterday_profit: 20,
          profit_rate: 11.11,
          nav_dwjz: 1.2345,
          nav_gsz: 1.235,
          nav_gszzl: 0.32,
          nav_jzrq: '2026-05-22',
          extra_field: 'ignore-me',
        },
      ],
    },
    advisoryData: {
      products: [
        {
          id: 'a1',
          product_name: '顾投一号',
          account_name: '雪球顾投',
          member_name: '家人',
          member_emoji: '👩',
          current_market_value: 2000,
          current_profit: 200,
          yesterday_profit: 30,
          profit_rate: 10,
          snapshot_date: '2026-05-22',
        },
      ],
    },
  })

  assert.equal(payload.positions.length, 1)
  assert.equal(payload.advisoryProducts.length, 1)
  assert.equal(payload.snapshotPositions.length, 2)
  assert.equal(payload.snapshotPositions[0].fund_name, '基金A')
  assert.equal(payload.snapshotPositions[0].extra_field, undefined)
  assert.equal(payload.snapshotPositions[1].fund_code, 'advisory-a1')
  assert.equal(payload.snapshotPositions[1].cost, 1800)
})
