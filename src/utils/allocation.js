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

export const createDefaultAllocationBuckets = () => ALLOCATION_ASSET_TYPE_ORDER.map(assetType => ({
  assetType,
  targetPct: 0,
  maxDeviationPct: 0,
}))

export const buildAllocationPositionKey = (position = {}) => `${position.account_id || ''}::${position.fund_code || ''}`

export const getPositionMarketValue = (position = {}) => round2(safeNumber(position.cost) + safeNumber(position.current_profit))

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
  createdAt: profile.createdAt || profile.created_at || null,
  updatedAt: profile.updatedAt || profile.updated_at || null,
  buckets: (profile.buckets || createDefaultAllocationBuckets()).map(normalizeBucket),
  funds: (profile.funds || []).map(normalizeFund),
  defaultFundByType: { ...(profile.defaultFundByType || {}) },
})

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
      return {
        positionId: fund.positionId,
        assetType: fund.assetType || guessAllocationAssetType(position),
        status: fund.status || ALLOCATION_FUND_STATUSES.KEEP,
        position,
        marketValue,
      }
    })
    .filter(Boolean)
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
  const occupancyMap = buildAllocationOccupancyMap(allProfiles.length ? allProfiles : [profile], positions)

  const fundRowsWithPct = fundRows.map(item => ({
    ...item,
    portfolioPct: totalMarketValue > 0 ? round2(item.marketValue / totalMarketValue * 100) : 0,
    occupancy: getPositionOccupancy(occupancyMap, item.position),
  }))

  const bucketSummaries = ALLOCATION_ASSET_TYPE_ORDER.map(assetType => {
    const bucket = bucketMap.get(assetType)
    const funds = fundRowsWithPct.filter(item => item.assetType === assetType)
    const marketValue = round2(funds.reduce((sum, item) => sum + item.marketValue, 0))
    const currentPct = totalMarketValue > 0 ? round2(marketValue / totalMarketValue * 100) : 0
    const deviationPct = round2(currentPct - bucket.targetPct)
    const status = getBucketStatus({ currentPct, targetPct: bucket.targetPct, maxDeviationPct: bucket.maxDeviationPct })
    return {
      ...bucket,
      label: ALLOCATION_ASSET_TYPE_LABELS[assetType],
      marketValue,
      currentPct,
      deviationPct,
      status,
      funds,
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
  const uncoveredMarketValue = round2(uncoveredPositions.reduce((sum, position) => sum + getPositionMarketValue(position), 0))

  return {
    profile,
    totalMarketValue,
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
  const totalMarketValue = summary.totalMarketValue
  const investAmount = round2(newCashAmount)
  const postInvestMarketValue = round2(totalMarketValue + investAmount)

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
