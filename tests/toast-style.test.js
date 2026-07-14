import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const appSource = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')

test('全局操作提示使用明确的深色背景与白色文字', () => {
  assert.match(appSource, /--van-toast-text-color:\s*#ffffff/)
  assert.match(appSource, /--van-toast-background:\s*rgba\(15, 23, 42, 0\.92\)/)
  assert.match(appSource, /\.van-toast\s*\{[\s\S]*color:\s*#ffffff !important;[\s\S]*background:\s*rgba\(15, 23, 42, 0\.92\) !important;/)
  assert.match(appSource, /\.van-toast \.van-toast__text/)
})
