export const toNumber = (value, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

export const formatAmount = (value, digits = 2) => {
  const num = toNumber(value)
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export const formatSignedAmount = (value, digits = 2) => {
  const num = toNumber(value)
  const prefix = num > 0 ? '+' : ''
  return `${prefix}${formatAmount(num, digits)}`
}

export const formatPercent = (value, digits = 2) => {
  const num = toNumber(value)
  return `${num.toFixed(digits)}%`
}

export const profitClass = (value) => {
  const num = toNumber(value)
  if (num > 0) return 'positive'
  if (num < 0) return 'negative'
  return 'neutral'
}

export const formatDateLabel = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const todayDateParts = (date = new Date()) => ([
  String(date.getFullYear()),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
])
