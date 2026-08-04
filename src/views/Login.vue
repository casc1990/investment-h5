<template>
  <div class="login-page">
    <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
    <main class="login-shell">
      <section class="welcome">
        <div class="brand-icon"><van-icon name="balance-list-o" /></div>
        <div class="brand-copy"><span>FAMILY WEALTH</span><strong>家庭资产</strong></div>
        <h1>让每一笔家庭资产<br><em>清晰可见</em></h1>
        <p>基金持仓、家庭资产与财务记录，在一个安全空间里持续沉淀。</p>
        <div class="feature-row">
          <span><van-icon name="chart-trending-o" /> 资产趋势</span>
          <span><van-icon name="friends-o" /> 家庭协作</span>
          <span><van-icon name="shield-o" /> 数据隔离</span>
        </div>
      </section>

      <section class="login-card">
        <div class="card-heading">
          <span>{{ isSetup ? '首次使用' : '欢迎回来' }}</span>
          <h2>{{ isSetup ? '创建超级管理员' : '登录家庭账户' }}</h2>
          <p>{{ isSetup ? '初始化系统唯一的 admin 超级管理员' : '继续查看和管理你的家庭资产' }}</p>
        </div>
        <van-form @submit="onSubmit">
          <div class="field-group">
            <label>用户名</label>
            <van-field v-model="formData.username" name="username" placeholder="请输入用户名" autocomplete="username" :readonly="isSetup" :rules="[{ required: true, message: '请输入用户名' }]">
              <template #left-icon><van-icon name="contact-o" /></template>
            </van-field>
          </div>
          <div class="field-group">
            <label>密码</label>
            <van-field v-model="formData.password" name="password" type="password" placeholder="请输入密码" autocomplete="current-password" :rules="[{ required: true, message: '请输入密码' }]">
              <template #left-icon><van-icon name="lock" /></template>
            </van-field>
          </div>
          <div v-if="isSetup" class="field-group">
            <label>确认密码</label>
            <van-field v-model="formData.confirmPassword" name="confirmPassword" type="password" placeholder="请再次输入密码" :rules="[{ required: true, message: '请确认密码' },{ validator: validateConfirm, message: '两次密码不一致' }]">
              <template #left-icon><van-icon name="lock" /></template>
            </van-field>
          </div>
          <div v-if="error" class="error-msg"><van-icon name="warning-o" />{{ error }}</div>
          <van-button round block type="primary" native-type="submit" :loading="loading" loading-text="正在验证...">{{ isSetup ? '创建超级管理员' : '安全登录' }}</van-button>
        </van-form>
        <div v-if="!isSetup" class="register-entry"><span>首次使用家庭账户？</span><button type="button" @click="router.push('/register')">白名单注册 <b>→</b></button></div>
        <div class="security-note"><van-icon name="shield-o" /> 仅授权家庭用户可访问</div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'

const router = useRouter()
const loading = ref(false)
const error = ref('')
const isSetup = ref(false)
const formData = ref({ username: 'admin', password: '', confirmPassword: '' })
const validateConfirm = val => val === formData.value.password

async function checkStatus() {
  try {
    const res = await fetch('/api/auth/status')
    const data = await res.json()
    isSetup.value = !data.data?.configured
    if (!isSetup.value && localStorage.getItem('auth_token')) router.replace('/')
  } catch { isSetup.value = true }
}

async function onSubmit() {
  error.value = ''
  if (formData.value.password.length < 6) return (error.value = '密码长度至少6位')
  if (isSetup.value && formData.value.password !== formData.value.confirmPassword) return (error.value = '两次密码不一致')
  loading.value = true
  try {
    const res = await fetch(isSetup.value ? '/api/auth/setup' : '/api/auth/login', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ username:formData.value.username, password:formData.value.password }),
    })
    const data = await res.json()
    if (data.code !== 0) return (error.value = data.message || '操作失败')
    localStorage.setItem('auth_token', data.data.token)
    localStorage.setItem('auth_username', data.data.username)
    showToast(isSetup.value ? '管理员账户已创建' : '登录成功')
    router.replace('/')
  } catch { error.value = '网络异常，请稍后重试' }
  finally { loading.value = false }
}

