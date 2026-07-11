import test from 'node:test'
import assert from 'node:assert/strict'

import { isAuthorizedCronRequest, requiresAuthentication } from '../functions/[[path]].js'

test('健康检查和认证入口保持公开', () => {
  assert.equal(requiresAuthentication('/api/health', 'GET'), false)
  assert.equal(requiresAuthentication('/api/auth/status', 'GET'), false)
  assert.equal(requiresAuthentication('/api/auth/setup', 'POST'), false)
  assert.equal(requiresAuthentication('/api/auth/login', 'POST'), false)
  assert.equal(requiresAuthentication('/api/anything', 'OPTIONS'), false)
  assert.equal(requiresAuthentication('/', 'GET'), false)
  assert.equal(requiresAuthentication('/positions', 'GET'), false)
  assert.equal(requiresAuthentication('/assets/app.js', 'GET'), false)
})

test('业务数据读取和写入均要求认证', () => {
  assert.equal(requiresAuthentication('/api/members', 'GET'), true)
  assert.equal(requiresAuthentication('/api/stats/overview', 'GET'), true)
  assert.equal(requiresAuthentication('/api/fund/sync', 'GET'), true)
  assert.equal(requiresAuthentication('/api/accounts', 'POST'), true)
  assert.equal(requiresAuthentication('/api/auth/logout', 'POST'), true)
})

test('定时同步只接受与环境变量一致的高强度密钥', () => {
  const secret = 'a'.repeat(64)
  const authorized = new Request('https://example.com/api/fund/sync', {
    method: 'POST',
    headers: { 'X-Cron-Secret': secret },
  })
  const rejected = new Request('https://example.com/api/fund/sync', {
    method: 'POST',
    headers: { 'X-Cron-Secret': 'wrong-secret' },
  })

  assert.equal(isAuthorizedCronRequest(authorized, { CRON_SYNC_SECRET: secret }), true)
  assert.equal(isAuthorizedCronRequest(rejected, { CRON_SYNC_SECRET: secret }), false)
  assert.equal(isAuthorizedCronRequest(authorized, { CRON_SYNC_SECRET: 'short' }), false)
})
