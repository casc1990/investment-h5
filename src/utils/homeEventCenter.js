const safeArray = (value) => Array.isArray(value) ? value : []

const formatFundNames = (funds = [], limit = 2) => safeArray(funds)
  .slice(0, limit)
  .map(item => item.fund_name || item.fund_code || '未命名基金')
  .join('、')

export const buildPendingNavEventCards = (funds = []) => {
  const pendingFunds = safeArray(funds)
  const normalFunds = pendingFunds.filter(item => item?.category !== 'qdii')
  const qdiiFunds = pendingFunds.filter(item => item?.category === 'qdii')
  const cards = []

  if (normalFunds.length) {
    const summaryNames = formatFundNames(normalFunds)
    cards.push({
      id: 'pending-nav-normal',
      level: 'urgent',
      title: `${normalFunds.length}只基金净值未更新`,
      description: summaryNames
        ? `${summaryNames}${normalFunds.length > 2 ? ' 等' : ''}仍未更新到最新净值日期，可能影响收益与统计口径。`
        : '有基金仍未更新到最新净值日期，可能影响收益与统计口径。',
      impactLabel: '需立即处理',
      action: 'sync_pending',
      actionLabel: '立即补同步',
      count: normalFunds.length,
      funds: normalFunds,
    })
  }

  if (qdiiFunds.length) {
    const summaryNames = formatFundNames(qdiiFunds)
    cards.push({
      id: 'pending-nav-qdii',
      level: 'notice',
      title: `${qdiiFunds.length}只QDII净值待确认`,
      description: summaryNames
        ? `${summaryNames}${qdiiFunds.length > 2 ? ' 等' : ''}通常会比国内基金晚一个交易日更新，先按提示关注即可。`
        : 'QDII/海外基金通常会比国内基金晚一个交易日更新，先按提示关注即可。',
      impactLabel: 'QDII正常时差',
      action: 'view_positions',
      actionLabel: '查看持仓',
      count: qdiiFunds.length,
      funds: qdiiFunds,
    })
  }

  return cards
}

export const summarizePendingNavEvents = (cards = []) => safeArray(cards).reduce((sum, item) => sum + Number(item?.count || 0), 0)
