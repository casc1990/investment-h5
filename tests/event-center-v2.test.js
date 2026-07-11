import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const homeSource = await readFile(new URL('../src/views/Home.vue', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../functions/[[path]].js', import.meta.url), 'utf8')

test('首页事件中心提供待处理和已确认双 Tab', () => {
  assert.match(homeSource, /待处理 \{\{ eventCounts\.pending \}\}/)
  assert.match(homeSource, /已确认 \{\{ eventCounts\.confirmed \}\}/)
  assert.match(apiSource, /status IN \('processed', 'ignored'\)/)
})

test('事件卡片展示类别、状态、时间、描述和详情入口', () => {
  for (const binding of ['event.event_type', 'event.status', 'event.event_time', 'event.description']) {
    assert.match(homeSource, new RegExp(binding.replace('.', '\\.')))
  }
  assert.match(homeSource, /查看详情/)
  assert.match(homeSource, /净值更新/)
  assert.match(homeSource, /分红/)
  assert.match(homeSource, /份额变动/)
})

test('事件详情支持处理、忽略、重新打开和净值补同步', () => {
  assert.match(homeSource, /忽略事件/)
  assert.match(homeSource, /标记已处理/)
  assert.match(homeSource, /重新打开/)
  assert.match(homeSource, /立即补同步/)
  assert.match(apiSource, /\['pending', 'processed', 'ignored'\]/)
})

test('分红公告提供立即处理并展示四位精度的每份分红', () => {
  assert.match(homeSource, /立即处理/)
  assert.match(homeSource, /processDividendEvent/)
  assert.match(homeSource, /formatDividendPerShare/)
  assert.match(homeSource, /红利再投新增/)
})

test('事件详情弹层挂载到 body 顶层且高于固定底部菜单', () => {
  assert.match(homeSource, /teleport="body"/)
  assert.match(homeSource, /:z-index="1000"/)
  assert.match(homeSource, /safe-area-inset-bottom/)
  assert.match(homeSource, /event-detail-popup \{ max-height: 88dvh; overflow-y: auto;/)
})

test('后端事件表包含业务字段并通过来源唯一键幂等去重', () => {
  for (const field of ['event_type', 'status', 'event_time', 'description', 'detail_json', 'handled_at', 'handle_note']) {
    assert.match(apiSource, new RegExp(field))
  }
  assert.match(apiSource, /UNIQUE\(source_type, source_id, event_type\)/)
  assert.match(apiSource, /INSERT OR IGNORE INTO events/)
})

test('近期分红事件展示登记日、除息日、预计金额和发放日', () => {
  assert.match(homeSource, /权益登记日/)
  assert.match(homeSource, /除息日/)
  assert.match(homeSource, /预计分红/)
  assert.match(homeSource, /红利发放日/)
  assert.match(apiSource, /dividend_announcement/)
})

test('处理分红公告会按持仓分红方式生成幂等交易流水', () => {
  assert.match(apiSource, /bookDividendAnnouncement/)
  assert.match(apiSource, /buildDividendTrade/)
  assert.match(apiSource, /'dividend_event'/)
  assert.match(apiSource, /CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_source/)
  assert.match(apiSource, /booking_result/)
})
