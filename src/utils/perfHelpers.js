export const PAGE_DATA_TTL = 30 * 1000

const safeNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export const shouldRefreshPageData = ({
  hasData = false,
  lastLoadedAt = 0,
  now = Date.now(),
  ttl = PAGE_DATA_TTL,
  force = false,
} = {}) => {
  if (force) return true
  if (!hasData) return true
  if (!lastLoadedAt) return true
  return now - lastLoadedAt >= ttl
}

export const normalizeAdvisoryAsPositions = (products = []) => products.map(item => ({
  id: `advisory-${item.id}`,
  fund_name: item.product_name,
  fund_code: `advisory-${item.id}`,
  account_id: item.account_id,
  account_name: item.account_name,
  member_id: item.member_id,
  member_name: item.member_name,
  member_emoji: item.member_emoji,
  current_profit: item.current_profit,
  yesterday_profit: item.yesterday_profit,
  profit_rate: item.profit_rate,
  cost: Math.max(0, safeNumber(item.current_market_value) - safeNumber(item.current_profit)),
  shares: 0,
  nav_dwjz: null,
  nav_gsz: null,
  nav_gszzl: null,
  nav_jzrq: item.snapshot_date || '',
}))

export const normalizeSnapshotPosition = (item = {}) => ({
  id: item.id || '',
  fund_name: item.fund_name || '',
  fund_code: item.fund_code || '',
  account_id: item.account_id || '',
  account_name: item.account_name || '',
  member_id: item.member_id || '',
  member_name: item.member_name || '',
  member_emoji: item.member_emoji || '',
  cost: safeNumber(item.cost),
  shares: safeNumber(item.shares),
  current_profit: safeNumber(item.current_profit),
  yesterday_profit: safeNumber(item.yesterday_profit),
  profit_rate: safeNumber(item.profit_rate),
  nav_dwjz: item.nav_dwjz ?? null,
  nav_gsz: item.nav_gsz ?? null,
  nav_gszzl: item.nav_gszzl ?? null,
  nav_jzrq: item.nav_jzrq || '',
})

export const buildSnapshotPayloadFromApis = ({
  overviewData = null,
  positionsData = null,
  advisoryData = null,
} = {}) => {
  const positions = positionsData?.positions || []
  const advisoryProducts = advisoryData?.products || []
  const snapshotPositions = [
    ...positions.map(normalizeSnapshotPosition),
    ...normalizeAdvisoryAsPositions(advisoryProducts),
  ]

  return {
    overview: overviewData,
    positions,
    advisoryProducts,
    snapshotPositions,
  }
}
