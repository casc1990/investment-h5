<template>
  <div class="data-health-page">
    <header class="page-header">
      <button aria-label="返回统计" @click="router.back()"><van-icon name="arrow-left" /></button>
      <strong>数据健康</strong>
      <span></span>
    </header>

    <section class="health-hero" :class="report?.status || 'loading'">
      <div class="health-icon"><van-icon :name="statusIcon" /></div>
      <div>
        <strong>{{ report?.title || '正在检查数据' }}</strong>
        <span>{{ checkedAtText }}</span>
      </div>
    </section>

    <section class="health-card">
      <div v-for="check in report?.checks || []" :key="check.key" class="check-row">
        <div class="check-icon" :class="check.status"><van-icon :name="checkIcon(check.status)" /></div>
        <div class="check-copy"><strong>{{ check.label }}</strong><span>{{ check.detail }}</span></div>
        <em :class="check.status">{{ statusLabel(check.status) }}</em>
      </div>
      <van-empty v-if="!loading && !report" image-size="70" description="暂时无法生成检查报告" />
    </section>

    <section v-if="report" class="rebuild-card">
      <div class="rebuild-title"><div class="rebuild-icon"><van-icon name="underway-o" /></div><strong>历史自动重算</strong></div>
      <div class="rebuild-row"><span>重算范围</span><b>{{ report.history_rebuild.start_date || '-' }} ~ {{ report.history_rebuild.end_date || '-' }}</b></div>
      <div class="rebuild-row"><span>重算依据</span><b>{{ report.history_rebuild.reason }}</b></div>
      <div class="rebuild-row"><span>影响周期</span><b>{{ report.history_rebuild.affected_periods }}</b></div>
      <div class="rebuild-footer">
        <span :class="report.history_rebuild.status"><van-icon :name="report.history_rebuild.status === 'completed' ? 'passed' : 'warning-o'" /> {{ report.history_rebuild.status === 'completed' ? '已完成' : '需要处理' }}</span>
        <button :disabled="loading" @click="loadHealthData"><van-loading v-if="loading" size="14" />{{ loading ? '检查中' : '重新检查' }}</button>
      </div>
    </section>

    <p class="health-note">每次检查都会重新读取服务端交易和收益快照，日、周、月、季、半年和年统计会自动按最新数据重算。</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { eventApi, tradeApi } from '../api'
import { captureProfitSnapshotFromApis } from '../utils/profitSnapshotService'
import { fetchProfitSnapshots } from '../utils/profitLedger'
import { buildDailyHistoryRows, buildPeriodHistoryRows } from '../utils/statsHistory'
import { buildDataHealthReport, buildPeriodReconciliations } from '../utils/statsReconciliation'

const router = useRouter()
const loading = ref(false)
const report = ref(null)

const statusIcon = computed(() => ({ passed: 'passed', warning: 'warning-o', failed: 'close' }[report.value?.status] || 'replay'))
const checkedAtText = computed(() => {
  if (!report.value?.checked_at) return '正在读取服务端快照'
  return `最近检查 ${new Date(report.value.checked_at).toLocaleString('zh-CN', { hour12: false })}`
})
const checkIcon = status => ({ passed: 'passed', warning: 'warning-o', failed: 'close' }[status] || 'question-o')
const statusLabel = status => ({ passed: '已通过', warning: '待关注', failed: '有差异' }[status] || '待检查')

