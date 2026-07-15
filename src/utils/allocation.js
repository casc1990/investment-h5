export const ALLOCATION_ASSET_TYPES = {
  PURE_BOND: 'pure_bond',
  FIXED_INCOME: 'fixed_income',
  DIVIDEND: 'dividend',
  INDEX: 'index',
  QDII: 'qdii',
  OTHER: 'other',
}

export const ALLOCATION_ASSET_TYPE_LABELS = {
  [ALLOCATION_ASSET_TYPES.PURE_BOND]: '纯债基金',
  [ALLOCATION_ASSET_TYPES.FIXED_INCOME]: '固收类基金',
  [ALLOCATION_ASSET_TYPES.DIVIDEND]: '红利类基金',
  [ALLOCATION_ASSET_TYPES.INDEX]: '指数类基金',
  [ALLOCATION_ASSET_TYPES.QDII]: '海外QDII基金',
  [ALLOCATION_ASSET_TYPES.OTHER]: '其他基金',
}

export const ALLOCATION_ASSET_TYPE_ORDER = [
  ALLOCATION_ASSET_TYPES.PURE_BOND,
  ALLOCATION_ASSET_TYPES.FIXED_INCOME,
  ALLOCATION_ASSET_TYPES.DIVIDEND,
  ALLOCATION_ASSET_TYPES.INDEX,
  ALLOCATION_ASSET_TYPES.QDII,
  ALLOCATION_ASSET_TYPES.OTHER,
]

export const ALLOCATION_FUND_STATUSES = {
  KEEP: '保留',
  WATCH: '观察',
  REDUCE: '可调出',
  FORBID_BUY: '禁买',
}

export const ALLOCATION_FUND_STATUS_ORDER = [
  ALLOCATION_FUND_STATUSES.KEEP,
  ALLOCATION_FUND_STATUSES.WATCH,
  ALLOCATION_FUND_STATUSES.REDUCE,
  ALLOCATION_FUND_STATUSES.FORBID_BUY,
]

const QDII_KEYWORDS = ['qdii', '纳斯达克', '标普', '恒生', '海外', '全球', '美股', '日经', '德国', '法国']
const PURE_BOND_KEYWORDS = ['纯债', '中短债', '短债', '长债', '债券']
const FIXED_INCOME_KEYWORDS = ['固收', '增强', '稳健收益', '稳健增利', '收益增强', '一年持有', '持有期']
const DIVIDEND_KEYWORDS = ['红利', '股息', '高股息', '红利低波']
const INDEX_KEYWORDS = ['指数', 'etf', '沪深300', '中证500', '中证1000', '创业板', '科创', '联接']

const round2 = (value) => Number((Number(value) || 0).toFixed(2))
const safeNumber = (value) => Number(value) || 0

export const ALLOCATION_BUCKET_TREND_COLORS = {
  [ALLOCATION_ASSET_TYPES.PURE_BOND]: '#3b82f6',
  [ALLOCATION_ASSET_TYPES.FIXED_INCOME]: '#8b5cf6',
  [ALLOCATION_ASSET_TYPES.DIVIDEND]: '#f59e0b',
  [ALLOCATION_ASSET_TYPES.INDEX]: '#10b981',
  [ALLOCATION_ASSET_TYPES.QDII]: '#ef4444',
  [ALLOCATION_ASSET_TYPES.OTHER]: '#64748b',
}

export const getPositionCurrentProfit = (position = {}) => round2(safeNumber(position.current_profit))
export const getPositionCost = (position = {}) => round2(safeNumber(position.cost))
export const getPositionYesterdayProfit = (position = {}) => round2(
  safeNumber(position.daily_profit)
  || safeNumber(position.yesterday_profit)
  || safeNumber(position.totalYesterdayProfit)
  || 0
)
export const getPositionTotalProfitRate = (position = {}) => {
  const cost = getPositionCost(position)
  if (cost <= 0) return 0
  return round2(getPositionCurrentProfit(position) / cost * 100)
}

export const getPositionDailyProfitRate = (position = {}) => {
  const dailyProfit = getPositionYesterdayProfit(position)
  const marketValue = getPositionMarketValue(position)
  const previousMarketValue = round2(marketValue - dailyProfit)
  if (previousMarketValue <= 0) return 0
  return round2(dailyProfit / previousMarketValue * 100)
}

