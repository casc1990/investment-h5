import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const viewSource = readFileSync(new URL('../src/views/FamilyFinance.vue', import.meta.url), 'utf8')
const detailSource = readFileSync(new URL('../src/views/FamilyAssetDetail.vue', import.meta.url), 'utf8')
const functionSource = readFileSync(new URL('../functions/[[path]].js', import.meta.url), 'utf8')

test('家庭财务页覆盖资产、应收、负债和资产增长场景', () => {
  assert.match(viewSource, /label: '资产'/)
  assert.match(viewSource, /label: '应收'/)
  assert.match(viewSource, /label: '负债'/)
  assert.match(viewSource, /资产增长趋势/)
  assert.doesNotMatch(viewSource, /净资产档案/)
  assert.match(viewSource, /基金自动汇总，其他资产手工记账/)
})

test('家庭财务顶部以两列汇总资产、应收、负债和可投资资产', () => {
  assert.match(viewSource, /<span>总资产<\/span><strong :class="\{ positive: summary\.total_assets > 0 \}">\{\{ money\(summary\.total_assets\) \}\}<\/strong>/)
  assert.match(viewSource, /<span>应收款<\/span><strong :class="\{ positive: summary\.receivable_value > 0 \}">\{\{ money\(summary\.receivable_value\) \}\}<\/strong>/)
  assert.match(viewSource, /<span>总负债<\/span><strong>\{\{ money\(summary\.total_liabilities\) \}\}<\/strong>/)
  assert.match(viewSource, /<span>可投资资产<\/span><strong>\{\{ money\(summary\.investable_assets\) \}\}<\/strong>/)
  assert.match(viewSource, /grid-template-columns: repeat\(2, 1fr\)/)
})

test('顶部总资产和应收款为正数时使用红色金额', () => {
  assert.match(viewSource, /summary\.total_assets > 0/)
  assert.match(viewSource, /summary\.receivable_value > 0/)
  assert.match(viewSource, /\.hero-grid strong\.positive \{ color: #ff8a8a; \}/)
})

test('家庭财务变更后仍在后台自动记录快照', () => {
  assert.doesNotMatch(viewSource, /保存今日快照|captureSnapshot/)
  assert.match(functionSource, /async function captureFamilySnapshot/)
  assert.ok((functionSource.match(/queueFamilySnapshot\(\)/g) || []).length >= 9)
  assert.match(functionSource, /context\.waitUntil\([\s\S]*?captureFamilySnapshot/)
})

test('资产增长趋势按每次手工资产操作生成坐标点并联动记录', () => {
  assert.match(viewSource, /<TrendChart/)
  assert.match(viewSource, /@select="selectedAssetTrend = \$event"/)
  assert.match(viewSource, /selectedAssetOperations/)
  assert.match(viewSource, /操作记录/)
  assert.match(functionSource, /FROM family_asset_records r[\s\S]*?JOIN family_assets a/)
  assert.match(functionSource, /assetBalances\.set\(record\.asset_id/)
  assert.match(functionSource, /asset_trend: assetTrend/)
})

test('应收页展示汇总字段和独立应收趋势，不再显示资产趋势', () => {
  assert.match(viewSource, /应收总额/)
  assert.match(viewSource, /应收笔数/)
  assert.match(viewSource, /已逾期金额/)
  assert.match(viewSource, /已逾期笔数/)
  assert.match(viewSource, /v-if="activeTab === 'assets'" class="trend-section"/)
  assert.match(viewSource, /v-else-if="activeTab === 'receivables'" class="trend-section"/)
  assert.match(viewSource, /应收账款趋势/)
  assert.match(viewSource, /selectedReceivableOperations/)
  assert.match(functionSource, /receivable_trend: receivableTrend/)
  assert.match(functionSource, /receivable_summary: receivableSummary/)
})

test('新增应收、记录回款和直接结清都能形成趋势操作', () => {
  assert.match(functionSource, /const receivableEvents = receivableRows\.map/)
  assert.match(functionSource, /receivablePaymentQuery\.results/)
  assert.match(functionSource, /receivableBalances\.set/)
  const settleStart = functionSource.indexOf("method === 'DELETE'", functionSource.indexOf('/api/family-finance/receivables'))
  const settleBlock = functionSource.slice(settleStart, functionSource.indexOf('/api/family-finance/liabilities', settleStart))
  assert.match(settleBlock, /INSERT INTO family_receivable_payments/)
  assert.match(settleBlock, /直接结清/)
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

test('资产列表提供查看、编辑和更新入口，详情页展示总览、记录及管理操作', () => {
  assert.match(viewSource, />查看<\/button>/)
  assert.match(viewSource, />编辑<\/button>/)
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

test('只有金额更新追加资产记录，编辑原始资料不生成趋势点', () => {
  const updateStart = functionSource.indexOf("const current = results[0];", functionSource.indexOf('/api/family-finance/assets'))
  const updateBlock = functionSource.slice(updateStart, functionSource.indexOf("method === 'GET'", updateStart))
  assert.match(updateBlock, /INSERT INTO family_asset_records/)
  assert.match(updateBlock, /hasAmountChange/)
  assert.match(updateBlock, /if \(hasAmountChange\) statements\.push/)
  assert.match(updateBlock, /更新资产金额/)
})

test('资产更新按本次增减额计算，记录不再展示前后总额', () => {
  assert.match(viewSource, /isChangingAsset[\s\S]*?<span>本次金额变化<\/span><input v-model="form\.change_value"/)
  assert.match(detailSource, />本次金额变化<\/span><input v-model="form\.change_value"/)
  assert.match(detailSource, /增加输入 100，减少输入 -100/)
  assert.doesNotMatch(detailSource, /money\(record\.previous_value\).*money\(record\.current_value\)/)
  const updateStart = functionSource.indexOf("const current = results[0];", functionSource.indexOf('/api/family-finance/assets'))
  const updateBlock = functionSource.slice(updateStart, functionSource.indexOf("method === 'GET'", updateStart))
  assert.match(updateBlock, /body\.change_value \?\? 0/)
  assert.match(updateBlock, /previousValue \+ changeValue/)
  assert.match(updateBlock, /本次减少金额不能大于当前金额/)
})

test('编辑资产只修改原始资料，更新入口只保留金额变化字段', () => {
  assert.match(viewSource, /assetAction\.value = 'edit'/)
  assert.match(viewSource, /assetAction\.value = 'change'/)
  assert.match(viewSource, /openAssetChange/)
  assert.match(detailSource, /editorMode === 'info'/)
  assert.match(detailSource, /openInfoEdit/)
  assert.match(detailSource, /openAmountUpdate/)
  assert.match(detailSource, /v-if="editorMode === 'info'" type="button" class="danger"/)
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
