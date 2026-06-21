const STORAGE_KEY = 'investment_profit_ledger_v1'

const safeNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const toDateKey = (input = new Date()) => {
  const date = input instanceof Date ? input : new Date(input)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const readStore = () => {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('[profitLedger] failed to parse storage:', error)
    return []
  }
}

const writeStore = (snapshots) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots))
}

const normalizeSummary = (summary = {}) => ({
  totalMarketValue: safeNumber(summary.totalMarketValue),
  totalYesterdayProfit: safeNumber(summary.totalYesterdayProfit),
  totalPositionYesterdayProfit: safeNumber(summary.totalPositionYesterdayProfit),
  totalAdvisoryYesterdayProfit: safeNumber(summary.totalAdvisoryYesterdayProfit),
  totalHoldingProfit: safeNumber(summary.totalHoldingProfit),
  totalCumulativeProfit: safeNumber(summary.totalCumulativeProfit ?? summary.totalHoldingProfit),
  totalProfitRate: safeNumber(summary.totalProfitRate),
  totalCost: safeNumber(summary.totalCost),
})

const normalizePosition = (position = {}) => ({
  id: position.id || '',
  fund_code: position.fund_code || '',
  fund_name: position.fund_name || '',
  account_id: position.account_id || '',
  account_name: position.account_name || '',
  member_id: position.member_id || '',
  member_name: position.member_name || '',
  member_emoji: position.member_emoji || '',
  shares: safeNumber(position.shares),
  cost: safeNumber(position.cost),
  current_profit: safeNumber(position.current_profit),
  yesterday_profit: safeNumber(position.yesterday_profit),
  profit_rate: safeNumber(position.profit_rate),
  initial_profit: safeNumber(position.initial_profit),
  nav_dwjz: position.nav_dwjz ?? null,
  nav_gsz: position.nav_gsz ?? null,
  nav_gszzl: position.nav_gszzl ?? null,
  nav_jzrq: position.nav_jzrq || '',
})

export const recordProfitSnapshot = ({ summary, positions = [], capturedAt = Date.now(), dateKey } = {}) => {
  if (!summary) {
    return { saved: false, reason: 'missing-summary' }
  }

  const snapshots = readStore()
  const normalizedDate = dateKey || toDateKey(capturedAt)
  const nextSnapshot = {
    date: normalizedDate,
    captured_at: capturedAt,
    summary: normalizeSummary(summary),
    positions: Array.isArray(positions) ? positions.map(normalizePosition) : [],
  }

  const existingIndex = snapshots.findIndex(item => item.date === normalizedDate)
  if (existingIndex >= 0) {
    snapshots[existingIndex] = nextSnapshot
  } else {
    snapshots.push(nextSnapshot)
  }

  snapshots.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  writeStore(snapshots)

  return {
    saved: true,
    snapshot: nextSnapshot,
    total: snapshots.length,
  }
}

export const getProfitSnapshots = ({ days } = {}) => {
  const snapshots = readStore().sort((a, b) => String(b.date).localeCompare(String(a.date)))
  if (!days) return snapshots

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  const startKey = toDateKey(start)

  return snapshots.filter(item => item.date >= startKey)
}

export const getLatestProfitSnapshot = () => {
  const snapshots = getProfitSnapshots()
  return snapshots[0] || null
}

export const summarizeProfitRange = (snapshots = []) => {
  if (!snapshots.length) {
    return {
      count: 0,
      latest: null,
      earliest: null,
      assetChange: 0,
      holdingProfitChange: 0,
      cumulativeProfitChange: 0,
      bestYesterdayProfit: 0,
      worstYesterdayProfit: 0,
    }
  }

  const latest = snapshots[0]
  const earliest = snapshots[snapshots.length - 1]
  const yesterdayProfits = snapshots.map(item => safeNumber(item.summary?.totalYesterdayProfit))

  return {
    count: snapshots.length,
    latest,
    earliest,
    assetChange: safeNumber(latest.summary?.totalMarketValue) - safeNumber(earliest.summary?.totalMarketValue),
    holdingProfitChange: safeNumber(latest.summary?.totalHoldingProfit) - safeNumber(earliest.summary?.totalHoldingProfit),
    cumulativeProfitChange: safeNumber(latest.summary?.totalCumulativeProfit) - safeNumber(earliest.summary?.totalCumulativeProfit),
    bestYesterdayProfit: Math.max(...yesterdayProfits),
    worstYesterdayProfit: Math.min(...yesterdayProfits),
  }
}

export const buildFundTrend = (snapshots = []) => {
  if (!snapshots.length) return []

  const latestMap = new Map()
  const earliestMap = new Map()

  snapshots[0]?.positions?.forEach((position) => {
    latestMap.set(position.fund_code, position)
  })

  snapshots[snapshots.length - 1]?.positions?.forEach((position) => {
    earliestMap.set(position.fund_code, position)
  })

  return Array.from(latestMap.values()).map((position) => {
    const earliest = earliestMap.get(position.fund_code)
    const profitChange = safeNumber(position.current_profit) - safeNumber(earliest?.current_profit)
    const assetValue = safeNumber(position.cost) + safeNumber(position.current_profit)

    return {
      fund_code: position.fund_code,
      fund_name: position.fund_name,
      account_name: position.account_name,
      member_name: position.member_name,
      member_emoji: position.member_emoji,
      current_profit: safeNumber(position.current_profit),
      yesterday_profit: safeNumber(position.yesterday_profit),
      profit_rate: safeNumber(position.profit_rate),
      asset_value: assetValue,
      profit_change: profitChange,
    }
  }).sort((a, b) => b.asset_value - a.asset_value)
}

export const __test__ = {
  safeNumber,
  toDateKey,
  normalizeSummary,
  normalizePosition,
}
