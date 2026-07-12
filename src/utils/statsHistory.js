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

const normalizeText = (value = '') => String(value || '').trim().toLowerCase()

const containsAny = (text = '', keywords = []) => keywords.some(keyword => text.includes(keyword))

const getPositionMarketValue = (item = {}) => {
  const directValue = Number(item.current_market_value)
  if (Number.isFinite(directValue)) return directValue
  return safeNumber(item.cost) + safeNumber(item.current_profit)
}

const detectFundType = (item = {}) => {
  const explicitType = normalizeText(item.fund_type)
  if (explicitType === 'qdii') return 'QDII'
  if (explicitType === '债券') return '债券'
  if (explicitType === '固收') return '固收'
  if (explicitType === '指数') return '指数'
  if (explicitType === '其他') return '其他'

  const name = normalizeText(item.fund_name)
  const code = normalizeText(item.fund_code)
  const text = `${name} ${code}`

  if (containsAny(text, ['qdii', '纳斯达克', '纳指', '标普', '恒生', '日经', '道琼斯', 'msci', '海外', '全球'])) return 'QDII'
  if (containsAny(text, ['固收', '理财', '稳利', '稳健增利', '固定收益'])) return '固收'
  if (containsAny(text, ['债券', '短债', '中短债', '纯债', '可转债'])) return '债券'
  if (containsAny(text, ['指数', 'etf', '联接', '沪深300', '中证', '创业板', '科创'])) return '指数'
  return '其他'
}

const normalizeFundTypeValue = (value = 'all') => {
  const text = normalizeText(value)
  if (!text || text === 'all') return 'all'
  if (text === 'qdii') return 'qdii'
  if (text === '债券') return 'bond'
  if (text === '固收') return 'fixed_income'
  if (text === '指数') return 'index'
  if (text === '其他') return 'other'
  return text
}

const matchesFundType = (item = {}, fundType = 'all') => {
  const normalized = normalizeFundTypeValue(fundType)
  if (normalized === 'all') return true
  const typeLabel = detectFundType(item)
  if (normalized === 'qdii') return typeLabel === 'QDII'
  if (normalized === 'bond') return typeLabel === '债券'
  if (normalized === 'fixed_income') return typeLabel === '固收'
  if (normalized === 'index') return typeLabel === '指数'
  if (normalized === 'other') return typeLabel === '其他'
  return true
}

const matchesFundQuery = (item = {}, fundQuery = '') => {
  const query = normalizeText(fundQuery)
  if (!query) return true
  const haystack = `${normalizeText(item.fund_name)} ${normalizeText(item.fund_code)}`
  return haystack.includes(query)
}

const matchesFundCode = (item = {}, fundCode = 'all') => {
  const normalized = normalizeText(fundCode)
  if (!normalized || normalized === 'all') return true
  return normalizeText(item.fund_code) === normalized
}

const annotatePosition = (item = {}) => ({
  ...item,
  fund_type: item.fund_type || detectFundType(item),
})

const hasFundScopedFilters = ({ fundType = 'all', fundQuery = '' } = {}) => normalizeFundTypeValue(fundType) !== 'all' || Boolean(normalizeText(fundQuery))

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
  const totalMarketValue = positions.reduce((sum, item) => sum + getPositionMarketValue(item), 0)
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

const filterSnapshotPositions = (snapshot = {}, { memberId = 'all', accountId = 'all', fundType = 'all', fundQuery = '', fundCode = 'all' } = {}) => {
  return (snapshot.positions || [])
    .map(annotatePosition)
    .filter((item) => {
      if (memberId !== 'all' && item.member_id !== memberId) return false
      if (accountId !== 'all' && item.account_id !== accountId) return false
      if (!matchesFundType(item, fundType)) return false
      if (!matchesFundQuery(item, fundQuery)) return false
      if (!matchesFundCode(item, fundCode)) return false
      return true
    })
}

