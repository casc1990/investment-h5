import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const apiSource = fs.readFileSync(new URL('../functions/[[path]].js', import.meta.url), 'utf8')
const homeSource = fs.readFileSync(new URL('../src/views/Home.vue', import.meta.url), 'utf8')
const statsSource = fs.readFileSync(new URL('../src/views/Stats.vue', import.meta.url), 'utf8')
const snapshotSource = fs.readFileSync(new URL('../src/utils/profitSnapshotService.js', import.meta.url), 'utf8')
const apiClientSource = fs.readFileSync(new URL('../src/api/index.js', import.meta.url), 'utf8')

test('首页一次请求读取两组事件，事件重建在后台独立执行', () => {
  assert.match(homeSource, /eventApi\.list\(\{ group: 'all', limit: 5 \}\)/)
  assert.match(homeSource, /eventApi\.reconcile\(\)/)
  const getRoute = apiSource.slice(apiSource.indexOf("if (path === '/api/events' && method === 'GET')"), apiSource.indexOf("if (path === '/api/events/reconcile'"))
  assert.doesNotMatch(getRoute, /seedBusinessEvents\(\)/)
  assert.match(apiSource, /groups:\s*\{[\s\S]*pending:[\s\S]*confirmed:/)
})

test('主要页面优先恢复缓存，统计快照保存不阻塞首屏', () => {
  assert.match(homeSource, /readPageCache\('home'\)/)
  assert.match(statsSource, /readPageCache\('stats'\)/)
  assert.match(snapshotSource, /persistProfitSnapshot\(snapshotResult\.snapshot\)\.catch/)
  assert.doesNotMatch(snapshotSource, /await persistProfitSnapshot/)
})

test('运行时结构迁移使用全局版本标记避免每个冷实例重复执行', () => {
  assert.match(apiSource, /runtime_schema_version/)
  assert.match(apiSource, /if \(schemaVersions\?\.\[0\]\?\.meta_value === runtimeSchemaVersion\) return/)
})

test('读取请求缩短超时、合并重复调用并仅自动重试一次', () => {
  assert.match(apiClientSource, /timeout: 12000/)
  assert.match(apiClientSource, /pendingGetRequests/)
  assert.match(apiClientSource, /!config\.__retried/)
  assert.match(apiClientSource, /config\.__retried = true/)
})
