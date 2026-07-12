import { normalizeAllocationProfile } from './allocation.js'
import { allocationProfileApi } from '../api/index.js'

const STORAGE_KEY = 'allocation_profiles_v1'
const SELECTED_PROFILE_KEY = 'allocation_selected_profile_id_v1'
const MIGRATED_KEY = 'allocation_profiles_server_migrated_v1'
export const ALLOCATION_PROFILES_UPDATED_EVENT = 'allocation-profiles-updated'

const dispatchAllocationProfilesUpdated = (detail) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(ALLOCATION_PROFILES_UPDATED_EVENT, { detail }))
}

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
  dispatchAllocationProfilesUpdated({ type: 'profiles' })
}

export const fetchAllocationProfiles = async () => {
  const localProfiles = loadAllocationProfiles()
  const data = await allocationProfileApi.list()
  let serverProfiles = (Array.isArray(data) ? data : data?.profiles || []).map(normalizeAllocationProfile)

  if (typeof localStorage !== 'undefined' && !localStorage.getItem(MIGRATED_KEY) && localProfiles.length) {
    const serverIds = new Set(serverProfiles.map(profile => profile.id))
    const missingLocalProfiles = localProfiles.filter(profile => !serverIds.has(profile.id))
    const migratedProfiles = await Promise.all(missingLocalProfiles.map(profile => allocationProfileApi.save(profile)))
    serverProfiles = [...serverProfiles, ...migratedProfiles.map(result => normalizeAllocationProfile(result?.profile || result))]
    localStorage.setItem(MIGRATED_KEY, '1')
  }

  saveAllocationProfiles(serverProfiles)
  return serverProfiles
}

export const persistAllocationProfiles = async (profiles = [], previousProfiles = loadAllocationProfiles()) => {
  const normalized = profiles.map(normalizeAllocationProfile)
  const nextIds = new Set(normalized.map(profile => profile.id))
  const previousById = new Map(previousProfiles.map(profile => [profile.id, normalizeAllocationProfile(profile)]))
  const changedProfiles = normalized.filter(profile => {
    const previous = previousById.get(profile.id)
    return !previous || JSON.stringify(profile) !== JSON.stringify(previous)
  })
  const removedProfiles = previousProfiles.filter(profile => !nextIds.has(profile.id))
  const [savedResults] = await Promise.all([
    Promise.all(changedProfiles.map(profile => allocationProfileApi.save(profile))),
    Promise.all(removedProfiles.map(profile => allocationProfileApi.delete(profile.id, Number(profile.version || 0)))),
  ])
  const savedById = new Map(savedResults.map(result => {
    const saved = normalizeAllocationProfile(result?.profile || result)
    return [saved.id, saved]
  }))
  const persisted = normalized.map(profile => savedById.get(profile.id) || profile)
  saveAllocationProfiles(persisted)
  if (typeof localStorage !== 'undefined') localStorage.setItem(MIGRATED_KEY, '1')
  return persisted
}

export const loadSelectedAllocationProfileId = () => {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(SELECTED_PROFILE_KEY) || ''
}

export const saveSelectedAllocationProfileId = (profileId = '') => {
  if (typeof localStorage === 'undefined') return
  if (!profileId) {
    localStorage.removeItem(SELECTED_PROFILE_KEY)
    dispatchAllocationProfilesUpdated({ type: 'selected', profileId: '' })
    return
  }
  localStorage.setItem(SELECTED_PROFILE_KEY, profileId)
  dispatchAllocationProfilesUpdated({ type: 'selected', profileId })
}