const loadHealthData = async () => {
  loading.value = true
  try {
    const captureData = await captureProfitSnapshotFromApis()
    const [snapshots, tradeData, eventData] = await Promise.all([
      fetchProfitSnapshots(),
      tradeApi.list(),
      eventApi.list({ group: 'pending', limit: 50 }),
    ])
    const dailyRows = buildDailyHistoryRows(snapshots)
    const trades = tradeData?.trades || []
    const reconciliations = ['week', 'month', 'quarter', 'halfyear', 'year'].flatMap(period => buildPeriodReconciliations({
      periodRows: buildPeriodHistoryRows(snapshots, { period }),
      dailyRows,
      snapshots,
      trades,
    }))
    report.value = buildDataHealthReport({
      snapshots,
      overview: captureData.overview,
      reconciliations,
      pendingEvents: eventData?.events || [],
    })
  } catch (error) {
    console.error('Failed to inspect data health:', error)
    showToast('数据健康检查失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadHealthData)
</script>

<style scoped>
.data-health-page { min-height: 100vh; padding: 8px 12px var(--app-floating-page-space); background: radial-gradient(circle at 50% 0, rgba(30,128,255,.09), transparent 260px), #f5f7fb; }
.page-header { display: grid; grid-template-columns: 36px 1fr 36px; align-items: center; height: 48px; }
.page-header button { width: 34px; height: 34px; border: 0; border-radius: 11px; background: rgba(255,255,255,.82); color: #334155; font-size: 18px; }
.page-header strong { color: #172033; font-size: 18px; text-align: center; }
.health-hero { display: flex; align-items: center; gap: 15px; margin-top: 8px; padding: 20px; border: 1px solid #e2eaf4; border-radius: 20px; background: #fff; box-shadow: 0 10px 28px rgba(37,59,91,.07); }
.health-icon { display: grid; place-items: center; width: 60px; height: 60px; flex: none; border-radius: 50%; background: #eaf8f1; color: #16b364; font-size: 33px; }
.health-hero.warning .health-icon { color: #f59e0b; background: #fff7e6; }
.health-hero.failed .health-icon { color: #ef4444; background: #fff0f0; }
.health-hero.loading .health-icon { color: #1e80ff; background: #eef5ff; }
.health-hero strong, .health-hero span { display: block; }
.health-hero strong { color: #172033; font-size: 21px; }
.health-hero span { margin-top: 5px; color: #8793a5; font-size: 11px; }
.health-card { overflow: hidden; margin-top: 12px; border: 1px solid #e2eaf4; border-radius: 18px; background: #fff; box-shadow: 0 8px 24px rgba(37,59,91,.05); }
.check-row { display: grid; grid-template-columns: 32px minmax(0,1fr) auto; gap: 9px; align-items: center; min-height: 64px; padding: 10px 14px; border-bottom: 1px solid #eef2f7; }
.check-row:last-child { border-bottom: 0; }
.check-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 10px; color: #16b364; background: #edf9f3; }
.check-icon.warning { color: #f59e0b; background: #fff7e8; }
.check-icon.failed { color: #ef4444; background: #fff0f0; }
.check-copy { min-width: 0; }
.check-copy strong, .check-copy span { display: block; }
.check-copy strong { color: #2a3447; font-size: 13px; }
.check-copy span { margin-top: 3px; overflow: hidden; color: #8b96a8; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.check-row em { color: #16b364; font-size: 11px; font-style: normal; font-weight: 600; }
.check-row em.warning { color: #f59e0b; }
.check-row em.failed { color: #ef4444; }
.rebuild-card { margin-top: 12px; padding: 16px; border: 1px solid #e2eaf4; border-radius: 18px; background: #fff; box-shadow: 0 8px 24px rgba(37,59,91,.05); }
.rebuild-title { display: flex; align-items: center; gap: 9px; margin-bottom: 13px; color: #253047; font-size: 16px; }
.rebuild-icon { display: grid; place-items: center; width: 35px; height: 35px; border-radius: 11px; color: #fff; background: linear-gradient(135deg,#1e80ff,#6d4df4); }
.rebuild-row { display: grid; grid-template-columns: 66px minmax(0,1fr); gap: 10px; padding: 7px 2px; }
.rebuild-row span { color: #8b96a8; font-size: 11px; }
.rebuild-row b { color: #445066; font-size: 11px; font-weight: 500; text-align: right; }
.rebuild-footer { display: flex; align-items: center; justify-content: space-between; margin: 10px -16px -16px; padding: 12px 16px; border-top: 1px solid #eef2f7; }
.rebuild-footer span { display: inline-flex; align-items: center; gap: 4px; color: #16b364; font-size: 12px; font-weight: 600; }
.rebuild-footer span.needs_attention { color: #f59e0b; }
.rebuild-footer button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 92px; height: 34px; border: 0; border-radius: 999px; color: #fff; background: linear-gradient(135deg,#1e80ff,#6049ef); font-size: 12px; font-weight: 600; }
.rebuild-footer button:disabled { opacity: .65; }
.health-note { margin: 10px 5px 0; color: #98a2b3; font-size: 10px; line-height: 1.55; }
</style>
