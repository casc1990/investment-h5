import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPendingFundList,
  getExpectedNavDateForSyncMode,
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
    snapshots: [{ fund_code: '019118', jzrq: '2026-06-20' }],
    now,
    mode: 'night',
    includeQdii: false,
  })

  assert.deepEqual(pending, [])
})

test('夜间开启 includeQdii 后会把 QDII 纳入 pending 列表', () => {
  const now = new Date('2026-06-21T14:30:00.000Z') // 北京时间 22:30
  const pending = buildPendingFundList({
    positions: [{ fund_code: '019118', fund_name: '摩根标普500指数(QDII)C' }],
    snapshots: [{ fund_code: '019118', jzrq: '2026-06-20' }],
    now,
    mode: 'night',
    includeQdii: true,
  })

  assert.deepEqual(pending, [
    {
      fund_code: '019118',
      fund_name: '摩根标普500指数(QDII)C',
      current_jzrq: '2026-06-20',
      expected_jzrq: '2026-06-21',
      category: 'qdii',
      pending_reason: 'date_not_advanced',
    },
  ])
})

test('morning / pre_report 模式都以当天为目标净值日期', () => {
  const now = new Date('2026-06-21T00:30:00.000Z') // 北京时间 08:30

  assert.equal(getExpectedNavDateForSyncMode({ now, mode: 'morning' }), '2026-06-21')
  assert.equal(getExpectedNavDateForSyncMode({ now, mode: 'pre_report' }), '2026-06-21')
})
