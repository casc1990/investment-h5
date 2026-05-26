import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import router from './router'
import { Icon } from 'vant'
import 'vant/lib/index.css'
import 'vant/lib/toast/style'
import 'vant/lib/dialog/style'
import 'vant/lib/notify/style'
import 'vant/lib/picker/style'
import 'vant/lib/field/style'
import 'vant/lib/cell/style'
import 'vant/lib/cell-group/style'
import 'vant/lib/button/style'
import 'vant/lib/overlay/style'
import 'vant/lib/tabbar/style'
import 'vant/lib/tabbar-item/style'
import 'vant/lib/empty/style'
import 'vant/lib/loading/style'
import 'vant/lib/popup/style'
import 'vant/lib/action-sheet/style'
import 'vant/lib/icon/style'
import 'vant/lib/badge/style'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true)
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    setInterval(() => {
      registration.update().catch(() => {})
    }, 60 * 1000)
  },
})

const app = createApp(App)
app.use(router)
app.use(Icon)
app.mount('#app')
