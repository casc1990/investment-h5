import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { canWriteHouseholdData, DEFAULT_HOUSEHOLD_ID } from '../functions/[[path]].js'

const source = readFileSync(new URL('../functions/[[path]].js', import.meta.url), 'utf8')

test('超级管理员、家庭所有者和管理员可以写入', () => {
  assert.equal(canWriteHouseholdData('super_admin'), true)
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
  assert.match(source, /UPDATE users SET role = 'super_admin'.*username = 'admin'/)
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

test('白名单用户创建独立家庭，受邀用户加入指定家庭', () => {
  assert.match(source, /path === '\/api\/auth\/register'/)
  assert.match(source, /FROM registration_whitelist w/)
  assert.match(source, /const householdId = invite \? invite\.household_id : generateId\(\)/)
  assert.match(source, /const householdName = invite \? invite\.household_name : `\$\{displayName\}的家庭`/)
  assert.match(source, /const role = invite \? \(invite\.role === 'admin' \? 'admin' : 'viewer'\) : 'owner'/)
  assert.match(source, /UPDATE household_invites SET used_by = \?, used_at = unixepoch\(\)/)
  assert.match(source, /INSERT INTO households \(id, name, owner_user_id\)/)
  assert.match(source, /INSERT INTO users \(id, username, password_hash, display_name, household_id, role/)
  assert.doesNotMatch(source, /CREATE TABLE IF NOT EXISTS household_users/)
})

test('家庭邀请不依赖白名单且限制最多10位受邀用户', () => {
  assert.match(source, /if \(inviteCode\)/)
  assert.match(source, /role NOT IN \('owner', 'super_admin'\)/)
  assert.match(source, /该家庭邀请成员已达10人上限/)
  assert.match(source, /受邀用户无需注册白名单|邀请码无效或已过期/)
})

test('邀请成员由服务端指定且用户与资产成员保持一对一', () => {
  assert.match(source, /ensureColumn\('household_invites', 'member_mode'/)
  assert.match(source, /ensureColumn\('household_invites', 'member_id'/)
  assert.match(source, /idx_users_linked_member_unique/)
  assert.match(source, /idx_invites_pending_member_unique/)
  assert.match(source, /该资产成员已经绑定登录账号/)
  assert.match(source, /该资产成员已有待使用邀请/)
  assert.match(source, /INSERT INTO members \(id, name, emoji, relation, household_id\)/)
  assert.match(source, /linked_member_id, updated_at/)
})

test('旧白名单用户会从共享家庭迁移到独立家庭', () => {
  assert.match(source, /JOIN registration_whitelist w ON w\.used_by = u\.id/)
  assert.match(source, /u\.household_id = w\.household_id AND u\.role != 'super_admin'/)
  assert.match(source, /independentHouseholdName/)
  assert.match(source, /UPDATE users SET household_id = \?, role = 'owner'/)
})

test('注册白名单按用户名唯一并在注册时原子占用', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS registration_whitelist/)
  assert.match(source, /username TEXT NOT NULL COLLATE NOCASE UNIQUE/)
  assert.match(source, /UPDATE registration_whitelist SET used_by = \?, used_at = unixepoch\(\), status = 'used'/)
  assert.match(source, /Number\(claim\?\.meta\?\.changes \|\| 0\) !== 1/)
  assert.match(source, /该用户名不在注册白名单中/)
  assert.match(source, /仅可移除尚未注册的白名单用户/)
  assert.match(source, /仅超级管理员 admin 可以管理注册白名单/)
  assert.match(source, /authUser\?\.role === 'super_admin'/)
  assert.match(source, /registered_household\.name AS registered_household_name/)
  assert.match(source, /used\.status AS registered_status/)
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
