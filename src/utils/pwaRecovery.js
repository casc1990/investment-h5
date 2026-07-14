const RECOVERY_STORAGE_KEY = 'investment_pwa_recovery_at'
const RECOVERY_COOLDOWN_MS = 2 * 60 * 1000

export const isStaleAssetLoadError = (error) => {
  const message = String(error?.message || error?.reason?.message || error || '')
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading CSS chunk|ChunkLoadError|expected a JavaScript(?:-or-Wasm)? module script|MIME type/i.test(message)
}

export async function recoverFromStalePwaAssets({
  windowRef = globalThis.window,
  navigatorRef = globalThis.navigator,
  cachesRef = globalThis.caches,
  now = Date.now(),
} = {}) {
  if (!windowRef?.sessionStorage || !windowRef?.location) return false

  const lastRecoveryAt = Number(windowRef.sessionStorage.getItem(RECOVERY_STORAGE_KEY) || 0)
  if (lastRecoveryAt > 0 && now - lastRecoveryAt < RECOVERY_COOLDOWN_MS) return false
  windowRef.sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(now))

  try {
    const registrations = await navigatorRef?.serviceWorker?.getRegistrations?.() || []
    await Promise.all(registrations.map(registration => registration.unregister()))
  } catch (error) {
    console.warn('Failed to unregister stale service worker:', error)
  }

  try {
    const cacheKeys = await cachesRef?.keys?.() || []
    await Promise.all(cacheKeys.map(key => cachesRef.delete(key)))
  } catch (error) {
    console.warn('Failed to clear stale PWA caches:', error)
  }

  windowRef.location.reload()
  return true
}
