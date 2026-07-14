export const MAIN_TABS = [
  { to: '/', label: '首页', icon: 'wap-home-o' },
  { to: '/positions', label: '持仓', icon: 'bag-o' },
  { to: '/allocation', label: '配置', icon: 'setting-o' },
  { to: '/trades', label: '交易', icon: 'balance-o' },
  { to: '/stats', label: '统计', icon: 'chart-trending-o' },
  { to: '/accounts', label: '成员账户', icon: 'friends-o' },
]

export const MAIN_TAB_INDEX_MAP = Object.fromEntries(MAIN_TABS.map((tab, index) => [tab.to, index]))
MAIN_TAB_INDEX_MAP['/ledger'] = MAIN_TAB_INDEX_MAP['/stats']
MAIN_TAB_INDEX_MAP['/members'] = MAIN_TAB_INDEX_MAP['/accounts']

export const resolveMainTabIndex = (path = '') => {
  if (path === '/ledger') return MAIN_TAB_INDEX_MAP['/stats']
  if (path === '/members') return MAIN_TAB_INDEX_MAP['/accounts']
  if (path === '/allocation' || path.startsWith('/allocation/')) return MAIN_TAB_INDEX_MAP['/allocation']
  return MAIN_TAB_INDEX_MAP[path] ?? 0
}
