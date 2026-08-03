export const FAMILY_ASSET_CATEGORIES = Object.freeze([
  { code: 'advisory', name: '顾投', group: 'investment', groupName: '增值资产', investable: true },
  { code: 'stock', name: '股票', group: 'investment', groupName: '增值资产', investable: true },
  { code: 'bank_wealth', name: '银行理财', group: 'investment', groupName: '增值资产', investable: true },
  { code: 'bond', name: '债券', group: 'investment', groupName: '增值资产', investable: true },
  { code: 'gold', name: '黄金及贵金属', group: 'investment', groupName: '增值资产', investable: true },
  { code: 'other_investment', name: '其他投资', group: 'investment', groupName: '增值资产', investable: true },
  { code: 'bank_demand', name: '银行活期', group: 'cash', groupName: '现金及存款', investable: true },
  { code: 'bank_fixed', name: '银行定期', group: 'cash', groupName: '现金及存款', investable: true },
  { code: 'cash', name: '现金', group: 'cash', groupName: '现金及存款', investable: true },
  { code: 'provident_fund', name: '住房公积金', group: 'restricted', groupName: '受限资产', investable: false },
  { code: 'medical_account', name: '医保个人账户', group: 'restricted', groupName: '受限资产', investable: false },
  { code: 'pension_account', name: '养老金个人账户', group: 'restricted', groupName: '受限资产', investable: false },
  { code: 'property', name: '房产', group: 'physical', groupName: '实物及其他资产', investable: false },
  { code: 'vehicle', name: '车辆', group: 'physical', groupName: '实物及其他资产', investable: false },
  { code: 'other_asset', name: '其他资产', group: 'physical', groupName: '实物及其他资产', investable: false },
])

export const FAMILY_ASSET_CATEGORY_MAP = Object.freeze(Object.fromEntries(FAMILY_ASSET_CATEGORIES.map(item => [item.code, item])))

export const FAMILY_RECEIVABLE_CATEGORIES = Object.freeze([
  { code: 'personal_loan', name: '亲友借款' },
  { code: 'reimbursement', name: '待报销款' },
  { code: 'business', name: '业务应收款' },
  { code: 'other', name: '其他应收款' },
])

export const FAMILY_LIABILITY_CATEGORIES = Object.freeze([
  { code: 'mortgage', name: '房贷' },
  { code: 'car_loan', name: '车贷' },
  { code: 'credit_card', name: '信用卡' },
  { code: 'consumer_loan', name: '消费贷' },
  { code: 'personal_loan', name: '亲友借款' },
  { code: 'other', name: '其他负债' },
])

const roundMoney = value => Number(Number(value || 0).toFixed(2))

export function validateFamilyAsset(input = {}) {
  const errors = []
  if (!String(input.name || '').trim()) errors.push('资产名称不能为空')
  if (!FAMILY_ASSET_CATEGORY_MAP[input.category_code]) errors.push('资产类别无效')
  if (!Number.isFinite(Number(input.current_value)) || Number(input.current_value) < 0) errors.push('当前金额必须大于或等于0')
  return errors
}

export function buildFamilySummary({ fundValue = 0, advisoryValue = 0, advisoryInvestableValue = advisoryValue, assets = [], receivables = [], liabilities = [] } = {}) {
  const activeAssets = assets.filter(item => item.status !== 'archived' && Number(item.include_in_net_worth ?? 1) === 1)
  const activeReceivables = receivables.filter(item => item.status !== 'settled')
  const activeLiabilities = liabilities.filter(item => item.status !== 'settled')
  const manualAssets = activeAssets.reduce((sum, item) => sum + Number(item.current_value || 0), 0)
  const receivableValue = activeReceivables.reduce((sum, item) => sum + Number(item.outstanding_amount || 0), 0)
  const liabilityValue = activeLiabilities.reduce((sum, item) => sum + Number(item.outstanding_principal || 0), 0)
  const investableManual = activeAssets.reduce((sum, item) => sum + (Number(item.include_in_investable_assets || 0) === 1 ? Number(item.current_value || 0) : 0), 0)
  const totalAssets = Number(fundValue || 0) + Number(advisoryValue || 0) + manualAssets + receivableValue
  const groups = {}
  activeAssets.forEach(item => {
    const category = FAMILY_ASSET_CATEGORY_MAP[item.category_code]
    const group = category?.group || 'other'
    groups[group] = roundMoney((groups[group] || 0) + Number(item.current_value || 0))
  })
  groups.fund = roundMoney(fundValue)
  groups.investment = roundMoney((groups.investment || 0) + Number(advisoryValue || 0))
  groups.receivable = roundMoney(receivableValue)
  return {
    fund_value: roundMoney(fundValue),
    advisory_value: roundMoney(advisoryValue),
    advisory_investable_value: roundMoney(advisoryInvestableValue),
    manual_asset_value: roundMoney(manualAssets),
    receivable_value: roundMoney(receivableValue),
    total_assets: roundMoney(totalAssets),
    total_liabilities: roundMoney(liabilityValue),
    net_worth: roundMoney(totalAssets - liabilityValue),
    investable_assets: roundMoney(Number(fundValue || 0) + Number(advisoryInvestableValue || 0) + investableManual),
    groups,
  }
}
