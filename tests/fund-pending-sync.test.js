import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPendingFundList,
  getExpectedNavDateForFund,
  getExpectedNavDateForSyncMode,
  isPendingFundOverdue,
} from '../functions/[[path]].js'

test('夜间普通基金只返回未更新到当天的 pending 列表', () => {
  const now = new Date('2026-06-21T13:30:00.000Z') // 北京时间 21:30
  const positions = [
    { fund_code: '000001', fund_name: '普通债券A' },
    { fund_code: '000002', fund_name: '普通混合A' },
  ]
  const snapshots = [
    { fund_code: '000001', jzrq: '2026-06-21' },
    { fund_code: '000002', jzrq: '2026-06-20' },
  ]

  const pending = buildPendingFundList({
    positions,
    snapshots,
    now,
    mode: 'night',
    includeQdii: false,
  })

  assert.deepEqual(pending, [
    {
      fund_code: '000002',
      fund_name: '普通混合A',
      current_jzrq: '2026-06-20',
      expected_jzrq: '2026-06-21',
      category: 'normal',
      pending_reason: 'date_not_advanced',
    },
  ])
})

test('缺少快照的基金会进入 pending 列表', () => {
  const now = new Date('2026-06-21T13:00:00.000Z')
  const pending = buildPendingFundList({
    positions: [{ fund_code: '000003', fund_name: '中证红利A' }],
    snapshots: [],
    now,
    mode: 'night',
    includeQdii: false,
  })

  assert.deepEqual(pending, [
    {
      fund_code: '000003',
      fund_name: '中证红利A',
      current_jzrq: null,
      expected_jzrq: '2026-06-21',
      category: 'normal',
      pending_reason: 'missing_snapshot',
    },
  ])
})

test('夜间未开启 includeQdii 时跳过 QDII 基金', () => {
  const now = new Date('2026-06-21T13:00:00.000Z')
  const pending = buildPendingFundList({
    positions: [{ fund_code: '019118', fund_name: '摩根标普500指数(QDII)C' }],
    snapshots: [{ fund_code: '019118', jzrq: '2026-06-18' }],
    now,
    mode: 'night',
    includeQdii: false,
  })

  assert.deepEqual(pending, [])
})

test('QDII 以最后一个交易日为目标日期，避免强求当天净值', () => {
  const now = new Date('2026-06-21T14:30:00.000Z') // 北京时间 22:30
  const pending = buildPendingFundList({
    positions: [{ fund_code: '019118', fund_name: '摩根标普500指数(QDII)C' }],
    snapshots: [{ fund_code: '019118', jzrq: '2026-06-18' }],
    now,
    mode: 'night',
    includeQdii: true,
  })

  assert.deepEqual(pending, [
    {
      fund_code: '019118',
      fund_name: '摩根标普500指数(QDII)C',
      current_jzrq: '2026-06-18',
      expected_jzrq: '2026-06-19',
      category: 'qdii',
      pending_reason: 'date_not_advanced',
    },
  ])
})

test('QDII 已更新到上一交易日时不再进入重试队列', () => {
  const now = new Date('2026-06-22T14:30:00.000Z') // 北京时间周一 22:30
  const pending = buildPendingFundList({
    positions: [{ fund_code: '019118', fund_name: '摩根标普500指数(QDII)C' }],
    snapshots: [{ fund_code: '019118', jzrq: '2026-06-19' }],
    now,
    mode: 'night',
    includeQdii: true,
  })

  assert.deepEqual(pending, [])
  assert.equal(getExpectedNavDateForFund({ now, mode: 'night', category: 'qdii' }), '2026-06-19')
})

test('morning / pre_report 模式都以当天为目标净值日期', () => {
  const now = new Date('2026-06-21T00:30:00.000Z') // 北京时间 08:30

  assert.equal(getExpectedNavDateForSyncMode({ now, mode: 'morning' }), '2026-06-21')
  assert.equal(getExpectedNavDateForSyncMode({ now, mode: 'pre_report' }), '2026-06-21')
})

test('普通基金深夜及次日早晨仍未更新时标记为超时', () => {
  const fund = { category: 'normal', current_jzrq: '2026-06-21' }
  assert.equal(isPendingFundOverdue(fund, new Date('2026-06-22T15:30:00.000Z')), true)
  assert.equal(isPendingFundOverdue(fund, new Date('2026-06-22T00:30:00.000Z')), true)
  assert.equal(isPendingFundOverdue(fund, new Date('2026-06-22T13:30:00.000Z')), false)
})

test('同步错误和落后两个交易日以上的 QDII 标记为超时', () => {
  const now = new Date('2026-06-23T02:00:00.000Z')
  assert.equal(isPendingFundOverdue({ category: 'normal', sync_state: 'error' }, now), true)
  assert.equal(isPendingFundOverdue({ category: 'qdii', current_jzrq: '2026-06-18' }, now), true)
  assert.equal(isPendingFundOverdue({ category: 'qdii', current_jzrq: '2026-06-19' }, now), false)
})
