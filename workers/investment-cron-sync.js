const SYNC_URL = 'https://investment-h5.pages.dev/api/fund/sync/pending?mode=night&includeQdii=true&batchSize=3'
const MAX_BATCHES = 12

async function triggerSync(env) {
  let totalSynced = 0
  let remaining = null

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const response = await fetch(SYNC_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'X-Cron-Secret': env.CRON_SYNC_SECRET,
      },
    })
    const body = await response.text()
    if (!response.ok) {
      throw new Error(`Investment sync failed (${response.status}): ${body.slice(0, 500)}`)
    }

    const result = JSON.parse(body)
    const synced = Number(result.synced || 0)
    const advanced = Object.values(result.results || {}).filter((item) => item.advanced).length
    remaining = Number(result.still_pending_count || 0)
    totalSynced += synced
    if (remaining === 0 || advanced === 0) break
  }

  return { synced: totalSynced, deferred: remaining || 0 }
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(triggerSync(env))
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'investment-cron-sync' })
    }
    return new Response('Not Found', { status: 404 })
  },
}
