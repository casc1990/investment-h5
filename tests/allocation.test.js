import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  ALLOCATION_ASSET_TYPES,
  ALLOCATION_FUND_STATUSES,
  applyAllocationBucketSelection,
  buildAllocationProfitTrend,
  buildAllocationBucketDailyProfitTrend,
  buildPositionAllocationStatusMap,
  buildAllocationSelectablePositions,
  createDefaultAllocationBuckets,
  buildAllocationDailyProfitTrend,
  buildAllocationOccupancyMap,
  getPositionOccupancy,
  buildAllocationProfileSummary,
  buildAllocationSuggestions,
  filterConfiguredAllocationBuckets,
  getAllocationPositionOwnerText,
  guessAllocationAssetType,
  normalizeAllocationProfile,
  isAllocationBucketConfigured,
} from '../src/utils/allocation.js'

const positions = [
  {
    id: 'p1',
    fund_code: '110020',
    fund_name: '易方达纯债债券A',
    account_id: 'jd',
    account_name: '京东金融',
    member_id: 'm1',
    member_name: '爸爸',
    cost: 10000,
    current_profit: 500,
    yesterday_profit: 100,
  },
  {
    id: 'p2',
    fund_code: '006551',
    fund_name: '某某固收增强一年持有A',
    account_id: 'ali',
    account_name: '支付宝',
    cost: 8000,
    current_profit: 400,
    yesterday_profit: -50,
  },
  {
    id: 'p3',
    fund_code: '515180',
    fund_name: '中证红利ETF联接A',
    account_id: 'jd',
    account_name: '京东金融',
    cost: 9000,
    current_profit: 200,
    yesterday_profit: 20,
  },
  {
    id: 'p4',
    fund_code: '161017',
    fund_name: '富国中证500指数增强',
    account_id: 'ali',
    account_name: '支付宝',
    cost: 9000,
    current_profit: 0,
    yesterday_profit: 0,
  },
  {
    id: 'p5',
    fund_code: '019118',
    fund_name: '广发纳斯达克100指数(QDII)A',
    account_id: 'ali',
    account_name: '支付宝',
    cost: 12000,
    current_profit: 2000,
    yesterday_profit: 200,
  },
  {
    id: 'p6',
    fund_code: '009999',
    fund_name: '主题成长混合A',
    account_id: 'jd',
    account_name: '京东金融',
    cost: 6000,
    current_profit: -300,
    yesterday_profit: -30,
  },
]

