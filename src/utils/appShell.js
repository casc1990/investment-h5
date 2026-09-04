import { ref } from 'vue'

export const KEEP_ALIVE_ROUTE_NAMES = [
  'Home',
  'FamilyFinance',
  'Accounts',
  'Positions',
  'Trades',
  'Stats',
  'AllocationStrategies',
  'Allocation',
  'Advisory',
  'Members',
]

export const appTabbarVisible = ref(true)
export const INVESTMENT_DATA_UPDATED_EVENT = 'investment-data-updated'

export const setAppTabbarVisible = (visible) => {
  appTabbarVisible.value = visible
}

export const shouldLogApi = (env = {}) => Boolean(env?.DEV)

export const notifyInvestmentDataUpdated = (detail = {}) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(INVESTMENT_DATA_UPDATED_EVENT, { detail }))
}