onMounted(checkStatus)
</script>

<style scoped>
.login-page { position:relative; min-height:100vh; overflow:hidden; padding:30px 18px 42px; background:linear-gradient(155deg,#f5f9ff 0%,#eef5ff 46%,#f6f3ff 100%); color:#172033; }.ambient { position:absolute; border-radius:50%; filter:blur(2px); pointer-events:none; }.ambient-one { top:-130px; right:-100px; width:320px; height:320px; background:radial-gradient(circle,rgba(35,132,255,.2),rgba(35,132,255,0) 70%); }.ambient-two { bottom:-180px; left:-140px; width:390px; height:390px; background:radial-gradient(circle,rgba(116,84,238,.16),rgba(116,84,238,0) 70%); }
.login-shell { position:relative; z-index:1; width:100%; max-width:430px; margin:0 auto; }.welcome { padding:15px 6px 28px; }.brand-icon { display:grid; place-items:center; float:left; width:48px; height:48px; margin-right:11px; border-radius:16px; background:linear-gradient(145deg,#1684ff,#6558ed); color:#fff; box-shadow:0 12px 26px rgba(51,111,227,.22); font-size:24px; }.brand-copy { display:flex; flex-direction:column; padding-top:4px; }.brand-copy span { color:#7889a1; font-size:9px; font-weight:700; letter-spacing:.13em; }.brand-copy strong { margin-top:2px; font-size:20px; }.welcome h1 { clear:both; margin:34px 0 10px; font-size:32px; line-height:1.28; letter-spacing:-.03em; }.welcome h1 em { color:#2583ef; font-style:normal; }.welcome>p { max-width:360px; margin:0; color:#78869b; font-size:14px; line-height:1.7; }.feature-row { display:flex; gap:16px; margin-top:18px; color:#65758d; font-size:11px; }.feature-row span { display:flex; align-items:center; gap:4px; }.feature-row .van-icon { color:#3188ed; font-size:15px; }
.login-card { padding:24px 20px 18px; border:1px solid rgba(220,229,240,.92); border-radius:24px; background:rgba(255,255,255,.94); box-shadow:0 22px 55px rgba(54,80,119,.12); backdrop-filter:blur(14px); }.card-heading>span { color:#2c85ed; font-size:12px; font-weight:700; }.card-heading h2 { margin:5px 0 4px; font-size:23px; }.card-heading p { margin:0 0 22px; color:#929dae; font-size:13px; }.field-group { margin-bottom:15px; }.field-group label { display:block; margin:0 3px 7px; color:#59677c; font-size:13px; font-weight:600; }.field-group :deep(.van-field) { padding:13px 14px; border:1px solid #e1e8f1; border-radius:14px; background:#f8fafc; }.field-group :deep(.van-field:focus-within) { border-color:#68a7f2; background:#fff; box-shadow:0 0 0 3px rgba(57,138,236,.09); }.field-group :deep(.van-field__left-icon) { margin-right:9px; color:#8493a8; font-size:18px; }
:deep(.van-button) { height:49px; margin-top:7px; border:0; background:linear-gradient(100deg,#1684ff,#6558ed); box-shadow:0 10px 23px rgba(49,106,224,.2); font-size:16px; font-weight:600; }.error-msg { display:flex; align-items:center; gap:5px; margin:-2px 2px 8px; color:#e55252; font-size:12px; }.register-entry { display:flex; justify-content:center; gap:5px; margin-top:18px; color:#99a3b2; font-size:13px; }.register-entry button { border:0; background:transparent; color:#277fdf; font-weight:600; }.register-entry b { font-size:15px; }.security-note { display:flex; justify-content:center; align-items:center; gap:4px; margin-top:16px; padding-top:14px; border-top:1px solid #edf1f6; color:#a2abb8; font-size:10px; }
@media (min-width:760px) { .login-page { display:flex; align-items:center; }.login-shell { max-width:900px; display:grid; grid-template-columns:1fr 390px; align-items:center; gap:68px; }.welcome { padding:20px; }.welcome h1 { font-size:42px; }.login-card { padding:30px 26px 22px; } }
</style>
