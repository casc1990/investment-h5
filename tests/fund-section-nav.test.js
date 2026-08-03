import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const navSource = readFileSync(new URL('../src/components/FundSectionNav.vue', import.meta.url), 'utf8')
const positionsSource = readFileSync(new URL('../src/views/Positions.vue', import.meta.url), 'utf8')
const tradesSource = readFileSync(new URL('../src/views/Trades.vue', import.meta.url), 'utf8')
const strategiesSource = readFileSync(new URL('../src/views/AllocationStrategies.vue', import.meta.url), 'utf8')

test('基金工作台统一提供持仓、交易和配置入口', () => {
  assert.match(navSource, /to: '\/positions', label: '持仓'/)
  assert.match(navSource, /to: '\/trades', label: '交易'/)
  assert.match(navSource, /to: '\/allocation', label: '配置'/)
})

test('三个现有基金主页面复用统一切换导航', () => {
  for (const source of [positionsSource, tradesSource, strategiesSource]) {
    assert.match(source, /<FundSectionNav \/>/)
    assert.match(source, /import FundSectionNav from '\.\.\/components\/FundSectionNav\.vue'/)
  }
})
