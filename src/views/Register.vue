<template>
  <div class="register-page">
    <div class="register-shell">
      <button class="back" type="button" @click="router.push('/login')"><span>‹</span> 返回登录</button>
      <div class="brand-mark"><van-icon name="shield-o" /></div>
      <div class="eyebrow">家庭账户 · 安全注册</div>
      <h1>创建你的登录账户</h1>
      <p class="intro">白名单用户可创建独立家庭；收到家庭邀请的用户可直接加入对应家庭。</p>

      <div class="whitelist-note">
        <van-icon name="passed" />
        <div><strong>两种注册方式</strong><span>创建新家庭需要白名单；加入已有家庭只需要有效邀请码。</span></div>
      </div>

      <van-form @submit="submit">
        <div class="field-group">
          <label>用户名</label>
          <van-field v-model="form.username" name="username" placeholder="请输入用户名" autocomplete="username" :rules="[{ required: true, message: '请输入用户名' }]" />
        </div>
        <div class="field-group">
          <label>家庭邀请码 <span>选填</span></label>
          <van-field v-model="form.inviteCode" name="inviteCode" placeholder="加入家庭时填写" :readonly="Boolean(route.query.invite)" :clearable="!route.query.invite" @blur="checkInvite" />
          <div v-if="inviteInfo" class="invite-result valid">将加入“{{ inviteInfo.household_name }}” · {{ roleLabel(inviteInfo.role) }} · {{ inviteMemberText }}</div>
          <div v-else-if="inviteChecked && form.inviteCode" class="invite-result invalid">邀请码无效或已过期</div>
        </div>
        <div v-if="inviteInfo?.member_mode === 'existing'" class="bound-member">
          <span>{{ inviteInfo.member_emoji || '👤' }}</span><div><strong>{{ inviteInfo.member_name }}</strong><small>{{ inviteInfo.member_relation || '家庭成员' }} · 注册后自动关联</small></div>
        </div>
        <div v-else class="field-group">
          <label>{{ inviteInfo ? '资产成员姓名' : '显示名称' }}</label>
          <van-field v-model="form.displayName" name="displayName" :placeholder="inviteInfo ? '请输入成员姓名' : '家庭中显示的称呼'" :rules="[{ required: true, message: '请输入名称' }]" />
        </div>
        <div v-if="!inviteInfo || inviteInfo.member_mode === 'create'" class="field-group">
          <label>头像</label>
          <div class="emoji-picker"><button v-for="emoji in emojiList" :key="emoji" type="button" :class="{ active: form.memberEmoji === emoji }" @click="form.memberEmoji = emoji">{{ emoji }}</button></div>
        </div>
        <div v-if="inviteInfo?.member_mode === 'create'" class="field-group">
          <label>家庭称谓</label>
          <van-field v-model="form.memberRelation" name="memberRelation" placeholder="例如：配偶、父母、子女" />
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
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { authApi } from '../api'
import { clearPageCaches } from '../utils/pageCache'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const form = ref({ username: '', displayName: '', password: '', confirmPassword: '', inviteCode: '', memberEmoji: '👤', memberRelation: '' })
const inviteInfo = ref(null)
const inviteChecked = ref(false)
const emojiList = ['👤', '🧑', '👨', '👩', '👴', '👵', '👦', '👧', '👨‍💼', '👩‍💼', '🧔', '👱‍♀️']
const roleLabel = role => role === 'admin' ? '家庭管理员' : '只读成员'
const inviteMemberText = computed(() => inviteInfo.value?.member_mode === 'existing' ? `关联${inviteInfo.value.member_name}` : '注册时创建成员')

async function checkInvite() {
  const code = form.value.inviteCode.trim()
  inviteInfo.value = null
  inviteChecked.value = Boolean(code)
  if (!code) return true
  try { inviteInfo.value = await authApi.inviteInfo(code); return true }
  catch { return false }
}

