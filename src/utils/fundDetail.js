const safeNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const toDateValue = (dateKey = '') => {
  if (!dateKey) return null
  const value = new Date(`${dateKey}T00:00:00`).getTime()
  return Number.isFinite(value) ? value : null
}

const toDateKey = (value) => {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const raw = Number(value)
    if (Number.isFinite(raw) && raw > 0) {
      const ms = raw > 1e12 ? raw : raw * 1000
      return new Date(ms).toISOString().slice(0, 10)
    }
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

const sortRowsAsc = (rows = []) => [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)))

const extractDividendPerShare = (unitMoney = '') => {
  const text = String(unitMoney || '')
  if (!text) return 0
  const match = text.match(/每份派现金\s*([0-9.]+)\s*元/)
  const amount = Number(match?.[1] || 0)
  return Number.isFinite(amount) ? Number(amount.toFixed(4)) : 0
}

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
      shares: Number(safeNumber(matched.shares).toFixed(4)),
      market_value: Number((safeNumber(matched.cost) + safeNumber(matched.current_profit)).toFixed(2)),
      total_profit: Number(safeNumber(matched.current_profit).toFixed(2)),
      total_profit_rate: Number(safeNumber(matched.profit_rate).toFixed(2)),
      daily_profit: Number(safeNumber(matched.yesterday_profit).toFixed(2)),
      nav_jzrq: matched.nav_jzrq || '',
      cost: Number(safeNumber(matched.cost).toFixed(2)),
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

export const buildPositionRowsWithDividendAdjustments = (rows = [], fundTrendRows = []) => {
  const dividendPerShareByDate = new Map(
    sortRowsAsc(fundTrendRows).map(row => [row.date, extractDividendPerShare(row.unit_money)]),
  )

  let cumulativeDividendAmount = 0

  return sortRowsAsc(rows).map((row) => {
    const dividendPerShare = dividendPerShareByDate.get(row.date) || 0
    const dividendAmount = dividendPerShare > 0
      ? Number((safeNumber(row.shares) * dividendPerShare).toFixed(2))
      : 0

    cumulativeDividendAmount = Number((cumulativeDividendAmount + dividendAmount).toFixed(2))

    const adjustedTotalProfit = Number((safeNumber(row.total_profit) + cumulativeDividendAmount).toFixed(2))
    const adjustedDailyProfit = Number((safeNumber(row.daily_profit) + dividendAmount).toFixed(2))
    const adjustedMarketValue = Number((safeNumber(row.market_value) + cumulativeDividendAmount).toFixed(2))
    const adjustedTotalProfitRate = safeNumber(row.cost) > 0
      ? Number(((adjustedTotalProfit / safeNumber(row.cost)) * 100).toFixed(2))
      : Number(safeNumber(row.total_profit_rate).toFixed(2))

    return {
      ...row,
      dividend_per_share: dividendPerShare,
      dividend_amount: dividendAmount,
      cumulative_dividend_amount: cumulativeDividendAmount,
      adjusted_daily_profit: adjustedDailyProfit,
      adjusted_total_profit: adjustedTotalProfit,
      adjusted_total_profit_rate: adjustedTotalProfitRate,
      adjusted_market_value: adjustedMarketValue,
    }
  })
}

/**
 * 从基金净值历史回放持仓收益（不走可能有断层的本地快照）。
 *
 * 每日收益 = 份额 × 今日确认净值涨跌幅（equityReturn）
 *          或 (今日净值 - 昨日净值) / 昨日净值（无 equityReturn 时兜底）
 *
 * 累计收益 = Σ(每日收益)  from range 起点到当日
 *
 * 分红除息日：
 *   equityReturn 已经反映除息（净值下跌 ≈ 分红金额），
 *   所以直接用它算每日收益即可，不会再出现"假性大跌"。
 *
 * @param {Array}  fundTrendRows  - 基金净值历史，元素含 { date, y, equityReturn, unitMoney }
 * @param {Object} positionSnapshot - 当前持仓快照，含 { cost, shares }
 * @param {string} range           - '1m'|'3m'|'6m'|'1y'|'all'
 * @returns {Array} [{ date, label, daily_profit, cumulative_profit, dividend_per_share, unitMoney, ... }]
 */
