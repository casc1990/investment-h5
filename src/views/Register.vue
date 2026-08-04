<template>
  <div class="register-page">
    <div class="register-card">
      <button class="back" type="button" @click="router.push('/login')">‹ 返回登录</button>
      <div class="eyebrow">家庭账户</div>
      <h1>{{ mode === 'create' ? '创建新家庭' : '加入已有家庭' }}</h1>
      <p>一个账户只能属于一个家庭，注册后不可切换。</p>

      <div class="mode-switch">
        <button type="button" :class="{ active: mode === 'create' }" @click="mode = 'create'">创建家庭</button>
        <button type="button" :class="{ active: mode === 'join' }" @click="mode = 'join'">使用邀请码</button>
      </div>

      <van-form @submit="submit">
        <van-cell-group inset>
          <van-field v-if="mode === 'create'" v-model="form.householdName" label="家庭名称" placeholder="例如：我的家庭" :rules="[{ required: true, message: '请输入家庭名称' }]" />
          <van-field v-else v-model="form.inviteCode" label="邀请码" placeholder="请输入家庭邀请码" :rules="[{ required: true, message: '请输入邀请码' }]" @blur="checkInvite" />
          <div v-if="inviteInfo" class="invite-info">将加入“{{ inviteInfo.household_name }}”，权限：{{ roleLabel(inviteInfo.role) }}</div>
          <van-field v-model="form.username" label="用户名" placeholder="4至30位字符" :rules="[{ required: true, message: '请输入用户名' }]" />
          <van-field v-model="form.displayName" label="显示名称" placeholder="家庭中显示的称呼" :rules="[{ required: true, message: '请输入显示名称' }]" />
          <van-field v-model="form.password" type="password" label="密码" placeholder="至少8位" :rules="[{ required: true, message: '请输入密码' }]" />
          <van-field v-model="form.confirmPassword" type="password" label="确认密码" placeholder="再次输入密码" :rules="[{ required: true, message: '请确认密码' }]" />
        </van-cell-group>
        <van-button round block type="primary" native-type="submit" :loading="loading" loading-text="创建中...">
          {{ mode === 'create' ? '创建家庭并注册' : '加入家庭并注册' }}
        </van-button>
      </van-form>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { authApi } from '../api'

const route = useRoute()
const router = useRouter()
const mode = ref(route.query.invite ? 'join' : 'create')
const loading = ref(false)
const inviteInfo = ref(null)
const form = ref({ householdName: '', inviteCode: String(route.query.invite || ''), username: '', displayName: '', password: '', confirmPassword: '' })

const roleLabel = role => role === 'admin' ? '管理员' : '只读成员'
watch(mode, () => { inviteInfo.value = null })

async function checkInvite() {
  if (!form.value.inviteCode.trim()) return
  try {
    inviteInfo.value = await authApi.inviteInfo(form.value.inviteCode.trim())
  } catch (error) {
    inviteInfo.value = null
    showToast(error?.response?.data?.message || '邀请码无效或已过期')
  }
}

async function submit() {
  if (loading.value) return
  if (form.value.password.length < 8) return showToast('密码长度至少8位')
  if (form.value.password !== form.value.confirmPassword) return showToast('两次输入的密码不一致')
  if (mode.value === 'join' && !inviteInfo.value) {
    await checkInvite()
    if (!inviteInfo.value) return
  }
  loading.value = true
  try {
    const data = await authApi.register({
      mode: mode.value,
      household_name: form.value.householdName.trim(),
      invite_code: form.value.inviteCode.trim(),
      username: form.value.username.trim(),
      display_name: form.value.displayName.trim(),
      password: form.value.password,
    })
    localStorage.setItem('auth_token', data.token)
    localStorage.setItem('auth_username', data.username)
    showToast(mode.value === 'create' ? '家庭创建成功' : '已加入家庭')
    router.replace('/')
  } catch (error) {
    showToast(error?.response?.data?.message || error?.message || '注册失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.register-page { min-height: 100vh; padding: 22px 14px 40px; background: linear-gradient(160deg, #eaf3ff, #f7f8fb 46%, #efeaff); }
.register-card { max-width: 480px; margin: 0 auto; padding: 22px 16px 26px; border-radius: 22px; background: rgba(255,255,255,.96); box-shadow: 0 16px 45px rgba(38,73,125,.12); }
.back { border: 0; background: transparent; color: #6f7d92; font-size: 14px; }
.eyebrow { margin-top: 22px; color: #1e80ff; font-size: 12px; font-weight: 700; }
h1 { margin-top: 5px; color: #172033; font-size: 26px; }
p { margin: 7px 0 20px; color: #8a96a8; font-size: 13px; }
.mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 16px; padding: 4px; border-radius: 13px; background: #eef2f7; }
.mode-switch button { height: 42px; border: 0; border-radius: 10px; background: transparent; color: #758196; font-size: 14px; font-weight: 600; }
.mode-switch button.active { background: #fff; color: #1e80ff; box-shadow: 0 3px 10px rgba(31,55,88,.09); }
.invite-info { margin: 0 16px 8px; padding: 10px 12px; border-radius: 10px; background: #edf7ff; color: #3975ad; font-size: 12px; }
:deep(.van-cell-group--inset) { margin: 0 0 20px; }
:deep(.van-button) { height: 48px; }
</style>
