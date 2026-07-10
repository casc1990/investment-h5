const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export const normalizeTrendChartBounds = (values = [], includeZero = false, referenceValues = []) => {
  const numericValues = values.map(toNumber)
  const numericReferences = referenceValues.map(toNumber)
  const mergedValues = [...numericValues, ...numericReferences]
  if (!mergedValues.length) return { min: 0, max: 0 }

  let min = Math.min(...mergedValues)
  let max = Math.max(...mergedValues)

  if (includeZero) {
    min = Math.min(min, 0)
    max = Math.max(max, 0)
  }

  return { min, max }
}

export const buildTrendChartGuides = (values = []) => {
  const numericValues = values.map(toNumber)
  if (!numericValues.length) return []

  const min = Math.min(...numericValues)
  const max = Math.max(...numericValues)
  const middle = min + ((max - min) / 2)

  return [max, middle, min].map(value => ({ value: Number(value.toFixed(2)) }))
}

export const formatTrendXAxisLabel = (point = {}) => {
  if (point.label) return String(point.label)
  if (point.date) return String(point.date).slice(5)
  return String(point.key || '')
}

export const findNearestTrendPoint = (points = [], x) => {
  if (!points.length) return null

  return points.reduce((nearest, point) => {
    if (!nearest) return point
    return Math.abs(point.x - x) < Math.abs(nearest.x - x) ? point : nearest
  }, null)
}

export const normalizeTrendReferenceLines = (referenceLines = [], axisFormatter = value => String(value ?? '-')) => referenceLines
  .map((item, index) => ({
    key: item?.key || `reference-${index}`,
    label: item?.label || '',
    value: Number(item?.value) || 0,
    color: item?.color || '#f59e0b',
    dasharray: item?.dasharray || '6 4',
    showAxisLabel: Boolean(item?.showAxisLabel),
    axisLabel: item?.axisLabel || axisFormatter(Number(item?.value) || 0),
  }))