const resolveSnapshotEffectiveDate = (snapshot = {}, positions = []) => {
  const fundDates = positions
    .filter(item => !isAdvisoryPosition(item))
    .map(item => String(item.nav_jzrq || '').trim())
    .filter(Boolean)

  if (!fundDates.length) return snapshot.date

  return [...fundDates].sort().at(-1) || snapshot.date
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

export const buildDailyHistoryRows = (snapshots = [], { memberId = 'all', accountId = 'all', fundType = 'all', fundQuery = '' } = {}) => {
  const sortedSnapshots = sortSnapshotsAsc(snapshots)
  const rows = sortedSnapshots.map((snapshot, index) => {
    const filteredPositions = filterSnapshotPositions(snapshot, { memberId, accountId, fundType, fundQuery })
    const previousFilteredPositions = index > 0
      ? filterSnapshotPositions(sortedSnapshots[index - 1], { memberId, accountId, fundType, fundQuery })
      : []
    if (!hasDailyProfitUpdateForSnapshot(filteredPositions, previousFilteredPositions)) return null

    const effectiveDate = resolveSnapshotEffectiveDate(snapshot, filteredPositions)
    const shouldUseSummary = memberId === 'all'
      && accountId === 'all'
      && !hasFundScopedFilters({ fundType, fundQuery })

    if (shouldUseSummary) {
      const summary = snapshot.summary || {}
      const positionDailyProfit = calcPositionDailyProfit(summary, filteredPositions)
      return {
        date: effectiveDate,
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
      date: effectiveDate,
      account_id: accountId,
      ...aggregatePositions(filteredPositions, { memberId, accountId }),
    }
  }).filter(Boolean)

  return sortRowsDesc(rows)
}

export const buildPeriodHistoryRows = (snapshots = [], { memberId = 'all', accountId = 'all', fundType = 'all', fundQuery = '', period = 'week' } = {}) => {
  const dailyRowsAsc = [...buildDailyHistoryRows(snapshots, { memberId, accountId, fundType, fundQuery })].sort((a, b) => String(a.date).localeCompare(String(b.date)))
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

export const buildFundTypeFilterOptions = (snapshots = [], { memberId = 'all', accountId = 'all' } = {}) => {
  const latestSnapshot = [...snapshots].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
  const typeOrder = ['QDII', '债券', '固收', '指数', '其他']
  const seen = new Set()

  const positions = filterSnapshotPositions(latestSnapshot || {}, { memberId, accountId })
    .filter(item => !isAdvisoryPosition(item))

  positions.forEach((item) => {
    seen.add(detectFundType(item))
  })

  const options = typeOrder
    .filter(type => seen.has(type))
    .map((type) => ({
      text: type,
      value: type === 'QDII'
        ? 'qdii'
        : type === '债券'
          ? '债券'
          : type === '固收'
            ? '固收'
            : type === '指数'
              ? '指数'
              : '其他',
    }))

  return [
    { text: '全部类型', value: 'all' },
    ...options,
  ]
}

export const buildFundSelectorOptions = (snapshots = [], { memberId = 'all', accountId = 'all', fundType = 'all' } = {}) => {
  const rows = buildCurrentFundRows(snapshots, { memberId, accountId, fundType })
  return [
    { text: '全部基金', value: 'all' },
    ...rows.map(item => ({
      text: `${item.fund_name}（${item.fund_code}）`,
      value: item.fund_code,
    })),
  ]
}

export const buildCurrentFundRows = (snapshots = [], { memberId = 'all', accountId = 'all', fundType = 'all', fundQuery = '', fundCode = 'all' } = {}) => {
  const latestSnapshot = [...snapshots].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
  if (!latestSnapshot) return []

  const positions = filterSnapshotPositions(latestSnapshot, { memberId, accountId, fundType, fundQuery, fundCode })
    .filter(item => !isAdvisoryPosition(item))

  const grouped = new Map()

  positions.forEach((item) => {
    const key = item.fund_code || item.fund_name || item.id
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, {
        fund_code: item.fund_code,
        fund_name: item.fund_name,
        fund_type: detectFundType(item),
        position_count: 1,
        account_names: new Set([item.account_name].filter(Boolean)),
        member_names: new Set([item.member_name].filter(Boolean)),
        total_market_value: getPositionMarketValue(item),
        total_profit: safeNumber(item.current_profit),
        daily_profit: safeNumber(item.yesterday_profit),
        shares: safeNumber(item.shares),
        cost: safeNumber(item.cost),
        nav_jzrq: item.nav_jzrq || '',
      })
      return
    }

    existing.position_count += 1
    if (item.account_name) existing.account_names.add(item.account_name)
    if (item.member_name) existing.member_names.add(item.member_name)
    existing.total_market_value += getPositionMarketValue(item)
    existing.total_profit += safeNumber(item.current_profit)
    existing.daily_profit += safeNumber(item.yesterday_profit)
    existing.shares += safeNumber(item.shares)
    existing.cost += safeNumber(item.cost)
    if (String(item.nav_jzrq || '') > String(existing.nav_jzrq || '')) existing.nav_jzrq = item.nav_jzrq
  })

  return Array.from(grouped.values()).map((item) => ({
    ...item,
    account_name: item.account_names.size <= 1 ? (Array.from(item.account_names)[0] || '') : `${item.account_names.size}个账户`,
    member_name: item.member_names.size <= 1 ? (Array.from(item.member_names)[0] || '') : `${item.member_names.size}位成员`,
    total_market_value: Number(item.total_market_value.toFixed(2)),
    total_profit: Number(item.total_profit.toFixed(2)),
    daily_profit: Number(item.daily_profit.toFixed(2)),
    profit_rate: calcProfitRate(item.total_profit, item.total_market_value),
    daily_profit_rate: calcDailyProfitRate(item.daily_profit, item.total_market_value),
  })).sort((a, b) => b.total_market_value - a.total_market_value)
}

export const buildProfitContributionRows = (fundRows = [], limit = 3) => {
  const rows = (fundRows || []).map(item => ({
    ...item,
    daily_profit: Number(safeNumber(item.daily_profit).toFixed(2)),
  }))
  const absoluteTotal = rows.reduce((sum, item) => sum + Math.abs(item.daily_profit), 0)
  const withShare = rows.map(item => ({
    ...item,
    contribution_share: absoluteTotal > 0
      ? Number(((Math.abs(item.daily_profit) / absoluteTotal) * 100).toFixed(2))
      : 0,
  }))

  return {
    contributors: withShare.filter(item => item.daily_profit > 0).sort((a, b) => b.daily_profit - a.daily_profit).slice(0, limit),
    detractors: withShare.filter(item => item.daily_profit < 0).sort((a, b) => a.daily_profit - b.daily_profit).slice(0, limit),
  }
}

export const getNextLoopDisplayCount = ({ total = 0, current = 2, initial = 2, batch = 10 } = {}) => {
  const safeTotal = Math.max(0, Number(total) || 0)
  if (safeTotal <= 0) return 0
  if (safeTotal <= initial) return safeTotal

  const safeCurrent = Math.max(initial, Number(current) || initial)
  if (safeCurrent >= safeTotal) return Math.min(initial, safeTotal)
  return Math.min(safeCurrent + batch, safeTotal)
}

export const __test__ = {
  safeNumber,
  calcProfitRate,
  calcDailyProfitRate,
  getPeriodKey,
  formatPeriodLabel,
  pickAggregationPeriod,
  getChinaDateString,
  detectFundType,
  normalizeFundTypeValue,
  matchesFundQuery,
}
