import test from 'node:test'
import assert from 'node:assert/strict'

import { parseUpcomingDividendRows } from '../functions/[[path]].js'

const html = `
  <table><tbody>
    <tr><td>2026年</td><td>2026-07-20</td><td>2026-07-20</td><td>每份派现金0.0083元</td><td>2026-07-21</td></tr>
    <tr><td>2026年</td><td>2026-08-15</td><td>2026-08-15</td><td>每份派现金0.0100元</td><td>2026-08-16</td></tr>
    <tr><td>2026年</td><td>2026-07-10</td><td>2026-07-10</td><td>每份派现金0.0060元</td><td>2026-07-11</td></tr>
  </tbody></table>
`

test('只收集今天起未来30天内的基金分红安排', () => {
  const rows = parseUpcomingDividendRows(html, {
    now: new Date('2026-07-11T02:00:00Z'),
    daysAhead: 30,
  })

  assert.deepEqual(rows, [{
    record_date: '2026-07-20',
    ex_date: '2026-07-20',
    dividend_per_share: 0.0083,
    payment_date: '2026-07-21',
  }])
})

test('分红解析兼容表格标签之间的空白', () => {
  const spacedHtml = '<tr>\n<td>2026年</td> <td>2026-07-11</td> <td>2026-07-11</td> <td>每份派现金0.0050元</td> <td>2026-07-14</td>\n</tr>'
  const rows = parseUpcomingDividendRows(spacedHtml, { now: new Date('2026-07-11T00:00:00+08:00') })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].dividend_per_share, 0.005)
})
