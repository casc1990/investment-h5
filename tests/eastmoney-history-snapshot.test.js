import test from 'node:test'
import assert from 'node:assert/strict'

import {
  mergeConfirmedHistoricalSnapshot,
  parseEastmoneyHistoricalSnapshot,
} from '../functions/[[path]].js'

const payload = {
  Data: {
    LSJZList: [
      { FSRQ: '2026-07-14', DWJZ: '1.0318', JZZZL: '0.01' },
      { FSRQ: '2026-07-13', DWJZ: '1.0317', JZZZL: '-0.01' },
    ],
  },
}

test('解析 F10 最新确认净值及上一日净值', () => {
  assert.deepEqual(parseEastmoneyHistoricalSnapshot(payload), {
    nav: 1.0318,
    navDate: '2026-07-14',
    prevNAV: 1.0317,
    changeRate: 0.01,
  })
})

test('F10 日期更新时覆盖旧确认净值和旧估算日期', () => {
  const result = mergeConfirmedHistoricalSnapshot({
    nav: 1.0318,
    navDate: '2026-07-13',
    gszzl: -0.01,
    prev_nav: 1.0318,
    dwjz: 1.0317,
    historicalSnapshot: parseEastmoneyHistoricalSnapshot(payload),
  })

  assert.deepEqual(result, {
    nav: 1.0318,
    navDate: '2026-07-14',
    gszzl: 0.01,
    prev_nav: 1.0317,
    dwjz: 1.0318,
  })
})

test('F10 日期更旧时不回退现有快照', () => {
  const current = {
    nav: 1.04,
    navDate: '2026-07-15',
    gszzl: 0.79,
    prev_nav: 1.0318,
    dwjz: 1.04,
  }

  assert.deepEqual(mergeConfirmedHistoricalSnapshot({
    ...current,
    historicalSnapshot: parseEastmoneyHistoricalSnapshot(payload),
  }), current)
})