export const createDefaultAllocationBuckets = () => ALLOCATION_ASSET_TYPE_ORDER.map(assetType => ({
  assetType,
  targetPct: 0,
  maxDeviationPct: 0,
}))

export const buildAllocationPositionKey = (position = {}) => `${position.account_id || ''}::${position.fund_code || ''}`

export const getAllocationPositionOwner = (position = {}) => ({
  memberName: String(position.member_name || position.memberName || '').trim() || '未分配用户',
  accountName: String(position.account_name || position.accountName || '').trim() || '未命名账户',
})

export const getAllocationPositionOwnerText = (position = {}) => {
  const { memberName, accountName } = getAllocationPositionOwner(position)
  return `用户：${memberName} · 账户：${accountName}`
}

export const getPositionMarketValue = (position = {}) => round2(getPositionCost(position) + getPositionCurrentProfit(position))

export const guessAllocationAssetType = (position = {}) => {
  const fundName = String(position.fund_name || position.fundName || '').toLowerCase()

  if (QDII_KEYWORDS.some(keyword => fundName.includes(keyword))) return ALLOCATION_ASSET_TYPES.QDII
  if (DIVIDEND_KEYWORDS.some(keyword => fundName.includes(keyword))) return ALLOCATION_ASSET_TYPES.DIVIDEND
  if (PURE_BOND_KEYWORDS.some(keyword => fundName.includes(keyword))) return ALLOCATION_ASSET_TYPES.PURE_BOND
  if (INDEX_KEYWORDS.some(keyword => fundName.includes(keyword))) return ALLOCATION_ASSET_TYPES.INDEX
  if (FIXED_INCOME_KEYWORDS.some(keyword => fundName.includes(keyword))) return ALLOCATION_ASSET_TYPES.FIXED_INCOME
  return ALLOCATION_ASSET_TYPES.OTHER
}

const normalizeBucket = (bucket = {}) => ({
  assetType: bucket.assetType,
  targetPct: round2(bucket.targetPct),
  maxDeviationPct: round2(bucket.maxDeviationPct),
})

const normalizeFund = (fund = {}) => ({
  positionId: fund.positionId,
  assetType: fund.assetType,
  status: fund.status || ALLOCATION_FUND_STATUSES.KEEP,
})

export const normalizeAllocationProfile = (profile = {}) => ({
  id: profile.id || `allocation-${Date.now()}`,
  name: profile.name || '未命名配置方案',
  note: profile.note || '',
  totalAsset: round2(profile.totalAsset ?? profile.total_asset ?? 0),
  targetProfitRate: round2(profile.targetProfitRate ?? profile.target_profit_rate ?? 0),
  createdAt: profile.createdAt || profile.created_at || null,
  updatedAt: profile.updatedAt || profile.updated_at || null,
  version: Number(profile.version || 0),
  buckets: (profile.buckets || createDefaultAllocationBuckets()).map(normalizeBucket),
  funds: (profile.funds || []).map(normalizeFund),
  defaultFundByType: { ...(profile.defaultFundByType || {}) },
})

export const isAllocationBucketConfigured = ({ bucket = {}, funds = [] } = {}) => {
  const targetPct = round2(bucket?.targetPct)
  if (targetPct > 0) return true
  const assetType = bucket?.assetType
  if (!assetType) return false
  return (funds || []).some(fund => fund?.assetType === assetType)
}

export const filterConfiguredAllocationBuckets = ({ buckets = [], funds = [] } = {}) => (
  (buckets || []).filter(bucket => isAllocationBucketConfigured({ bucket, funds }))
)

export const buildAllocationOccupancyMap = (profiles = [], positions = []) => {
  const positionById = new Map((positions || []).map(position => [position.id, position]))
  const occupancyMap = new Map()

  for (const rawProfile of profiles || []) {
    const profile = normalizeAllocationProfile(rawProfile)
    for (const fund of profile.funds) {
      const position = positionById.get(fund.positionId)
      if (!position) continue
      const key = buildAllocationPositionKey(position)
      const list = occupancyMap.get(key) || []
      list.push({ profileId: profile.id, profileName: profile.name, positionId: fund.positionId })
      occupancyMap.set(key, list)
    }
  }

  return occupancyMap
}

export const getPositionOccupancy = (occupancyMap, position) => {
  if (!occupancyMap || !position) return []
  return occupancyMap.get(buildAllocationPositionKey(position)) || []
}

