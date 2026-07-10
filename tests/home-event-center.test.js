import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPendingNavEventCards,
  summarizePendingNavEvents,
} from '../src/utils/homeEventCenter.js'

test('净值未更新事件中心会把普通基金和 QDII 分成不同优先级卡片', () => {
  const cards = buildPendingNavEventCards([
    { fund_code: '000001', fund_name: '普通债券A', category: 'normal' },
    { fund_code: '000002', fund_name: '普通混合A', category: 'normal' },
    { fund_code: '019118', fund_name: '摩根标普500指数(QDII)C', category: 'qdii' },
  ])

  assert.equal(cards.length, 2)
  assert.deepEqual(cards.map(item => item.id), ['pending-nav-normal', 'pending-nav-qdii'])
  assert.equal(cards[0].level, 'urgent')
  assert.equal(cards[0].count, 2)
  assert.match(cards[0].description, /普通债券A、普通混合A/)
  assert.equal(cards[1].level, 'notice')
  assert.equal(cards[1].count, 1)
  assert.match(cards[1].description, /晚一个交易日更新/)
})

test('只有 QDII 待更新时只显示提示卡，不升级成告警卡', () => {
  const cards = buildPendingNavEventCards([
    { fund_code: '019118', fund_name: '摩根标普500指数(QDII)C', category: 'qdii' },
  ])

  assert.equal(cards.length, 1)
  assert.equal(cards[0].id, 'pending-nav-qdii')
  assert.equal(cards[0].level, 'notice')
  assert.equal(cards[0].action, 'view_positions')
})

test('汇总事件数会累加所有净值待处理基金数量', () => {
  const count = summarizePendingNavEvents([
    { count: 2 },
    { count: 3 },
  ])

  assert.equal(count, 5)
})
