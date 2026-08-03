import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const viewSource = readFileSync(new URL('../src/views/FamilyFinance.vue', import.meta.url), 'utf8')
const detailSource = readFileSync(new URL('../src/views/FamilyAssetDetail.vue', import.meta.url), 'utf8')
const functionSource = readFileSync(new URL('../functions/[[path]].js', import.meta.url), 'utf8')

test('家庭财务页覆盖资产、应收、负债和快照场景', () => {
  assert.match(viewSource, /label: '资产'/)
  assert.match(viewSource, /label: '应收'/)
  assert.match(viewSource, /label: '负债'/)
  assert.match(viewSource, /净资产档案/)
  assert.match(viewSource, /基金自动汇总，其他资产手工记账/)
})

test('净资产快照改为家庭财务变更后自动记录', () => {
  assert.doesNotMatch(viewSource, /保存今日快照|captureSnapshot/)
  assert.match(viewSource, /家庭资产、应收和负债发生变化后自动记录/)
  assert.match(functionSource, /async function captureFamilySnapshot/)
  assert.ok((functionSource.match(/queueFamilySnapshot\(\)/g) || []).length >= 9)
  assert.match(functionSource, /context\.waitUntil\([\s\S]*?captureFamilySnapshot/)
})

test('手工资产必须关联家庭成员', () => {
  assert.match(viewSource, /<span>所属成员<\/span><select v-model="form\.member_id" required>/)
  assert.match(viewSource, /请选择家庭成员/)
  assert.match(functionSource, /INSERT INTO family_assets \([\s\S]*?id, member_id/)
  assert.match(functionSource, /LEFT JOIN members m ON a\.member_id = m\.id/)
  assert.match(functionSource, /请选择有效的家庭成员/)
})

test('家庭财务页复用现有系统的页面底色、主色和卡片层级', () => {
  assert.match(viewSource, /background: #f5f5f5/)
  assert.match(viewSource, /linear-gradient\(135deg, #1e80ff 0%, #0066cc 100%\)/)
  assert.match(viewSource, /border-radius: 12px/)
  assert.match(viewSource, /background: #1e80ff/)
  assert.doesNotMatch(viewSource, /#18275b|#3549a8/)
})

test('资产表单使用大类和二级分类联动并精简低价值字段', () => {
  assert.match(viewSource, /<span>资产大类<\/span>/)
  assert.match(viewSource, /<span>二级分类<\/span>/)
  assert.match(viewSource, /filteredAssetCategories/)
  assert.match(viewSource, /handleAssetGroupChange/)
  assert.match(viewSource, /<span>记录日期<\/span>/)
  assert.doesNotMatch(viewSource, /金融机构 \/ 存放位置/)
  assert.doesNotMatch(viewSource, /<span>估值日期<\/span>/)
})

test('资产备注支持填写金融机构和存放位置等附加信息', () => {
  assert.match(viewSource, /<span>备注<\/span>/)
  assert.match(viewSource, /可填写金融机构、存放位置等附加信息/)
  assert.match(functionSource, /String\(body\.remark \?\? current\.remark \?\? ''\)\.trim\(\)/)
})

test('资产列表提供查看和更新入口，详情页展示总览、记录及管理操作', () => {
  assert.match(viewSource, />查看<\/button>/)
  assert.match(viewSource, />更新<\/button>/)
  assert.match(viewSource, /router\.push\(`\/family-finance\/assets\/\$\{id\}`\)/)
  assert.match(viewSource, /onActivated\(loadData\)/)
  assert.match(detailSource, /资产总览/)
  assert.match(detailSource, /资产记录/)
  assert.match(detailSource, /更新资产/)
  assert.match(detailSource, /删除资产/)
  assert.match(detailSource, /familyFinanceApi\.assetDetail/)
  assert.match(functionSource, /data: \{ asset: results\[0\], records: records \|\| \[\], category/)
})

test('资产详情优先展示列表或详情缓存，后台刷新失败不再阻塞整页', () => {
  assert.match(detailSource, /readPageCache\(detailCacheKey\)/)
  assert.match(detailSource, /readPageCache\('family-finance'\)/)
  assert.match(detailSource, /writePageCache\(detailCacheKey/)
  assert.match(detailSource, /loading\.value = !asset\.value/)
  assert.match(detailSource, /详情刷新失败，已显示最近数据/)
})

test('资产删除确认框使用 Vant 自动层级，不再被编辑弹层遮挡', () => {
  assert.doesNotMatch(viewSource, /:z-index="12000" class="finance-popup"/)
  assert.doesNotMatch(detailSource, /:z-index="12000" class="asset-popup"/)
  assert.match(detailSource, /type="button" class="danger" @click="removeAsset"/)
  assert.match(detailSource, /await showConfirmDialog\(\{ title: '删除资产'/)
})

test('每次资产更新都会追加记录，包括金额不变的信息更新', () => {
  const updateStart = functionSource.indexOf("const current = results[0];", functionSource.indexOf('/api/family-finance/assets'))
  const updateBlock = functionSource.slice(updateStart, functionSource.indexOf("method === 'GET'", updateStart))
  assert.match(updateBlock, /INSERT INTO family_asset_records/)
  assert.doesNotMatch(updateBlock, /if \(changed\) statements\.push/)
  assert.match(updateBlock, /更新资产信息/)
})

test('资产更新按本次增减额计算，记录不再展示前后总额', () => {
  assert.match(detailSource, />本次金额变化<\/span><input v-model="form\.change_value"/)
  assert.match(detailSource, /增加输入 100，减少输入 -100/)
  assert.doesNotMatch(detailSource, /money\(record\.previous_value\).*money\(record\.current_value\)/)
  const updateStart = functionSource.indexOf("const current = results[0];", functionSource.indexOf('/api/family-finance/assets'))
  const updateBlock = functionSource.slice(updateStart, functionSource.indexOf("method === 'GET'", updateStart))
  assert.match(updateBlock, /body\.change_value \?\? 0/)
  assert.match(updateBlock, /previousValue \+ changeValue/)
  assert.match(updateBlock, /本次减少金额不能大于当前金额/)
})

test('资产保存不等待快照和详情刷新，避免触发 12 秒超时', () => {
  assert.match(functionSource, /function queueFamilySnapshot/)
  assert.doesNotMatch(functionSource, /await captureFamilySnapshot\(\);/)
  assert.match(detailSource, /showSuccessToast\('资产已更新'\)\s*loadDetail\(\)/)
  assert.doesNotMatch(detailSource, /await loadDetail\(\)\s*showSuccessToast\('资产已更新'\)/)
})

test('家庭财务刷新优先加载总览，成员失败时保留缓存且不拖死页面', () => {
  assert.match(viewSource, /readPageCache\('family-finance'\)/)
  assert.match(viewSource, /writePageCache\('family-finance'/)
  assert.match(viewSource, /if \(loading\.value\) return/)
  assert.match(viewSource, /const memberRefresh = memberApi\.list\(\)/)
  assert.match(viewSource, /家庭成员刷新失败，保留现有数据/)
  assert.doesNotMatch(viewSource, /Promise\.all\(\[familyFinanceApi\.overview\(\), memberApi\.list\(\)\]\)/)
})

test('家庭财务后端使用独立表且基金仅通过读查询汇总', () => {
  for (const table of ['family_assets', 'family_asset_records', 'family_receivables', 'family_liabilities', 'family_snapshots']) {
    assert.match(functionSource, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`))
  }
  const overviewBlock = functionSource.slice(functionSource.indexOf("path === '/api/family-finance/overview'"), functionSource.indexOf('// ========== 事件中心 API'))
  assert.doesNotMatch(overviewBlock, /UPDATE positions|INSERT INTO positions|DELETE FROM positions/)
})

test('成员存在家庭财务记录时禁止静默删除', () => {
  assert.match(functionSource, /该成员仍有家庭资产、应收款或负债，请先处理归属/)
  assert.match(functionSource, /status: 409|, 409\)/)
})
