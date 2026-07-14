const PREFIX = 'investment_page_cache_v1:'

export const readPageCache = (key, { maxAge = 24 * 60 * 60 * 1000 } = {}) => {
  if (typeof localStorage === 'undefined') return null
  try {
    const parsed = JSON.parse(localStorage.getItem(`${PREFIX}${key}`) || 'null')
    if (!parsed || !parsed.savedAt || Date.now() - parsed.savedAt > maxAge) return null
    return parsed
  } catch {
    return null
  }
}

export const writePageCache = (key, data) => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(`${PREFIX}${key}`, JSON.stringify({ ...data, savedAt: Date.now() }))
  } catch (error) {
    console.warn('[pageCache] failed to save cache:', error)
  }
}

export const clearPageCaches = () => {
  if (typeof localStorage === 'undefined') return
  const keys = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(PREFIX)) keys.push(key)
  }
  keys.forEach(key => localStorage.removeItem(key))
}
