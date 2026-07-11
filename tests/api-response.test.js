import test from 'node:test'
import assert from 'node:assert/strict'

import { unwrapApiPayload } from '../src/utils/apiResponse.js'

test('标准 data 响应继续解包业务数据', () => {
  assert.deepEqual(unwrapApiPayload({ code: 0, data: { configured: true } }), { configured: true })
})

test('顶层业务字段响应保留完整结构', () => {
  const payload = { code: 0, pending: 2, overdue: 0, funds: [{ fund_code: '019118' }] }
  assert.deepEqual(unwrapApiPayload(payload), payload)
})

test('错误响应不被误解包', () => {
  const payload = { code: 500, message: 'failed' }
  assert.deepEqual(unwrapApiPayload(payload), payload)
})
