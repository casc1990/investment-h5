<template>
  <div class="register-page">
    <div class="register-shell">
      <button class="back" type="button" @click="router.push('/login')"><span>‹</span> 返回登录</button>
      <div class="brand-mark"><van-icon name="shield-o" /></div>
      <div class="eyebrow">家庭账户 · 安全注册</div>
      <h1>创建你的登录账户</h1>
      <p class="intro">仅超级管理员预先加入白名单的用户名可以注册。注册后会自动创建独立家庭空间。</p>

      <div class="whitelist-note">
        <van-icon name="passed" />
        <div><strong>白名单校验</strong><span>请使用超级管理员登记的用户名，你的数据与其他家庭完全隔离。</span></div>
      </div>

      <van-form @submit="submit">
        <div class="field-group">
          <label>白名单用户名</label>
          <van-field v-model="form.username" name="username" placeholder="请输入已登记的用户名" autocomplete="username" :rules="[{ required: true, message: '请输入用户名' }]" />
        </div>
        <div class="field-group">
          <label>显示名称</label>
          <van-field v-model="form.displayName" name="displayName" placeholder="家庭中显示的称呼" :rules="[{ required: true, message: '请输入显示名称' }]" />
        </div>
        <div class="field-group">
          <label>设置密码</label>
          <van-field v-model="form.password" name="password" type="password" placeholder="至少8位" autocomplete="new-password" :rules="[{ required: true, message: '请输入密码' }]" />
        </div>
        <div class="field-group">
          <label>确认密码</label>
          <van-field v-model="form.confirmPassword" name="confirmPassword" type="password" placeholder="再次输入密码" autocomplete="new-password" :rules="[{ required: true, message: '请确认密码' }]" />
        </div>
        <van-button round block type="primary" native-type="submit" :loading="loading" loading-text="正在注册...">完成注册</van-button>
      </van-form>
      <div class="privacy"><van-icon name="lock" /> 注册信息仅用于家庭资产系统登录</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { authApi } from '../api'

const router = useRouter()
const loading = ref(false)
const form = ref({ username: '', displayName: '', password: '', confirmPassword: '' })

async function submit() {
  if (loading.value) return
  if (form.value.password.length < 8) return showToast('密码长度至少8位')
  if (form.value.password !== form.value.confirmPassword) return showToast('两次输入的密码不一致')
  loading.value = true
  try {
    const data = await authApi.register({
      username: form.value.username.trim(),
      display_name: form.value.displayName.trim(),
      password: form.value.password,
    })
    localStorage.setItem('auth_token', data.token)
    localStorage.setItem('auth_username', data.username)
    showToast(`已加入${data.household_name || '家庭'}`)
    router.replace('/')
  } catch (error) {
    showToast(error?.response?.data?.message || error?.message || '注册失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.register-page { min-height:100vh; padding:22px 16px 42px; background:radial-gradient(circle at 88% 8%,rgba(60,142,255,.16),transparent 30%),linear-gradient(155deg,#eef6ff 0%,#f8fafc 48%,#f2efff 100%); }
.register-shell { width:100%; max-width:440px; margin:0 auto; padding:6px 4px; }
.back { display:flex; align-items:center; gap:5px; padding:8px 0; border:0; background:transparent; color:#718096; font-size:14px; }.back span { font-size:25px; line-height:14px; }
.brand-mark { display:grid; place-items:center; width:56px; height:56px; margin-top:26px; border-radius:18px; background:linear-gradient(145deg,#1684ff,#6858ef); color:#fff; box-shadow:0 12px 28px rgba(51,112,231,.24); font-size:27px; }
.eyebrow { margin-top:20px; color:#2582ec; font-size:12px; font-weight:700; letter-spacing:.06em; }
h1 { margin:6px 0 0; color:#172033; font-size:28px; line-height:1.25; }.intro { margin:10px 0 20px; color:#7d899c; font-size:14px; line-height:1.7; }
.whitelist-note { display:flex; gap:11px; margin-bottom:18px; padding:14px; border:1px solid #dceafe; border-radius:15px; background:rgba(255,255,255,.78); color:#2780e5; }.whitelist-note>.van-icon { margin-top:2px; font-size:20px; }.whitelist-note div { display:flex; flex-direction:column; gap:3px; }.whitelist-note strong { color:#31415a; font-size:14px; }.whitelist-note span { color:#8793a5; font-size:12px; line-height:1.5; }
form { padding:20px 16px; border:1px solid rgba(220,229,240,.9); border-radius:22px; background:rgba(255,255,255,.94); box-shadow:0 18px 48px rgba(52,78,117,.1); }.field-group { margin-bottom:14px; }.field-group label { display:block; margin:0 3px 7px; color:#59677c; font-size:13px; font-weight:600; }.field-group :deep(.van-field) { padding:13px 14px; border:1px solid #e2e8f0; border-radius:13px; background:#f8fafc; }.field-group :deep(.van-field:focus-within) { border-color:#6ba9f4; background:#fff; box-shadow:0 0 0 3px rgba(58,139,238,.09); }
:deep(.van-button) { height:49px; margin-top:8px; border:0; background:linear-gradient(100deg,#1684ff,#6658ef); box-shadow:0 10px 22px rgba(52,108,226,.2); font-size:16px; font-weight:600; }.privacy { display:flex; justify-content:center; align-items:center; gap:5px; margin-top:17px; color:#98a3b3; font-size:11px; }
</style>
