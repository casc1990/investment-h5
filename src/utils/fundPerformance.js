const FUND_PERFORMANCE_CACHE_TTL = 10 * 60 * 1000

const performanceCache = new Map()
const pendingRequests = new Map()

function toDateValue(dateKey = '') {
  if (!dateKey) return null
  const value = new Date(`${dateKey}T00:00:00`).getTime()
  return Number.isFinite(value) ? value : null
}

export function computePeriodReturnPct(rows = [], days = 7) {
  const ordered = [...rows]
    .filter(item => item?.date && Number.isFinite(Number(item?.nav)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  if (ordered.length < 2) return null

  const latest = ordered.at(-1)
  const latestDateValue = toDateValue(latest?.date)
  if (!latestDateValue) return null

  const threshold = latestDateValue - (days * 24 * 60 * 60 * 1000)
  const base = ordered.find(item => {
    const value = toDateValue(item.date)
    return value !== null && value >= threshold
  }) || ordered[0]

  const baseNav = Number(base?.nav || 0)
  const latestNav = Number(latest?.nav || 0)
  if (!(baseNav > 0 && latestNav > 0)) return null

  return Number((((latestNav - baseNav) / baseNav) * 100).toFixed(2))
}

export function buildFundPerformanceSummary(detail = {}) {
  const monthlyStat = Array.isArray(detail?.performance_stats)
    ? detail.performance_stats.find(item => item.key === '1m')
    : null

  return {
    weeklyReturnPct: computePeriodReturnPct(detail?.net_worth_trend || [], 7),
    monthlyReturnPct: monthlyStat?.return_pct ?? computePeriodReturnPct(detail?.net_worth_trend || [], 30),
  }
}

async function getCachedFundPerformance(fundCode, detailFetcher, { ttl = FUND_PERFORMANCE_CACHE_TTL, now = Date.now() } = {}) {
  const cached = performanceCache.get(fundCode)
  if (cached && now - cached.timestamp < ttl) {
    return cached.value
  }

  if (pendingRequests.has(fundCode)) {
    return pendingRequests.get(fundCode)
  }

  const task = (async () => {
    try {
      const detail = await detailFetcher(fundCode)
      const value = buildFundPerformanceSummary(detail)
      performanceCache.set(fundCode, { timestamp: Date.now(), value })
      return value
    } catch {
      const fallback = { weeklyReturnPct: null, monthlyReturnPct: null }
      performanceCache.set(fundCode, { timestamp: Date.now(), value: fallback })
      return fallback
    } finally {
      pendingRequests.delete(fundCode)
    }
  })()

  pendingRequests.set(fundCode, task)
  return task
}

export async function buildFundPerformanceMap(fundCodes = [], detailFetcher, options = {}) {
  const uniqueCodes = [...new Set((fundCodes || []).filter(Boolean))]
  if (!uniqueCodes.length) return {}

  const entries = await Promise.all(uniqueCodes.map(async fundCode => ([
    fundCode,
    await getCachedFundPerformance(fundCode, detailFetcher, options),
  ])))

  return Object.fromEntries(entries)
}

export function clearFundPerformanceCache() {
  performanceCache.clear()
  pendingRequests.clear()
}
