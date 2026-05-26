const EPS = 1e-8

export const TRADE_TYPES = {
  BUY: '买入',
  SELL: '卖出',
  CASH_DIVIDEND: '现金分红',
  REINVEST_DIVIDEND: '红利再投',
  TRANSFER_IN: '转入',
  TRANSFER_OUT: '转出',
  CALIBRATION: '手动校准',
}

export function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

export function round4(value) {
  return Number(toNumber(value).toFixed(4))
}

export function nearlyZero(value) {
  return Math.abs(toNumber(value)) < EPS
}

export function normalizeTradeType(type) {
  const value = String(type || '').trim()
  switch (value) {
    case '买入':
      return TRADE_TYPES.BUY
    case '卖出':
      return TRADE_TYPES.SELL
    case '现金分红':
      return TRADE_TYPES.CASH_DIVIDEND
    case '红利再投':
    case '分红再投':
      return TRADE_TYPES.REINVEST_DIVIDEND
    case '转入':
    case '托管转入':
      return TRADE_TYPES.TRANSFER_IN
    case '转出':
    case '托管转出':
      return TRADE_TYPES.TRANSFER_OUT
    case '手动校准':
    case '校准':
    case '调整':
      return TRADE_TYPES.CALIBRATION
    default:
      return value
  }
}

export function sortTrades(trades = []) {
  return [...trades].sort((a, b) => {
    const dateA = String(a.trade_date || '')
    const dateB = String(b.trade_date || '')
    if (dateA !== dateB) return dateA.localeCompare(dateB)
    const createdA = toNumber(a.created_at)
    const createdB = toNumber(b.created_at)
    if (createdA !== createdB) return createdA - createdB
    return String(a.id || '').localeCompare(String(b.id || ''))
  })
}

export function createOpeningState(position = {}) {
  return {
    quantity: round4(position.opening_quantity ?? position.quantity ?? 0),
    cost: round4(position.opening_cost ?? position.cost ?? position.amount ?? 0),
    initial_profit: round4(position.opening_initial_profit ?? position.initial_profit ?? 0),
    realized_profit: 0,
    cash_dividend: 0,
    total_buy_amount: 0,
    total_sell_amount: 0,
    fund_name: position.fund_name || '',
    dividend_method: position.dividend_method || '红利再投',
  }
}

function assertNonNegative(value, field, tradeType) {
  if (toNumber(value) < -EPS) {
    throw new Error(`${tradeType}的${field}不能小于0`)
  }
}

function applyBuy(state, trade) {
  const quantity = toNumber(trade.quantity)
  const amount = toNumber(trade.amount)
  const fee = toNumber(trade.fee)
  if (quantity <= 0) throw new Error('买入份额必须大于0')
  if (amount <= 0) throw new Error('买入金额必须大于0')
  assertNonNegative(fee, '手续费', TRADE_TYPES.BUY)

  state.quantity = round4(state.quantity + quantity)
  state.cost = round4(state.cost + amount + fee)
  state.total_buy_amount = round4(state.total_buy_amount + amount + fee)
}

function applySell(state, trade) {
  const quantity = toNumber(trade.quantity)
  const amount = toNumber(trade.amount)
  const fee = toNumber(trade.fee)
  if (quantity <= 0) throw new Error('卖出份额必须大于0')
  if (amount < 0) throw new Error('卖出金额不能小于0')
  assertNonNegative(fee, '手续费', TRADE_TYPES.SELL)
  if (state.quantity <= 0) throw new Error('当前无可卖出份额')
  if (quantity - state.quantity > EPS) throw new Error('卖出份额不能超过当前持仓份额')

  const avgCost = state.quantity > 0 ? state.cost / state.quantity : 0
  const soldCost = avgCost * quantity
  const netAmount = amount - fee

  state.quantity = round4(state.quantity - quantity)
  state.cost = round4(state.cost - soldCost)
  state.realized_profit = round4(state.realized_profit + netAmount - soldCost)
  state.total_sell_amount = round4(state.total_sell_amount + netAmount)

  if (nearlyZero(state.quantity)) {
    state.quantity = 0
    state.cost = 0
  }
}

function applyCashDividend(state, trade) {
  const amount = toNumber(trade.amount)
  if (amount < 0) throw new Error('现金分红金额不能小于0')
  state.cash_dividend = round4(state.cash_dividend + amount)
  state.realized_profit = round4(state.realized_profit + amount)
}

