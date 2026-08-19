import { advisoryApi, positionApi, profitSnapshotApi, statsApi } from '../api'
import { recordProfitSnapshot } from './profitLedger'
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
  const [payload, captureData] = await Promise.all([
    fetchProfitSnapshotData(),
    profitSnapshotApi.capture(),
  ])
  const serverSnapshot = captureData?.snapshot || captureData?.snapshots?.[0]

  const snapshotResult = recordProfitSnapshot({
    summary: serverSnapshot?.summary,
    positions: serverSnapshot?.positions,
    capturedAt: serverSnapshot?.captured_at,
    dateKey: serverSnapshot?.date,
  })

  return {
    ...payload,
    serverSnapshot,
    snapshotResult,
  }
}
