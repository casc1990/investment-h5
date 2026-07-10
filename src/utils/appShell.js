import { ref } from 'vue'

export const KEEP_ALIVE_ROUTE_NAMES = [
  'Home',
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

export const setAppTabbarVisible = (visible) => {
  appTabbarVisible.value = visible
}

export const shouldLogApi = (env = {}) => Boolean(env?.DEV)
