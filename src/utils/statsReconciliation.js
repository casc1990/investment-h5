import {
  filterSnapshotPositions,
  getPositionMarketValue,
  isAdvisoryPosition,
} from './statsHistory.js'

const safeNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const round2 = value => Number(safeNumber(value).toFixed(2))
const positionKey = item => `${item?.account_id || ''}::${item?.fund_code || ''}`

const sortSnapshotsAsc = snapshots => [...(snapshots || [])]
  .filter(snapshot => snapshot?.date)
  .sort((left, right) => String(left.date).localeCompare(String(right.date)))

const scopedPositions = (snapshot, filters) => filterSnapshotPositions(snapshot, filters)
  .filter(position => !isAdvisoryPosition(position))

const snapshotMarketValue = (snapshot, filters) => round2(
  scopedPositions(snapshot, filters).reduce((sum, position) => sum + getPositionMarketValue(position), 0),
)

const findSnapshot = (snapshots, predicate, direction = 'last') => {
  const matches = snapshots.filter(predicate)
  return direction === 'first' ? matches[0] || null : matches[matches.length - 1] || null
}

const buildScopedPositionKeys = (snapshots, filters) => new Set(
  snapshots.flatMap(snapshot => scopedPositions(snapshot, filters).map(positionKey)),
)

const getTradeRecordedAt = trade => {
  const timestamp = safeNumber(trade?.created_at)
  if (!timestamp) return 0
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp
}

const getTradeEffect = (trade) => {
  const amount = safeNumber(trade?.amount)
  const fee = safeNumber(trade?.fee)
  const type = String(trade?.trade_type || '')
  if (type === '买入') return amount + fee
  if (type === '卖出') return -(amount - fee)
  if (type === '转入') return amount
  if (type === '转出') return -amount
  // 红利再投是基金内部产生的收益，不是用户追加的外部资金。
  if (type === '红利再投' || type === '分红再投') return 0
  if (type === '现金分红') return -amount
  return 0
}

const getTradeCategory = type => {
  if (type === '红利再投' || type === '分红再投') return '红利再投'
  if (type === '现金分红') return '现金分红'
  if (type === '买入' || type === '转入') return '资金流入'
  if (type === '卖出' || type === '转出') return '资金流出'
  return '资金调整'
}

const isDividendTrade = trade => ['现金分红', '红利再投', '分红再投'].includes(String(trade?.trade_type || ''))

const getDividendEventAmount = (event, snapshots, filters, effectiveDate) => {
  const perShare = safeNumber(event?.detail?.dividend_per_share)
  if (perShare <= 0) return 0

  const snapshot = findSnapshot(snapshots, item => String(item.date) <= effectiveDate)
  if (!snapshot) {
    const isUnfiltered = (!filters?.memberId || filters.memberId === 'all')
      && (!filters?.accountId || filters.accountId === 'all')
      && (!filters?.fundType || filters.fundType === 'all')
    return isUnfiltered ? round2(event?.detail?.estimated_amount) : 0
  }
  const shares = scopedPositions(snapshot, filters)
    .filter(position => String(position?.fund_code || '') === String(event?.fund_code || ''))
    .reduce((sum, position) => sum + safeNumber(position?.shares), 0)
  return round2(shares * perShare)
}

const buildDividendSettlementEntries = ({ events, snapshots, filters, startDate, endDate }) => {
  const entries = []
  for (const event of events || []) {
    if (event?.event_type !== 'dividend' || event?.source_type !== 'dividend_announcement') continue
    const exDate = String(event?.detail?.ex_date || '')
    const paymentDate = String(event?.detail?.payment_date || '')
    const amount = getDividendEventAmount(event, snapshots, filters, exDate || paymentDate)
    if (amount <= 0) continue

    if (exDate >= startDate && exDate <= endDate) {
      entries.push({
        key: `dividend-receivable-${event.id || `${event.fund_code}-${exDate}`}`,
        date: exDate,
        category: '分红待入账',
        title: event.fund_name || event.title || event.fund_code || '基金分红',
        amount: -amount,
        note: `除息后待到账 · 预计 ${paymentDate || '待确认'}`,
      })
    }
    if (paymentDate >= startDate && paymentDate <= endDate) {
      entries.push({
        key: `dividend-settled-${event.id || `${event.fund_code}-${paymentDate}`}`,
        date: paymentDate,
        category: '分红到账',
        title: event.fund_name || event.title || event.fund_code || '基金分红',
        amount,
        note: '释放除息日待入账分红',
      })
    }
  }
  return entries
}

