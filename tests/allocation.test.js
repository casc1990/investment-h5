import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ALLOCATION_ASSET_TYPES,
  ALLOCATION_FUND_STATUSES,
  createDefaultAllocationBuckets,
  buildAllocationOccupancyMap,
  getPositionOccupancy,
  buildAllocationProfileSummary,
  buildAllocationSuggestions,
  guessAllocationAssetType,
} from '../src/utils/allocation.js'

const positions = [
  {
    id: 'p1',
    fund_code: '110020',
    fund_name: '易方达纯债债券A',
    account_id: 'jd',
    account_name: '京东金融',
    cost: 10000,
    current_profit: 500,
  },
  {
    id: 'p2',
    fund_code: '006551',
    fund_name: '某某固收增强一年持有A',
    account_id: 'ali',
    account_name: '支付宝',
    cost: 8000,
    current_profit: 400,
  },
  {
    id: 'p3',
    fund_code: '515180',
    fund_name: '中证红利ETF联接A',
    account_id: 'jd',
    account_name: '京东金融',
    cost: 9000,
    current_profit: 200,
  },
  {
    id: 'p4',
    fund_code: '161017',
    fund_name: '富国中证500指数增强',
    account_id: 'ali',
    account_name: '支付宝',
    cost: 9000,
    current_profit: 0,
  },
  {
    id: 'p5',
    fund_code: '019118',
    fund_name: '广发纳斯达克100指数(QDII)A',
    account_id: 'ali',
    account_name: '支付宝',
    cost: 12000,
    current_profit: 2000,
  },
  {
    id: 'p6',
    fund_code: '009999',
    fund_name: '主题成长混合A',
    account_id: 'jd',
    account_name: '京东金融',
    cost: 6000,
    current_profit: -300,
  },
]

const profile = {
  id: 'steady',
  name: '稳健配置',
  buckets: [
    { assetType: ALLOCATION_ASSET_TYPES.PURE_BOND, targetPct: 30, maxDeviationPct: 5 },
    { assetType: ALLOCATION_ASSET_TYPES.FIXED_INCOME, targetPct: 20, maxDeviationPct: 5 },
    { assetType: ALLOCATION_ASSET_TYPES.DIVIDEND, targetPct: 10, maxDeviationPct: 3 },
    { assetType: ALLOCATION_ASSET_TYPES.INDEX, targetPct: 20, maxDeviationPct: 4 },
    { assetType: ALLOCATION_ASSET_TYPES.QDII, targetPct: 10, maxDeviationPct: 2 },
    { assetType: ALLOCATION_ASSET_TYPES.OTHER, targetPct: 10, maxDeviationPct: 3 },
  ],
  funds: [
    { positionId: 'p1', assetType: ALLOCATION_ASSET_TYPES.PURE_BOND, status: ALLOCATION_FUND_STATUSES.KEEP },
    { positionId: 'p2', assetType: ALLOCATION_ASSET_TYPES.FIXED_INCOME, status: ALLOCATION_FUND_STATUSES.WATCH },
    { positionId: 'p3', assetType: ALLOCATION_ASSET_TYPES.DIVIDEND, status: ALLOCATION_FUND_STATUSES.REDUCE },
    { positionId: 'p4', assetType: ALLOCATION_ASSET_TYPES.INDEX, status: ALLOCATION_FUND_STATUSES.KEEP },
    { positionId: 'p5', assetType: ALLOCATION_ASSET_TYPES.QDII, status: ALLOCATION_FUND_STATUSES.FORBID_BUY },
    { positionId: 'p6', assetType: ALLOCATION_ASSET_TYPES.OTHER, status: ALLOCATION_FUND_STATUSES.KEEP },
  ],
  defaultFundByType: {
    [ALLOCATION_ASSET_TYPES.INDEX]: 'p4',
    [ALLOCATION_ASSET_TYPES.QDII]: 'p5',
  },
}

test('默认资产配置桶覆盖六类基金且目标比例初始为0', () => {
  const buckets = createDefaultAllocationBuckets()

  assert.equal(buckets.length, 6)
  assert.deepEqual(
    buckets.map(item => item.assetType),
    [
      ALLOCATION_ASSET_TYPES.PURE_BOND,
      ALLOCATION_ASSET_TYPES.FIXED_INCOME,
      ALLOCATION_ASSET_TYPES.DIVIDEND,
      ALLOCATION_ASSET_TYPES.INDEX,
      ALLOCATION_ASSET_TYPES.QDII,
      ALLOCATION_ASSET_TYPES.OTHER,
    ]
  )
  assert.ok(buckets.every(item => item.targetPct === 0 && item.maxDeviationPct === 0))
})

test('基金自动分类可识别纯债、固收、红利、指数、QDII与其他', () => {
  assert.equal(guessAllocationAssetType(positions[0]), ALLOCATION_ASSET_TYPES.PURE_BOND)
  assert.equal(guessAllocationAssetType(positions[1]), ALLOCATION_ASSET_TYPES.FIXED_INCOME)
  assert.equal(guessAllocationAssetType(positions[2]), ALLOCATION_ASSET_TYPES.DIVIDEND)
  assert.equal(guessAllocationAssetType(positions[3]), ALLOCATION_ASSET_TYPES.INDEX)
  assert.equal(guessAllocationAssetType(positions[4]), ALLOCATION_ASSET_TYPES.QDII)
  assert.equal(guessAllocationAssetType(positions[5]), ALLOCATION_ASSET_TYPES.OTHER)
})

