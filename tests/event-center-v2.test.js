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

test('后端事件表包含业务字段并通过来源唯一键幂等去重', () => {
  for (const field of ['event_type', 'status', 'event_time', 'description', 'detail_json', 'handled_at', 'handle_note']) {
    assert.match(apiSource, new RegExp(field))
  }
  assert.match(apiSource, /UNIQUE\(source_type, source_id, event_type\)/)
  assert.match(apiSource, /INSERT OR IGNORE INTO events/)
})