async function submit() {
  if (loading.value) return
  if (form.value.password.length < 8) return showToast('密码长度至少8位')
  if (form.value.password !== form.value.confirmPassword) return showToast('两次输入的密码不一致')
  if (form.value.inviteCode.trim() && !(await checkInvite())) return showToast('邀请码无效或已过期')
  loading.value = true
  try {
    const data = await authApi.register({
      username: form.value.username.trim(),
      display_name: form.value.displayName.trim(),
      password: form.value.password,
      invite_code: form.value.inviteCode.trim() || undefined,
      member_name: form.value.displayName.trim(),
      member_emoji: form.value.memberEmoji,
      member_relation: form.value.memberRelation.trim(),
    })
    clearPageCaches()
    localStorage.setItem('auth_token', data.token)
    localStorage.setItem('auth_username', data.username)
    showToast(`已加入${data.household_name || '家庭'}`)
    window.location.replace('/')
  } catch (error) {
    showToast(error?.response?.data?.message || error?.message || '注册失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  form.value.inviteCode = String(route.query.invite || '').trim()
  if (form.value.inviteCode) checkInvite()
})
</script>

<style scoped>
.register-page { min-height:100vh; padding:22px 16px 42px; background:radial-gradient(circle at 88% 8%,rgba(60,142,255,.16),transparent 30%),linear-gradient(155deg,#eef6ff 0%,#f8fafc 48%,#f2efff 100%); }
.register-shell { width:100%; max-width:440px; margin:0 auto; padding:6px 4px; }
.back { display:flex; align-items:center; gap:5px; padding:8px 0; border:0; background:transparent; color:#718096; font-size:14px; }.back span { font-size:25px; line-height:14px; }
.brand-mark { display:grid; place-items:center; width:56px; height:56px; margin-top:26px; border-radius:18px; background:linear-gradient(145deg,#1684ff,#6858ef); color:#fff; box-shadow:0 12px 28px rgba(51,112,231,.24); font-size:27px; }
.eyebrow { margin-top:20px; color:#2582ec; font-size:12px; font-weight:700; letter-spacing:.06em; }
h1 { margin:6px 0 0; color:#172033; font-size:28px; line-height:1.25; }.intro { margin:10px 0 20px; color:#7d899c; font-size:14px; line-height:1.7; }
.whitelist-note { display:flex; gap:11px; margin-bottom:18px; padding:14px; border:1px solid #dceafe; border-radius:15px; background:rgba(255,255,255,.78); color:#2780e5; }.whitelist-note>.van-icon { margin-top:2px; font-size:20px; }.whitelist-note div { display:flex; flex-direction:column; gap:3px; }.whitelist-note strong { color:#31415a; font-size:14px; }.whitelist-note span { color:#8793a5; font-size:12px; line-height:1.5; }
form { padding:20px 16px; border:1px solid rgba(220,229,240,.9); border-radius:22px; background:rgba(255,255,255,.94); box-shadow:0 18px 48px rgba(52,78,117,.1); }.field-group { margin-bottom:14px; }.field-group label { display:block; margin:0 3px 7px; color:#59677c; font-size:13px; font-weight:600; }.field-group label span { color:#9aa6b6; font-size:11px; font-weight:400; }.field-group :deep(.van-field) { padding:13px 14px; border:1px solid #e2e8f0; border-radius:13px; background:#f8fafc; }.field-group :deep(.van-field:focus-within) { border-color:#6ba9f4; background:#fff; box-shadow:0 0 0 3px rgba(58,139,238,.09); }.invite-result { margin:6px 3px 0; font-size:12px; }.invite-result.valid { color:#20a66a; }.invite-result.invalid { color:#e45858; }
.bound-member { display:flex; align-items:center; gap:12px; margin-bottom:14px; padding:14px; border:1px solid #d9e9fb; border-radius:14px; background:#f3f8ff; }.bound-member>span { font-size:28px; }.bound-member div { display:flex; flex-direction:column; }.bound-member strong { color:#29364a; }.bound-member small { margin-top:3px; color:#8290a4; }.emoji-picker { display:flex; flex-wrap:wrap; gap:8px; }.emoji-picker button { display:grid; place-items:center; width:42px; height:42px; border:1px solid #e1e7ef; border-radius:12px; background:#f8fafc; font-size:22px; }.emoji-picker button.active { border-color:#2583ef; background:#eaf4ff; box-shadow:0 0 0 2px rgba(37,131,239,.1); }
:deep(.van-button) { height:49px; margin-top:8px; border:0; background:linear-gradient(100deg,#1684ff,#6658ef); box-shadow:0 10px 22px rgba(52,108,226,.2); font-size:16px; font-weight:600; }.privacy { display:flex; justify-content:center; align-items:center; gap:5px; margin-top:17px; color:#98a3b3; font-size:11px; }
</style>
