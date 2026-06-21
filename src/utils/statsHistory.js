const safeNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const sortSnapshotsAsc = (snapshots = []) => [...snapshots].sort((a, b) => String(a.date).localeCompare(String(b.date)))

const sortRowsDesc = (rows = []) => [...rows].sort((a, b) => String(b.date || b.period_key).localeCompare(String(a.date || a.period_key)))

const formatShortDate = (dateKey = '') => String(dateKey).slice(5)

const formatPeriodLabel = (period, periodKey) => {
  if (period === 'week') return `${periodKey} 周`
  if (period === 'month') {
    const [year, month] = String(periodKey).split('-')
    return `${year}年${month}月`
  }
  if (period === 'quarter') {
    const [year, quarter] = String(periodKey).split('-Q')
    return `${year}年Q${quarter}`
  }
  if (period === 'halfyear') {
    const [year, half] = String(periodKey).split('-H')
    return `${year}年${half === '1' ? '上半年' : '下半年'}`
  }
  if (period === 'year') return `${periodKey}年`
  return String(periodKey)
}

const getWeekStart = (dateKey) => {
  const [year, month, day] = String(dateKey).split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const dayOfWeek = date.getDay() || 7
  date.setDate(date.getDate() - dayOfWeek + 1)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getQuarter = (month) => Math.floor((month - 1) / 3) + 1
const getHalf = (month) => (month <= 6 ? 1 : 2)

const getPeriodKey = (dateKey, period) => {
  const [year, month] = String(dateKey).split('-').map(Number)
  if (period === 'week') return getWeekStart(dateKey)
  if (period === 'month') return `${year}-${String(month).padStart(2, '0')}`
  if (period === 'quarter') return `${year}-Q${getQuarter(month)}`
  if (period === 'halfyear') return `${year}-H${getHalf(month)}`
  if (period === 'year') return String(year)
  return String(dateKey)
}

const calcProfitRate = (profit, marketValue) => {
  const principal = safeNumber(marketValue) - safeNumber(profit)
  if (principal <= 0) return 0
  return Number(((safeNumber(profit) / principal) * 100).toFixed(2))
}

const calcDailyProfitRate = (dailyProfit, marketValue) => {
  const previousMarketValue = safeNumber(marketValue) - safeNumber(dailyProfit)
  if (previousMarketValue <= 0) return 0
  return Number(((safeNumber(dailyProfit) / previousMarketValue) * 100).toFixed(2))
}

const normalizeScopeLabel = ({ memberName = '', accountName = '', memberId = 'all', accountId = 'all' } = {}) => {
  if (memberId !== 'all' && accountId === 'all') return `${memberName || '该成员'} · 全部账户`
  if (accountId !== 'all') return accountName || '未知账户'
  return '全部账户'
}

const isAdvisoryPosition = (item = {}) => String(item.id || item.fund_code || '').startsWith('advisory-')

const getChinaDateString = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find(part => part.type === 'year')?.value || '0000'
  const month = parts.find(part => part.type === 'month')?.value || '00'
  const day = parts.find(part => part.type === 'day')?.value || '00'

  return `${year}-${month}-${day}`
}

const calcPositionDailyProfit = (summary = {}, positions = []) => {
  const summaryValue = summary.totalPositionYesterdayProfit
  if (summaryValue !== undefined && summaryValue !== null && Number.isFinite(Number(summaryValue))) {
    return Number(safeNumber(summaryValue).toFixed(2))
  }

  const fallback = positions
    .filter(item => !isAdvisoryPosition(item))
    .reduce((sum, item) => sum + safeNumber(item.yesterday_profit), 0)

  return Number(fallback.toFixed(2))
}

const aggregatePositions = (positions = [], { memberId = 'all', accountId = 'all' } = {}) => {
  const memberName = positions[0]?.member_name || ''
  const accountName = positions[0]?.account_name || ''
  const totalMarketValue = positions.reduce((sum, item) => sum + safeNumber(item.cost) + safeNumber(item.current_profit), 0)
  const totalProfit = positions.reduce((sum, item) => sum + safeNumber(item.current_profit), 0)
  const dailyProfit = positions.reduce((sum, item) => sum + safeNumber(item.yesterday_profit), 0)

  return {
    member_id: memberId === 'all' ? (positions.length === 1 ? positions[0]?.member_id || 'all' : 'all') : memberId,
    member_name: memberId === 'all' ? (positions.length === 1 ? positions[0]?.member_name || '' : '全部成员') : memberName,
    account_name: normalizeScopeLabel({ memberName, accountName, memberId, accountId }),
    total_market_value: Number(totalMarketValue.toFixed(2)),
    total_profit: Number(totalProfit.toFixed(2)),
    total_profit_rate: calcProfitRate(totalProfit, totalMarketValue),
    daily_profit: Number(dailyProfit.toFixed(2)),
    daily_profit_rate: calcDailyProfitRate(dailyProfit, totalMarketValue),
  }
}

