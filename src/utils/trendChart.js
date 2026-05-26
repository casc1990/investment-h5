const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
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
