import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildNavEventPendingFundList,
  buildPendingFundList,
  getExpectedNavDateForFund,
  getExpectedNavDateForSyncMode,
  isChinaTradingDay,
  isPendingFundOverdue,
  summarizeFundNavFreshness,
} from '../functions/[[path]].js'

test('净值事件在交易日当天晚上不比较当天净值', () => {
  const pending = buildNavEventPendingFundList({
    positions: [{ fund_code: '000001', fund_name: '普通混合A' }],
    snapshots: [{ fund_code: '000001', jzrq: '2026-07-10' }],
    now: new Date('2026-07-13T14:30:00.000Z'), // 北京时间周一 22:30
  })

  assert.deepEqual(pending, [])
})

test('次日凌晨仍未更新时才生成净值待处理事件', () => {
  const pending = buildNavEventPendingFundList({
    positions: [{ fund_code: '000001', fund_name: '普通混合A' }],
    snapshots: [{ fund_code: '000001', jzrq: '2026-07-10' }],
    now: new Date('2026-07-13T16:30:00.000Z'), // 北京时间周二 00:30
  })

  assert.deepEqual(pending, [{
    fund_code: '000001',
    fund_name: '普通混合A',
    current_jzrq: '2026-07-10',
    expected_jzrq: '2026-07-13',
    category: 'normal',
    pending_reason: 'date_not_advanced',
  }])
})

test('事件净值比较只在中国交易日执行', () => {
  assert.equal(isChinaTradingDay(new Date('2026-07-10T04:00:00.000Z')), true)
  assert.equal(isChinaTradingDay(new Date('2026-07-11T04:00:00.000Z')), false)
  assert.equal(isChinaTradingDay(new Date('2026-10-05T04:00:00.000Z')), false)
  assert.equal(isChinaTradingDay(new Date('2026-10-08T04:00:00.000Z')), true)
})

test('上一交易日会跳过周末和节假日', () => {
  const afterNationalDay = new Date('2026-10-08T14:30:00.000Z')
  assert.equal(getExpectedNavDateForFund({
    now: afterNationalDay,
    mode: 'night',
    category: 'qdii',
  }), '2026-09-30')
})

test('夜间普通基金只返回未更新到当天的 pending 列表', () => {
  const now = new Date('2026-06-22T13:30:00.000Z') // 北京时间周一 21:30
  const positions = [
    { fund_code: '000001', fund_name: '普通债券A' },
    { fund_code: '000002', fund_name: '普通混合A' },
  ]
  const snapshots = [
    { fund_code: '000001', jzrq: '2026-06-22' },
    { fund_code: '000002', jzrq: '2026-06-18' },
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
      current_jzrq: '2026-06-18',
      expected_jzrq: '2026-06-22',
      category: 'normal',
      pending_reason: 'date_not_advanced',
    },
  ])
})

test('缺少快照的基金会进入 pending 列表', () => {
  const now = new Date('2026-06-22T13:00:00.000Z')
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
      expected_jzrq: '2026-06-22',
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
  const now = new Date('2026-06-22T14:30:00.000Z') // 北京时间周一 22:30
  const pending = buildPendingFundList({
    positions: [{ fund_code: '019118', fund_name: '摩根标普500指数(QDII)C' }],
    snapshots: [{ fund_code: '019118', jzrq: '2026-06-17' }],
    now,
    mode: 'night',
    includeQdii: true,
  })

  assert.deepEqual(pending, [
    {
      fund_code: '019118',
      fund_name: '摩根标普500指数(QDII)C',
      current_jzrq: '2026-06-17',
      expected_jzrq: '2026-06-18',
      category: 'qdii',
      pending_reason: 'date_not_advanced',
    },
  ])
})

test('QDII 已更新到上一交易日时不再进入重试队列', () => {
  const now = new Date('2026-06-22T14:30:00.000Z') // 北京时间周一 22:30
  const pending = buildPendingFundList({
    positions: [{ fund_code: '019118', fund_name: '摩根标普500指数(QDII)C' }],
    snapshots: [{ fund_code: '019118', jzrq: '2026-06-18' }],
    now,
    mode: 'night',
    includeQdii: true,
  })

  assert.deepEqual(pending, [])
  assert.equal(getExpectedNavDateForFund({ now, mode: 'night', category: 'qdii' }), '2026-06-18')
})

test('morning / pre_report 模式都以当天为目标净值日期', () => {
  const now = new Date('2026-06-23T00:30:00.000Z') // 北京时间周二 08:30

  assert.equal(getExpectedNavDateForSyncMode({ now, mode: 'morning' }), '2026-06-23')
  assert.equal(getExpectedNavDateForSyncMode({ now, mode: 'pre_report' }), '2026-06-23')
})

test('周末和法定节假日不产生净值待更新列表', () => {
  const positions = [{ fund_code: '000001', fund_name: '普通债券A' }]
  const snapshots = [{ fund_code: '000001', jzrq: '2026-07-09' }]
  assert.deepEqual(buildPendingFundList({ positions, snapshots, now: new Date('2026-07-11T04:00:00.000Z'), mode: 'night' }), [])
  assert.deepEqual(buildPendingFundList({ positions, snapshots, now: new Date('2026-10-05T04:00:00.000Z'), mode: 'night' }), [])
})

test('周末首页进度把滞后一天的 QDII 计为已更新', () => {
  const positions = [
    ...Array.from({ length: 26 }, (_, index) => ({ fund_code: `N${index}`, fund_name: `国内基金${index}`, quantity: 1 })),
    { fund_code: 'Q1', fund_name: '海外指数(QDII)A', quantity: 1 },
    { fund_code: 'Q2', fund_name: '纳斯达克(QDII)C', quantity: 1 },
  ]
  const snapshotMap = Object.fromEntries([
    ...Array.from({ length: 26 }, (_, index) => [`N${index}`, { jzrq: '2026-07-10' }]),
    ['Q1', { jzrq: '2026-07-09' }],
    ['Q2', { jzrq: '2026-07-09' }],
  ])
  assert.deepEqual(summarizeFundNavFreshness({
    positions,
    snapshotMap,
    now: new Date('2026-07-11T00:17:00.000Z'),
  }), {
    totalFundCount: 28,
    updatedFundCount: 28,
    staleFundCount: 0,
  })
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
  assert.equal(isPendingFundOverdue({ category: 'qdii', current_jzrq: '2026-06-17' }, now), true)
  assert.equal(isPendingFundOverdue({ category: 'qdii', current_jzrq: '2026-06-18' }, now), false)
})
