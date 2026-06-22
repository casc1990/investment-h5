import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDailyHistoryRows,
  buildPeriodHistoryRows,
  buildTrendSeries,
  buildDisplayTrendSeries,
  buildMemberFilterOptions,
  buildAccountFilterOptions,
  buildFundTypeFilterOptions,
  buildFundSelectorOptions,
  buildCurrentFundRows,
  getNextLoopDisplayCount,
  getDailyProfitUpdateStatus,
} from '../src/utils/statsHistory.js'

const snapshots = [
  {
    date: '2026-05-30',
    summary: {
      totalMarketValue: 4200,
      totalHoldingProfit: 420,
      totalProfitRate: 11.11,
      totalYesterdayProfit: 40,
    },
    positions: [
      { fund_code: 'A', account_id: 'jd', account_name: '京东金融', member_id: 'me', member_name: '本人', cost: 1000, current_profit: 100, yesterday_profit: 10, nav_jzrq: '2026-05-30' },
      { fund_code: 'B', account_id: 'ali', account_name: '支付宝-182', member_id: 'me', member_name: '本人', cost: 1700, current_profit: 200, yesterday_profit: 20, nav_jzrq: '2026-05-30' },
      { fund_code: 'C', account_id: 'wife', account_name: '家人账户', member_id: 'family', member_name: '家人', cost: 1800, current_profit: 120, yesterday_profit: 10, nav_jzrq: '2026-05-30' },
    ],
  },
  {
    date: '2026-05-31',
    summary: {
      totalMarketValue: 4390,
      totalHoldingProfit: 610,
      totalProfitRate: 16.13,
      totalYesterdayProfit: 70,
    },
    positions: [
      { fund_code: 'A', account_id: 'jd', account_name: '京东金融', member_id: 'me', member_name: '本人', cost: 1000, current_profit: 130, yesterday_profit: 30, nav_jzrq: '2026-05-31' },
      { fund_code: 'B', account_id: 'ali', account_name: '支付宝-182', member_id: 'me', member_name: '本人', cost: 1700, current_profit: 230, yesterday_profit: 30, nav_jzrq: '2026-05-31' },
      { fund_code: 'C', account_id: 'wife', account_name: '家人账户', member_id: 'family', member_name: '家人', cost: 1800, current_profit: 250, yesterday_profit: 10, nav_jzrq: '2026-05-31' },
    ],
  },
  {
    date: '2026-06-01',
    summary: {
      totalMarketValue: 4390,
      totalHoldingProfit: 610,
      totalProfitRate: 16.13,
      totalYesterdayProfit: 70,
    },
    positions: [
      { fund_code: 'A', account_id: 'jd', account_name: '京东金融', member_id: 'me', member_name: '本人', cost: 1000, current_profit: 130, yesterday_profit: 30, nav_jzrq: '2026-05-31' },
      { fund_code: 'B', account_id: 'ali', account_name: '支付宝-182', member_id: 'me', member_name: '本人', cost: 1700, current_profit: 230, yesterday_profit: 30, nav_jzrq: '2026-05-31' },
      { fund_code: 'C', account_id: 'wife', account_name: '家人账户', member_id: 'family', member_name: '家人', cost: 1800, current_profit: 250, yesterday_profit: 10, nav_jzrq: '2026-05-31' },
    ],
  },
  {
    date: '2026-06-02',
    summary: {
      totalMarketValue: 4600,
      totalHoldingProfit: 820,
      totalProfitRate: 21.69,
      totalYesterdayProfit: 44,
    },
    positions: [
      { fund_code: 'A', account_id: 'jd', account_name: '京东金融', member_id: 'me', member_name: '本人', cost: 1000, current_profit: 150, yesterday_profit: 20, nav_jzrq: '2026-06-02' },
      { fund_code: 'B', account_id: 'ali', account_name: '支付宝-182', member_id: 'me', member_name: '本人', cost: 1700, current_profit: 270, yesterday_profit: 4, nav_jzrq: '2026-06-02' },
      { fund_code: 'C', account_id: 'wife', account_name: '家人账户', member_id: 'family', member_name: '家人', cost: 1800, current_profit: 400, yesterday_profit: 20, nav_jzrq: '2026-06-02' },
    ],
  },
]

