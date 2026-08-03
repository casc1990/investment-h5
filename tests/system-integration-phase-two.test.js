import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const homeSource = readFileSync(new URL('../src/views/Home.vue', import.meta.url), 'utf8')
const statsSource = readFileSync(new URL('../src/views/Stats.vue', import.meta.url), 'utf8')

test('首页将家庭总览和基金资产合并为同一张主卡', () => {
  assert.match(homeSource, /class="portfolio-overview-card"/)
  assert.match(homeSource, /家庭净资产/)
  assert.match(homeSource, /familyFinanceApi\.overview\(\)/)
  assert.match(homeSource, /familyOverview: familyOverview\.value/)
  assert.match(homeSource, /class="fund-summary-block"/)
  assert.match(homeSource, /<span>基金资产<\/span>/)
  assert.doesNotMatch(homeSource, /class="header-card"/)
  assert.match(homeSource, /每日收益贡献/)
})

test('统计页整合家庭资产和基金收益且保留原基金统计', () => {
  assert.match(statsSource, /activeStatsDomain === 'family'/)
  assert.match(statsSource, />家庭资产<\/button>/)
  assert.match(statsSource, />基金收益<\/button>/)
  assert.match(statsSource, /净资产趋势/)
  assert.match(statsSource, /家庭资产结构/)
  assert.match(statsSource, /<TrendChart/)
  assert.match(statsSource, /收益走势/)
  assert.match(statsSource, /周期汇总/)
  assert.match(statsSource, /收益贡献与拖累/)
})

test('家庭统计加载失败不会阻断现有基金统计', () => {
  assert.match(statsSource, /Promise\.allSettled\(\[captureProfitSnapshotFromApis\(\), familyFinanceApi\.overview\(\)\]\)/)
  assert.match(statsSource, /if \(fundResult\.status === 'rejected'\) throw fundResult\.reason/)
  assert.match(statsSource, /Failed to fetch family stats/)
})

test('首页顾投账户进入顾投管理，普通基金账户仍进入持仓', () => {
  assert.match(homeSource, /account\.hasAdvisory && !account\.hasPositions \? '\/advisory' : '\/positions'/)
})