export const buildPositionAllocationStatusMap = (profiles = []) => {
  const entriesByPositionId = new Map()

  for (const rawProfile of profiles || []) {
    const profile = normalizeAllocationProfile(rawProfile)
    for (const fund of profile.funds) {
      if (!fund.positionId) continue
      const entries = entriesByPositionId.get(fund.positionId) || []
      entries.push({
        profileId: profile.id,
        profileName: profile.name,
        assetType: fund.assetType,
        status: fund.status,
      })
      entriesByPositionId.set(fund.positionId, entries)
    }
  }

  return new Map([...entriesByPositionId].map(([positionId, entries]) => {
    if (entries.length === 1) {
      return [positionId, {
        ...entries[0],
        label: entries[0].status,
        conflict: false,
        entries,
      }]
    }
    return [positionId, {
      label: '多策略',
      conflict: true,
      entries,
    }]
  }))
}

export const buildAllocationSelectablePositions = ({
  positions = [],
  profiles = [],
  currentProfile = null,
  assetType,
}) => {
  const normalizedProfile = currentProfile ? normalizeAllocationProfile(currentProfile) : null
  const occupancyMap = buildAllocationOccupancyMap(profiles, positions)

  return [...(positions || [])]
    .map(position => {
      const config = normalizedProfile?.funds?.find(item => item.positionId === position.id) || null
      const occupancy = getPositionOccupancy(occupancyMap, position)
      const lockedByOtherProfile = occupancy.some(item => item.profileId !== normalizedProfile?.id)
      const includedInCurrentBucket = config?.assetType === assetType
      const lockedByCurrentProfileOtherBucket = Boolean(config?.assetType) && config.assetType !== assetType
      const selectionDisabled = (lockedByOtherProfile || lockedByCurrentProfileOtherBucket) && !includedInCurrentBucket
      const guessMatched = guessAllocationAssetType(position) === assetType
      return {
        position,
        config,
        occupancy,
        lockedByOtherProfile,
        lockedByCurrentProfileOtherBucket,
        selectionDisabled,
        includedInCurrentBucket,
        includedInCurrentProfile: Boolean(config),
        guessMatched,
        marketValue: getPositionMarketValue(position),
        currentProfit: getPositionCurrentProfit(position),
        totalProfitRate: getPositionTotalProfitRate(position),
      }
    })
    .sort((a, b) => {
      if (a.includedInCurrentBucket !== b.includedInCurrentBucket) return a.includedInCurrentBucket ? -1 : 1
      if (a.guessMatched !== b.guessMatched) return a.guessMatched ? -1 : 1
      if (a.lockedByOtherProfile !== b.lockedByOtherProfile) return a.lockedByOtherProfile ? 1 : -1
      if (a.includedInCurrentProfile !== b.includedInCurrentProfile) return a.includedInCurrentProfile ? -1 : 1
      return b.marketValue - a.marketValue
    })
}

export const applyAllocationBucketSelection = ({
  profile: rawProfile,
  assetType,
  selectedPositionIds = [],
}) => {
  const profile = normalizeAllocationProfile(rawProfile)
  const selectedSet = new Set(selectedPositionIds)
  const currentFunds = profile.funds || []
  const nextFunds = []

  for (const fund of currentFunds) {
    if (fund.assetType === assetType && !selectedSet.has(fund.positionId)) {
      continue
    }
    if (selectedSet.has(fund.positionId)) {
      nextFunds.push({
        ...fund,
        assetType,
      })
      selectedSet.delete(fund.positionId)
      continue
    }
    nextFunds.push(fund)
  }

  for (const positionId of selectedSet) {
    nextFunds.push({
      positionId,
      assetType,
      status: ALLOCATION_FUND_STATUSES.KEEP,
    })
  }

  return normalizeAllocationProfile({
    ...profile,
    funds: nextFunds,
    updatedAt: new Date().toISOString(),
  })
}

const buildBucketMap = (buckets = []) => {
  const map = new Map()
  for (const bucket of buckets) {
    const normalized = normalizeBucket(bucket)
    map.set(normalized.assetType, normalized)
  }
  for (const assetType of ALLOCATION_ASSET_TYPE_ORDER) {
    if (!map.has(assetType)) {
      map.set(assetType, { assetType, targetPct: 0, maxDeviationPct: 0 })
    }
  }
  return map
}

