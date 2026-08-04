import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { canWriteHouseholdData, DEFAULT_HOUSEHOLD_ID } from '../functions/[[path]].js'

const source = readFileSync(new URL('../functions/[[path]].js', import.meta.url), 'utf8')

test('家庭角色只有所有者和管理员可以写入', () => {
  assert.equal(canWriteHouseholdData('owner'), true)
  assert.equal(canWriteHouseholdData('admin'), true)
  assert.equal(canWriteHouseholdData('viewer'), false)
  assert.equal(canWriteHouseholdData(''), false)
})

test('现有单管理员数据迁移到稳定的默认家庭', () => {
  assert.equal(DEFAULT_HOUSEHOLD_ID, 'default-household')
  assert.match(source, /INSERT OR IGNORE INTO households/)
  assert.match(source, /UPDATE users SET household_id = COALESCE\(household_id, \?\)/)
  assert.match(source, /UPDATE auth_tokens SET user_id = COALESCE\(user_id, \?\)/)
})

test('认证会话关联用户和唯一家庭', () => {
  assert.match(source, /JOIN users u ON u\.id = t\.user_id/)
  assert.match(source, /JOIN households h ON h\.id = u\.household_id/)
  assert.match(source, /const householdId = authUser\?\.household_id/)
  assert.match(source, /path === '\/api\/auth\/me'/)
})

test('家庭私有核心查询必须使用家庭条件', () => {
  assert.match(source, /SELECT \* FROM members WHERE household_id = \?/)
  assert.match(source, /WHERE a\.household_id = \?'/)
  assert.match(source, /conditions = \['a\.household_id = \?'\]/)
  assert.match(source, /SELECT \* FROM family_assets WHERE id = \? AND status != \? AND household_id = \?/)
  assert.match(source, /SELECT profile_json, version, deleted_at FROM allocation_profiles WHERE household_id = \?/)
  assert.match(source, /SELECT snapshot_json FROM household_profit_snapshots WHERE household_id = \?/)
})

test('家庭快照使用家庭和日期复合主键且保留旧快照迁移', () => {
  assert.match(source, /PRIMARY KEY \(household_id, snapshot_date\)/)
  assert.match(source, /INSERT OR IGNORE INTO household_profit_snapshots/)
  assert.match(source, /INSERT OR IGNORE INTO household_family_snapshots/)
  assert.match(source, /ON CONFLICT\(household_id, snapshot_date\) DO UPDATE/)
})

test('注册用户通过白名单绑定唯一家庭', () => {
  assert.match(source, /path === '\/api\/auth\/register'/)
  assert.match(source, /FROM registration_whitelist w/)
  assert.match(source, /const householdId = whitelist\.household_id/)
  assert.match(source, /INSERT INTO users \(id, username, password_hash, display_name, household_id, role/)
  assert.doesNotMatch(source, /CREATE TABLE IF NOT EXISTS household_users/)
})

test('注册白名单按用户名唯一并在注册时原子占用', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS registration_whitelist/)
  assert.match(source, /username TEXT NOT NULL COLLATE NOCASE UNIQUE/)
  assert.match(source, /UPDATE registration_whitelist SET used_by = \?, used_at = unixepoch\(\), status = 'used'/)
  assert.match(source, /Number\(claim\?\.meta\?\.changes \|\| 0\) !== 1/)
  assert.match(source, /该用户名不在注册白名单中/)
  assert.match(source, /仅可移除尚未注册的白名单用户/)
})

test('家庭所有者管理用户角色和停用会话', () => {
  assert.match(source, /仅家庭所有者可以执行此操作/)
  assert.match(source, /\['admin', 'viewer'\]\.includes\(nextRole\)/)
  assert.match(source, /DELETE FROM auth_tokens WHERE user_id = \?/)
  assert.match(source, /user\.status !== 'active'/)
})

test('定时快照和事件重建按家庭隔离执行', () => {
  assert.match(source, /captureCurrentProfitSnapshot\(targetHouseholdId = householdId \|\| DEFAULT_HOUSEHOLD_ID\)/)
  assert.match(source, /SELECT id FROM households WHERE status = 'active'/)
  assert.match(source, /household_count: snapshots\.length/)
  assert.match(source, /seedBusinessEvents\(targetHouseholdId = householdId \|\| DEFAULT_HOUSEHOLD_ID\)/)
  assert.match(source, /WHERE a\.household_id = \? AND COALESCE\(t\.source_type/)
  assert.match(source, /GROUP BY a\.household_id, p\.fund_code/)
})
