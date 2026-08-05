import { reactive, readonly } from 'vue'
import { authApi } from '../api'

const state = reactive({ loaded: false, loading: false, id: '', username: '', display_name: '', household_name: '', role: '', linked_member_id: '', linked_member_name: '', linked_member_emoji: '', linked_member_relation: '' })
let pendingRequest = null

export const authIdentity = readonly(state)

export async function loadAuthIdentity({ force = false } = {}) {
  if (state.loaded && !force) return state
  if (pendingRequest) return pendingRequest
  state.loading = true
  pendingRequest = authApi.me().then(data => {
    Object.assign(state, data || {}, { loaded: true })
    return state
  }).finally(() => {
    state.loading = false
    pendingRequest = null
  })
  return pendingRequest
}

export function updateAuthIdentity(values = {}) {
  Object.assign(state, values)
}