const longDailyRows = Array.from({ length: 120 }, (_, index) => {
  const date = new Date(2026, 0, 1)
  date.setDate(date.getDate() + index)
  const dateKey = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')

  return {
    date: dateKey,
    account_id: 'all',
    account_name: '全部账户',
    total_market_value: 1000 + (index * 10),
    total_profit: 100 + index,
    total_profit_rate: 10 + (index * 0.1),
    daily_profit: index % 7,
    daily_profit_rate: 0.5,
  }
})

test('按天历史行可输出全部账户汇总', () => {
  const rows = buildDailyHistoryRows(snapshots, { memberId: 'all', accountId: 'all' })

  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map(item => item.date), ['2026-06-02', '2026-05-31', '2026-05-30'])
  assert.equal(rows[0].account_name, '全部账户')
  assert.equal(rows[0].total_market_value, 4600)
  assert.equal(rows[0].total_profit, 820)
  assert.equal(rows[0].daily_profit, 44)
})

test('全部账户历史行优先使用基金昨日收益，不混入顾投昨日收益', () => {
  const mixedSnapshots = [
    {
      date: '2026-06-10',
      summary: {
        totalMarketValue: 10000,
        totalHoldingProfit: 800,
        totalProfitRate: 8,
        totalYesterdayProfit: 102.9,
        totalPositionYesterdayProfit: 156.66,
        totalAdvisoryYesterdayProfit: -53.76,
      },
      positions: [
        { id: 'fund-a', fund_code: 'A', account_id: 'jd', account_name: '京东', member_id: 'me', member_name: '本人', cost: 5000, current_profit: 300, yesterday_profit: 100, nav_jzrq: '2026-06-10' },
        { id: 'fund-b', fund_code: 'B', account_id: 'ali', account_name: '支付宝', member_id: 'me', member_name: '本人', cost: 3000, current_profit: 200, yesterday_profit: 56.66, nav_jzrq: '2026-06-10' },
        { id: 'advisory-1', fund_code: 'advisory-1', account_id: 'adv', account_name: '顾投', member_id: 'me', member_name: '本人', cost: 2000, current_profit: 300, yesterday_profit: -53.76, nav_jzrq: '2026-06-10' },
      ],
    },
  ]

  const rows = buildDailyHistoryRows(mixedSnapshots, { memberId: 'all', accountId: 'all' })

  assert.equal(rows[0].daily_profit, 156.66)
})

test('旧快照缺少基金昨日收益汇总字段时，会回退为仅累加基金昨日收益', () => {
  const legacySnapshots = [
    {
      date: '2026-06-10',
      summary: {
        totalMarketValue: 10000,
        totalHoldingProfit: 800,
        totalProfitRate: 8,
        totalYesterdayProfit: 102.9,
      },
      positions: [
        { id: 'fund-a', fund_code: 'A', account_id: 'jd', account_name: '京东', member_id: 'me', member_name: '本人', cost: 5000, current_profit: 300, yesterday_profit: 100, nav_jzrq: '2026-06-10' },
        { id: 'fund-b', fund_code: 'B', account_id: 'ali', account_name: '支付宝', member_id: 'me', member_name: '本人', cost: 3000, current_profit: 200, yesterday_profit: 56.66, nav_jzrq: '2026-06-10' },
        { id: 'advisory-1', fund_code: 'advisory-1', account_id: 'adv', account_name: '顾投', member_id: 'me', member_name: '本人', cost: 2000, current_profit: 300, yesterday_profit: -53.76, nav_jzrq: '2026-06-10' },
      ],
    },
  ]

  const rows = buildDailyHistoryRows(legacySnapshots, { memberId: 'all', accountId: 'all' })

  assert.equal(rows[0].daily_profit, 156.66)
})

test('基金日收益签名未变化的重复快照不会进入历史每日统计', () => {
  const rows = buildDailyHistoryRows(snapshots, { memberId: 'all', accountId: 'all' })

  assert.ok(rows.every(item => item.date !== '2026-06-01'))
})

