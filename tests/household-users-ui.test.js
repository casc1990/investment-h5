import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const register = readFileSync(new URL('../src/views/Register.vue', import.meta.url), 'utf8')
const users = readFileSync(new URL('../src/views/HouseholdUsers.vue', import.meta.url), 'utf8')
const login = readFileSync(new URL('../src/views/Login.vue', import.meta.url), 'utf8')
const accountMembers = readFileSync(new URL('../src/views/AccountMembers.vue', import.meta.url), 'utf8')

test('登录页使用家庭资产品牌视觉且注册入口明确为白名单', () => {
  assert.match(login, /让每一笔家庭资产/)
  assert.match(login, /资产趋势/)
  assert.match(login, /家庭协作/)
  assert.match(login, /白名单注册/)
  assert.match(register, /仅超级管理员预先加入白名单的用户名可以注册/)
  assert.match(register, /白名单用户名/)
  assert.match(register, /authApi\.register/)
})

test('我的页面整合家庭用户管理', () => {
  assert.match(accountMembers, /HouseholdUsers/)
  assert.match(accountMembers, /activeTab === 'users'/)
  assert.match(users, /添加白名单/)
  assert.match(users, /注册白名单/)
  assert.match(users, /householdApi\.addWhitelist/)
  assert.match(users, /isSuperAdmin/)
  assert.match(users, /super_admin: '超级管理员'/)
  assert.match(users, /只读成员/)
  assert.match(users, /管理员/)
  assert.match(users, /停用用户/)
})