const buildFundRowsInternal = ({ profile, positions }) => {
  const positionById = new Map((positions || []).map(position => [position.id, position]))
  return (profile.funds || [])
    .map(normalizeFund)
    .map(fund => {
      const position = positionById.get(fund.positionId)
      if (!position) return null
      const marketValue = getPositionMarketValue(position)
      const currentProfit = getPositionCurrentProfit(position)
      const dailyProfit = getPositionYesterdayProfit(position)
      return {
        positionId: fund.positionId,
        assetType: fund.assetType || guessAllocationAssetType(position),
        status: fund.status || ALLOCATION_FUND_STATUSES.KEEP,
        position,
        marketValue,
        cost: getPositionCost(position),
        currentProfit,
        dailyProfit,
        dailyProfitRate: getPositionDailyProfitRate(position),
        totalProfitRate: getPositionTotalProfitRate(position),
      }
    })
    .filter(Boolean)
}

const buildHoldingDistribution = (funds = [], bucketMarketValue = 0) => {
  if (bucketMarketValue <= 0) return []
  return funds
    .map(item => ({
      positionId: item.positionId,
      fundName: item.position?.fund_name || '未知基金',
      marketValue: item.marketValue,
      amountPct: round2(item.marketValue / bucketMarketValue * 100),
      totalProfitRate: item.totalProfitRate,
      currentProfit: item.currentProfit,
    }))
    .sort((a, b) => b.marketValue - a.marketValue)
}