test('QDII 在下一个交易日更新上一交易日收益时，会按实际净值日期入历史统计', () => {
  const qdiiSnapshots = [
    {
      date: '2026-05-23',
      summary: {
        totalMarketValue: 1000,
        totalHoldingProfit: 100,
        totalProfitRate: 11.11,
        totalYesterdayProfit: 0,
      },
      positions: [
        { id: 'q1', fund_code: '019118', fund_name: '纳指(QDII)', account_id: 'ali', account_name: '支付宝', member_id: 'me', member_name: '本人', cost: 900, current_profit: 100, yesterday_profit: 0, nav_dwjz: 1.2, nav_gsz: 1.2, nav_jzrq: '2026-05-21' },
      ],
    },
    {
      date: '2026-05-26',
      summary: {
        totalMarketValue: 1045,
        totalHoldingProfit: 145,
        totalProfitRate: 16.11,
        totalYesterdayProfit: 45,
      },
      positions: [
        { id: 'q1', fund_code: '019118', fund_name: '纳指(QDII)', account_id: 'ali', account_name: '支付宝', member_id: 'me', member_name: '本人', cost: 900, current_profit: 145, yesterday_profit: 45, nav_dwjz: 1.245, nav_gsz: 1.245, nav_jzrq: '2026-05-23' },
      ],
    },
    {
      date: '2026-05-27',
      summary: {
        totalMarketValue: 1045,
        totalHoldingProfit: 145,
        totalProfitRate: 16.11,
        totalYesterdayProfit: 45,
      },
      positions: [
        { id: 'q1', fund_code: '019118', fund_name: '纳指(QDII)', account_id: 'ali', account_name: '支付宝', member_id: 'me', member_name: '本人', cost: 900, current_profit: 145, yesterday_profit: 45, nav_dwjz: 1.245, nav_gsz: 1.245, nav_jzrq: '2026-05-23' },
      ],
    },
  ]

  const rows = buildDailyHistoryRows(qdiiSnapshots, { memberId: 'all', accountId: 'all' })

  assert.deepEqual(rows.map(item => item.date), ['2026-05-23', '2026-05-21'])
  assert.equal(rows[0].daily_profit, 45)
})

test('非交易日打开统计页时，应显示实际收益所属净值日期，而不是当天快照日期', () => {
  const staleSnapshots = [
    {
      date: '2026-06-20',
      summary: {
        totalMarketValue: 1000,
        totalHoldingProfit: 120,
        totalProfitRate: 13.64,
        totalPositionYesterdayProfit: 50,
      },
      positions: [
        { id: 'f1', fund_code: '110020', account_id: 'jd', account_name: '京东', member_id: 'me', member_name: '本人', cost: 880, current_profit: 120, yesterday_profit: 50, nav_dwjz: 1.2, nav_gsz: 1.2, nav_jzrq: '2026-06-18' },
      ],
    },
  ]

  const rows = buildDailyHistoryRows(staleSnapshots, { memberId: 'all', accountId: 'all' })

  assert.deepEqual(rows.map(item => item.date), ['2026-06-18'])
  assert.equal(rows[0].daily_profit, 50)
})

test('仅估算净值变化但日收益未更新时，不应把当天快照计入趋势图/历史日收益', () => {
  const intradaySnapshots = [
    {
      date: '2026-06-08',
      summary: {
        totalMarketValue: 1000,
        totalHoldingProfit: 100,
        totalProfitRate: 11.11,
        totalYesterdayProfit: 20,
      },
      positions: [
        { id: 'f1', fund_code: 'A', account_id: 'jd', account_name: '京东', member_id: 'me', member_name: '本人', cost: 900, current_profit: 100, yesterday_profit: 20, nav_dwjz: 1.2, nav_gsz: 1.2, nav_jzrq: '2026-06-08' },
      ],
    },
    {
      date: '2026-06-09',
      summary: {
        totalMarketValue: 1010,
        totalHoldingProfit: 110,
        totalProfitRate: 12.22,
        totalYesterdayProfit: 20,
      },
      positions: [
        { id: 'f1', fund_code: 'A', account_id: 'jd', account_name: '京东', member_id: 'me', member_name: '本人', cost: 900, current_profit: 110, yesterday_profit: 20, nav_dwjz: 1.2, nav_gsz: 1.21, nav_jzrq: '2026-06-08' },
      ],
    },
  ]

  const rows = buildDailyHistoryRows(intradaySnapshots, { memberId: 'all', accountId: 'all' })

  assert.deepEqual(rows.map(item => item.date), ['2026-06-08'])
})

