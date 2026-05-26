const normalizeTradeType = (type) => {
  if (type === 'buy') return '买入'
  if (type === 'sell') return '卖出'
  if (!type) return ''
  return type
}

const getAccountId = (account = {}) => account?.id || account?.account_id || ''
const getAccountName = (account = {}) => account?.name || account?.account_name || account?.['账户名称'] || ''

export const resolveTradeDraft = ({
  accounts = [],
  preferredAccountId = '',
  preferredTradeType = '买入',
  routeType = '',
} = {}) => {
  const normalizedType = normalizeTradeType(routeType) || normalizeTradeType(preferredTradeType)
  const matchedAccount = accounts.find(account => getAccountId(account) === preferredAccountId) || accounts[0] || null

  return {
    tradeType: normalizedType || '买入',
    accountId: matchedAccount ? getAccountId(matchedAccount) : '',
    accountName: matchedAccount ? getAccountName(matchedAccount) : '',
  }
}

export const buildTradeQuickFundOptions = (positions = [], accountId = '', limit = 6) => {
  const seen = new Set()
  return positions
    .filter(position => !accountId || position.account_id === accountId)
    .filter((position) => {
      const code = String(position.fund_code || '').trim()
      if (!code || seen.has(code)) return false
      seen.add(code)
      return true
    })
    .sort((a, b) => Number(b.cost || 0) + Number(b.current_profit || 0) - (Number(a.cost || 0) + Number(a.current_profit || 0)))
    .slice(0, limit)
    .map(position => ({
      fundCode: String(position.fund_code || ''),
      fundName: position.fund_name || position.fund_code || '未知基金',
    }))
}

export const __test__ = {
  normalizeTradeType,
  getAccountId,
  getAccountName,
}