const filterSnapshotPositions = (snapshot = {}, { memberId = 'all', accountId = 'all' } = {}) => {
  return (snapshot.positions || []).filter((item) => {
    if (memberId !== 'all' && item.member_id !== memberId) return false
    if (accountId !== 'all' && item.account_id !== accountId) return false
    return true
  })
}

const buildDailyProfitSignatureMap = (positions = []) => new Map(
  positions.map((item) => {
    const key = item.id || `${item.account_id || ''}::${item.fund_code || ''}`
    const signature = [
      String(item.nav_jzrq || ''),
      safeNumber(item.yesterday_profit).toFixed(4),
      safeNumber(item.nav_dwjz).toFixed(4),
    ].join('|')
    return [key, signature]
  }),
)

const hasDailyProfitUpdateForSnapshot = (positions = [], previousPositions = []) => {
  if (!positions.length) return false

  const currentMap = buildDailyProfitSignatureMap(positions)
  const previousMap = buildDailyProfitSignatureMap(previousPositions)

  if (!previousPositions.length) {
    return positions.some(item => String(item.nav_jzrq || '').length > 0 || safeNumber(item.yesterday_profit) !== 0)
  }

  return positions.some((item) => {
    const key = item.id || `${item.account_id || ''}::${item.fund_code || ''}`
    return currentMap.get(key) !== previousMap.get(key)
  })
}

export const buildDailyHistoryRows = (snapshots = [], { memberId = 'all', accountId = 'all' } = {}) => {
  const sortedSnapshots = sortSnapshotsAsc(snapshots)
  const rows = sortedSnapshots.map((snapshot, index) => {
    const filteredPositions = filterSnapshotPositions(snapshot, { memberId, accountId })
    const previousFilteredPositions = index > 0
      ? filterSnapshotPositions(sortedSnapshots[index - 1], { memberId, accountId })
      : []
    if (!hasDailyProfitUpdateForSnapshot(filteredPositions, previousFilteredPositions)) return null

    if (memberId === 'all' && accountId === 'all') {
      const summary = snapshot.summary || {}
      const positionDailyProfit = calcPositionDailyProfit(summary, filteredPositions)
      return {
        date: snapshot.date,
        member_id: 'all',
        member_name: '全部成员',
        account_id: 'all',
        account_name: '全部账户',
        total_market_value: Number(safeNumber(summary.totalMarketValue).toFixed(2)),
        total_profit: Number(safeNumber(summary.totalHoldingProfit).toFixed(2)),
        total_profit_rate: Number(safeNumber(summary.totalProfitRate).toFixed(2)),
        daily_profit: positionDailyProfit,
        daily_profit_rate: calcDailyProfitRate(positionDailyProfit, summary.totalMarketValue),
      }
    }

    if (!filteredPositions.length) return null

    return {
      date: snapshot.date,
      account_id: accountId,
      ...aggregatePositions(filteredPositions, { memberId, accountId }),
    }
  }).filter(Boolean)

  return sortRowsDesc(rows)
}

export const buildPeriodHistoryRows = (snapshots = [], { memberId = 'all', accountId = 'all', period = 'week' } = {}) => {
  const dailyRowsAsc = [...buildDailyHistoryRows(snapshots, { memberId, accountId })].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const groups = new Map()

  dailyRowsAsc.forEach((row) => {
    const periodKey = getPeriodKey(row.date, period)
    if (!groups.has(periodKey)) groups.set(periodKey, [])
    groups.get(periodKey).push(row)
  })

  const periodRows = Array.from(groups.entries()).map(([periodKey, rows]) => {
    const latest = rows[rows.length - 1]
    const periodProfit = rows.reduce((sum, item) => sum + safeNumber(item.daily_profit), 0)
    const baseMarketValue = rows[0]?.total_market_value || 0
    const periodMaxDrawdown = rows.reduce((minValue, item) => {
      const dailyProfit = safeNumber(item.daily_profit)
      return dailyProfit < minValue ? dailyProfit : minValue
    }, 0)

    return {
      period_key: periodKey,
      period_label: formatPeriodLabel(period, periodKey),
      start_date: rows[0]?.date || '',
      end_date: latest?.date || '',
      member_id: latest?.member_id || memberId,
      member_name: latest?.member_name || '全部成员',
      account_id: latest?.account_id || accountId,
      account_name: latest?.account_name || '全部账户',
      total_market_value: Number(safeNumber(latest?.total_market_value).toFixed(2)),
      total_profit: Number(safeNumber(latest?.total_profit).toFixed(2)),
      total_profit_rate: Number(safeNumber(latest?.total_profit_rate).toFixed(2)),
      daily_profit: Number(safeNumber(latest?.daily_profit).toFixed(2)),
      daily_profit_rate: Number(safeNumber(latest?.daily_profit_rate).toFixed(2)),
      period_profit: Number(periodProfit.toFixed(2)),
      period_profit_rate: calcDailyProfitRate(periodProfit, baseMarketValue),
      period_max_drawdown: Number(periodMaxDrawdown.toFixed(2)),
    }
  })

  return sortRowsDesc(periodRows)
}