test('按天历史行可按单账户过滤并重算收益率', () => {
  const rows = buildDailyHistoryRows(snapshots, { memberId: 'all', accountId: 'jd' })

  assert.equal(rows.length, 3)
  assert.equal(rows[0].account_name, '京东金融')
  assert.equal(rows[0].total_market_value, 1150)
  assert.equal(rows[0].total_profit, 150)
  assert.equal(rows[0].daily_profit, 20)
  assert.equal(rows[0].total_profit_rate, 15)
})

test('按成员过滤时会汇总成员名下全部账户', () => {
  const rows = buildDailyHistoryRows(snapshots, { memberId: 'me', accountId: 'all' })

  assert.equal(rows.length, 3)
  assert.equal(rows[0].member_id, 'me')
  assert.equal(rows[0].member_name, '本人')
  assert.equal(rows[0].account_name, '本人 · 全部账户')
  assert.equal(rows[0].total_market_value, 3120)
  assert.equal(rows[0].total_profit, 420)
  assert.equal(rows[0].daily_profit, 24)
})

test('周期历史行可按周聚合并输出阶段收益', () => {
  const rows = buildPeriodHistoryRows(snapshots, { memberId: 'all', accountId: 'all', period: 'week' })

  assert.equal(rows.length, 2)
  assert.equal(rows[0].period_key, '2026-06-01')
  assert.equal(rows[0].period_profit, 44)
  assert.equal(rows[0].start_date, '2026-06-02')
  assert.equal(rows[0].end_date, '2026-06-02')
  assert.equal(rows[1].period_key, '2026-05-25')
  assert.equal(rows[1].period_profit, 110)
  assert.equal(rows[1].start_date, '2026-05-30')
  assert.equal(rows[1].end_date, '2026-05-31')
})

test('周期历史行可按月聚合并计算当期收益', () => {
  const rows = buildPeriodHistoryRows(snapshots, { memberId: 'all', accountId: 'all', period: 'month' })

  assert.equal(rows.length, 2)
  assert.equal(rows[0].period_key, '2026-06')
  assert.equal(rows[0].period_label, '2026年06月')
  assert.equal(rows[0].period_profit, 44)
  assert.equal(rows[0].period_profit_rate, 0.97)
  assert.equal(rows[0].period_max_drawdown, 0)
  assert.equal(rows[1].period_key, '2026-05')
  assert.equal(rows[1].period_profit, 110)
  assert.equal(rows[1].period_profit_rate, 2.69)
  assert.equal(rows[1].period_max_drawdown, 0)
})

test('周期历史行可计算当期最大亏损', () => {
  const drawdownSnapshots = [
    {
      date: '2026-06-10',
      summary: {
        totalMarketValue: 1000,
        totalHoldingProfit: 100,
        totalProfitRate: 11.11,
        totalYesterdayProfit: 20,
      },
      positions: [
        { id: 'f1', fund_code: 'A', account_id: 'jd', account_name: '京东', member_id: 'me', member_name: '本人', cost: 900, current_profit: 100, yesterday_profit: 20, nav_jzrq: '2026-06-10' },
      ],
    },
    {
      date: '2026-06-11',
      summary: {
        totalMarketValue: 970,
        totalHoldingProfit: 70,
        totalProfitRate: 7.78,
        totalYesterdayProfit: -30,
      },
      positions: [
        { id: 'f1', fund_code: 'A', account_id: 'jd', account_name: '京东', member_id: 'me', member_name: '本人', cost: 900, current_profit: 70, yesterday_profit: -30, nav_jzrq: '2026-06-11' },
      ],
    },
  ]

  const rows = buildPeriodHistoryRows(drawdownSnapshots, { memberId: 'all', accountId: 'all', period: 'month' })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].period_profit, -10)
  assert.equal(rows[0].period_max_drawdown, -30)
})

test('短周期趋势图按天展示每天一个数据点', () => {
  const dailyRows = buildDailyHistoryRows(snapshots, { memberId: 'me', accountId: 'all' })
  const series = buildDisplayTrendSeries(dailyRows, { metric: 'total_profit', mode: 'daily' })

  assert.deepEqual(series.map(item => item.label), ['05-30', '05-31', '06-02'])
  assert.deepEqual(series.map(item => item.value), [300, 360, 420])
})

test('时间范围过长时趋势图自动聚合，避免每天都画点', () => {
  const series = buildDisplayTrendSeries(longDailyRows, { metric: 'total_profit', mode: 'daily' })

  assert.ok(series.length < longDailyRows.length)
  assert.ok(series.every(item => String(item.label).includes('周') || String(item.label).includes('月')))
})

