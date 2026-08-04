import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const register = readFileSync(new URL('../src/views/Register.vue', import.meta.url), 'utf8')
const users = readFileSync(new URL('../src/views/HouseholdUsers.vue', import.meta.url), 'utf8')
const login = readFileSync(new URL('../src/views/Login.vue', import.meta.url), 'utf8')
const accountMembers = readFileSync(new URL('../src/views/AccountMembers.vue', import.meta.url), 'utf8')

test('登录页提供注册入口且注册页支持创建或加入家庭', () => {
  assert.match(login, /注册或加入家庭/)
  assert.match(register, /创建新家庭/)
  assert.match(register, /加入已有家庭/)
  assert.match(register, /一个账户只能属于一个家庭/)
  assert.match(register, /authApi\.register/)
})

test('我的页面整合家庭用户管理', () => {
  assert.match(accountMembers, /HouseholdUsers/)
  assert.match(accountMembers, /activeTab === 'users'/)
  assert.match(users, /邀请用户/)
  assert.match(users, /只读成员/)
  assert.match(users, /管理员/)
  assert.match(users, /停用用户/)
})
