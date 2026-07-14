import { advisoryApi, positionApi, statsApi } from '../api'
import { persistProfitSnapshot, recordProfitSnapshot } from './profitLedger'
import { buildSnapshotPayloadFromApis } from './perfHelpers'

export const fetchProfitSnapshotData = async () => {
  const [overviewData, positionsData, advisoryData] = await Promise.all([
    statsApi.overview(),
    positionApi.list(),
    advisoryApi.list(),
  ])

  return buildSnapshotPayloadFromApis({
    overviewData,
    positionsData,
    advisoryData,
  })
}

export const captureProfitSnapshotFromApis = async () => {
  const payload = await fetchProfitSnapshotData()

  const snapshotResult = recordProfitSnapshot({
    summary: payload.overview?.summary,
    positions: payload.snapshotPositions,
  })
  if (snapshotResult.saved) {
    persistProfitSnapshot(snapshotResult.snapshot).catch(error => {
      console.warn('[profitSnapshot] background save failed:', error)
    })
  }

  return {
    ...payload,
    snapshotResult,
  }
}