test('成员筛选项会从快照中提取并保留全部成员选项', () => {
  const options = buildMemberFilterOptions(snapshots)

  assert.deepEqual(options[0], { text: '全部成员', value: 'all' })
  assert.equal(options[1].text, '本人')
  assert.equal(options[2].text, '家人')
})

test('账户筛选项会跟随成员变化', () => {
  const meOptions = buildAccountFilterOptions(snapshots, { memberId: 'me' })
  const familyOptions = buildAccountFilterOptions(snapshots, { memberId: 'family' })

  assert.deepEqual(meOptions.map(item => item.text), ['本人 · 全部账户', '京东金融', '支付宝-182'])
  assert.deepEqual(familyOptions.map(item => item.text), ['家人 · 全部账户', '家人账户'])
})

test('基金类型筛选项会从最新快照提取并保留全部类型选项', () => {
  const typedSnapshots = [
    {
      date: '2026-06-10',
      summary: { totalMarketValue: 3000, totalHoldingProfit: 300, totalProfitRate: 10, totalYesterdayProfit: 30 },
      positions: [
        { id: 'f1', fund_code: '019118', fund_name: '广发纳斯达克100指数(QDII)A', account_id: 'ali', account_name: '支付宝', member_id: 'me', member_name: '本人', cost: 1000, current_profit: 100, yesterday_profit: 10, nav_jzrq: '2026-06-10' },
        { id: 'f2', fund_code: '110020', fund_name: '易方达稳健收益债券A', account_id: 'jd', account_name: '京东', member_id: 'me', member_name: '本人', cost: 1000, current_profit: 80, yesterday_profit: 8, nav_jzrq: '2026-06-10' },
        { id: 'f3', fund_code: '018888', fund_name: '某某固收增强1号', account_id: 'jd', account_name: '京东', member_id: 'me', member_name: '本人', cost: 1000, current_profit: 120, yesterday_profit: 12, nav_jzrq: '2026-06-10' },
      ],
    },
  ]

  const options = buildFundTypeFilterOptions(typedSnapshots)

  assert.deepEqual(options.map(item => item.text), ['全部类型', 'QDII', '债券', '固收'])
})

test('单基金下拉筛选项会按当前筛选范围生成', () => {
  const typedSnapshots = [
    {
      date: '2026-06-10',
      summary: { totalMarketValue: 5000, totalHoldingProfit: 500, totalProfitRate: 11.11, totalYesterdayProfit: 50 },
      positions: [
        { id: 'f1', fund_code: '019118', fund_name: '广发纳斯达克100指数(QDII)A', account_id: 'ali', account_name: '支付宝', member_id: 'me', member_name: '本人', cost: 1000, current_profit: 100, yesterday_profit: 15, nav_jzrq: '2026-06-10' },
        { id: 'f2', fund_code: '110020', fund_name: '易方达稳健收益债券A', account_id: 'ali', account_name: '支付宝', member_id: 'me', member_name: '本人', cost: 1200, current_profit: 90, yesterday_profit: 9, nav_jzrq: '2026-06-10' },
        { id: 'f3', fund_code: '161017', fund_name: '富国中证500指数增强', account_id: 'ali', account_name: '支付宝', member_id: 'me', member_name: '本人', cost: 1500, current_profit: 200, yesterday_profit: 21, nav_jzrq: '2026-06-10' },
      ],
    },
  ]

  const options = buildFundSelectorOptions(typedSnapshots, { fundType: '债券' })

  assert.deepEqual(options, [
    { text: '全部基金', value: 'all' },
    { text: '易方达稳健收益债券A（110020）', value: '110020' },
  ])
})

