import test from 'node:test'
import assert from 'node:assert/strict'

import { isAuthorizedCronRequest, requiresAuthentication, validateAllocationProfile } from '../functions/[[path]].js'

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

test('配置策略后端校验比例、分类、状态和重复持仓', () => {
  const valid = {
    id: 'strategy-1', name: '稳健策略', totalAsset: 100000, targetProfitRate: 8,
    buckets: [
      { assetType: 'pure_bond', targetPct: 40, maxDeviationPct: 5 },
      { assetType: 'index', targetPct: 60, maxDeviationPct: 8 },
    ],
    funds: [{ positionId: 'position-1', assetType: 'index', status: '保留' }],
  }
  assert.deepEqual(validateAllocationProfile(valid), [])
  const errors = validateAllocationProfile({
    ...valid,
    buckets: [{ assetType: 'unknown', targetPct: 90, maxDeviationPct: -1 }],
    funds: [
      { positionId: 'position-1', assetType: 'index', status: '错误状态' },
      { positionId: 'position-1', assetType: 'index', status: '保留' },
    ],
  })
  assert.ok(errors.includes('存在无效资产分类'))
  assert.ok(errors.includes('允许偏差必须在0到100之间'))
  assert.ok(errors.includes('目标比例合计必须等于100%'))
  assert.ok(errors.includes('基金状态无效'))
  assert.ok(errors.includes('同一持仓不能重复纳入策略'))
})