test('同账户同基金在多个方案中会被占用映射识别', () => {
  const profiles = [
    profile,
    {
      id: 'growth',
      name: '进取配置',
      buckets: createDefaultAllocationBuckets(),
      funds: [
        { positionId: 'p3', assetType: ALLOCATION_ASSET_TYPES.DIVIDEND, status: ALLOCATION_FUND_STATUSES.KEEP },
      ],
    },
  ]

  const occupancyMap = buildAllocationOccupancyMap(profiles, positions)
  const occupied = getPositionOccupancy(occupancyMap, positions[2])

  assert.equal(occupied.length, 2)
  assert.deepEqual(occupied.map(item => item.profileName), ['稳健配置', '进取配置'])
})

test('资产配置汇总会按目标比例、允许偏差输出类别状态与基金占比', () => {
  const summary = buildAllocationProfileSummary({ profile, positions })

  assert.equal(summary.totalMarketValue, 56800)
  assert.equal(summary.coveredPositionCount, 6)
  assert.equal(summary.uncoveredMarketValue, 0)

  const pureBondBucket = summary.bucketSummaries.find(item => item.assetType === ALLOCATION_ASSET_TYPES.PURE_BOND)
  assert.equal(pureBondBucket.currentPct, 18.49)
  assert.equal(pureBondBucket.status, 'low')

  const qdiiBucket = summary.bucketSummaries.find(item => item.assetType === ALLOCATION_ASSET_TYPES.QDII)
  assert.equal(qdiiBucket.currentPct, 24.65)
  assert.equal(qdiiBucket.status, 'high')

  const redFund = summary.fundRows.find(item => item.positionId === 'p3')
  assert.equal(redFund.portfolioPct, 16.2)
  assert.equal(redFund.assetBucketPct, 100)
  assert.equal(redFund.status, ALLOCATION_FUND_STATUSES.REDUCE)
})

test('配置建议会结合新增资金、超低配类别和基金状态给出买入与调仓提示', () => {
  const suggestions = buildAllocationSuggestions({
    profile,
    positions,
    newCashAmount: 10000,
  })

  assert.equal(suggestions.recommendedCategories.length, 4)
  assert.deepEqual(
    suggestions.recommendedCategories.map(item => item.assetType),
    [
      ALLOCATION_ASSET_TYPES.PURE_BOND,
      ALLOCATION_ASSET_TYPES.FIXED_INCOME,
      ALLOCATION_ASSET_TYPES.INDEX,
      ALLOCATION_ASSET_TYPES.OTHER,
    ]
  )

  const pureBondSuggestion = suggestions.recommendedCategories[0]
  assert.equal(pureBondSuggestion.recommendedAmount, 4800)
  assert.equal(pureBondSuggestion.recommendedFunds[0].positionId, 'p1')
  assert.equal(pureBondSuggestion.recommendedFunds[0].status, ALLOCATION_FUND_STATUSES.KEEP)

  const fixedIncomeSuggestion = suggestions.recommendedCategories.find(item => item.assetType === ALLOCATION_ASSET_TYPES.FIXED_INCOME)
  assert.equal(fixedIncomeSuggestion.recommendedFunds[0].status, ALLOCATION_FUND_STATUSES.WATCH)
  assert.match(fixedIncomeSuggestion.recommendedFunds[0].reason, /观察/)

  const qdiiAdjustment = suggestions.rebalanceCategories.find(item => item.assetType === ALLOCATION_ASSET_TYPES.QDII)
  assert.equal(qdiiAdjustment.currentPct, 24.65)
  assert.equal(qdiiAdjustment.candidateFunds[0].positionId, 'p5')
  assert.equal(qdiiAdjustment.candidateFunds[0].status, ALLOCATION_FUND_STATUSES.FORBID_BUY)

  const dividendAdjustment = suggestions.rebalanceCategories.find(item => item.assetType === ALLOCATION_ASSET_TYPES.DIVIDEND)
  assert.equal(dividendAdjustment.candidateFunds[0].positionId, 'p3')
  assert.equal(dividendAdjustment.candidateFunds[0].status, ALLOCATION_FUND_STATUSES.REDUCE)
})

test('当类别下没有可买基金时，只输出类别级建议不强落到基金', () => {
  const qdiiOnlyProfile = {
    id: 'qdii',
    name: 'QDII测试',
    buckets: [
      { assetType: ALLOCATION_ASSET_TYPES.PURE_BOND, targetPct: 0, maxDeviationPct: 0 },
      { assetType: ALLOCATION_ASSET_TYPES.FIXED_INCOME, targetPct: 0, maxDeviationPct: 0 },
      { assetType: ALLOCATION_ASSET_TYPES.DIVIDEND, targetPct: 0, maxDeviationPct: 0 },
      { assetType: ALLOCATION_ASSET_TYPES.INDEX, targetPct: 0, maxDeviationPct: 0 },
      { assetType: ALLOCATION_ASSET_TYPES.QDII, targetPct: 100, maxDeviationPct: 0 },
      { assetType: ALLOCATION_ASSET_TYPES.OTHER, targetPct: 0, maxDeviationPct: 0 },
    ],
    funds: [
      { positionId: 'p5', assetType: ALLOCATION_ASSET_TYPES.QDII, status: ALLOCATION_FUND_STATUSES.FORBID_BUY },
    ],
    defaultFundByType: {
      [ALLOCATION_ASSET_TYPES.QDII]: 'p5',
    },
  }

  const suggestions = buildAllocationSuggestions({
    profile: qdiiOnlyProfile,
    positions,
    newCashAmount: 5000,
  })

  assert.equal(suggestions.recommendedCategories.length, 1)
  assert.equal(suggestions.recommendedCategories[0].assetType, ALLOCATION_ASSET_TYPES.QDII)
  assert.equal(suggestions.recommendedCategories[0].recommendedFunds.length, 0)
  assert.match(suggestions.recommendedCategories[0].reason, /暂无可买基金/)
})
