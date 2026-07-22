const STORAGE_KEY = 'investment_positions_view_state_v1'

export const POSITION_VIEW_OPTIONS = new Set([
  'abnormal',
  'loss',
  'profit',
  'market_value_desc',
  'daily_profit_desc',
  'holding_profit_desc',
  'profit_rate_desc',
  'name_asc',
])

export const normalizePositionViewState = (state = {}) => ({
  memberId: state.memberId ? String(state.memberId) : null,
  accountId: state.accountId ? String(state.accountId) : null,
  viewOption: POSITION_VIEW_OPTIONS.has(state.viewOption) ? state.viewOption : 'market_value_desc',
})

export const readPositionViewState = (storage = globalThis.localStorage) => {
  if (!storage) return normalizePositionViewState()
  try {
    return normalizePositionViewState(JSON.parse(storage.getItem(STORAGE_KEY) || 'null') || {})
  } catch {
    return normalizePositionViewState()
  }
}

export const writePositionViewState = (state = {}, storage = globalThis.localStorage) => {
  const normalized = normalizePositionViewState(state)
  if (!storage) return normalized
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  } catch (error) {
    console.warn('[positionViewState] failed to save state:', error)
  }
  return normalized
}
