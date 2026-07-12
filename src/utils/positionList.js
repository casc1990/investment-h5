const toFiniteNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export const getPositionMarketValue = (position = {}) => {
  const explicit = Number(position.current_market_value)
  if (Number.isFinite(explicit)) return explicit
  return toFiniteNumber(position.cost) + toFiniteNumber(position.current_profit)
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