test('单基金收益支持按类型筛选和单基金下拉选择', () => {
  const typedSnapshots = [
    {
      date: '2026-06-10',
      summary: { totalMarketValue: 5000, totalHoldingProfit: 500, totalProfitRate: 11.11, totalYesterdayProfit: 50 },
      positions: [
        { id: 'f1', fund_code: '019118', fund_name: '广发纳斯达克100指数(QDII)A', account_id: 'ali', account_name: '支付宝', member_id: 'me', member_name: '本人', cost: 1000, current_profit: 100, yesterday_profit: 15, nav_jzrq: '2026-06-10' },
        { id: 'f2', fund_code: '019118', fund_name: '广发纳斯达克100指数(QDII)A', account_id: 'jd', account_name: '京东', member_id: 'me', member_name: '本人', cost: 500, current_profit: 50, yesterday_profit: 5, nav_jzrq: '2026-06-10' },
        { id: 'f3', fund_code: '110020', fund_name: '易方达稳健收益债券A', account_id: 'ali', account_name: '支付宝', member_id: 'me', member_name: '本人', cost: 1200, current_profit: 90, yesterday_profit: 9, nav_jzrq: '2026-06-10' },
        { id: 'f4', fund_code: '161017', fund_name: '富国中证500指数增强', account_id: 'ali', account_name: '支付宝', member_id: 'me', member_name: '本人', cost: 1500, current_profit: 200, yesterday_profit: 21, nav_jzrq: '2026-06-10' },
      ],
    },
  ]

  const qdiiRows = buildCurrentFundRows(typedSnapshots, { fundType: 'qdii', fundCode: '019118' })
  assert.equal(qdiiRows.length, 1)
  assert.equal(qdiiRows[0].fund_code, '019118')
  assert.equal(qdiiRows[0].total_profit, 150)
  assert.equal(qdiiRows[0].daily_profit, 20)

  const indexRows = buildCurrentFundRows(typedSnapshots, { fundCode: '161017' })
  assert.equal(indexRows.length, 1)
  assert.equal(indexRows[0].fund_code, '161017')
  assert.equal(indexRows[0].fund_type, '指数')
})

test('阶段表现展示条数支持默认2条，并按10条一批循环展开', () => {
  assert.equal(getNextLoopDisplayCount({ total: 18, current: 2 }), 12)
  assert.equal(getNextLoopDisplayCount({ total: 18, current: 12 }), 18)
  assert.equal(getNextLoopDisplayCount({ total: 18, current: 18 }), 2)
  assert.equal(getNextLoopDisplayCount({ total: 1, current: 2 }), 1)
})

test('基础趋势序列函数仍可按指定指标输出', () => {
  const dailyRows = buildDailyHistoryRows(snapshots, { memberId: 'all', accountId: 'all' })
  const series = buildTrendSeries(dailyRows, { metric: 'total_profit', mode: 'daily' })

  assert.deepEqual(series.map(item => item.label), ['05-30', '05-31', '06-02'])
  assert.deepEqual(series.map(item => item.value), [420, 610, 820])
})

test('今日收益未更新时，会明确提示当前显示上一交易日收益', () => {
  const positions = [
    { id: 'fund-a', fund_code: 'A', nav_jzrq: '2026-06-08' },
    { id: 'fund-b', fund_code: 'B', nav_jzrq: '2026-06-08' },
    { id: 'advisory-1', fund_code: 'advisory-1', nav_jzrq: '2026-06-09' },
  ]

  const status = getDailyProfitUpdateStatus(positions, new Date('2026-06-09T08:00:00+08:00'))

  assert.equal(status.status, 'stale')
  assert.equal(status.helperText, '今日未更新，当前显示上一交易日收益')
  assert.equal(status.updatedCount, 0)
  assert.equal(status.totalCount, 2)
})

test('今日收益全部更新时，会显示已更新状态', () => {
  const positions = [
    { id: 'fund-a', fund_code: 'A', nav_jzrq: '2026-06-09' },
    { id: 'fund-b', fund_code: 'B', nav_jzrq: '2026-06-09' },
  ]

  const status = getDailyProfitUpdateStatus(positions, new Date('2026-06-09T20:00:00+08:00'))

  assert.equal(status.status, 'updated')
  assert.equal(status.helperText, '今日收益已更新')
  assert.equal(status.updatedCount, 2)
  assert.equal(status.totalCount, 2)
})

test('部分基金更新时，会显示部分更新状态', () => {
  const positions = [
    { id: 'fund-a', fund_code: 'A', nav_jzrq: '2026-06-09' },
    { id: 'fund-b', fund_code: 'B', nav_jzrq: '2026-06-08' },
  ]

  const status = getDailyProfitUpdateStatus(positions, new Date('2026-06-09T20:00:00+08:00'))

  assert.equal(status.status, 'partial')
  assert.equal(status.helperText, '部分基金今日已更新（1/2），当前合计仍含上一交易日收益')
  assert.equal(status.updatedCount, 1)
  assert.equal(status.totalCount, 2)
})
