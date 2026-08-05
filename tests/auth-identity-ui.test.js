import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const backend = read('../functions/[[path]].js')
const app = read('../src/App.vue')
const accountMembers = read('../src/views/AccountMembers.vue')
const accounts = read('../src/views/Accounts.vue')
const finance = read('../src/views/FamilyFinance.vue')
const positions = read('../src/views/Positions.vue')
const trades = read('../src/views/Trades.vue')
const home = read('../src/views/Home.vue')
const stats = read('../src/views/Stats.vue')
const identity = read('../src/utils/authIdentity.js')

test('登录身份返回关联资产成员并在我的页面展示', () => {
  assert.match(backend, /u\.linked_member_id, h\.name AS household_name/)
  assert.match(backend, /m\.emoji AS linked_member_emoji/)
  assert.match(backend, /linked_member_relation: authUser\.linked_member_relation/)
  assert.match(identity, /export const authIdentity/)
  assert.match(accountMembers, /当前登录身份/)
  assert.match(accountMembers, /关联资产成员/)
  assert.match(accountMembers, /尚未关联资产成员/)
  assert.match(accountMembers, /去关联/)
})

test('底部我的入口使用关联成员头像', () => {
  assert.match(app, /identity-tab-avatar/)
  assert.match(app, /authIdentity\.linked_member_emoji/)
  assert.match(app, /loadAuthIdentity\(\)/)
})

test('新增账户、家庭财务、持仓和交易默认使用当前关联成员', () => {
  assert.match(accounts, /memberId: authIdentity\.linked_member_id/)
  assert.match(finance, /const defaultMemberId = authIdentity\.linked_member_id/)
  assert.match(positions, /memberId: authIdentity\.linked_member_id/)
  assert.match(trades, /!formData\.value\.memberId && authIdentity\.linked_member_id/)
})

test('首页、持仓和统计提供我的资产快捷筛选', () => {
  assert.match(home, />我的资产<\/button>/)
  assert.match(home, /selectedContributionMemberId\.value = authIdentity\.linked_member_id/)
  assert.match(positions, /class="my-assets-btn"/)
  assert.match(positions, /onMemberChange\(authIdentity\.linked_member_id\)/)
  assert.match(stats, /const selectMyAssets/)
  assert.match(stats, /selectedMember\.value = authIdentity\.linked_member_id/)
})
