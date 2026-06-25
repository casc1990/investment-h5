import { normalizeAllocationProfile } from './allocation.js'

const STORAGE_KEY = 'allocation_profiles_v1'
const SELECTED_PROFILE_KEY = 'allocation_selected_profile_id_v1'

const safeJsonParse = (value, fallback) => {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export const loadAllocationProfiles = () => {
  if (typeof localStorage === 'undefined') return []
  const raw = localStorage.getItem(STORAGE_KEY)
  const parsed = safeJsonParse(raw, [])
  if (!Array.isArray(parsed)) return []
  return parsed.map(normalizeAllocationProfile)
}

export const saveAllocationProfiles = (profiles = []) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
}

export const loadSelectedAllocationProfileId = () => {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(SELECTED_PROFILE_KEY) || ''
}

export const saveSelectedAllocationProfileId = (profileId = '') => {
  if (typeof localStorage === 'undefined') return
  if (!profileId) {
    localStorage.removeItem(SELECTED_PROFILE_KEY)
    return
  }
  localStorage.setItem(SELECTED_PROFILE_KEY, profileId)
}