export const buildTrendSeries = (rows = [], { metric = 'total_profit', mode = 'daily' } = {}) => {
  const ordered = [...rows].reverse()
  return ordered.map((row) => ({
    key: mode === 'daily' ? row.date : row.period_key,
    label: mode === 'daily' ? formatShortDate(row.date) : row.period_label,
    value: Number(safeNumber(row[metric]).toFixed(2)),
    raw: row,
  }))
}

const pickAggregationPeriod = (rows = []) => {
  if (rows.length > 180) return 'month'
  if (rows.length > 90) return 'week'
  return null
}

const aggregateTrendRows = (rows = [], period) => {
  const ascRows = [...rows].reverse()
  const groups = new Map()

  ascRows.forEach((row) => {
    const periodKey = getPeriodKey(row.date, period)
    if (!groups.has(periodKey)) groups.set(periodKey, [])
    groups.get(periodKey).push(row)
  })

  const aggregated = Array.from(groups.entries()).map(([periodKey, groupRows]) => {
    const latest = groupRows[groupRows.length - 1]
    return {
      ...latest,
      period_key: periodKey,
      period_label: formatPeriodLabel(period, periodKey),
      start_date: groupRows[0]?.date,
      end_date: latest?.date,
    }
  })

  return aggregated.reverse()
}

export const buildDisplayTrendSeries = (rows = [], { metric = 'total_profit', mode = 'daily' } = {}) => {
  if (mode !== 'daily') return buildTrendSeries(rows, { metric, mode })
  const period = pickAggregationPeriod(rows)
  const targetRows = period ? aggregateTrendRows(rows, period) : rows
  return buildTrendSeries(targetRows, { metric, mode: period ? 'period' : 'daily' })
}

export const getDailyProfitUpdateStatus = (positions = [], now = new Date()) => {
  const fundPositions = positions.filter(item => !isAdvisoryPosition(item))
  if (!fundPositions.length) {
    return {
      status: 'unknown',
      helperText: '',
      updatedCount: 0,
      totalCount: 0,
      today: getChinaDateString(now),
    }
  }

  const today = getChinaDateString(now)
  const updatedCount = fundPositions.filter(item => String(item.nav_jzrq || '') === today).length
  const totalCount = fundPositions.length

  if (updatedCount === totalCount) {
    return {
      status: 'updated',
      helperText: '今日收益已更新',
      updatedCount,
      totalCount,
      today,
    }
  }

  if (updatedCount === 0) {
    return {
      status: 'stale',
      helperText: '今日未更新，当前显示上一交易日收益',
      updatedCount,
      totalCount,
      today,
    }
  }

  return {
    status: 'partial',
    helperText: `部分基金今日已更新（${updatedCount}/${totalCount}），当前合计仍含上一交易日收益`,
    updatedCount,
    totalCount,
    today,
  }
}

export const buildMemberFilterOptions = (snapshots = []) => {
  const latestFirst = [...snapshots].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const members = new Map()

  latestFirst.forEach((snapshot) => {
    ;(snapshot.positions || []).forEach((position) => {
      if (!position.member_id || !position.member_name) return
      if (!members.has(position.member_id)) {
        members.set(position.member_id, {
          text: position.member_name,
          value: position.member_id,
        })
      }
    })
  })

  return [
    { text: '全部成员', value: 'all' },
    ...Array.from(members.values()),
  ]
}

export const buildAccountFilterOptions = (snapshots = [], { memberId = 'all' } = {}) => {
  const latestFirst = [...snapshots].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const accounts = new Map()
  let scopedMemberName = ''

  latestFirst.forEach((snapshot) => {
    ;(snapshot.positions || []).forEach((position) => {
      if (memberId !== 'all' && position.member_id !== memberId) return
      if (memberId !== 'all' && !scopedMemberName) scopedMemberName = position.member_name || ''
      if (!position.account_id || !position.account_name) return
      if (!accounts.has(position.account_id)) {
        accounts.set(position.account_id, {
          text: position.account_name,
          value: position.account_id,
        })
      }
    })
  })

  return [
    { text: normalizeScopeLabel({ memberName: scopedMemberName, memberId, accountId: 'all' }), value: 'all' },
    ...Array.from(accounts.values()),
  ]
}

export const __test__ = {
  safeNumber,
  calcProfitRate,
  calcDailyProfitRate,
  getPeriodKey,
  formatPeriodLabel,
  pickAggregationPeriod,
  getChinaDateString,
}
