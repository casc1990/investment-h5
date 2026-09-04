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
  assert.match(homeSource, /总收益贡献/)
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
  assert.match(statsSource, /期初/)
  assert.match(statsSource, /已记录资金/)
  assert.match(statsSource, /快照差额/)
  assert.match(statsSource, /分红待入账/)
  assert.match(statsSource, /profitClass\(row\.closing_market_value\)/)
  assert.match(statsSource, /\.period-main-metric strong\.positive/)
  assert.match(statsSource, /它不是一笔真实交易/)
  assert.match(statsSource, /期末基金市值/)
  assert.match(statsSource, /查看明细/)
  assert.match(statsSource, /router\.push\('\/data-health'\)/)
})

test('数据健康页覆盖快照对账、净值和历史自动重算', () => {
  const healthSource = readFileSync(new URL('../src/views/DataHealth.vue', import.meta.url), 'utf8')
  const reconciliationSource = readFileSync(new URL('../src/utils/statsReconciliation.js', import.meta.url), 'utf8')
  for (const text of ['数据健康', '历史自动重算', '重新检查']) {
    assert.match(healthSource, new RegExp(text))
  }
  assert.match(reconciliationSource, /跨页面基金市值/)
  assert.match(reconciliationSource, /周期收益对账/)
  assert.match(healthSource, /buildPeriodReconciliations/)
  assert.match(healthSource, /\['week', 'month', 'quarter', 'halfyear', 'year'\]/)
})

test('家庭净资产趋势读取快照净资产且资产结构按二级分类拆分', () => {
  assert.match(statsSource, /value: Number\(item\.net_worth \|\| 0\)/)
  assert.doesNotMatch(statsSource, /total_value: Number\(item\.net_worth/)
  assert.match(statsSource, /familyOverview\.value\?\.categories\?\.assets/)
  assert.match(statsSource, /asset\.category_code/)
  assert.doesNotMatch(statsSource, /label: '其他资产', value: summary\.manual_asset_value/)
})

test('家庭统计加载失败不会阻断现有基金统计', () => {
  assert.match(statsSource, /Promise\.allSettled\(\[captureProfitSnapshotFromApis\(\), familyFinanceApi\.overview\(\)\]\)/)
  assert.match(statsSource, /if \(fundResult\.status === 'rejected'\) throw fundResult\.reason/)
  assert.match(statsSource, /Failed to fetch family stats/)
})

test('统计页刷新只能读取服务端生成的完整收益快照', () => {
  const snapshotServiceSource = readFileSync(new URL('../src/utils/profitSnapshotService.js', import.meta.url), 'utf8')
  assert.match(snapshotServiceSource, /profitSnapshotApi\.capture\(\)/)
  assert.doesNotMatch(snapshotServiceSource, /profitSnapshotApi\.save/)
  assert.doesNotMatch(snapshotServiceSource, /persistProfitSnapshot/)
})

test('首页基金入口和收益统计只保留真实基金持仓口径', () => {
  assert.match(homeSource, /router\.push\('\/positions'\)/)
  assert.doesNotMatch(homeSource, /account\.hasAdvisory/)
})
