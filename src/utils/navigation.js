export const MAIN_TABS = [
  { to: '/', label: '首页', icon: 'wap-home-o' },
  { to: '/family-finance', label: '家庭财务', icon: 'gold-coin-o' },
  { to: '/positions', label: '基金', icon: 'bag-o' },
  { to: '/stats', label: '统计', icon: 'chart-trending-o' },
  { to: '/accounts', label: '我的', icon: 'friends-o' },
]

export const MAIN_TAB_INDEX_MAP = Object.fromEntries(MAIN_TABS.map((tab, index) => [tab.to, index]))
MAIN_TAB_INDEX_MAP['/ledger'] = MAIN_TAB_INDEX_MAP['/stats']
MAIN_TAB_INDEX_MAP['/members'] = MAIN_TAB_INDEX_MAP['/accounts']
MAIN_TAB_INDEX_MAP['/trades'] = MAIN_TAB_INDEX_MAP['/positions']
MAIN_TAB_INDEX_MAP['/allocation'] = MAIN_TAB_INDEX_MAP['/positions']

export const resolveMainTabIndex = (path = '') => {
  if (path === '/ledger') return MAIN_TAB_INDEX_MAP['/stats']
  if (path === '/members') return MAIN_TAB_INDEX_MAP['/accounts']
  if (path === '/family-finance' || path.startsWith('/family-finance/')) return MAIN_TAB_INDEX_MAP['/family-finance']
  if (path === '/positions' || path.startsWith('/positions/')) return MAIN_TAB_INDEX_MAP['/positions']
  if (path === '/trades' || path.startsWith('/trades/')) return MAIN_TAB_INDEX_MAP['/positions']
  if (path === '/allocation' || path.startsWith('/allocation/')) return MAIN_TAB_INDEX_MAP['/positions']
  return MAIN_TAB_INDEX_MAP[path] ?? 0
}
