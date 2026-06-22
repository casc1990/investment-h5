const safeNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const toDateValue = (dateKey = '') => {
  if (!dateKey) return null
  const value = new Date(`${dateKey}T00:00:00`).getTime()
  return Number.isFinite(value) ? value : null
}

const sortRowsAsc = (rows = []) => [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)))

const RANGE_DAY_MAP = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
  '3y': 365 * 3,
}

export const buildPositionDetailRows = (snapshots = [], { positionId = '', fundCode = '', accountId = '' } = {}) => {
  const rows = []

  sortRowsAsc(snapshots).forEach((snapshot) => {
    const positions = Array.isArray(snapshot.positions) ? snapshot.positions : []
    const matched = positions.find(item => item.id === positionId)
      || positions.find(item => item.fund_code === fundCode && item.account_id === accountId)
      || positions.find(item => item.fund_code === fundCode)

    if (!matched) return

    const date = matched.nav_jzrq || snapshot.date
    if (!date) return

    rows.push({
      date,
      snapshot_date: snapshot.date,
      fund_code: matched.fund_code || fundCode,
      fund_name: matched.fund_name || '',
      account_id: matched.account_id || accountId,
      account_name: matched.account_name || '',
      member_id: matched.member_id || '',
      member_name: matched.member_name || '',
      market_value: Number((safeNumber(matched.cost) + safeNumber(matched.current_profit)).toFixed(2)),
      total_profit: Number(safeNumber(matched.current_profit).toFixed(2)),
      total_profit_rate: Number(safeNumber(matched.profit_rate).toFixed(2)),
      daily_profit: Number(safeNumber(matched.yesterday_profit).toFixed(2)),
      nav_jzrq: matched.nav_jzrq || '',
    })
  })

  const byDate = new Map()
  rows.forEach((row) => {
    byDate.set(row.date, row)
  })

  return sortRowsAsc(Array.from(byDate.values()))
}

export const filterFundDetailRange = (rows = [], range = '1y') => {
  const ordered = sortRowsAsc(rows)
  if (range === 'all' || ordered.length <= 2) return ordered

  const days = RANGE_DAY_MAP[range]
  if (!days) return ordered

  const latestDateValue = toDateValue(ordered.at(-1)?.date)
  if (!latestDateValue) return ordered

  const start = latestDateValue - (days * 24 * 60 * 60 * 1000)
  const filtered = ordered.filter((row) => {
    const rowDateValue = toDateValue(row.date)
    return rowDateValue !== null && rowDateValue >= start
  })

  if (filtered.length >= 2) return filtered
  return ordered.slice(-Math.min(2, ordered.length))
}

export const buildPositionTrendPoints = (rows = [], { metric = 'total_profit' } = {}) => {
  return sortRowsAsc(rows).map(row => ({
    key: row.date,
    date: row.date,
    label: String(row.date).slice(5),
    value: Number(safeNumber(row[metric]).toFixed(2)),
    raw: row,
  }))
}

export const buildFundReturnChartPoints = (rows = []) => {
  return sortRowsAsc(rows).map(row => ({
    key: row.date,
    date: row.date,
    label: String(row.date).slice(5),
    value: Number(safeNumber(row.cumulative_return_pct).toFixed(2)),
    raw: row,
  }))
}

export const __test__ = {
  safeNumber,
  toDateValue,
  RANGE_DAY_MAP,
}
