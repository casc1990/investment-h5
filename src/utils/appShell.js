export const KEEP_ALIVE_ROUTE_NAMES = [
  'Home',
  'Accounts',
  'Positions',
  'Trades',
  'Stats',
  'Advisory',
  'Members',
]

export const shouldLogApi = (env = {}) => Boolean(env?.DEV)