const profile = {
  id: 'steady',
  name: '稳健配置',
  totalAsset: 80000,
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

test('资产配置方案默认包含目标收益率字段，未填写时默认为0', () => {
  const normalized = normalizeAllocationProfile({
    id: 'target-rate',
    name: '目标收益率测试',
    totalAsset: 100000,
    buckets: createDefaultAllocationBuckets(),
  })

  assert.equal(normalized.targetProfitRate, 0)

  const withValue = normalizeAllocationProfile({
    id: 'target-rate-2',
    name: '目标收益率测试2',
    totalAsset: 100000,
    targetProfitRate: 8.888,
    buckets: createDefaultAllocationBuckets(),
  })

  assert.equal(withValue.targetProfitRate, 8.89)
})

test('策略编辑保存会保留服务端版本号并显示保存中状态', () => {
  const source = readFileSync(new URL('../src/views/Allocation.vue', import.meta.url), 'utf8')
  assert.match(source, /version: Number\(profile\.version \|\| 0\)/)
  assert.match(source, /version: Number\(profileDraft\.value\.version \|\| 0\)/)
  assert.match(source, /loading-text="保存中\.\.\."/)
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
  assert.equal(summary.allocationBaseMarketValue, 80000)
  assert.equal(summary.coveredPositionCount, 6)
  assert.equal(summary.totalProfit, 2800)
  assert.equal(summary.totalProfitRate, 5.19)
  assert.equal(summary.totalDailyProfit, 240)
  assert.equal(summary.totalDailyProfitRate, 0.42)
  assert.equal(summary.uncoveredMarketValue, 23200)

  const pureBondBucket = summary.bucketSummaries.find(item => item.assetType === ALLOCATION_ASSET_TYPES.PURE_BOND)
  assert.equal(pureBondBucket.currentPct, 13.13)
  assert.equal(pureBondBucket.targetAmount, 24000)
  assert.equal(pureBondBucket.deviationPct, -16.87)
  assert.equal(pureBondBucket.deviationAmount, -13500)
  assert.equal(pureBondBucket.status, 'low')
  assert.equal(pureBondBucket.totalProfit, 500)
  assert.equal(pureBondBucket.totalProfitRate, 5)
  assert.equal(pureBondBucket.dailyProfit, 100)
  assert.equal(pureBondBucket.dailyProfitRate, 0.96)

  const qdiiBucket = summary.bucketSummaries.find(item => item.assetType === ALLOCATION_ASSET_TYPES.QDII)
  assert.equal(qdiiBucket.currentPct, 17.5)
  assert.equal(qdiiBucket.targetAmount, 8000)
  assert.equal(qdiiBucket.deviationPct, 7.5)
  assert.equal(qdiiBucket.deviationAmount, 6000)
  assert.equal(qdiiBucket.status, 'high')
  assert.equal(qdiiBucket.dailyProfit, 200)
  assert.equal(qdiiBucket.dailyProfitRate, 1.45)

  const redFund = summary.fundRows.find(item => item.positionId === 'p3')
  assert.equal(redFund.portfolioPct, 11.5)
  assert.equal(redFund.assetBucketPct, 100)
  assert.equal(redFund.status, ALLOCATION_FUND_STATUSES.REDUCE)
  assert.equal(redFund.currentProfit, 200)
  assert.equal(redFund.dailyProfit, 20)
  assert.equal(redFund.dailyProfitRate, 0.22)
  assert.equal(redFund.totalProfitRate, 2.22)
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
  assert.equal(pureBondSuggestion.recommendedAmount, 4200)
  assert.equal(pureBondSuggestion.recommendedFunds[0].positionId, 'p1')
  assert.equal(pureBondSuggestion.recommendedFunds[0].status, ALLOCATION_FUND_STATUSES.KEEP)

  const fixedIncomeSuggestion = suggestions.recommendedCategories.find(item => item.assetType === ALLOCATION_ASSET_TYPES.FIXED_INCOME)
  assert.equal(fixedIncomeSuggestion.recommendedFunds[0].status, ALLOCATION_FUND_STATUSES.WATCH)
  assert.match(fixedIncomeSuggestion.recommendedFunds[0].reason, /观察/)

  const qdiiAdjustment = suggestions.rebalanceCategories.find(item => item.assetType === ALLOCATION_ASSET_TYPES.QDII)
  assert.equal(suggestions.rebalanceCategories.length, 1)
  assert.equal(qdiiAdjustment.currentPct, 17.5)
  assert.equal(qdiiAdjustment.candidateFunds[0].positionId, 'p5')
  assert.equal(qdiiAdjustment.candidateFunds[0].status, ALLOCATION_FUND_STATUSES.FORBID_BUY)
})

test('仅展示已配置的方案分类：目标比例大于0或已纳入基金时才显示', () => {
  const profileWithPartialBuckets = normalizeAllocationProfile({
    id: 'partial',
    name: '部分分类',
    buckets: [
      { assetType: ALLOCATION_ASSET_TYPES.PURE_BOND, targetPct: 50, maxDeviationPct: 5 },
      { assetType: ALLOCATION_ASSET_TYPES.QDII, targetPct: 0, maxDeviationPct: 0 },
      { assetType: ALLOCATION_ASSET_TYPES.OTHER, targetPct: 0, maxDeviationPct: 0 },
    ],
    funds: [
      { positionId: 'p5', assetType: ALLOCATION_ASSET_TYPES.QDII, status: ALLOCATION_FUND_STATUSES.KEEP },
    ],
  })

  const visibleAssetTypes = profileWithPartialBuckets.buckets
    .filter(bucket => isAllocationBucketConfigured({ bucket, funds: profileWithPartialBuckets.funds }))
    .map(bucket => bucket.assetType)

  assert.deepEqual(visibleAssetTypes, [ALLOCATION_ASSET_TYPES.PURE_BOND, ALLOCATION_ASSET_TYPES.QDII])
})

test('配置统计卡片也只展示已配置分类，后续增加策略比例后会自动出现', () => {
  const partialProfile = normalizeAllocationProfile({
    id: 'summary-visible',
    name: '统计卡片显示测试',
    totalAsset: 50000,
    buckets: [
      { assetType: ALLOCATION_ASSET_TYPES.PURE_BOND, targetPct: 60, maxDeviationPct: 5 },
      { assetType: ALLOCATION_ASSET_TYPES.QDII, targetPct: 0, maxDeviationPct: 0 },
      { assetType: ALLOCATION_ASSET_TYPES.OTHER, targetPct: 0, maxDeviationPct: 0 },
    ],
    funds: [
      { positionId: 'p1', assetType: ALLOCATION_ASSET_TYPES.PURE_BOND, status: ALLOCATION_FUND_STATUSES.KEEP },
    ],
  })

  const partialSummary = buildAllocationProfileSummary({ profile: partialProfile, positions })
  const visibleBefore = filterConfiguredAllocationBuckets({
    buckets: partialSummary.bucketSummaries,
    funds: partialProfile.funds,
  }).map(bucket => bucket.assetType)

  assert.deepEqual(visibleBefore, [ALLOCATION_ASSET_TYPES.PURE_BOND])

  const updatedProfile = normalizeAllocationProfile({
    ...partialProfile,
    buckets: partialProfile.buckets.map(bucket => (
      bucket.assetType === ALLOCATION_ASSET_TYPES.QDII
        ? { ...bucket, targetPct: 15 }
        : bucket
    )),
  })

  const updatedSummary = buildAllocationProfileSummary({ profile: updatedProfile, positions })
  const visibleAfter = filterConfiguredAllocationBuckets({
    buckets: updatedSummary.bucketSummaries,
    funds: updatedProfile.funds,
  }).map(bucket => bucket.assetType)

  assert.deepEqual(visibleAfter, [ALLOCATION_ASSET_TYPES.PURE_BOND, ALLOCATION_ASSET_TYPES.QDII])
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

test('基金选择页候选列表优先显示当前分类已纳入和系统匹配的基金，并标记其他方案占用', () => {
  const profiles = [
    profile,
    {
      id: 'other',
      name: '其他方案',
      buckets: createDefaultAllocationBuckets(),
      funds: [
        { positionId: 'p5', assetType: ALLOCATION_ASSET_TYPES.QDII, status: ALLOCATION_FUND_STATUSES.KEEP },
      ],
    },
  ]

  const selectable = buildAllocationSelectablePositions({
    positions,
    profiles,
    currentProfile: profile,
    assetType: ALLOCATION_ASSET_TYPES.PURE_BOND,
  })

  assert.equal(selectable[0].position.id, 'p1')
  assert.equal(selectable[0].includedInCurrentBucket, true)
  assert.equal(selectable[0].guessMatched, true)

  const lockedQdii = selectable.find(item => item.position.id === 'p5')
  assert.equal(lockedQdii.lockedByOtherProfile, true)
  assert.equal(lockedQdii.selectionDisabled, true)
})

test('基金选择页中已加入当前策略其他类别的基金会被置灰禁选', () => {
  const selectable = buildAllocationSelectablePositions({
    positions,
    profiles: [profile],
    currentProfile: profile,
    assetType: ALLOCATION_ASSET_TYPES.PURE_BOND,
  })

  const fixedIncomeFund = selectable.find(item => item.position.id === 'p2')
  assert.equal(fixedIncomeFund.includedInCurrentProfile, true)
  assert.equal(fixedIncomeFund.includedInCurrentBucket, false)
  assert.equal(fixedIncomeFund.selectionDisabled, true)
  assert.equal(fixedIncomeFund.lockedByCurrentProfileOtherBucket, true)
})

test('同一类别基金持仓分布会输出金额占比用于饼图展示', () => {
  const multiFundProfile = {
    ...profile,
    funds: [
      { positionId: 'p1', assetType: ALLOCATION_ASSET_TYPES.PURE_BOND, status: ALLOCATION_FUND_STATUSES.KEEP },
      { positionId: 'p6', assetType: ALLOCATION_ASSET_TYPES.PURE_BOND, status: ALLOCATION_FUND_STATUSES.KEEP },
    ],
  }

  const summary = buildAllocationProfileSummary({ profile: multiFundProfile, positions })
  const pureBondBucket = summary.bucketSummaries.find(item => item.assetType === ALLOCATION_ASSET_TYPES.PURE_BOND)

  assert.equal(pureBondBucket.funds.length, 2)
  assert.equal(pureBondBucket.holdingDistribution.length, 2)
  assert.deepEqual(
    pureBondBucket.holdingDistribution.map(item => ({ positionId: item.positionId, amountPct: item.amountPct })),
    [
      { positionId: 'p1', amountPct: 64.81 },
      { positionId: 'p6', amountPct: 35.19 },
    ]
  )
})

test('策略收益率趋势会基于快照生成累计收益率曲线，并带目标收益率参照值', () => {
  const snapshots = [
    {
      date: '2026-06-26',
      positions: [
        { id: 'p1', cost: 10000, current_profit: 700 },
        { id: 'p2', cost: 8000, current_profit: 600 },
        { id: 'outside', cost: 5000, current_profit: 1000 },
      ],
    },
    {
      date: '2026-06-25',
      positions: [
        { id: 'p1', cost: 10000, current_profit: 400 },
        { id: 'p2', cost: 8000, current_profit: 500 },
      ],
    },
    {
      date: '2026-06-24',
      positions: [
        { id: 'p1', cost: 10000, current_profit: 300 },
        { id: 'p2', cost: 8000, current_profit: -100 },
      ],
    },
  ]

  const trend = buildAllocationProfitTrend({
    profile: {
      ...profile,
      targetProfitRate: 8,
      funds: [
        { positionId: 'p1', assetType: ALLOCATION_ASSET_TYPES.PURE_BOND, status: ALLOCATION_FUND_STATUSES.KEEP },
        { positionId: 'p2', assetType: ALLOCATION_ASSET_TYPES.FIXED_INCOME, status: ALLOCATION_FUND_STATUSES.KEEP },
      ],
    },
    snapshots,
  })

  assert.equal(trend.length, 3)
  assert.deepEqual(trend.map(item => item.date), ['2026-06-24', '2026-06-25', '2026-06-26'])
  assert.deepEqual(trend.map(item => item.value), [1.11, 5, 7.22])
  assert.ok(trend.every(item => item.targetProfitRate === 8))
  assert.equal(trend[2].totalProfit, 1300)
  assert.equal(trend[2].totalCost, 18000)
})

test('策略详情每日收益统计会汇总所有已纳入基金的当日总收益', () => {
  const snapshots = [
    {
      date: '2026-06-24',
      positions: [
        { id: 'p1', yesterday_profit: 80 },
        { id: 'p4', daily_profit: -20 },
        { id: 'p5', totalYesterdayProfit: 150 },
      ],
    },
    {
      date: '2026-06-25',
      positions: [
        { id: 'p1', yesterday_profit: 120 },
        { id: 'p4', daily_profit: 30 },
        { id: 'p5', totalYesterdayProfit: -50 },
      ],
    },
    {
      date: '2026-06-26',
      positions: [
        { id: 'p1', yesterday_profit: 60 },
        { id: 'p4', daily_profit: 10 },
        { id: 'p5', totalYesterdayProfit: 90 },
        { id: 'outside', yesterday_profit: 999 },
      ],
    },
  ]

  const series = buildAllocationDailyProfitTrend({
    profile: {
      ...profile,
      funds: [
        { positionId: 'p1', assetType: ALLOCATION_ASSET_TYPES.PURE_BOND, status: ALLOCATION_FUND_STATUSES.KEEP },
        { positionId: 'p4', assetType: ALLOCATION_ASSET_TYPES.INDEX, status: ALLOCATION_FUND_STATUSES.KEEP },
        { positionId: 'p5', assetType: ALLOCATION_ASSET_TYPES.QDII, status: ALLOCATION_FUND_STATUSES.KEEP },
      ],
    },
    snapshots,
  })

  assert.equal(series.length, 1)
  assert.equal(series[0].label, '每日总收益')
  assert.deepEqual(series[0].points.map(item => item.value), [210, 100, 160])
  assert.equal(series[0].points[2].raw.valuesByAssetType[ALLOCATION_ASSET_TYPES.QDII], 90)
})

test('策略详情可按类别生成每日收益多折线趋势图，有几类基金就输出几根线', () => {
  const snapshots = [
    {
      date: '2026-06-24',
      positions: [
        { id: 'p1', yesterday_profit: 80 },
        { id: 'p4', daily_profit: -20 },
        { id: 'p5', totalYesterdayProfit: 150 },
      ],
    },
    {
      date: '2026-06-25',
      positions: [
        { id: 'p1', yesterday_profit: 120 },
        { id: 'p4', daily_profit: 30 },
        { id: 'p5', totalYesterdayProfit: -50 },
      ],
    },
    {
      date: '2026-06-26',
      positions: [
        { id: 'p1', yesterday_profit: 60 },
        { id: 'p4', daily_profit: 10 },
        { id: 'p5', totalYesterdayProfit: 90 },
        { id: 'outside', yesterday_profit: 999 },
      ],
    },
  ]

  const series = buildAllocationBucketDailyProfitTrend({
    profile: {
      ...profile,
      funds: [
        { positionId: 'p1', assetType: ALLOCATION_ASSET_TYPES.PURE_BOND, status: ALLOCATION_FUND_STATUSES.KEEP },
        { positionId: 'p4', assetType: ALLOCATION_ASSET_TYPES.INDEX, status: ALLOCATION_FUND_STATUSES.KEEP },
        { positionId: 'p5', assetType: ALLOCATION_ASSET_TYPES.QDII, status: ALLOCATION_FUND_STATUSES.KEEP },
      ],
    },
    snapshots,
  })

  assert.deepEqual(series.map(item => item.assetType), [
    ALLOCATION_ASSET_TYPES.PURE_BOND,
    ALLOCATION_ASSET_TYPES.INDEX,
    ALLOCATION_ASSET_TYPES.QDII,
  ])
  assert.deepEqual(series.map(item => item.label), ['纯债基金', '指数类基金', '海外QDII基金'])
  assert.deepEqual(series[0].points.map(item => item.date), ['2026-06-24', '2026-06-25', '2026-06-26'])
  assert.deepEqual(series[0].points.map(item => item.value), [80, 120, 60])
  assert.deepEqual(series[1].points.map(item => item.value), [-20, 30, 10])
  assert.deepEqual(series[2].points.map(item => item.value), [150, -50, 90])
  assert.equal(series[2].points[2].raw.valuesByAssetType[ALLOCATION_ASSET_TYPES.QDII], 90)
})

test('批量保存分类选择时，会替换当前分类并保留已存在基金状态', () => {
  const nextProfile = applyAllocationBucketSelection({
    profile,
    assetType: ALLOCATION_ASSET_TYPES.PURE_BOND,
    selectedPositionIds: ['p1', 'p6'],
  })

  const pureBondFunds = nextProfile.funds.filter(item => item.assetType === ALLOCATION_ASSET_TYPES.PURE_BOND)
  assert.deepEqual(pureBondFunds.map(item => item.positionId).sort(), ['p1', 'p6'])

  const movedFund = nextProfile.funds.find(item => item.positionId === 'p6')
  assert.equal(movedFund.status, ALLOCATION_FUND_STATUSES.KEEP)

  const removedOldBucketFund = nextProfile.funds.find(item => item.positionId === 'p2')
  assert.equal(removedOldBucketFund.assetType, ALLOCATION_ASSET_TYPES.FIXED_INCOME)
})

test('配置建议详情可按分类拆出补仓与调仓数据', () => {
  const suggestions = buildAllocationSuggestions({
    profile,
    positions,
    newCashAmount: 10000,
  })

  const pureBondRecommendation = suggestions.recommendedCategories.find(item => item.assetType === ALLOCATION_ASSET_TYPES.PURE_BOND)
  const pureBondRebalance = suggestions.rebalanceCategories.find(item => item.assetType === ALLOCATION_ASSET_TYPES.PURE_BOND)
  assert.equal(pureBondRecommendation.recommendedAmount, 4200)
  assert.equal(pureBondRebalance, undefined)

  const qdiiRecommendation = suggestions.recommendedCategories.find(item => item.assetType === ALLOCATION_ASSET_TYPES.QDII)
  const qdiiRebalance = suggestions.rebalanceCategories.find(item => item.assetType === ALLOCATION_ASSET_TYPES.QDII)
  assert.equal(qdiiRecommendation, undefined)
  assert.equal(qdiiRebalance.candidateFunds[0].positionId, 'p5')
  assert.equal(qdiiRebalance.deviationPct, 7.5)
})

test('基金归类页面可输出用户与账户文案', () => {
  assert.equal(getAllocationPositionOwnerText(positions[0]), '用户：爸爸 · 账户：京东金融')
  assert.equal(getAllocationPositionOwnerText({}), '用户：未分配用户 · 账户：未命名账户')
})

test('持仓页可按 positionId 复用策略状态，未纳入策略的持仓不生成状态', () => {
  const statusMap = buildPositionAllocationStatusMap([profile])

  assert.deepEqual(statusMap.get('p1'), {
    profileId: profile.id,
    profileName: profile.name,
    assetType: ALLOCATION_ASSET_TYPES.PURE_BOND,
    status: ALLOCATION_FUND_STATUSES.KEEP,
    label: ALLOCATION_FUND_STATUSES.KEEP,
    conflict: false,
    entries: [{
      profileId: profile.id,
      profileName: profile.name,
      assetType: ALLOCATION_ASSET_TYPES.PURE_BOND,
      status: ALLOCATION_FUND_STATUSES.KEEP,
    }],
  })
  assert.equal(statusMap.has('not-configured'), false)
})

test('同一持仓异常出现在多个策略时标记多策略冲突', () => {
  const statusMap = buildPositionAllocationStatusMap([
    profile,
    {
      ...profile,
      id: 'strategy-2',
      name: '第二策略',
      funds: [{
        positionId: 'p1',
        assetType: ALLOCATION_ASSET_TYPES.PURE_BOND,
        status: ALLOCATION_FUND_STATUSES.WATCH,
      }],
    },
  ])

  assert.equal(statusMap.get('p1').label, '多策略')
  assert.equal(statusMap.get('p1').conflict, true)
  assert.equal(statusMap.get('p1').entries.length, 2)
})

test('分类基金持仓页顶部摘要使用新的收益与配比文案', () => {
  const file = readFileSync(new URL('../src/views/AllocationBucketHoldings.vue', import.meta.url), 'utf8')

  assert.match(file, /总收益\/率/)
  assert.match(file, /当前配比/)
  assert.match(file, /目标配比/)
  assert.match(file, /昨日收益\/率/)
  assert.doesNotMatch(file, /当前总收益率/)
  assert.doesNotMatch(file, /当前占比/)
  assert.doesNotMatch(file, /目标占比/)
})

test('策略详情趋势区使用顶部双 Tab 切换，并把分类趋势改成每日总收益统计日历', () => {
  const file = readFileSync(new URL('../src/views/Allocation.vue', import.meta.url), 'utf8')

  assert.match(file, /allocation-trend-tabs/)
  assert.match(file, /累计收益率统计/)
  assert.match(file, /每日收益统计/)
  assert.match(file, /buildAllocationDailyProfitTrend/)
  assert.match(file, /AllocationBucketProfitCalendar/)
  assert.doesNotMatch(file, /分类每日收益统计/)
})

test('分类每日收益趋势图组件按日期对齐各分类坐标，避免其他分类挤成左侧竖线', () => {
  const file = readFileSync(new URL('../src/components/AllocationBucketDailyTrendChart.vue', import.meta.url), 'utf8')

  assert.match(file, /const getAxisKey = \(point = \{\}\) => String\(point\.date/)
  assert.match(file, /key: point\.axisKey/)
  assert.match(file, /xMap\.value\.get\(point\.axisKey\)/)
  assert.match(file, /find\(item => item\.axisKey === selectedRow\.value\.key\)/)
})

test('分类收益日历组件支持单序列展示并压缩大额数值，避免日期区域拥挤', () => {
  const file = readFileSync(new URL('../src/components/AllocationBucketProfitCalendar.vue', import.meta.url), 'utf8')

  assert.match(file, /showCategoryTabs/)
  assert.match(file, /if \(abs >= 1000\)/)
  assert.match(file, /text-overflow: ellipsis/)
  assert.match(file, /@media \(max-width: 390px\)/)
})

test('分类基金持仓页把当前类别趋势改成每日收益统计日历风格', () => {
  const file = readFileSync(new URL('../src/views/AllocationBucketHoldings.vue', import.meta.url), 'utf8')

  assert.match(file, /AllocationBucketProfitCalendar/)
  assert.match(file, /当前类别每日收益统计/)
  assert.match(file, /assetTypes: \[assetType\.value\]/)
  assert.match(file, /summary-label="每日收益统计"/)
  assert.doesNotMatch(file, /AllocationBucketDailyTrendChart/)
})
