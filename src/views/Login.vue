<template>
  <div class="login-page">
    <div class="login-card">
      <div class="logo">💰</div>
      <h1 class="title">投资管理系统</h1>
      <p class="subtitle">{{ isSetup ? '设置管理员密码' : '请登录' }}</p>

      <van-form @submit="onSubmit">
        <van-cell-group inset>
          <van-field
            v-model="formData.username"
            label="用户名"
            placeholder="请输入用户名"
            :rules="[{ required: true, message: '请输入用户名' }]"
          />
          <van-field
            v-model="formData.password"
            type="password"
            label="密码"
            placeholder="请输入密码"
            :rules="[{ required: true, message: '请输入密码' }]"
          />
          <van-field
            v-if="isSetup"
            v-model="formData.confirmPassword"
            type="password"
            label="确认密码"
            placeholder="请再次输入密码"
            :rules="[{ required: true, message: '请确认密码' },
                     { validator: validateConfirm, message: '两次密码不一致' }]"
          />
        </van-cell-group>

        <div class="form-actions">
          <van-button round block type="primary" native-type="submit" :loading="loading">
            {{ isSetup ? '创建账户' : '登录' }}
          </van-button>
        </div>
      </van-form>

      <div v-if="error" class="error-msg">{{ error }}</div>
    </div>
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
const formData = ref({
  username: 'admin',
  password: '',
  confirmPassword: '',
})

const validateConfirm = (val) => val === formData.value.password

const checkStatus = async () => {
  try {
    const res = await fetch('/api/auth/status')
    const data = await res.json()
    isSetup.value = !data.data?.configured
    // 已有 token 则直接跳转
    if (!isSetup.value && localStorage.getItem('auth_token')) {
      router.replace('/')
    }
  } catch (e) {
    isSetup.value = true
  }
}

const onSubmit = async () => {
  error.value = ''
  if (formData.value.password.length < 6) {
    error.value = '密码长度至少6位'
    return
  }
  if (isSetup.value && formData.value.password !== formData.value.confirmPassword) {
    error.value = '两次密码不一致'
    return
  }
  loading.value = true
  try {
    const endpoint = isSetup.value ? '/api/auth/setup' : '/api/auth/login'
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: formData.value.username,
        password: formData.value.password,
      }),
    })
    const data = await res.json()
    if (data.code !== 0) {
      error.value = data.message || '操作失败'
      return
    }
    localStorage.setItem('auth_token', data.data.token)
    localStorage.setItem('auth_username', data.data.username)
    showToast(isSetup.value ? '管理员账户已创建' : '登录成功')
    router.replace('/')
  } catch (e) {
    error.value = '网络错误，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  checkStatus()
})
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.login-card {
  background: white;
  border-radius: 16px;
  padding: 40px 24px;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.logo {
  text-align: center;
  font-size: 64px;
  margin-bottom: 16px;
}

.title {
  text-align: center;
  font-size: 24px;
  font-weight: bold;
  color: #333;
  margin-bottom: 8px;
}

.subtitle {
  text-align: center;
  font-size: 14px;
  color: #999;
  margin-bottom: 32px;
}

.form-actions {
  margin-top: 24px;
  padding: 0 16px;
}

.error-msg {
  margin-top: 16px;
  text-align: center;
  color: #ee0a24;
  font-size: 14px;
}
</style>
