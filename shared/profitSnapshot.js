const safeNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const round = (value, digits = 2) => Number(safeNumber(value).toFixed(digits))

export function resolveProfitSnapshotDate(positions = [], fallbackDate = '') {
  const navDates = positions
    .map(position => String(position?.nav_jzrq || '').trim())
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
  return navDates.sort().at(-1) || fallbackDate
}

export function buildServerProfitSnapshot({
  positions = [],
  advisoryProducts = [],
  capturedAt = Date.now(),
  fallbackDate = '',
} = {}) {
  const activePositions = positions.filter(position => safeNumber(position?.shares) > 0)
  const snapshotDate = resolveProfitSnapshotDate(activePositions, fallbackDate)
  if (!snapshotDate) throw new Error('无法确定收益快照日期')

  const normalizedPositions = activePositions.map(position => ({
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
    daily_profit: safeNumber(position.daily_profit ?? position.yesterday_profit),
    yesterday_profit: safeNumber(position.yesterday_profit ?? position.daily_profit),
    totalYesterdayProfit: safeNumber(position.yesterday_profit ?? position.daily_profit),
    profit_rate: safeNumber(position.profit_rate),
    initial_profit: safeNumber(position.initial_profit),
    nav_dwjz: position.nav_dwjz ?? null,
    nav_gsz: position.nav_gsz ?? null,
    nav_gszzl: position.nav_gszzl ?? null,
    nav_jzrq: position.nav_jzrq || '',
  }))

  advisoryProducts.forEach(product => {
    normalizedPositions.push({
      id: `advisory-${product.id}`,
      fund_code: `advisory-${product.id}`,
      fund_name: product.product_name || '',
      account_id: product.account_id || '',
      account_name: product.account_name || '',
      member_id: product.member_id || '',
      member_name: product.member_name || '',
      member_emoji: product.member_emoji || '',
      shares: 0,
      cost: Math.max(0, safeNumber(product.total_amount) - safeNumber(product.current_profit)),
      current_profit: safeNumber(product.current_profit),
      daily_profit: safeNumber(product.daily_profit),
      yesterday_profit: safeNumber(product.daily_profit),
      totalYesterdayProfit: safeNumber(product.daily_profit),
      profit_rate: safeNumber(product.profit_rate),
      initial_profit: 0,
      nav_dwjz: null,
      nav_gsz: null,
      nav_gszzl: null,
      nav_jzrq: product.snapshot_date || '',
    })
  })

  const positionMarketValue = activePositions.reduce((sum, item) => sum + safeNumber(item.current_market_value), 0)
  const advisoryMarketValue = advisoryProducts.reduce((sum, item) => sum + safeNumber(item.total_amount), 0)
  const positionProfit = activePositions.reduce((sum, item) => sum + safeNumber(item.current_profit), 0)
  const advisoryProfit = advisoryProducts.reduce((sum, item) => sum + safeNumber(item.current_profit), 0)
  const positionDailyProfit = activePositions.reduce((sum, item) => sum + safeNumber(item.yesterday_profit ?? item.daily_profit), 0)
  const advisoryDailyProfit = advisoryProducts.reduce((sum, item) => sum + safeNumber(item.daily_profit), 0)
  const realizedProfit = activePositions.reduce((sum, item) => sum + safeNumber(item.realized_profit), 0)
  const totalMarketValue = positionMarketValue + advisoryMarketValue
  const totalHoldingProfit = positionProfit + advisoryProfit
  const totalCost = totalMarketValue - totalHoldingProfit

  return {
    date: snapshotDate,
    captured_at: capturedAt,
    summary: {
      totalMarketValue: round(totalMarketValue),
      totalYesterdayProfit: round(positionDailyProfit + advisoryDailyProfit),
      totalPositionYesterdayProfit: round(positionDailyProfit),
      totalAdvisoryYesterdayProfit: round(advisoryDailyProfit),
      totalHoldingProfit: round(totalHoldingProfit),
      totalCumulativeProfit: round(totalHoldingProfit + realizedProfit),
      totalProfitRate: totalCost > 0 ? round((totalHoldingProfit / totalCost) * 100) : 0,
      totalCost: round(totalCost),
      dailyProfitDate: snapshotDate,
    },
    positions: normalizedPositions,
  }
}