export const buildAllocationProfitTrend = ({ profile: rawProfile, snapshots = [] }) => {
  const profile = normalizeAllocationProfile(rawProfile)
  const trackedIds = new Set((profile.funds || []).map(item => item.positionId).filter(Boolean))
  if (!trackedIds.size || !Array.isArray(snapshots) || !snapshots.length) return []

  return [...snapshots]
    .map(snapshot => {
      const matchedPositions = (snapshot?.positions || []).filter(position => trackedIds.has(position.id))
      if (!matchedPositions.length) return null

      const totalCost = round2(matchedPositions.reduce((sum, position) => sum + safeNumber(position.cost), 0))
      const totalProfit = round2(matchedPositions.reduce((sum, position) => sum + safeNumber(position.current_profit), 0))
      const totalMarketValue = round2(totalCost + totalProfit)
      const totalProfitRate = totalCost > 0 ? round2(totalProfit / totalCost * 100) : 0
      const targetProfitRate = round2(profile.targetProfitRate)

      const row = {
        key: snapshot.date,
        date: snapshot.date,
        label: String(snapshot.date || '').slice(5),
        value: totalProfitRate,
        totalCost,
        totalProfit,
        totalMarketValue,
        totalProfitRate,
        targetProfitRate,
        targetGapRate: round2(totalProfitRate - targetProfitRate),
      }

      return {
        ...row,
        raw: row,
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

export const buildAllocationBucketDailyProfitTrend = ({ profile: rawProfile, snapshots = [], assetTypes = null }) => {
  const profile = normalizeAllocationProfile(rawProfile)
  const trackedFunds = (profile.funds || []).filter(item => item?.positionId && item?.assetType)
  if (!trackedFunds.length || !Array.isArray(snapshots) || !snapshots.length) return []

  const trackedIds = new Set(trackedFunds.map(item => item.positionId))
  const assetTypeByPositionId = new Map(trackedFunds.map(item => [item.positionId, item.assetType]))
  const allowedAssetTypes = Array.isArray(assetTypes) && assetTypes.length
    ? ALLOCATION_ASSET_TYPE_ORDER.filter(assetType => assetTypes.includes(assetType))
    : ALLOCATION_ASSET_TYPE_ORDER
  const includedAssetTypes = allowedAssetTypes.filter(assetType => trackedFunds.some(item => item.assetType === assetType))
  if (!includedAssetTypes.length) return []

  const rows = [...snapshots]
    .map(snapshot => {
      const matchedPositions = (snapshot?.positions || []).filter(position => trackedIds.has(position.id))
      if (!matchedPositions.length) return null

      const valuesByAssetType = includedAssetTypes.reduce((acc, assetType) => {
        acc[assetType] = 0
        return acc
      }, {})

      for (const position of matchedPositions) {
        const assetType = assetTypeByPositionId.get(position.id)
        if (!assetType || !includedAssetTypes.includes(assetType)) continue
        valuesByAssetType[assetType] = round2(valuesByAssetType[assetType] + getPositionYesterdayProfit(position))
      }

      const totalValue = round2(Object.values(valuesByAssetType).reduce((sum, value) => sum + safeNumber(value), 0))
      const row = {
        key: snapshot.date,
        date: snapshot.date,
        label: String(snapshot.date || '').slice(5),
        valuesByAssetType,
        totalValue,
      }

      return row
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  return includedAssetTypes.map(assetType => ({
    key: assetType,
    assetType,
    label: ALLOCATION_ASSET_TYPE_LABELS[assetType] || assetType,
    color: ALLOCATION_BUCKET_TREND_COLORS[assetType] || '#64748b',
    points: rows.map(row => ({
      key: `${assetType}-${row.date}`,
      date: row.date,
      label: row.label,
      value: round2(row.valuesByAssetType[assetType]),
      raw: {
        ...row,
        assetType,
        value: round2(row.valuesByAssetType[assetType]),
      },
    })),
  })).filter(series => series.points.some(point => point.value !== 0))
}

export const buildAllocationDailyProfitTrend = ({ profile: rawProfile, snapshots = [] }) => {
  const profile = normalizeAllocationProfile(rawProfile)
  const trackedFunds = (profile.funds || []).filter(item => item?.positionId && item?.assetType)
  if (!trackedFunds.length || !Array.isArray(snapshots) || !snapshots.length) return []

  const includedAssetTypes = ALLOCATION_ASSET_TYPE_ORDER.filter(assetType => trackedFunds.some(item => item.assetType === assetType))
  const bucketSeries = buildAllocationBucketDailyProfitTrend({ profile, snapshots, assetTypes: includedAssetTypes })
  if (!bucketSeries.length) return []

  const rowsByDate = new Map()
  for (const series of bucketSeries) {
    for (const point of series.points || []) {
      const existing = rowsByDate.get(point.date) || {
        key: point.date,
        date: point.date,
        label: point.label,
        totalValue: 0,
        valuesByAssetType: {},
      }
      existing.totalValue = round2(existing.totalValue + safeNumber(point.value))
      existing.valuesByAssetType[series.assetType] = round2(point.value)
      rowsByDate.set(point.date, existing)
    }
  }

  const points = [...rowsByDate.values()]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(row => ({
      key: `total-${row.date}`,
      date: row.date,
      label: row.label,
      value: round2(row.totalValue),
      raw: {
        ...row,
        assetType: 'total',
        value: round2(row.totalValue),
      },
    }))

  if (!points.some(point => point.value !== 0)) return []

  return [{
    key: 'total-daily-profit',
    assetType: 'total',
    label: '每日总收益',
    color: '#4f46e5',
    points,
  }]
}

const getBucketStatus = ({ currentPct, targetPct, maxDeviationPct }) => {
  if (currentPct < round2(targetPct - maxDeviationPct)) return 'low'
  if (currentPct > round2(targetPct + maxDeviationPct)) return 'high'
  return 'ok'
}

const getStatusPriority = (status) => {
  switch (status) {
    case ALLOCATION_FUND_STATUSES.KEEP:
      return 0
    case ALLOCATION_FUND_STATUSES.WATCH:
      return 1
    case ALLOCATION_FUND_STATUSES.REDUCE:
      return 2
    case ALLOCATION_FUND_STATUSES.FORBID_BUY:
      return 3
    default:
      return 9
  }
}

export const buildAllocationProfileSummary = ({ profile: rawProfile, positions = [], allProfiles = [] }) => {
  const profile = normalizeAllocationProfile(rawProfile)
  const bucketMap = buildBucketMap(profile.buckets)
  const fundRows = buildFundRowsInternal({ profile, positions })
  const totalMarketValue = round2(fundRows.reduce((sum, item) => sum + item.marketValue, 0))
  const allocationBaseMarketValue = profile.totalAsset > 0 ? round2(profile.totalAsset) : totalMarketValue
  const occupancyMap = buildAllocationOccupancyMap(allProfiles.length ? allProfiles : [profile], positions)

  const fundRowsWithPct = fundRows.map(item => ({
    ...item,
    portfolioPct: allocationBaseMarketValue > 0 ? round2(item.marketValue / allocationBaseMarketValue * 100) : 0,
    occupancy: getPositionOccupancy(occupancyMap, item.position),
  }))

  const bucketSummaries = ALLOCATION_ASSET_TYPE_ORDER.map(assetType => {
    const bucket = bucketMap.get(assetType)
    const funds = fundRowsWithPct.filter(item => item.assetType === assetType)
    const marketValue = round2(funds.reduce((sum, item) => sum + item.marketValue, 0))
    const totalCost = round2(funds.reduce((sum, item) => sum + item.cost, 0))
    const totalProfit = round2(funds.reduce((sum, item) => sum + item.currentProfit, 0))
    const totalProfitRate = totalCost > 0 ? round2(totalProfit / totalCost * 100) : 0
    const dailyProfit = round2(funds.reduce((sum, item) => sum + item.dailyProfit, 0))
    const previousMarketValue = round2(marketValue - dailyProfit)
    const dailyProfitRate = previousMarketValue > 0 ? round2(dailyProfit / previousMarketValue * 100) : 0
    const currentPct = allocationBaseMarketValue > 0 ? round2(marketValue / allocationBaseMarketValue * 100) : 0
    const targetAmount = allocationBaseMarketValue > 0 ? round2(allocationBaseMarketValue * bucket.targetPct / 100) : 0
    const deviationPct = round2(currentPct - bucket.targetPct)
    const deviationAmount = round2(marketValue - targetAmount)
    const status = getBucketStatus({ currentPct, targetPct: bucket.targetPct, maxDeviationPct: bucket.maxDeviationPct })
    return {
      ...bucket,
      label: ALLOCATION_ASSET_TYPE_LABELS[assetType],
      marketValue,
      totalCost,
      totalProfit,
      totalProfitRate,
      dailyProfit,
      dailyProfitRate,
      currentPct,
      targetAmount,
      deviationPct,
      deviationAmount,
      status,
      funds,
      holdingDistribution: buildHoldingDistribution(funds, marketValue),
    }
  })

  const fundRowsFinal = fundRowsWithPct.map(item => {
    const bucket = bucketSummaries.find(bucketItem => bucketItem.assetType === item.assetType)
    return {
      ...item,
      assetBucketPct: bucket?.marketValue > 0 ? round2(item.marketValue / bucket.marketValue * 100) : 0,
      assetTypeLabel: ALLOCATION_ASSET_TYPE_LABELS[item.assetType],
    }
  })

  const coveredPositionIds = new Set(fundRowsFinal.map(item => item.positionId))
  const uncoveredPositions = (positions || []).filter(position => !coveredPositionIds.has(position.id))
  const uncoveredMarketValue = profile.totalAsset > 0
    ? round2(Math.max(allocationBaseMarketValue - totalMarketValue, 0))
    : round2(uncoveredPositions.reduce((sum, position) => sum + getPositionMarketValue(position), 0))

  const totalCost = round2(fundRowsFinal.reduce((sum, item) => sum + item.cost, 0))
  const totalProfit = round2(fundRowsFinal.reduce((sum, item) => sum + item.currentProfit, 0))
  const totalProfitRate = totalCost > 0 ? round2(totalProfit / totalCost * 100) : 0
  const totalDailyProfit = round2(fundRowsFinal.reduce((sum, item) => sum + item.dailyProfit, 0))
  const totalPreviousMarketValue = round2(totalMarketValue - totalDailyProfit)
  const totalDailyProfitRate = totalPreviousMarketValue > 0 ? round2(totalDailyProfit / totalPreviousMarketValue * 100) : 0

  return {
    profile,
    totalMarketValue,
    totalCost,
    totalProfit,
    totalProfitRate,
    totalDailyProfit,
    totalDailyProfitRate,
    allocationBaseMarketValue,
    coveredPositionCount: fundRowsFinal.length,
    uncoveredPositionCount: uncoveredPositions.length,
    uncoveredMarketValue,
    bucketSummaries,
    fundRows: fundRowsFinal.sort((a, b) => b.marketValue - a.marketValue),
    uncoveredPositions,
  }
}

const pickRecommendedFunds = ({ bucketSummary, defaultFundByType = {} }) => {
  const candidates = [...(bucketSummary.funds || [])]
    .filter(item => ![ALLOCATION_FUND_STATUSES.REDUCE, ALLOCATION_FUND_STATUSES.FORBID_BUY].includes(item.status))
    .sort((a, b) => {
      const defaultId = defaultFundByType[bucketSummary.assetType]
      if (a.positionId === defaultId && b.positionId !== defaultId) return -1
      if (b.positionId === defaultId && a.positionId !== defaultId) return 1
      const priorityDiff = getStatusPriority(a.status) - getStatusPriority(b.status)
      if (priorityDiff !== 0) return priorityDiff
      return a.portfolioPct - b.portfolioPct
    })

  return candidates.map(item => ({
    positionId: item.positionId,
    fundCode: item.position.fund_code,
    fundName: item.position.fund_name,
    status: item.status,
    reason: item.status === ALLOCATION_FUND_STATUSES.WATCH
      ? '状态为观察，已降级推荐优先级'
      : '状态为保留，可作为优先承接基金',
    marketValue: item.marketValue,
    portfolioPct: item.portfolioPct,
  }))
}

export const buildAllocationSuggestions = ({ profile: rawProfile, positions = [], newCashAmount = 0 }) => {
  const summary = buildAllocationProfileSummary({ profile: rawProfile, positions })
  const allocationBaseMarketValue = summary.allocationBaseMarketValue
  const investAmount = round2(newCashAmount)
  const postInvestMarketValue = round2(allocationBaseMarketValue + investAmount)

  const deficitBuckets = summary.bucketSummaries
    .map(bucket => {
      const targetValue = round2(postInvestMarketValue * bucket.targetPct / 100)
      const gapValue = round2(targetValue - bucket.marketValue)
      return { ...bucket, targetValue, gapValue }
    })
    .filter(bucket => bucket.gapValue > 0 && bucket.targetPct > 0)
    .sort((a, b) => b.gapValue - a.gapValue)

  const totalGap = round2(deficitBuckets.reduce((sum, bucket) => sum + bucket.gapValue, 0))
  let remainingAmount = investAmount
  const recommendedCategories = deficitBuckets.map((bucket, index) => {
    let recommendedAmount = 0
    if (investAmount > 0 && totalGap > 0) {
      if (index === deficitBuckets.length - 1) {
        recommendedAmount = remainingAmount
      } else {
        recommendedAmount = round2(Math.floor((investAmount * bucket.gapValue / totalGap) / 100) * 100)
        recommendedAmount = Math.min(recommendedAmount, remainingAmount)
      }
      remainingAmount = round2(remainingAmount - recommendedAmount)
    }

    const recommendedFunds = pickRecommendedFunds({
      bucketSummary: bucket,
      defaultFundByType: summary.profile.defaultFundByType,
    })

    return {
      assetType: bucket.assetType,
      label: bucket.label,
      currentPct: bucket.currentPct,
      targetPct: bucket.targetPct,
      maxDeviationPct: bucket.maxDeviationPct,
      gapPct: round2(bucket.targetPct - bucket.currentPct),
      gapValue: bucket.gapValue,
      recommendedAmount,
      recommendedFunds,
      reason: recommendedFunds.length
        ? `当前${bucket.label}低配，优先补足该类别`
        : `当前${bucket.label}低配，但方案内暂无可买基金，仅建议补充该类别`,
    }
  })

  const rebalanceCategories = summary.bucketSummaries
    .filter(bucket => bucket.status === 'high')
    .map(bucket => {
      const candidateFunds = [...bucket.funds]
        .sort((a, b) => {
          const priorityDiff = getStatusPriority(a.status) - getStatusPriority(b.status)
          if (priorityDiff !== 0) return priorityDiff * -1
          return b.portfolioPct - a.portfolioPct
        })
        .map(item => ({
          positionId: item.positionId,
          fundCode: item.position.fund_code,
          fundName: item.position.fund_name,
          status: item.status,
          portfolioPct: item.portfolioPct,
          marketValue: item.marketValue,
          reason: item.status === ALLOCATION_FUND_STATUSES.REDUCE
            ? '状态为可调出，优先作为调仓候选'
            : item.status === ALLOCATION_FUND_STATUSES.WATCH
              ? '状态为观察，可作为次级调仓候选'
              : item.status === ALLOCATION_FUND_STATUSES.FORBID_BUY
                ? '状态为禁买，应停止继续加仓并纳入处理观察'
                : '当前类别超配，但该基金状态为保留，建议后置处理',
        }))

      return {
        assetType: bucket.assetType,
        label: bucket.label,
        currentPct: bucket.currentPct,
        targetPct: bucket.targetPct,
        maxDeviationPct: bucket.maxDeviationPct,
        deviationPct: bucket.deviationPct,
        candidateFunds,
      }
    })

  return {
    newCashAmount: investAmount,
    postInvestMarketValue,
    recommendedCategories,
    rebalanceCategories,
    summary,
  }
}