const isTradeInWindow = (trade, { startDate, endDate, openingSnapshot, closingSnapshot, openingWithinPeriod }) => {
  const effectiveDate = String(trade?.trade_date || '')
  const recordedAt = getTradeRecordedAt(trade)
  const openingCapturedAt = safeNumber(openingSnapshot?.captured_at)
  const closingCapturedAt = safeNumber(closingSnapshot?.captured_at)
  if (recordedAt && openingCapturedAt && closingCapturedAt) {
    if (recordedAt > openingCapturedAt && recordedAt <= closingCapturedAt) return true
    // 补录交易在历史期末快照之后才进入系统，应归属实际入账周期，避免跨周重复。
    if (recordedAt > closingCapturedAt) return false
  }

  return openingWithinPeriod
    ? effectiveDate > String(openingSnapshot?.date || startDate) && effectiveDate <= endDate
    : effectiveDate >= startDate && effectiveDate <= endDate
}

export const buildPeriodReconciliations = ({
  periodRows = [],
  dailyRows = [],
  snapshots = [],
  trades = [],
  dividendEvents = [],
  filters = {},
} = {}) => {
  const orderedSnapshots = sortSnapshotsAsc(snapshots)
  const scopedKeys = buildScopedPositionKeys(orderedSnapshots, filters)

  return periodRows.map((periodRow) => {
    const startDate = String(periodRow.start_date || '')
    const endDate = String(periodRow.end_date || '')
    const priorSnapshot = findSnapshot(orderedSnapshots, snapshot => String(snapshot.date) < startDate)
    const firstPeriodSnapshot = findSnapshot(
      orderedSnapshots,
      snapshot => String(snapshot.date) >= startDate && String(snapshot.date) <= endDate,
      'first',
    )
    const openingSnapshot = priorSnapshot || firstPeriodSnapshot
    const openingWithinPeriod = !priorSnapshot && Boolean(firstPeriodSnapshot)
    const closingSnapshot = findSnapshot(orderedSnapshots, snapshot => String(snapshot.date) <= endDate)
    const openingMarketValue = openingSnapshot
      ? snapshotMarketValue(openingSnapshot, filters)
      : round2(Math.max(0, safeNumber(periodRow.total_market_value) - safeNumber(periodRow.period_profit)))
    const closingMarketValue = closingSnapshot
      ? snapshotMarketValue(closingSnapshot, filters)
      : round2(periodRow.total_market_value)
    const periodTrades = trades
      .filter(trade => scopedKeys.has(positionKey(trade)))
      .filter(trade => isTradeInWindow(trade, { startDate, endDate, openingSnapshot, closingSnapshot, openingWithinPeriod }))
      .map(trade => ({ ...trade, reconciliation_effect: round2(getTradeEffect(trade)) }))

    const explicitCapitalFlow = round2(periodTrades.reduce((sum, trade) => sum + trade.reconciliation_effect, 0))

    const profitEntries = dailyRows
      .filter((row) => {
        const rowDate = String(row.date)
        if (openingWithinPeriod) return rowDate > String(openingSnapshot?.date || '') && rowDate <= endDate
        return rowDate >= startDate && rowDate <= endDate
      })
      .map(row => ({
        key: `profit-${row.date}`,
        date: row.date,
        category: '净值收益',
        title: '当日确认收益',
        amount: round2(row.daily_profit),
        note: 'QDII 按收益确认日归属',
      }))
    const confirmedProfit = round2(profitEntries.reduce((sum, entry) => sum + entry.amount, 0))
    const dividendEntries = periodTrades
      .filter(isDividendTrade)
      .map(trade => ({
        key: `dividend-${trade.id || `${trade.trade_date}-${trade.fund_code}`}`,
        date: trade.trade_date,
        category: '分红收益',
        title: trade.fund_name || trade.fund_code || trade.trade_type,
        amount: round2(trade.amount),
        note: trade.trade_type,
      }))
    // 官方日涨跌幅已经包含分红回报，分红流水不能再次叠加到周期收益。
    // 除息日至到账日之间，基金市值暂不包含这笔收益，因此单独列为“分红待入账”。
    const investmentProfit = confirmedProfit
    const dividendSettlementEntries = buildDividendSettlementEntries({
      events: dividendEvents,
      snapshots: orderedSnapshots,
      filters,
      startDate,
      endDate,
    })
    const dividendSettlementFlow = round2(dividendSettlementEntries.reduce((sum, entry) => sum + entry.amount, 0))
    const inferredPositionFlow = round2(closingMarketValue - openingMarketValue - explicitCapitalFlow - investmentProfit - dividendSettlementFlow)
    const netCapitalFlow = round2(explicitCapitalFlow + dividendSettlementFlow + inferredPositionFlow)
    const balanceDifference = round2(closingMarketValue - openingMarketValue - netCapitalFlow - investmentProfit)
    const inferredPositionEntries = Math.abs(inferredPositionFlow) >= 0.01
      ? [{
          key: `position-adjustment-${periodRow.period_key}`,
          date: endDate,
          category: '快照差额',
          title: '市值变化与明细合计的差额',
          amount: inferredPositionFlow,
          note: '非每日净值基金、精度差、历史补录或手动校准',
        }]
      : []
    const confirmationAdjustment = 0
    const tradeEntries = periodTrades.filter(trade => trade.reconciliation_effect !== 0).map(trade => ({
      key: `trade-${trade.id || `${trade.trade_date}-${trade.fund_code}`}`,
      date: trade.trade_date,
      recorded_at: trade.created_at,
      category: getTradeCategory(trade.trade_type),
      title: trade.fund_name || trade.fund_code || trade.trade_type,
      amount: trade.reconciliation_effect,
      note: trade.trade_type,
      trade_id: trade.id,
    }))
    return {
      ...periodRow,
      coverage_start_date: openingWithinPeriod ? openingSnapshot?.date || startDate : startDate,
      coverage_note: openingWithinPeriod ? '从首个快照起算' : '',
      opening_date: openingSnapshot?.date || '',
      opening_market_value: openingMarketValue,
      opening_is_estimated: !priorSnapshot,
      closing_market_value: closingMarketValue,
      explicit_capital_flow: explicitCapitalFlow,
      dividend_settlement_flow: dividendSettlementFlow,
      inferred_position_flow: inferredPositionFlow,
      net_capital_flow: netCapitalFlow,
      confirmed_profit: confirmedProfit,
      investment_profit: investmentProfit,
      investment_profit_rate: openingMarketValue > 0 ? round2(investmentProfit / openingMarketValue * 100) : 0,
      confirmation_adjustment: confirmationAdjustment,
      balance_difference: balanceDifference,
      is_balanced: Math.abs(balanceDifference) < 0.01,
      ledger_entries: [
        ...tradeEntries,
        ...inferredPositionEntries,
        ...dividendSettlementEntries,
        ...dividendEntries.map(entry => ({
          ...entry,
          reference_amount: entry.amount,
          amount: 0,
          note: `${entry.note} · 已含在当日确认收益`,
        })),
        ...profitEntries,
      ]
        .sort((left, right) => String(right.date).localeCompare(String(left.date)) || String(left.key).localeCompare(String(right.key))),
    }
  })
}

