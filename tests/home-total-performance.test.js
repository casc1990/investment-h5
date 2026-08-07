import test from 'node:test'
import assert from 'node:assert/strict'

import { detectOverviewAssetCategory } from '../functions/[[path]].js'

test('首页成员资产分类覆盖纯债、固收、红利、指数、QDII和其他', () => {
  assert.equal(detectOverviewAssetCategory('易方达纯债债券A'), 'pure_bond')
  assert.equal(detectOverviewAssetCategory('某某固收增强一年持有A'), 'fixed_income')
  assert.equal(detectOverviewAssetCategory('中证红利ETF联接A'), 'dividend')
  assert.equal(detectOverviewAssetCategory('沪深300指数增强A'), 'index')
  assert.equal(detectOverviewAssetCategory('纳斯达克100ETF联接(QDII)'), 'qdii')
  assert.equal(detectOverviewAssetCategory('灵活配置混合A'), 'other')
})
