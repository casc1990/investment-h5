const toFiniteNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export const getPositionMarketValue = (position = {}) => {
  const explicit = Number(position.current_market_value)
  if (Number.isFinite(explicit)) return explicit
  return toFiniteNumber(position.cost) + toFiniteNumber(position.current_profit)
}

export const buildPositionSummary = (positions = []) => {
  const activePositions = (positions || []).filter(position => toFiniteNumber(position.quantity ?? position.shares) > 0)
  if (!activePositions.length) return null
  const dailyProfitDate = activePositions
    .map(position => String(position.daily_profit_confirmed_date || position.nav_jzrq || '').slice(0, 10))
    .filter(Boolean)
    .sort()
    .at(-1) || ''
  const totals = activePositions.reduce((summary, position) => {
    summary.totalCost += toFiniteNumber(position.cost)
    summary.totalMarketValue += getPositionMarketValue(position)
    summary.totalHoldingProfit += toFiniteNumber(position.current_profit)
    const confirmationDate = String(position.daily_profit_confirmed_date || position.nav_jzrq || '').slice(0, 10)
    if (confirmationDate === dailyProfitDate) {
      summary.totalYesterdayProfit += toFiniteNumber(position.yesterday_profit ?? position.daily_profit)
    }
    return summary
  }, { totalCost: 0, totalMarketValue: 0, totalHoldingProfit: 0, totalYesterdayProfit: 0 })
  const totalProfitRate = totals.totalCost > 0 ? (totals.totalHoldingProfit / totals.totalCost) * 100 : 0

  return {
    ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number(value.toFixed(2))])),
    totalProfitRate: Number(totalProfitRate.toFixed(2)),
    dailyProfitDate,
  }
}

export const getPositionNavStatus = (position = {}) => {
  if (position.nav_update_status === 'error' || position.sync_state === 'error') {
    return { key: 'error', label: '同步异常', tone: 'danger' }
  }
  if (position.nav_update_status === 'waiting') {
    return {
      key: 'waiting',
      label: position.nav_category === 'qdii' ? 'QDII待更新' : '净值待更新',
      tone: 'warning',
    }
  }
  return { key: 'updated', label: '净值已更新', tone: 'success' }
}

export const filterAndSortPositions = (positions = [], {
  status = 'all',
  sort = 'market_value_desc',
} = {}) => {
  const filtered = (positions || []).filter((position) => {
    const navStatus = getPositionNavStatus(position).key
    if (status === 'abnormal') return navStatus !== 'updated'
    if (status === 'loss') return toFiniteNumber(position.current_profit) < 0
    if (status === 'profit') return toFiniteNumber(position.current_profit) > 0
    return true
  })

  const comparators = {
    market_value_desc: (a, b) => getPositionMarketValue(b) - getPositionMarketValue(a),
    daily_profit_desc: (a, b) => toFiniteNumber(b.daily_profit ?? b.yesterday_profit) - toFiniteNumber(a.daily_profit ?? a.yesterday_profit),
    holding_profit_desc: (a, b) => toFiniteNumber(b.current_profit) - toFiniteNumber(a.current_profit),
    profit_rate_desc: (a, b) => toFiniteNumber(b.profit_rate) - toFiniteNumber(a.profit_rate),
    name_asc: (a, b) => String(a.fund_name || '').localeCompare(String(b.fund_name || ''), 'zh-CN'),
  }
  return [...filtered].sort(comparators[sort] || comparators.market_value_desc)
}