export const buildDataHealthReport = ({ snapshots = [], overview = null, reconciliations = [], pendingEvents = [] } = {}) => {
  const orderedSnapshots = sortSnapshotsAsc(snapshots)
  const latestSnapshot = orderedSnapshots[orderedSnapshots.length - 1] || null
  const fundPositions = scopedPositions(latestSnapshot || {}, {})
  const snapshotFundValue = round2(fundPositions.reduce((sum, position) => sum + getPositionMarketValue(position), 0))
  const overviewFundValue = round2(overview?.summary?.totalMarketValue)
  const crossPageDifference = round2(overviewFundValue - snapshotFundValue)
  const invalidPositions = fundPositions.filter(position => ![
    position.cost,
    position.current_profit,
    position.shares,
  ].every(value => Number.isFinite(Number(value))))
  const unbalancedPeriods = reconciliations.filter(row => !row.is_balanced)
  const adjustedPeriods = reconciliations.filter(row => Math.abs(safeNumber(row.inferred_position_flow)) >= 1)
  const staleFundCount = safeNumber(overview?.summary?.staleFundCount)
  const totalFundCount = safeNumber(overview?.summary?.totalFundCount)
  const updatedFundCount = safeNumber(overview?.summary?.updatedFundCount)

  const checks = [
    {
      key: 'snapshot',
      label: '收益快照完整性',
      status: fundPositions.length > 0 ? 'passed' : 'failed',
      detail: fundPositions.length > 0 ? `${fundPositions.length}个基金持仓已记录` : '最新快照缺少基金持仓',
    },
    {
      key: 'position-equation',
      label: '成本与持有收益',
      status: invalidPositions.length === 0 ? 'passed' : 'failed',
      detail: invalidPositions.length === 0 ? '持仓金额字段完整' : `${invalidPositions.length}个持仓存在无效金额`,
    },
    {
      key: 'cross-page',
      label: '跨页面基金市值',
      status: Math.abs(crossPageDifference) <= 1 ? 'passed' : 'failed',
      detail: Math.abs(crossPageDifference) <= 1 ? '首页、持仓和快照口径一致' : `相差 ¥${Math.abs(crossPageDifference).toFixed(2)}`,
    },
    {
      key: 'periods',
      label: '周期收益对账',
      status: unbalancedPeriods.length === 0 ? 'passed' : 'failed',
      detail: unbalancedPeriods.length === 0 ? '期初、资金变动、收益与期末已对平' : `${unbalancedPeriods.length}个周期存在差额`,
    },
    {
      key: 'unmatched-adjustments',
      label: '快照差额',
      status: adjustedPeriods.length > 0 ? 'warning' : 'passed',
      detail: adjustedPeriods.length > 0 ? `${adjustedPeriods.length}个周期的市值变化与明细合计有差额` : '期末市值与明细合计一致',
    },
    {
      key: 'nav',
      label: '净值更新',
      status: staleFundCount > 0 ? 'warning' : 'passed',
      detail: totalFundCount > 0 ? `${updatedFundCount}/${totalFundCount}只已更新${staleFundCount > 0 ? ` · ${staleFundCount}只待更新` : ''}` : '暂无基金持仓',
    },
    {
      key: 'events',
      label: '待处理事项',
      status: pendingEvents.length > 0 ? 'warning' : 'passed',
      detail: pendingEvents.length > 0 ? `${pendingEvents.length}条事项待确认` : '暂无待处理事项',
    },
  ]

  const hasFailure = checks.some(check => check.status === 'failed')
  const hasWarning = checks.some(check => check.status === 'warning')
  return {
    status: hasFailure ? 'failed' : (hasWarning ? 'warning' : 'passed'),
    title: hasFailure ? '发现数据差异' : (hasWarning ? '数据正常·有待办' : '当前数据正常'),
    checked_at: Date.now(),
    latest_snapshot_date: latestSnapshot?.date || '',
    checks,
    history_rebuild: {
      start_date: orderedSnapshots[0]?.date || '',
      end_date: latestSnapshot?.date || '',
      reason: '基于最新交易与收益快照自动重算',
      affected_periods: '日、周、月、季、半年、年',
      status: hasFailure ? 'needs_attention' : 'completed',
    },
  }
}
