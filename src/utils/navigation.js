export const MAIN_TABS = [
  { to: '/', label: '首页', icon: 'wap-home-o' },
  { to: '/positions', label: '持仓', icon: 'bag-o' },
  { to: '/trades', label: '交易', icon: 'balance-o' },
  { to: '/stats', label: '统计', icon: 'chart-trending-o' },
  { to: '/allocation', label: '配置', icon: 'setting-o' },
  { to: '/accounts', label: '账户', icon: 'friends-o' },
  { to: '/advisory', label: '顾投', icon: 'apps-o' },
  { to: '/members', label: '成员', icon: 'contact-o' },
]

export const MAIN_TAB_INDEX_MAP = Object.fromEntries(MAIN_TABS.map((tab, index) => [tab.to, index]))
MAIN_TAB_INDEX_MAP['/ledger'] = MAIN_TAB_INDEX_MAP['/stats']
