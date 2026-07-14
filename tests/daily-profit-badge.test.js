import test from 'node:test'
import assert from 'node:assert/strict'

import { getDailyProfitMeta, shouldShowNavUpdateNotice } from '../functions/[[path]].js'

test('净值日期等于北京时间今天时，标记为今日收益已更新', () => {
  const meta = getDailyProfitMeta('2026-05-25', new Date('2026-05-25T14:10:00Z'))

  assert.equal(meta.daily_profit_label, '今日收益')
  assert.equal(meta.daily_profit_rate_label, '今日收益率')
  assert.equal(meta.daily_profit_updated, true)
  assert.equal(meta.daily_profit_update_text, '今日收益更新')
})

test('QDII 在北京时间今天补出上一交易日净值时，显示最新收益已更新', () => {
  const meta = getDailyProfitMeta('2026-05-22', new Date('2026-05-25T14:10:00Z'), '摩根标普500指数(QDII)C')

  assert.equal(meta.daily_profit_label, '昨日收益')
  assert.equal(meta.daily_profit_rate_label, '昨日收益率')
  assert.equal(meta.daily_profit_updated, true)
  assert.equal(meta.daily_profit_update_text, '最新收益已更新')
})

test('QDII 次日凌晨持有前一交易日净值仍视为正常最新状态', () => {
  const meta = getDailyProfitMeta('2026-07-07', new Date('2026-07-08T16:36:00Z'), '景顺长城纳斯达克科技市值加权ETF联接(QDII)E')

  assert.equal(meta.daily_profit_label, '昨日收益')
  assert.equal(meta.daily_profit_rate_label, '昨日收益率')
  assert.equal(meta.daily_profit_updated, true)
  assert.equal(meta.daily_profit_update_text, '最新收益已更新')
})

test('普通基金净值日期不是北京时间今天时，不显示今日收益更新标签', () => {
  const meta = getDailyProfitMeta('2026-05-22', new Date('2026-05-25T14:10:00Z'), '中欧瑾通灵活配置混合C')

  assert.equal(meta.daily_profit_label, '昨日收益')
  assert.equal(meta.daily_profit_rate_label, '昨日收益率')
  assert.equal(meta.daily_profit_updated, false)
  assert.equal(meta.daily_profit_update_text, '')
})

test('缺少净值日期时回退到昨日收益口径', () => {
  const meta = getDailyProfitMeta(null, new Date('2026-05-25T14:10:00Z'))

  assert.equal(meta.daily_profit_label, '昨日收益')
  assert.equal(meta.daily_profit_rate_label, '昨日收益率')
  assert.equal(meta.daily_profit_updated, false)
  assert.equal(meta.daily_profit_update_text, '')
})

test('已更新提示只保留在实际同步当天，次日凌晨自动隐藏', () => {
  const snapshotUpdatedAt = Date.parse('2026-07-13T22:10:00+08:00') / 1000
  assert.equal(shouldShowNavUpdateNotice({
    status: 'updated',
    snapshotUpdatedAt,
    navDate: '2026-07-13',
    now: new Date('2026-07-13T15:00:00.000Z'),
  }), true)
  assert.equal(shouldShowNavUpdateNotice({
    status: 'updated',
    snapshotUpdatedAt,
    navDate: '2026-07-13',
    now: new Date('2026-07-13T16:30:00.000Z'),
  }), false)
})

test('待更新和同步失败提示跨日后继续保留', () => {
  const now = new Date('2026-07-13T16:30:00.000Z')
  assert.equal(shouldShowNavUpdateNotice({ status: 'waiting', now }), true)
  assert.equal(shouldShowNavUpdateNotice({ status: 'error', now }), true)
})