export const rebuildPositionRowsFromNavHistory = (
  fundTrendRows = [],
  positionSnapshot = {},
  range = '1y',
) => {
  if (!fundTrendRows.length || !positionSnapshot || safeNumber(positionSnapshot.shares) <= 0) {
    return []
  }

  const shares = safeNumber(positionSnapshot.shares)
  const sortedSourceRows = sortRowsAsc(fundTrendRows)
  const startDate = toDateKey(
    positionSnapshot.start_date
    || positionSnapshot.buy_date
    || positionSnapshot.purchase_date
    || positionSnapshot.trade_date
    || positionSnapshot.created_at,
  )
  const sourceRows = startDate
    ? sortedSourceRows.filter(row => String(row.date) >= startDate)
    : sortedSourceRows

  if (!sourceRows.length) return []

  // 兼容两种来源：
  // 1) 东方财富原始结构: { y, equityReturn, unitMoney }
  // 2) 后端整理结构:     { nav, daily_return_pct, unit_money }
  const readNav = (row = {}) => safeNumber(row.nav ?? row.y)
  const readDailyReturnPct = (row = {}) => {
    const val = row.daily_return_pct ?? row.equityReturn
    if (val === undefined || val === null || val === '') return null
    const num = Number(val)
    return Number.isFinite(num) ? num : null
  }
  const readUnitMoney = (row = {}) => String(row.unit_money ?? row.unitMoney ?? '')

  // 提取分红事件 Map（date -> 每份分红金额）
  const dividendPerShareByDate = new Map(
    sourceRows
      .map(row => [row.date, extractDividendPerShare(readUnitMoney(row))])
      .filter(([, amount]) => amount > 0),
  )

  // 按日期升序，对齐净值历史
  const sortedNav = sourceRows.map((row, index) => {
    const prevRow = index > 0 ? sourceRows[index - 1] : null
    const currentNav = readNav(row)
    const prevNav = prevRow ? readNav(prevRow) : null

    let dailyReturnPct = readDailyReturnPct(row)
    if ((dailyReturnPct === null || Number.isNaN(dailyReturnPct)) && prevNav && prevNav > 0 && currentNav > 0) {
      dailyReturnPct = Number((((currentNav - prevNav) / prevNav) * 100).toFixed(2))
    }

    const profitBaseNav = (prevNav && prevNav > 0) ? prevNav : currentNav
    const dailyProfit = dailyReturnPct !== null && !Number.isNaN(dailyReturnPct) && profitBaseNav > 0
      ? Number((shares * profitBaseNav * dailyReturnPct / 100).toFixed(2))
      : 0

    const dividendPerShare = dividendPerShareByDate.get(row.date) || 0
    const dividendAmount = dividendPerShare > 0
      ? Number((shares * dividendPerShare).toFixed(2))
      : 0

    return {
      date: row.date,
      nav: Number(currentNav.toFixed(4)),
      daily_return_pct: dailyReturnPct,
      daily_profit: dailyProfit,
      cumulative_dividend_amount: 0,
      dividend_per_share: dividendPerShare,
      dividend_amount: dividendAmount,
      unit_money: readUnitMoney(row),
      has_dividend: dividendPerShare > 0,
      start_date: startDate || '',
    }
  })

  let cumDividend = 0
  sortedNav.forEach(row => {
    cumDividend = Number((cumDividend + row.dividend_amount).toFixed(2))
    row.cumulative_dividend_amount = cumDividend
  })

  // 累计收益改为直接按持仓口径计算，保证最新一天与页面顶部“持有收益”一致
  const positionCost = safeNumber(positionSnapshot.cost)
  sortedNav.forEach(row => {
    row.cumulative_profit = Number(((shares * row.nav) - positionCost).toFixed(2))
  })

  const filtered = filterFundDetailRange(sortedNav, range)

  return filtered.map(row => ({
    date: row.date,
    label: String(row.date).slice(5),
    daily_profit: row.daily_profit,
    cumulative_profit: row.cumulative_profit,
    nav: row.nav,
    daily_return_pct: row.daily_return_pct,
    dividend_per_share: row.dividend_per_share,
    dividend_amount: row.dividend_amount,
    cumulative_dividend_amount: row.cumulative_dividend_amount,
    unit_money: row.unit_money,
    has_dividend: row.has_dividend,
    start_date: row.start_date,
    raw: row,
  }))
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

export const buildFundPeriodReturnRows = (rows = [], { officialReturnPct = null } = {}) => {
  const ordered = sortRowsAsc(rows)
  const baseNav = Number(ordered[0]?.nav || 0)
  const rawRows = ordered.map((row, index) => {
    const currentNav = Number(row.nav || 0)
    const periodReturn = index === 0
      ? 0
      : (baseNav > 0 ? Number((((currentNav - baseNav) / baseNav) * 100).toFixed(2)) : 0)

    return {
      ...row,
      period_return_pct: periodReturn,
      raw_period_return_pct: periodReturn,
    }
  })

  if (!rawRows.length) return rawRows

  if (officialReturnPct === null || officialReturnPct === undefined || officialReturnPct === '') return rawRows
  const official = Number(officialReturnPct)
  if (!Number.isFinite(official)) return rawRows

  const lastRaw = Number(rawRows.at(-1)?.period_return_pct || 0)
  const lastIndex = Math.max(rawRows.length - 1, 1)

  return rawRows.map((row, index) => {
    const adjusted = lastRaw !== 0
      ? Number(((row.period_return_pct * official) / lastRaw).toFixed(2))
      : Number((((index / lastIndex) * official)).toFixed(2))
    return {
      ...row,
      period_return_pct: index === 0 ? 0 : adjusted,
    }
  })
}

export const buildRecentFundNavRows = (rows = [], limit = 30) => {
  const ordered = sortRowsAsc(rows)
  const latestDateValue = toDateValue(ordered.at(-1)?.date)
  if (!latestDateValue) {
    return ordered.slice(-limit).reverse().map(row => ({
      ...row,
      nav: Number(safeNumber(row.nav).toFixed(4)),
      daily_return_pct: Number(safeNumber(row.daily_return_pct).toFixed(2)),
    }))
  }

  const start = latestDateValue - ((limit - 1) * 24 * 60 * 60 * 1000)
  return ordered
    .filter((row) => {
      const rowDateValue = toDateValue(row.date)
      return rowDateValue !== null && rowDateValue >= start
    })
    .slice(-limit)
    .reverse()
    .map(row => ({
      ...row,
      nav: Number(safeNumber(row.nav).toFixed(4)),
      daily_return_pct: Number(safeNumber(row.daily_return_pct).toFixed(2)),
    }))
}

export const buildFundReturnChartPoints = (rows = [], { officialReturnPct = null } = {}) => {
  return buildFundPeriodReturnRows(rows, { officialReturnPct }).map(row => ({
    key: row.date,
    date: row.date,
    label: String(row.date).slice(5),
    value: Number(safeNumber(row.period_return_pct).toFixed(2)),
    raw: row,
  }))
}

export const __test__ = {
  safeNumber,
  toDateValue,
  RANGE_DAY_MAP,
}