function applyReinvestDividend(state, trade) {
  const quantity = toNumber(trade.quantity)
  const amount = toNumber(trade.amount)
  if (quantity <= 0) throw new Error('红利再投新增份额必须大于0')
  if (amount < 0) throw new Error('红利再投金额不能小于0')

  state.quantity = round4(state.quantity + quantity)
  state.cash_dividend = round4(state.cash_dividend + amount)
}

function applyTransferIn(state, trade) {
  const quantity = toNumber(trade.quantity)
  const amount = toNumber(trade.amount)
  if (quantity <= 0) throw new Error('转入份额必须大于0')
  if (amount < 0) throw new Error('转入成本不能小于0')

  state.quantity = round4(state.quantity + quantity)
  state.cost = round4(state.cost + amount)
}

function applyTransferOut(state, trade) {
  const quantity = toNumber(trade.quantity)
  const amount = toNumber(trade.amount)
  if (quantity <= 0) throw new Error('转出份额必须大于0')
  if (state.quantity <= 0) throw new Error('当前无可转出份额')
  if (quantity - state.quantity > EPS) throw new Error('转出份额不能超过当前持仓份额')

  const avgCost = state.quantity > 0 ? state.cost / state.quantity : 0
  const transferCost = amount > 0 ? amount : avgCost * quantity
  if (transferCost - state.cost > EPS) throw new Error('转出成本不能超过当前持仓成本')

  state.quantity = round4(state.quantity - quantity)
  state.cost = round4(state.cost - transferCost)

  if (nearlyZero(state.quantity)) {
    state.quantity = 0
    state.cost = 0
  }
}

function applyCalibration(state, trade) {
  const targetQuantity = trade.target_quantity ?? trade.quantity
  const targetCost = trade.target_cost ?? trade.amount
  const targetInitialProfit = trade.target_initial_profit ?? trade.initial_profit

  if (targetQuantity !== undefined && targetQuantity !== null && targetQuantity !== '') {
    const quantity = toNumber(targetQuantity)
    if (quantity < 0) throw new Error('校准后的份额不能小于0')
    state.quantity = round4(quantity)
  }

  if (targetCost !== undefined && targetCost !== null && targetCost !== '') {
    const cost = toNumber(targetCost)
    if (cost < 0) throw new Error('校准后的成本不能小于0')
    state.cost = round4(cost)
  }

  if (targetInitialProfit !== undefined && targetInitialProfit !== null && targetInitialProfit !== '') {
    state.initial_profit = round4(targetInitialProfit)
  }

  if (nearlyZero(state.quantity)) {
    state.quantity = 0
    state.cost = 0
  }
}

export function applyTradeToState(currentState, rawTrade) {
  const state = {
    ...currentState,
    quantity: round4(currentState.quantity),
    cost: round4(currentState.cost),
    initial_profit: round4(currentState.initial_profit),
    realized_profit: round4(currentState.realized_profit),
    cash_dividend: round4(currentState.cash_dividend),
    total_buy_amount: round4(currentState.total_buy_amount),
    total_sell_amount: round4(currentState.total_sell_amount),
  }

  const trade = {
    ...rawTrade,
    trade_type: normalizeTradeType(rawTrade.trade_type),
  }

  if (trade.fund_name) state.fund_name = trade.fund_name
  if (trade.dividend_method) state.dividend_method = trade.dividend_method

  switch (trade.trade_type) {
    case TRADE_TYPES.BUY:
      applyBuy(state, trade)
      break
    case TRADE_TYPES.SELL:
      applySell(state, trade)
      break
    case TRADE_TYPES.CASH_DIVIDEND:
      applyCashDividend(state, trade)
      break
    case TRADE_TYPES.REINVEST_DIVIDEND:
      applyReinvestDividend(state, trade)
      break
    case TRADE_TYPES.TRANSFER_IN:
      applyTransferIn(state, trade)
      break
    case TRADE_TYPES.TRANSFER_OUT:
      applyTransferOut(state, trade)
      break
    case TRADE_TYPES.CALIBRATION:
      applyCalibration(state, trade)
      break
    default:
      throw new Error(`暂不支持的交易类型：${trade.trade_type}`)
  }

  return state
}

export function rebuildPositionFromTrades(position, trades = []) {
  return sortTrades(trades).reduce((state, trade) => applyTradeToState(state, trade), createOpeningState(position))
}
