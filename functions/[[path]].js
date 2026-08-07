/**
 * 投资管理系统 - Cloudflare Pages Function (直接访问 D1)
 * 不依赖外部 API，中国可直接访问
 */

import { buildDividendTrade, rebuildPositionFromTrades, normalizeTradeType, toNumber, TRADE_TYPES } from '../shared/tradeEngine.js'
import { buildServerProfitSnapshot } from '../shared/profitSnapshot.js'
import {
  FAMILY_ASSET_CATEGORY_MAP,
  FAMILY_LIABILITY_CATEGORIES,
  FAMILY_RECEIVABLE_CATEGORIES,
  buildFamilySummary,
  validateFamilyAsset,
} from '../shared/familyFinance.js'

let runtimeSchemaInitPromise = null;
let advisorySchemaInitPromise = null;

// 生成 UUID
function generateId() {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 16);
}

// 通用响应
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}

const ALLOCATION_ASSET_TYPES = new Set(['pure_bond', 'fixed_income', 'dividend', 'index', 'qdii', 'other']);
const ALLOCATION_FUND_STATUSES = new Set(['保留', '观察', '可调出', '禁买']);

export function validateAllocationProfile(profile = {}) {
  const errors = [];
  if (!String(profile.id || '').match(/^[\w-]+$/)) errors.push('策略ID无效');
  const name = String(profile.name || '').trim();
  if (!name) errors.push('策略名称不能为空');
  if (name.length > 80) errors.push('策略名称不能超过80个字符');
  if (String(profile.note || '').length > 500) errors.push('备注不能超过500个字符');
  if (!Number.isFinite(Number(profile.totalAsset)) || Number(profile.totalAsset) <= 0) errors.push('组合总资产必须大于0');
  if (!Number.isFinite(Number(profile.targetProfitRate))) errors.push('目标收益率无效');
  const buckets = Array.isArray(profile.buckets) ? profile.buckets : [];
  if (!buckets.length) errors.push('至少需要一个资产分类');
  const bucketTypes = new Set();
  let targetTotal = 0;
  for (const bucket of buckets) {
    if (!ALLOCATION_ASSET_TYPES.has(bucket?.assetType)) errors.push('存在无效资产分类');
    if (bucketTypes.has(bucket?.assetType)) errors.push('资产分类不能重复');
    bucketTypes.add(bucket?.assetType);
    const targetPct = Number(bucket?.targetPct);
    const maxDeviationPct = Number(bucket?.maxDeviationPct);
    if (!Number.isFinite(targetPct) || targetPct < 0 || targetPct > 100) errors.push('目标比例必须在0到100之间');
    if (!Number.isFinite(maxDeviationPct) || maxDeviationPct < 0 || maxDeviationPct > 100) errors.push('允许偏差必须在0到100之间');
    targetTotal += Number.isFinite(targetPct) ? targetPct : 0;
  }
  if (Math.abs(targetTotal - 100) > 0.001) errors.push('目标比例合计必须等于100%');
  const positionIds = new Set();
  for (const fund of Array.isArray(profile.funds) ? profile.funds : []) {
    if (!String(fund?.positionId || '')) errors.push('基金持仓ID不能为空');
    if (positionIds.has(fund?.positionId)) errors.push('同一持仓不能重复纳入策略');
    positionIds.add(fund?.positionId);
    if (!ALLOCATION_ASSET_TYPES.has(fund?.assetType)) errors.push('基金资产分类无效');
    if (!ALLOCATION_FUND_STATUSES.has(fund?.status || '保留')) errors.push('基金状态无效');
  }
  return [...new Set(errors)];
}

export function pruneAllocationProfileFunds(profile = {}, existingPositionIds = []) {
  const existingIds = existingPositionIds instanceof Set
    ? existingPositionIds
    : new Set(existingPositionIds || []);
  const funds = Array.isArray(profile.funds) ? profile.funds : [];
  const prunedPositionIds = [...new Set(
    funds
      .map(fund => fund?.positionId)
      .filter(positionId => positionId && !existingIds.has(positionId))
  )];
  return {
    profile: {
      ...profile,
      funds: funds.filter(fund => existingIds.has(fund?.positionId)),
    },
    prunedPositionIds,
  };
}

export function requiresAuthentication(path = '', method = 'GET') {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (normalizedMethod === 'OPTIONS') return false;
  if (!path.startsWith('/api/')) return false;
  if ((path === '/health' || path === '/api/health') && normalizedMethod === 'GET') return false;
  if (path === '/api/auth/status' && normalizedMethod === 'GET') return false;
  if ((path === '/api/auth/setup' || path === '/api/auth/login' || path === '/api/auth/register') && normalizedMethod === 'POST') return false;
  if (/^\/api\/auth\/invite\/[A-Za-z0-9_-]+$/.test(path) && normalizedMethod === 'GET') return false;
  return true;
}

export const DEFAULT_HOUSEHOLD_ID = 'default-household';

export function canWriteHouseholdData(role = '') {
  return role === 'super_admin' || role === 'owner' || role === 'admin';
}

function safeEqualStrings(left = '', right = '') {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] || 0) ^ (b[index] || 0);
  }
  return mismatch === 0;
}

export function isAuthorizedCronRequest(request, env = {}) {
  const configuredSecret = String(env.CRON_SYNC_SECRET || '');
  const providedSecret = request.headers.get('X-Cron-Secret') || '';
  return configuredSecret.length >= 32 && safeEqualStrings(configuredSecret, providedSecret);
}

function addChinaBusinessDays(date, offset) {
  const direction = offset >= 0 ? 1 : -1;
  let remaining = Math.abs(Number(offset || 0));
  let cursor = new Date(date);
  while (remaining > 0) {
    cursor = addDays(cursor, direction);
    const weekday = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', weekday: 'short' }).format(cursor);
    if (weekday !== 'Sat' && weekday !== 'Sun') remaining -= 1;
  }
  return cursor;
}

export function parseUpcomingDividendRows(html = '', {
  now = new Date(),
  businessDaysBefore = 3,
  businessDaysAfter = 3,
} = {}) {
  const startDate = getChinaDateString(addChinaBusinessDays(now, -Math.max(0, Number(businessDaysBefore || 0))));
  const endDate = getChinaDateString(addChinaBusinessDays(now, Math.max(0, Number(businessDaysAfter || 0))));
  const rows = [];
  const rowPattern = /<tr>\s*<td>\d{4}年<\/td>\s*<td>(\d{4}-\d{2}-\d{2})<\/td>\s*<td>(\d{4}-\d{2}-\d{2})<\/td>\s*<td>每份派现金([\d.]+)元<\/td>\s*<td>(\d{4}-\d{2}-\d{2})<\/td>\s*<\/tr>/g;
  let match;
  while ((match = rowPattern.exec(String(html || ''))) !== null) {
    const [, recordDate, exDate, dividendPerShare, paymentDate] = match;
    if (recordDate < startDate || recordDate > endDate) continue;
    rows.push({
      record_date: recordDate,
      ex_date: exDate,
      dividend_per_share: Number(dividendPerShare),
      payment_date: paymentDate,
    });
  }
  return rows;
}

function getChinaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// 上交所 2026 年部分节假日休市安排（周末由 weekday 判断统一处理）。
// 后续年度发布休市安排后，只需补充对应日期即可。
const CHINA_MARKET_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-02',
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-23',
  '2026-04-06',
  '2026-05-01', '2026-05-04', '2026-05-05',
  '2026-06-19',
  '2026-09-25',
  '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07',
]);

export function isChinaTradingDay(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
  }).format(date);
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  return !CHINA_MARKET_HOLIDAYS.has(getChinaDateString(date));
}

function getPreviousChinaTradingDateString(now = new Date()) {
  let cursor = addDays(now, -1);

  while (true) {
    if (isChinaTradingDay(cursor)) {
      return getChinaDateString(cursor);
    }

    cursor = addDays(cursor, -1);
  }
}

function getNthPreviousChinaTradingDateString(now = new Date(), n = 1) {
  let cursor = new Date(now);
  let remaining = Math.max(1, Number(n || 1));

  while (remaining > 0) {
    cursor = addDays(cursor, -1);
    if (isChinaTradingDay(cursor)) {
      remaining -= 1;
    }
  }

  return getChinaDateString(cursor);
}

function isQdiiFund(fundName = '') {
  return /QDII/i.test(String(fundName || ''));
}

const NON_DAILY_NAV_FUND_CODES = new Set(['002826']);

export function isDailyNavTrackingFund(fundCode = '') {
  return !NON_DAILY_NAV_FUND_CODES.has(String(fundCode || '').trim());
}

export function getDailyProfitMeta(navDate, now = new Date(), fundName = '') {
  const chinaToday = getChinaDateString(now);
  const isTodayUpdated = Boolean(navDate) && navDate === chinaToday;
  const isLatestUpdated = isFundNavUpdated({ navDate, fundName, now, mode: 'night' });

  return {
    daily_profit_label: isTodayUpdated ? '今日收益' : '昨日收益',
    daily_profit_rate_label: isTodayUpdated ? '今日收益率' : '昨日收益率',
    daily_profit_updated: isLatestUpdated,
    daily_profit_update_text: isTodayUpdated
      ? '今日收益更新'
      : (isLatestUpdated ? '最新收益已更新' : ''),
  };
}

export function shouldShowNavUpdateNotice({
  status = 'idle',
  snapshotUpdatedAt = null,
  navDate = null,
  now = new Date(),
} = {}) {
  if (status === 'waiting' || status === 'error') return true;
  if (status !== 'updated') return false;

  const chinaToday = getChinaDateString(now);
  const updatedAt = Number(snapshotUpdatedAt || 0);
  if (updatedAt > 0) {
    return getChinaDateString(new Date(updatedAt * 1000)) === chinaToday;
  }
  return Boolean(navDate) && String(navDate) === chinaToday;
}

export function summarizeOverviewDailyProfits(positionDailyProfit = 0, advisoryDailyProfit = 0) {
  const fundProfit = Number(positionDailyProfit || 0);
  const advisoryProfit = Number(advisoryDailyProfit || 0);

  return {
    totalYesterdayProfit: Number((fundProfit + advisoryProfit).toFixed(2)),
    totalPositionYesterdayProfit: Number(fundProfit.toFixed(2)),
    totalAdvisoryYesterdayProfit: Number(advisoryProfit.toFixed(2)),
  };
}

export function calculateOverviewPositionDailyProfit(position = {}, snapshot = null, now = new Date()) {
  const quantity = Number(position.quantity || position.shares || 0);
  const confirmedNav = Number(snapshot?.dwjz || snapshot?.gsz || position.nav_dwjz || position.nav_gsz || 0);
  const prevNav = Number(snapshot?.prev_nav || position.prev_nav || 0);
  const storedChangeRate = snapshot?.gszzl ?? position.nav_gszzl ?? null;
  const navDate = snapshot?.jzrq ?? position.nav_jzrq ?? null;

  return resolveDisplayedYesterdayProfit({
    shares: quantity,
    confirmedNav,
    prevNav,
    storedChangeRate,
    navDate,
    fundName: position.fund_name || snapshot?.name || '',
    now,
  });
}

export function calculateOverviewPositionDailyProfitForDate(position = {}, snapshot = null, profitDate = '', now = new Date()) {
  const updatedAt = Number(snapshot?.updated_at ?? position.nav_updated_at ?? 0);
  const confirmationDate = updatedAt > 0
    ? getChinaDateString(new Date(updatedAt * 1000))
    : String(snapshot?.jzrq ?? position.nav_jzrq ?? '').slice(0, 10);
  if (!profitDate || confirmationDate !== String(profitDate).slice(0, 10)) return 0;
  return calculateOverviewPositionDailyProfit(position, snapshot, now);
}

export function parsePingzhongdataNetWorth(text = '') {
  const navMatch = String(text).match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/);
  if (!navMatch) return null;

  try {
    const rows = JSON.parse(navMatch[1]);
    if (!Array.isArray(rows) || rows.length < 2) return null;

    const latest = rows[rows.length - 1] || {};
    const previous = rows[rows.length - 2] || {};
    const currentNAV = Number(latest.y);
    const prevNAV = Number(previous.y);
    if (!Number.isFinite(currentNAV) || !Number.isFinite(prevNAV)) return null;

    const parsedDate = new Date(Number(latest.x) + 8 * 3600 * 1000).toISOString().split('T')[0];
    const equityReturn = Number(latest.equityReturn);
    const changeRate = Number.isFinite(equityReturn)
      ? Number(equityReturn.toFixed(4))
      : (prevNAV > 0 ? Number((((currentNAV - prevNAV) / prevNAV) * 100).toFixed(4)) : null);

    return {
      currentNAV,
      prevNAV,
      navDate: parsedDate,
      changeRate,
      unitMoney: latest.unitMoney || '',
    };
  } catch (_) {
    return null;
  }
}

export function parseEastmoneyHistoricalSnapshot(payload = '') {
  let parsed = payload;
  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload);
    } catch (_) {
      return null;
    }
  }

  const rows = Array.isArray(parsed?.Data?.LSJZList) ? parsed.Data.LSJZList : [];
  const normalizedRows = rows
    .map((row) => {
      const rawChangeRate = String(row?.JZZZL ?? '').trim();
      return {
        nav: Number(row?.DWJZ),
        navDate: String(row?.FSRQ || '').split(' ')[0],
        changeRate: rawChangeRate ? Number(rawChangeRate) : Number.NaN,
      };
    })
    .filter((row) => row.nav > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.navDate))
    .sort((a, b) => b.navDate.localeCompare(a.navDate));

  const latest = normalizedRows[0];
  if (!latest) return null;

  const previous = normalizedRows.find((row) => row.navDate < latest.navDate);
  const calculatedChangeRate = previous?.nav > 0
    ? Number((((latest.nav - previous.nav) / previous.nav) * 100).toFixed(4))
    : null;

  return {
    nav: latest.nav,
    navDate: latest.navDate,
    prevNAV: previous?.nav || null,
    changeRate: Number.isFinite(latest.changeRate) ? latest.changeRate : calculatedChangeRate,
  };
}


function parsePingzhongdataJsonVar(text, varName) {
  const source = String(text || '');
  const match = source.match(new RegExp(`${varName}\s*=\s*(\[[\s\S]*?\]);`));
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function toHistoryDateKey(timestamp) {
  const date = new Date(Number(timestamp) + (8 * 60 * 60 * 1000));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

function parseOfficialPerformanceStatsFromHtml(htmlText = '') {
  const source = String(htmlText || '');
  const labelMap = {
    '近1月': '1m',
    '近3月': '3m',
    '近6月': '6m',
    '近1年': '1y',
    '近3年': '3y',
    '成立来': 'all',
  };
  const result = {};
  const matches = source.matchAll(/<dd><span>(近1月|近3月|近6月|近1年|近3年|成立来)：<\/span><span class="ui-font-middle ui-color-red ui-num">([^<]+)<\/span><\/dd>/g);
  for (const match of matches) {
    const key = labelMap[match[1]];
    const value = Number(String(match[2] || '').replace('%', '').trim());
    if (key && Number.isFinite(value)) {
      result[key] = value;
    }
  }
  return result;
}

function buildFundPerformanceStats(rows = [], officialReturns = {}) {
  if (!rows.length) return [];

  const latest = rows[rows.length - 1];
  const latestTime = latest.time;
  const first = rows[0];
  const ranges = [
    { key: '1m', label: '近1月', days: 30 },
    { key: '3m', label: '近3月', days: 90 },
    { key: '6m', label: '近6月', days: 180 },
    { key: '1y', label: '近1年', days: 365 },
    { key: '3y', label: '近3年', days: 365 * 3 },
  ];

  const stats = ranges.map((range) => {
    const targetTime = latestTime - (range.days * 24 * 60 * 60 * 1000);
    const officialReturnPct = Number(officialReturns?.[range.key]);
    if (first.time > targetTime) {
      return {
        key: range.key,
        label: range.label,
        return_pct: Number.isFinite(officialReturnPct) ? Number(officialReturnPct.toFixed(2)) : null,
        start_date: null,
        end_date: latest.date,
      };
    }

    const startRow = [...rows].reverse().find((item) => item.time <= targetTime) || first;
    const baseNav = Number(startRow.nav || 0);
    const fallbackReturnPct = baseNav > 0 ? Number((((latest.nav - baseNav) / baseNav) * 100).toFixed(2)) : null;
    const returnPct = Number.isFinite(officialReturnPct) ? Number(officialReturnPct.toFixed(2)) : fallbackReturnPct;
    return {
      key: range.key,
      label: range.label,
      return_pct: returnPct,
      start_date: startRow.date,
      end_date: latest.date,
    };
  });

  const baseNav = Number(first.nav || 0);
  const allFallbackReturnPct = baseNav > 0 ? Number((((latest.nav - baseNav) / baseNav) * 100).toFixed(2)) : null;
  const allOfficialReturnPct = Number(officialReturns?.all);
  stats.push({
    key: 'all',
    label: '成立以来',
    return_pct: Number.isFinite(allOfficialReturnPct) ? Number(allOfficialReturnPct.toFixed(2)) : allFallbackReturnPct,
    start_date: first.date,
    end_date: latest.date,
  });

  return stats;
}

export function parsePingzhongdataFundHistory(text, htmlText = '') {
  const source = String(text || '');
  const fundNameMatch = source.match(/f_S_name\s*=\s*["']([^"']+)["']/);
  const trendMatch = source.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/);
  const fundName = fundNameMatch ? fundNameMatch[1] : '';
  const officialReturns = {
    ...parseOfficialPerformanceStatsFromHtml(htmlText),
    '1m': Number(source.match(/syl_1y\s*=\s*["']([^"']+)["']/)?.[1]),
    '3m': Number(source.match(/syl_3y\s*=\s*["']([^"']+)["']/)?.[1]),
    '6m': Number(source.match(/syl_6y\s*=\s*["']([^"']+)["']/)?.[1]),
    '1y': Number(source.match(/syl_1n\s*=\s*["']([^"']+)["']/)?.[1]),
  };

  if (!trendMatch) {
    return {
      fund_name: fundName,
      net_worth_trend: [],
      performance_stats: [],
    };
  }

  let parsedRows = [];
  try {
    parsedRows = JSON.parse(trendMatch[1]);
  } catch (_) {
    parsedRows = [];
  }

  const trendRows = parsedRows
    .map((item) => {
      const nav = Number(item?.y);
      const time = Number(item?.x);
      if (!Number.isFinite(nav) || !Number.isFinite(time)) return null;
      return {
        time,
        date: toHistoryDateKey(time),
        nav: Number(nav.toFixed(4)),
        daily_return_pct: Number.isFinite(Number(item?.equityReturn)) ? Number(Number(item.equityReturn).toFixed(2)) : null,
        unit_money: item?.unitMoney || '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  const baseNav = Number(trendRows[0]?.nav || 0);
  const netWorthTrend = trendRows.map((row, index) => {
    const prev = trendRows[index - 1];
    const fallbackDaily = prev && prev.nav > 0 ? Number((((row.nav - prev.nav) / prev.nav) * 100).toFixed(2)) : 0;
    return {
      date: row.date,
      nav: row.nav,
      daily_return_pct: row.daily_return_pct ?? fallbackDaily,
      cumulative_return_pct: baseNav > 0 ? Number((((row.nav - baseNav) / baseNav) * 100).toFixed(2)) : 0,
      unit_money: row.unit_money,
      time: row.time,
    };
  });

  return {
    fund_name: fundName,
    net_worth_trend: netWorthTrend,
    performance_stats: buildFundPerformanceStats(netWorthTrend, officialReturns),
    official_returns: officialReturns,
  };
}

export function mergeLatestConfirmedNavIntoHistory(rows = [], snapshot = {}) {
  const ordered = [...(Array.isArray(rows) ? rows : [])]
    .filter(row => row?.date && Number(row?.nav) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const date = String(snapshot?.date || '');
  const nav = Number(snapshot?.nav || 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(nav) || nav <= 0) return ordered;

  const existingIndex = ordered.findIndex(row => row.date === date);
  const latestDate = ordered.at(-1)?.date || '';
  if (existingIndex < 0 && latestDate && date < latestDate) return ordered;

  const previous = existingIndex > 0 ? ordered[existingIndex - 1] : ordered.at(-1);
  const previousNav = Number(previous?.nav || 0);
  const suppliedReturn = Number(snapshot?.daily_return_pct);
  const dailyReturnPct = Number.isFinite(suppliedReturn)
    ? Number(suppliedReturn.toFixed(2))
    : previousNav > 0
      ? Number((((nav - previousNav) / previousNav) * 100).toFixed(2))
      : 0;
  const baseNav = Number(ordered[0]?.nav || nav);
  const mergedRow = {
    ...(existingIndex >= 0 ? ordered[existingIndex] : {}),
    time: new Date(`${date}T00:00:00+08:00`).getTime(),
    date,
    nav: Number(nav.toFixed(4)),
    daily_return_pct: dailyReturnPct,
    cumulative_return_pct: baseNav > 0 ? Number((((nav - baseNav) / baseNav) * 100).toFixed(2)) : 0,
    unit_money: existingIndex >= 0 ? ordered[existingIndex]?.unit_money || '' : '',
  };

  if (existingIndex >= 0) ordered.splice(existingIndex, 1, mergedRow);
  else ordered.push(mergedRow);
  return ordered;
}

export function resolveDisplayedNavGszzl({
  storedChangeRate = null,
  estimateNav = null,
  confirmedNav = 0,
  prevNav = 0,
} = {}) {
  if (storedChangeRate !== null && storedChangeRate !== undefined && Number.isFinite(Number(storedChangeRate))) {
    return Number(Number(storedChangeRate).toFixed(4));
  }

  const estimate = Number(estimateNav || 0);
  const confirmed = Number(confirmedNav || 0);
  const previous = Number(prevNav || 0);
  const hasIntradayEstimate = estimate > 0 && confirmed > 0
    && Math.abs(estimate - confirmed) > 0.000001;

  if (hasIntradayEstimate) {
    return Number((((estimate - confirmed) / confirmed) * 100).toFixed(4));
  }

  if (confirmed > 0 && previous > 0) {
    return Number((((confirmed - previous) / previous) * 100).toFixed(4));
  }

  return null;
}

export function resolveDisplayedYesterdayProfit({
  shares = 0,
  confirmedNav = 0,
  prevNav = 0,
  storedChangeRate = null,
  navDate = null,
  fundName = '',
  now = new Date(),
} = {}) {
  const quantity = Number(shares || 0);

  // 如果有净值日期，判断是否为最新（普通基金：今天/上一交易日；QDII 允许额外晚一个交易日）
  if (navDate !== null && navDate !== undefined && navDate !== '') {
    const today = getChinaDateString(now);
    const previousTradingDate = getPreviousChinaTradingDateString(now);
    const secondPreviousTradingDate = getNthPreviousChinaTradingDateString(now, 2);
    const thirdPreviousTradingDate = getNthPreviousChinaTradingDateString(now, 3);
    const isLatestDate = navDate === today || navDate === previousTradingDate;
    const isQdiiLaggedLatestDate = isQdiiFund(fundName)
      && (navDate === previousTradingDate || navDate === secondPreviousTradingDate || navDate === thirdPreviousTradingDate);
    if (!isLatestDate && !isQdiiLaggedLatestDate) {
      return 0;
    }
  }

  const confirmed = Number(confirmedNav || 0);
  const previous = Number(prevNav || 0);
  const pct = storedChangeRate !== null && storedChangeRate !== undefined && Number.isFinite(Number(storedChangeRate))
    ? Number(storedChangeRate)
    : null;

  if (quantity > 0 && previous > 0 && pct !== null) {
    return Number((quantity * previous * (pct / 100)).toFixed(4));
  }

  if (quantity > 0 && confirmed > 0 && previous > 0) {
    return Number(((confirmed - previous) * quantity).toFixed(4));
  }

  return 0;
}

export function mergeFundEstimateIntoSnapshot({
  nav = null,
  navDate = null,
  gszzl = null,
  prev_nav = null,
  estimateNav = null,
  estimateChange = null,
  officialNavYesterday = null,
  fundGzNavDate = null,
} = {}) {
  const merged = {
    nav,
    navDate,
    gszzl,
    prev_nav,
    dwjz: null,
  };

  const currentNav = Number(nav || 0);
  const estimate = Number(estimateNav || 0);
  const officialNav = Number(officialNavYesterday || 0);
  const currentChangeRate = gszzl !== null && gszzl !== undefined && Number.isFinite(Number(gszzl))
    ? Number(gszzl)
    : null;
  const hasEstimate = estimate > 0;
  const hasOfficialNav = officialNav > 0;
  const hasUsableFundGz = navDate && fundGzNavDate && (hasEstimate || hasOfficialNav);
  const dateIsNewer = fundGzNavDate > navDate;
  const hasSameDayEstimate = hasEstimate
    && fundGzNavDate === navDate
    && estimate.toFixed(4) !== officialNav.toFixed(4)
    && estimate.toFixed(4) !== currentNav.toFixed(4);

  if (!hasUsableFundGz || (!dateIsNewer && !hasSameDayEstimate)) {
    return merged;
  }

  if (dateIsNewer) {
    const nextConfirmedNav = hasOfficialNav ? officialNav : estimate;
    const nextDisplayedNav = hasEstimate ? estimate : nextConfirmedNav;
    const hasEstimateChange = estimateChange !== null && estimateChange !== undefined && Number.isFinite(Number(estimateChange));
    const fallbackChangeRate = currentNav > 0 && nextConfirmedNav > 0
      ? Number((((nextConfirmedNav - currentNav) / currentNav) * 100).toFixed(4))
      : currentChangeRate;

    merged.prev_nav = currentNav > 0 ? currentNav : prev_nav;
    merged.nav = nextDisplayedNav;
    merged.navDate = fundGzNavDate;
    merged.gszzl = hasEstimateChange ? Number(estimateChange) : fallbackChangeRate;
    merged.dwjz = hasOfficialNav ? officialNav : merged.dwjz;
    return merged;
  }

  merged.nav = estimate;
  merged.gszzl = currentChangeRate !== null ? currentChangeRate : estimateChange;
  merged.dwjz = hasOfficialNav ? officialNav : merged.dwjz;
  return merged;
}

export function mergeConfirmedHistoricalSnapshot({
  nav = null,
  navDate = null,
  gszzl = null,
  prev_nav = null,
  dwjz = null,
  historicalSnapshot = null,
} = {}) {
  const merged = { nav, navDate, gszzl, prev_nav, dwjz };
  const confirmedNav = Number(historicalSnapshot?.nav || 0);
  const confirmedDate = String(historicalSnapshot?.navDate || '');
  if (!(confirmedNav > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(confirmedDate)) return merged;

  const currentDate = String(navDate || '');
  if (currentDate && confirmedDate < currentDate) return merged;

  const historicalPrevNav = Number(historicalSnapshot?.prevNAV || 0);
  const rawHistoricalChangeRate = historicalSnapshot?.changeRate;
  const historicalChangeRate = rawHistoricalChangeRate !== null
    && rawHistoricalChangeRate !== undefined
    && rawHistoricalChangeRate !== ''
    ? Number(rawHistoricalChangeRate)
    : Number.NaN;
  const fallbackPrevNav = Number(dwjz || nav || prev_nav || 0);
  const nextPrevNav = historicalPrevNav > 0 ? historicalPrevNav : fallbackPrevNav;
  const fallbackChangeRate = nextPrevNav > 0
    ? Number((((confirmedNav - nextPrevNav) / nextPrevNav) * 100).toFixed(4))
    : gszzl;

  if (!currentDate || confirmedDate > currentDate) {
    return {
      nav: confirmedNav,
      navDate: confirmedDate,
      gszzl: Number.isFinite(historicalChangeRate) ? historicalChangeRate : fallbackChangeRate,
      prev_nav: nextPrevNav || prev_nav,
      dwjz: confirmedNav,
    };
  }

  return {
    ...merged,
    nav: Number(nav || 0) > 0 ? nav : confirmedNav,
    gszzl: Number.isFinite(historicalChangeRate) ? historicalChangeRate : gszzl,
    prev_nav: nextPrevNav || prev_nav,
    dwjz: confirmedNav,
  };
}

function getChinaHour(date = new Date()) {
  const hour = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hour12: false,
  }).format(date);

  return Number(hour);
}

function getChinaMinuteOfDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function isDelayedNavFund(fundName = '') {
  return /QDII|纳斯达克|标普|海外|恒生|美股|港股/i.test(String(fundName || ''));
}

function normalizeSyncMode(mode = 'night') {
  return ['night', 'morning', 'pre_report'].includes(mode) ? mode : 'night';
}

function parseBooleanLike(value, defaultValue = false) {
  if (value === null || value === undefined || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function normalizeBatchSize(value, defaultValue = 3) {
  const parsed = Number.parseInt(String(value ?? defaultValue), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.min(parsed, 5);
}

export function getExpectedNavDateForSyncMode({ now = new Date(), mode = 'night' } = {}) {
  const normalizedMode = normalizeSyncMode(mode);

  if (!isChinaTradingDay(now)) {
    return getPreviousChinaTradingDateString(now);
  }

  if (normalizedMode === 'night' && getChinaHour(now) < 21) {
    return getPreviousChinaTradingDateString(now);
  }

  return getChinaDateString(now);
}

export function getExpectedNavDateForFund({ now = new Date(), mode = 'night', category = 'normal' } = {}) {
  const normalExpectedDate = getExpectedNavDateForSyncMode({ now, mode });
  if (category === 'qdii') {
    const anchor = new Date(`${normalExpectedDate}T12:00:00+08:00`);
    return getPreviousChinaTradingDateString(anchor);
  }
  return normalExpectedDate;
}

export function isFundNavUpdated({ navDate = null, fundName = '', now = new Date(), mode = 'night' } = {}) {
  if (!navDate) return false;
  const category = isDelayedNavFund(fundName) ? 'qdii' : 'normal';
  const expectedDate = getExpectedNavDateForFund({ now, mode, category });
  return String(navDate) >= expectedDate;
}

export function summarizeFundNavFreshness({ positions = [], snapshotMap = {}, now = new Date() } = {}) {
  const heldPositions = (positions || []).filter(position => (
    Number(position.quantity || 0) > 0 && isDailyNavTrackingFund(position.fund_code)
  ));
  const fundNameMap = new Map(heldPositions.map(position => [position.fund_code, position.fund_name || '']));
  const fundCodes = [...fundNameMap.keys()];
  const updatedFundCount = fundCodes.filter(code => isFundNavUpdated({
    navDate: snapshotMap[code]?.jzrq,
    fundName: fundNameMap.get(code) || '',
    now,
    mode: 'night',
  })).length;
  return {
    totalFundCount: fundCodes.length,
    updatedFundCount,
    staleFundCount: Math.max(0, fundCodes.length - updatedFundCount),
  };
}

export function buildPendingFundList({
  positions = [],
  snapshots = [],
  now = new Date(),
  mode = 'night',
  includeQdii = false,
} = {}) {
  if (!isChinaTradingDay(now)) return [];

  const snapshotMap = new Map(
    (snapshots || []).map(row => [String(row.fund_code || ''), row])
  );
  const seen = new Set();
  const pending = [];

  for (const position of positions || []) {
    const fundCode = String(position.fund_code || '').trim();
    if (!fundCode || seen.has(fundCode)) continue;
    seen.add(fundCode);
    if (!isDailyNavTrackingFund(fundCode)) continue;

    const fundName = position.fund_name || position.name || '';
    const category = isDelayedNavFund(fundName) ? 'qdii' : 'normal';
    if (category === 'qdii' && !includeQdii) continue;
    const expectedJzrq = getExpectedNavDateForFund({ now, mode, category });

    const snapshot = snapshotMap.get(fundCode);
    const currentJzrq = snapshot?.jzrq || null;
    if (currentJzrq && currentJzrq >= expectedJzrq) continue;

    pending.push({
      fund_code: fundCode,
      fund_name: fundName,
      current_jzrq: currentJzrq,
      expected_jzrq: expectedJzrq,
      category,
      pending_reason: currentJzrq ? 'date_not_advanced' : 'missing_snapshot',
    });
  }

  return pending;
}

export function buildNavEventPendingFundList({
  positions = [],
  snapshots = [],
  now = new Date(),
  includeQdii = true,
} = {}) {
  const chinaDate = getChinaDateString(now);
  const nextDayCheckTime = new Date(`${chinaDate}T08:00:00+08:00`);
  return buildPendingFundList({
    positions,
    snapshots,
    now: nextDayCheckTime,
    mode: 'night',
    includeQdii,
  });
}

export function isPendingFundOverdue(fund = {}, now = new Date()) {
  if (Number(fund.consecutive_failures || 0) > 0 || fund.sync_state === 'error') return true;

  if (fund.category === 'qdii') {
    const oldestExpectedDate = getNthPreviousChinaTradingDateString(now, 2);
    return Boolean(fund.current_jzrq) && fund.current_jzrq < oldestExpectedDate;
  }

  const minuteOfDay = getChinaMinuteOfDay(now);
  return minuteOfDay >= 23 * 60 + 30 || (minuteOfDay >= 8 * 60 && minuteOfDay < 21 * 60);
}

async function syncOneFundSnapshot(env, fundCode, fundNameFallback = '') {
  let nav = null;
  let navDate = null;
  let gszzl = null;
  let prev_nav = null;
  let dwjz = null;
  let name = fundNameFallback || '';

  const [res2, resGz, resHistory] = await Promise.all([
    fetch(`https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    }),
    fetch(`https://fundgz.1234567.com.cn/js/${fundCode}.js?v=${Date.now()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'http://fundgz.1234567.com.cn/'
      }
    }),
    fetch(`https://api.fund.eastmoney.com/f10/lsjz?fundCode=${fundCode}&pageIndex=1&pageSize=2&startDate=&endDate=`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://fundf10.eastmoney.com/'
      }
    }).catch(() => null)
  ]);

  const text2 = await res2.text();
  const nameMatch = text2.match(/f_S_name\s*=\s*["']([^"']+)["']/);
  if (nameMatch) name = nameMatch[1];
  const latestNetWorth = parsePingzhongdataNetWorth(text2);
  if (latestNetWorth) {
    nav = latestNetWorth.currentNAV;
    prev_nav = latestNetWorth.prevNAV;
    navDate = latestNetWorth.navDate;
    gszzl = latestNetWorth.changeRate;
  }

  const textGz = await resGz.text();
  const gzMatch = textGz.match(/jsonpgz\((.+)\)/);
  if (gzMatch) {
    try {
      const gzData = JSON.parse(gzMatch[1]);
      if (gzData && (gzData.gsz || gzData.dwjz || gzData.jzrq)) {
        const estimateNav = parseFloat(gzData.gsz);
        const estimateChange = parseFloat(gzData.gszzl);
        const fundGzNavDate = (gzData.jzrq || '').split(' ')[0];
        const officialNavYesterday = parseFloat(gzData.dwjz);
        const mergedSnapshot = mergeFundEstimateIntoSnapshot({
          nav,
          navDate,
          gszzl,
          prev_nav,
          estimateNav,
          estimateChange,
          officialNavYesterday,
          fundGzNavDate,
        });
        nav = mergedSnapshot.nav;
        navDate = mergedSnapshot.navDate;
        gszzl = mergedSnapshot.gszzl;
        prev_nav = mergedSnapshot.prev_nav;
        dwjz = mergedSnapshot.dwjz || dwjz;
      }
    } catch (_) {}
  }

  if (resHistory?.ok) {
    const historicalSnapshot = parseEastmoneyHistoricalSnapshot(await resHistory.text());
    const mergedSnapshot = mergeConfirmedHistoricalSnapshot({
      nav,
      navDate,
      gszzl,
      prev_nav,
      dwjz,
      historicalSnapshot,
    });
    nav = mergedSnapshot.nav;
    navDate = mergedSnapshot.navDate;
    gszzl = mergedSnapshot.gszzl;
    prev_nav = mergedSnapshot.prev_nav;
    dwjz = mergedSnapshot.dwjz;
  }

  const { results: oldSnap } = await env.DB.prepare(
    'SELECT last_nav, last_gszzl FROM market_snapshot WHERE fund_code = ?'
  ).bind(fundCode).all();
  const oldLastNav = oldSnap.length > 0 ? oldSnap[0].last_nav : null;

  await env.DB.prepare(`
    INSERT INTO market_snapshot (fund_code, name, dwjz, gsz, gszzl, jzrq, gztime, prev_nav, last_nav, last_gszzl, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(fund_code) DO UPDATE SET
      name = excluded.name,
      dwjz = excluded.dwjz,
      gsz = excluded.gsz,
      gszzl = excluded.gszzl,
      jzrq = excluded.jzrq,
      gztime = excluded.gztime,
      prev_nav = excluded.prev_nav,
      last_nav = excluded.last_nav,
      last_gszzl = excluded.last_gszzl,
      updated_at = unixepoch()
  `).bind(fundCode, name, dwjz || nav, nav, gszzl, navDate, navDate ? `${navDate} 00:00:00` : null, prev_nav, prev_nav, gszzl).run();

  const { results: positions } = await env.DB.prepare(
    'SELECT id, quantity FROM positions WHERE fund_code = ?'
  ).bind(fundCode).all();

  for (const pos of positions) {
    const yesterdayProfit = resolveDisplayedYesterdayProfit({
      shares: pos.quantity || 0,
      confirmedNav: dwjz || nav || 0,
      prevNav: prev_nav || 0,
      storedChangeRate: gszzl,
      navDate: navDate || null,
      fundName: name || '',
    });
    await env.DB.prepare(`
      UPDATE positions SET yesterday_profit = ?, updated_at = unixepoch() WHERE id = ?
    `).bind(yesterdayProfit, pos.id).run();
  }

  return {
    ok: !!nav,
    fund_code: fundCode,
    fund_name: name,
    gsz: nav,
    gszzl,
    prev_nav,
    dwjz: dwjz || nav,
    confirmed_nav: dwjz || nav,
    last_nav: oldLastNav,
    jzrq: navDate,
  };
}

async function getPendingFunds(env, {
  now = new Date(),
  mode = 'night',
  includeQdii = false,
} = {}) {
  const { results: positions } = await env.DB.prepare(
    'SELECT DISTINCT fund_code, fund_name FROM positions WHERE fund_code IS NOT NULL AND fund_code != ""'
  ).all();

  const { results: snapshots } = await env.DB.prepare(
    'SELECT fund_code, jzrq FROM market_snapshot'
  ).all();

  return buildPendingFundList({
    positions,
    snapshots,
    now,
    mode,
    includeQdii,
  });
}

async function syncPendingFunds(env, {
  now = new Date(),
  mode = 'night',
  includeQdii = false,
  batchSize = 3,
} = {}) {
  const pendingFunds = await getPendingFunds(env, { now, mode, includeQdii });
  const results = {};
  const batch = pendingFunds.slice(0, batchSize);
  const batchResults = await Promise.all(
    batch.map(async (fund) => {
      try {
        const result = await syncOneFundSnapshot(env, fund.fund_code, fund.fund_name);
        return [fund.fund_code, {
          ...result,
          before_jzrq: fund.current_jzrq,
          expected_jzrq: fund.expected_jzrq,
          category: fund.category,
          advanced: Boolean(result.jzrq && (!fund.current_jzrq || result.jzrq > fund.current_jzrq)),
        }];
      } catch (error) {
        return [fund.fund_code, {
          ok: false,
          fund_code: fund.fund_code,
          fund_name: fund.fund_name,
          before_jzrq: fund.current_jzrq,
          expected_jzrq: fund.expected_jzrq,
          category: fund.category,
          reason: String(error?.message || error),
        }];
      }
    })
  );

  for (const [fundCode, result] of batchResults) {
    results[fundCode] = result;
  }

  await Promise.all(Object.values(results).map((result) => {
    const state = !result.ok ? 'error' : (result.advanced ? 'synced' : 'waiting');
    const errorMessage = result.ok ? null : String(result.reason || 'Unknown sync error');
    return env.DB.prepare(`
      INSERT INTO fund_sync_status (
        fund_code, fund_name, category, state, last_attempt_at, last_success_at,
        last_success_jzrq, consecutive_failures, next_retry_at, last_error, updated_at
      ) VALUES (?, ?, ?, ?, unixepoch(),
        CASE WHEN ? = 'synced' THEN unixepoch() ELSE NULL END,
        CASE WHEN ? = 'synced' THEN ? ELSE NULL END,
        CASE WHEN ? = 'error' THEN 1 ELSE 0 END,
        CASE WHEN ? IN ('waiting', 'error') THEN unixepoch() + 1800 ELSE NULL END,
        ?, unixepoch())
      ON CONFLICT(fund_code) DO UPDATE SET
        fund_name = excluded.fund_name,
        category = excluded.category,
        state = excluded.state,
        last_attempt_at = excluded.last_attempt_at,
        last_success_at = CASE WHEN excluded.state = 'synced' THEN excluded.last_success_at ELSE fund_sync_status.last_success_at END,
        last_success_jzrq = CASE WHEN excluded.state = 'synced' THEN excluded.last_success_jzrq ELSE fund_sync_status.last_success_jzrq END,
        consecutive_failures = CASE WHEN excluded.state = 'error' THEN fund_sync_status.consecutive_failures + 1 ELSE 0 END,
        next_retry_at = excluded.next_retry_at,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
    `).bind(
      result.fund_code,
      result.fund_name || '',
      result.category || 'normal',
      state,
      state,
      state,
      result.jzrq || null,
      state,
      state,
      errorMessage,
    ).run();
  }));

  const stillPendingFunds = await getPendingFunds(env, { now, mode, includeQdii });
  const syncedCount = Object.values(results).filter(item => item.ok).length;

  return {
    mode: normalizeSyncMode(mode),
    include_qdii: includeQdii,
    batch_size: batchSize,
    total_pending_before_sync: pendingFunds.length,
    attempted: batch.length,
    synced: syncedCount,
    failed: Object.values(results).filter(item => !item.ok).length,
    still_pending_count: stillPendingFunds.length,
    still_pending_funds: stillPendingFunds,
    results,
  };
}

// 主处理函数
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;
  const method = context.request.method;
  const env = context.env;
  const isCronAuthorized = method === 'POST'
    && (path === '/api/fund/sync' || path === '/api/fund/sync/pending' || path === '/api/profit-snapshots/capture')
    && isAuthorizedCronRequest(context.request, env);

  // CORS 预检
  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // 检查 D1 绑定
  if (!env.DB) {
    return jsonResponse({ code: 500, message: 'D1 数据库未绑定，请检查 Pages 项目设置' }, 500);
  }

  try {
    // 验证 token 的 helper
    async function verifyToken(request) {
      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) return null;
      const { results } = await env.DB.prepare(
        `SELECT t.*, u.id AS user_id, u.username, u.display_name, u.household_id, u.role, u.status AS user_status,
                u.linked_member_id, h.name AS household_name,
                m.name AS linked_member_name, m.emoji AS linked_member_emoji, m.relation AS linked_member_relation
         FROM auth_tokens t
         JOIN users u ON u.id = t.user_id
         JOIN households h ON h.id = u.household_id
         LEFT JOIN members m ON m.id = u.linked_member_id AND m.household_id = u.household_id
         WHERE t.token = ? AND (t.expires_at IS NULL OR t.expires_at > ?) AND u.status = 'active'`
      ).bind(token, Math.floor(Date.now() / 1000)).all();
      return results.length > 0 ? results[0] : null;
    }

    async function derivePasswordHash(password, salt = crypto.randomUUID().replace(/-/g, '').substring(0, 16)) {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
      const hashBuffer = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      return `${salt}$${hashHex}`;
    }

    async function hashInviteCode(code) {
      const bytes = new TextEncoder().encode(String(code || '').trim());
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function ensureAdvisoryTables() {
      const productTableInfo = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='advisory_products'").all();
      if (productTableInfo.results.length === 0) {
        await env.DB.prepare(`
          CREATE TABLE advisory_products (
            id TEXT PRIMARY KEY,
            account_id TEXT,
            member_id TEXT,
            platform TEXT DEFAULT 'xueqiu',
            product_name TEXT NOT NULL,
            status TEXT DEFAULT '正常',
            include_in_investable_assets INTEGER NOT NULL DEFAULT 1,
            remark TEXT DEFAULT '',
            created_at INTEGER DEFAULT (unixepoch()),
            updated_at INTEGER DEFAULT (unixepoch())
          )
        `).run();
      }

      const productColumns = await env.DB.prepare('PRAGMA table_info(advisory_products)').all();
      if (!(productColumns.results || []).some(column => column.name === 'include_in_investable_assets')) {
        await env.DB.prepare('ALTER TABLE advisory_products ADD COLUMN include_in_investable_assets INTEGER NOT NULL DEFAULT 1').run();
      }

      const snapshotTableInfo = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='advisory_product_snapshots'").all();
      if (snapshotTableInfo.results.length === 0) {
        await env.DB.prepare(`
          CREATE TABLE advisory_product_snapshots (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            snapshot_date TEXT NOT NULL,
            total_amount REAL DEFAULT 0,
            daily_profit REAL DEFAULT 0,
            current_profit REAL DEFAULT 0,
            profit_rate REAL DEFAULT 0,
            created_at INTEGER DEFAULT (unixepoch()),
            updated_at INTEGER DEFAULT (unixepoch()),
            UNIQUE(product_id, snapshot_date)
          )
        `).run();
      }
    }

    async function ensureMembersSchema() {
      const tableInfo = await env.DB.prepare("PRAGMA table_info(members)").all();
      const columns = new Set((tableInfo.results || []).map(col => col.name));
      if (!columns.has('remark')) {
        await env.DB.prepare("ALTER TABLE members ADD COLUMN remark TEXT DEFAULT ''").run();
      }
      if (!columns.has('relation')) {
        await env.DB.prepare("ALTER TABLE members ADD COLUMN relation TEXT DEFAULT ''").run();
      }
    }

    function serializeAccountRow(r) {
      return {
        id: r.id,
        account_name: r.name,
        channel: r.channel,
        status: r.status,
        remark: r.remark || '',
        emoji: r.emoji || '',
        member_id: r.member_id,
        member_name: r.member_name || '',
        created_at: r.created_at,
      };
    }

    function serializePositionRow(r) {
      const shares = r.quantity || 0;
      const cost = r.cost || 0;
      const estimateNav = r.nav_gsz || null;
      const confirmedNav = r.nav_dwjz || 0;
      // 默认和支付宝持有页口径对齐：金额/持有收益优先按确认净值 dwjz 展示。
      // gsz 仅作为盘中估算信息保留给前端详情展示，不直接覆盖主列表金额。
      const marketNav = confirmedNav || estimateNav || 0;
      const prevNav = r.prev_nav || 0;
      const yesterdayProfit = resolveDisplayedYesterdayProfit({
        shares,
        confirmedNav,
        prevNav,
        storedChangeRate: r.nav_gszzl,
        navDate: r.nav_jzrq || null,
        fundName: r.fund_name || '',
      });
      const currentMarketValue = shares > 0 && marketNav > 0
        ? parseFloat((shares * marketNav).toFixed(4))
        : 0;
      const previousMarketValue = parseFloat((currentMarketValue - yesterdayProfit).toFixed(4));
      const yesterdayProfitRate = previousMarketValue > 0
        ? parseFloat(((yesterdayProfit / previousMarketValue) * 100).toFixed(4))
        : 0;
      const currentProfit = parseFloat((currentMarketValue - cost).toFixed(4));
      const profitRate = cost > 0
        ? parseFloat(((currentProfit / cost) * 100).toFixed(4))
        : 0;
      const navGszzl = resolveDisplayedNavGszzl({
        storedChangeRate: r.nav_gszzl,
        estimateNav,
        confirmedNav,
        prevNav,
      });
      const navDate = r.nav_jzrq || null;
      const dailyProfitConfirmedDate = Number(r.nav_updated_at || 0) > 0
        ? getChinaDateString(new Date(Number(r.nav_updated_at) * 1000))
        : navDate;
      const positionNow = new Date();
      const tradingDay = isChinaTradingDay(positionNow);
      const dailyProfitMeta = getDailyProfitMeta(navDate, positionNow, r.fund_name || '');
      const navCategory = isDelayedNavFund(r.fund_name || '') ? 'qdii' : 'normal';
      const expectedNavDate = getExpectedNavDateForFund({ now: positionNow, mode: 'night', category: navCategory });
      const navTrackingExempt = !isDailyNavTrackingFund(r.fund_code);
      const navUpdateStatus = navTrackingExempt || !tradingDay
        ? 'idle'
        : r.sync_state === 'error'
        ? 'error'
        : (navDate && navDate >= expectedNavDate ? 'updated' : 'waiting');
      const showNavUpdateNotice = !navTrackingExempt && shouldShowNavUpdateNotice({
        status: navUpdateStatus,
        snapshotUpdatedAt: r.nav_updated_at,
        navDate,
        now: positionNow,
      });

      return {
        id: r.id,
        account_id: r.account_id,
        account_name: r.account_name || '',
        account_channel: r.account_channel || '',
        member_id: r.member_id,
        member_name: r.member_name || '',
        member_emoji: r.member_emoji || '👤',
        fund_code: r.fund_code,
        fund_name: r.fund_name || '',
        shares,
        cost,
        current_market_value: currentMarketValue,
        current_profit: currentProfit,
        profit_rate: profitRate,
        yesterday_profit: yesterdayProfit,
        yesterday_profit_rate: yesterdayProfitRate,
        daily_profit: yesterdayProfit,
        daily_profit_label: dailyProfitMeta.daily_profit_label,
        daily_profit_rate: yesterdayProfitRate,
        daily_profit_rate_label: dailyProfitMeta.daily_profit_rate_label,
        daily_profit_updated: dailyProfitMeta.daily_profit_updated,
        daily_profit_update_text: dailyProfitMeta.daily_profit_update_text,
        is_trading_day: tradingDay,
        nav_tracking_exempt: navTrackingExempt,
        show_nav_update_notice: showNavUpdateNotice,
        initial_profit: r.initial_profit || 0,
        realized_profit: r.realized_profit || 0,
        cash_dividend: r.cash_dividend || 0,
        total_buy_amount: r.total_buy_amount || 0,
        total_sell_amount: r.total_sell_amount || 0,
        opening_quantity: r.opening_quantity ?? shares,
        opening_cost: r.opening_cost ?? cost,
        opening_initial_profit: r.opening_initial_profit ?? (r.initial_profit || 0),
        dividend_method: r.dividend_method || '红利再投',
        created_at: r.created_at,
        nav_gsz: estimateNav,
        nav_gszzl: navGszzl,
        nav_dwjz: confirmedNav,
        nav_jzrq: r.nav_jzrq || null,
        daily_profit_confirmed_date: dailyProfitConfirmedDate,
        nav_category: navCategory,
        nav_update_status: navUpdateStatus,
        expected_nav_date: expectedNavDate,
        sync_state: r.sync_state || null,
        sync_last_attempt_at: r.sync_last_attempt_at || null,
        sync_consecutive_failures: Number(r.sync_consecutive_failures || 0),
        sync_last_error: r.sync_last_error || null,
        trade_count: Number(r.trade_count || 0),
      };
    }

    async function captureCurrentProfitSnapshot(targetHouseholdId = householdId || DEFAULT_HOUSEHOLD_ID) {
      await ensureAdvisorySchemaOnce();
      const snapshotHouseholdId = targetHouseholdId;
      const { results: positionRows } = await env.DB.prepare(`
        SELECT p.*, a.name as account_name, a.channel as account_channel, a.member_id,
               m.name as member_name, m.emoji as member_emoji,
               s.gsz as nav_gsz, s.gszzl as nav_gszzl, s.dwjz as nav_dwjz,
               s.jzrq as nav_jzrq, s.updated_at as nav_updated_at, s.prev_nav,
               fs.state as sync_state, fs.last_attempt_at as sync_last_attempt_at,
               fs.consecutive_failures as sync_consecutive_failures, fs.last_error as sync_last_error
        FROM positions p
        LEFT JOIN accounts a ON p.account_id = a.id
        LEFT JOIN members m ON a.member_id = m.id
        LEFT JOIN market_snapshot s ON p.fund_code = s.fund_code
        LEFT JOIN fund_sync_status fs ON p.fund_code = fs.fund_code
        WHERE a.household_id = ?
      `).bind(snapshotHouseholdId).all();
      const positions = (positionRows || []).map(serializePositionRow);
      const { results: advisoryProducts } = await env.DB.prepare(`
        SELECT p.id, p.product_name, p.account_id,
               COALESCE(p.member_id, a.member_id) as member_id,
               a.name as account_name, m.name as member_name, m.emoji as member_emoji,
               s.snapshot_date, s.total_amount, s.daily_profit, s.current_profit, s.profit_rate
        FROM advisory_products p
        LEFT JOIN accounts a ON p.account_id = a.id
        LEFT JOIN members m ON COALESCE(p.member_id, a.member_id) = m.id
        LEFT JOIN advisory_product_snapshots s ON s.id = (
          SELECT s2.id FROM advisory_product_snapshots s2
          WHERE s2.product_id = p.id
          ORDER BY s2.snapshot_date DESC, s2.updated_at DESC, s2.created_at DESC
          LIMIT 1
        )
        WHERE p.household_id = ?
      `).bind(snapshotHouseholdId).all();
      const capturedAt = Date.now();
      const snapshot = buildServerProfitSnapshot({
        positions,
        advisoryProducts: advisoryProducts || [],
        capturedAt,
        fallbackDate: getChinaDateString(new Date(capturedAt)),
      });
      await env.DB.prepare(`
        INSERT INTO household_profit_snapshots (snapshot_date, snapshot_json, captured_at, household_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
        ON CONFLICT(household_id, snapshot_date) DO UPDATE SET
          snapshot_json = excluded.snapshot_json,
          captured_at = excluded.captured_at,
          updated_at = unixepoch()
        WHERE excluded.captured_at > household_profit_snapshots.captured_at
      `).bind(snapshot.date, JSON.stringify(snapshot), snapshot.captured_at, snapshotHouseholdId).run();
      return snapshot;
    }

    async function ensureColumn(tableName, columnName, definition) {
      const { results } = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
      if (!results.some(column => column.name === columnName)) {
        await env.DB.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`).run();
      }
    }

    async function ensureLedgerSchemas() {
      await ensureColumn('positions', 'opening_quantity', 'opening_quantity REAL');
      await ensureColumn('positions', 'opening_cost', 'opening_cost REAL');
      await ensureColumn('positions', 'opening_initial_profit', 'opening_initial_profit REAL');
      await ensureColumn('positions', 'realized_profit', 'realized_profit REAL DEFAULT 0');
      await ensureColumn('positions', 'cash_dividend', 'cash_dividend REAL DEFAULT 0');
      await ensureColumn('positions', 'total_buy_amount', 'total_buy_amount REAL DEFAULT 0');
      await ensureColumn('positions', 'total_sell_amount', 'total_sell_amount REAL DEFAULT 0');
      await ensureColumn('trades', 'fund_name', 'fund_name TEXT');
      await ensureColumn('trades', 'note', 'note TEXT');
      await ensureColumn('trades', 'target_quantity', 'target_quantity REAL');
      await ensureColumn('trades', 'target_cost', 'target_cost REAL');
      await ensureColumn('trades', 'target_initial_profit', 'target_initial_profit REAL');
      await ensureColumn('trades', 'updated_at', 'updated_at INTEGER');
      await ensureColumn('trades', 'source_type', 'source_type TEXT');
      await ensureColumn('trades', 'source_id', 'source_id TEXT');
      await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_source ON trades(source_type, source_id)').run();

      await env.DB.prepare(`
        UPDATE positions
        SET
          opening_quantity = COALESCE(opening_quantity, quantity, 0),
          opening_cost = COALESCE(opening_cost, cost, amount, 0),
          opening_initial_profit = COALESCE(opening_initial_profit, initial_profit, 0),
          realized_profit = COALESCE(realized_profit, 0),
          cash_dividend = COALESCE(cash_dividend, 0),
          total_buy_amount = COALESCE(total_buy_amount, 0),
          total_sell_amount = COALESCE(total_sell_amount, 0)
        WHERE
          opening_quantity IS NULL OR opening_cost IS NULL OR opening_initial_profit IS NULL OR
          realized_profit IS NULL OR cash_dividend IS NULL OR total_buy_amount IS NULL OR total_sell_amount IS NULL
      `).run();
    }

    async function ensureFamilyFinanceSchemas() {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS family_assets (
          id TEXT PRIMARY KEY,
          member_id TEXT,
          name TEXT NOT NULL,
          category_code TEXT NOT NULL,
          institution TEXT DEFAULT '',
          current_value REAL NOT NULL DEFAULT 0,
          valuation_date TEXT NOT NULL,
          include_in_net_worth INTEGER NOT NULL DEFAULT 1,
          include_in_investable_assets INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active',
          remark TEXT DEFAULT '',
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        )
      `).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_family_assets_member ON family_assets(member_id, status)').run();
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS family_asset_records (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          previous_value REAL NOT NULL DEFAULT 0,
          current_value REAL NOT NULL DEFAULT 0,
          change_value REAL NOT NULL DEFAULT 0,
          record_date TEXT NOT NULL,
          remark TEXT DEFAULT '',
          created_at INTEGER DEFAULT (unixepoch())
        )
      `).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_family_asset_records_asset ON family_asset_records(asset_id, record_date DESC)').run();
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS family_receivables (
          id TEXT PRIMARY KEY,
          member_id TEXT,
          category_code TEXT NOT NULL,
          name TEXT NOT NULL,
          debtor_name TEXT DEFAULT '',
          original_amount REAL NOT NULL DEFAULT 0,
          outstanding_amount REAL NOT NULL DEFAULT 0,
          lent_date TEXT,
          due_date TEXT,
          status TEXT NOT NULL DEFAULT 'normal',
          risk_level TEXT NOT NULL DEFAULT 'normal',
          remark TEXT DEFAULT '',
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        )
      `).run();
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS family_receivable_payments (
          id TEXT PRIMARY KEY,
          receivable_id TEXT NOT NULL,
          amount REAL NOT NULL,
          payment_date TEXT NOT NULL,
          remark TEXT DEFAULT '',
          created_at INTEGER DEFAULT (unixepoch())
        )
      `).run();
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS family_liabilities (
          id TEXT PRIMARY KEY,
          member_id TEXT,
          category_code TEXT NOT NULL,
          name TEXT NOT NULL,
          creditor_name TEXT DEFAULT '',
          original_amount REAL NOT NULL DEFAULT 0,
          outstanding_principal REAL NOT NULL DEFAULT 0,
          interest_rate REAL NOT NULL DEFAULT 0,
          monthly_payment REAL NOT NULL DEFAULT 0,
          due_date TEXT,
          status TEXT NOT NULL DEFAULT 'normal',
          remark TEXT DEFAULT '',
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        )
      `).run();
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS family_liability_payments (
          id TEXT PRIMARY KEY,
          liability_id TEXT NOT NULL,
          amount REAL NOT NULL,
          payment_date TEXT NOT NULL,
          remark TEXT DEFAULT '',
          created_at INTEGER DEFAULT (unixepoch())
        )
      `).run();
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS family_snapshots (
          snapshot_date TEXT PRIMARY KEY,
          summary_json TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        )
      `).run();
    }

    const familyReceivableCategoryCodes = new Set(FAMILY_RECEIVABLE_CATEGORIES.map(item => item.code));
    const familyLiabilityCategoryCodes = new Set(FAMILY_LIABILITY_CATEGORIES.map(item => item.code));
    const normalizeFamilyMemberId = value => String(value || '').trim() || null;
    const normalizeFamilyDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : getChinaDateString(new Date());
    const normalizeFamilyMoney = value => Number(Number(value || 0).toFixed(2));

    async function getFamilyFinanceData() {
      await ensureAdvisorySchemaOnce();
      const [assetQuery, receivableQuery, liabilityQuery, fundQuery, advisoryQuery] = await Promise.all([
        env.DB.prepare(`
          SELECT a.*, m.name AS member_name, m.emoji AS member_emoji
          FROM family_assets a LEFT JOIN members m ON a.member_id = m.id
          WHERE a.status != 'archived' AND a.household_id = ?
          ORDER BY a.updated_at DESC, a.created_at DESC
        `).bind(householdId).all(),
        env.DB.prepare(`
          SELECT r.*, m.name AS member_name, m.emoji AS member_emoji
          FROM family_receivables r LEFT JOIN members m ON r.member_id = m.id
          WHERE r.status != 'settled' AND r.household_id = ?
          ORDER BY CASE WHEN r.due_date IS NULL OR r.due_date = '' THEN 1 ELSE 0 END, r.due_date, r.updated_at DESC
        `).bind(householdId).all(),
        env.DB.prepare(`
          SELECT l.*, m.name AS member_name, m.emoji AS member_emoji
          FROM family_liabilities l LEFT JOIN members m ON l.member_id = m.id
          WHERE l.status != 'settled' AND l.household_id = ?
          ORDER BY l.updated_at DESC, l.created_at DESC
        `).bind(householdId).all(),
        env.DB.prepare(`
          SELECT COALESCE(SUM(
            CASE
              WHEN COALESCE(s.dwjz, s.gsz, 0) > 0 THEN COALESCE(p.quantity, 0) * COALESCE(s.dwjz, s.gsz, 0)
              ELSE COALESCE(p.cost, p.amount, 0)
            END
          ), 0) AS fund_value
          FROM positions p
          JOIN accounts a ON p.account_id = a.id
          LEFT JOIN market_snapshot s ON p.fund_code = s.fund_code
          WHERE COALESCE(p.quantity, 0) > 0 AND a.household_id = ?
        `).bind(householdId).all(),
        env.DB.prepare(`
          SELECT p.id, p.product_name, p.account_id, p.status, p.remark, p.include_in_investable_assets,
                 a.name AS account_name, a.channel AS account_channel,
                 COALESCE(p.member_id, a.member_id) AS member_id,
                 m.name AS member_name, m.emoji AS member_emoji,
                 s.snapshot_date, COALESCE(s.total_amount, 0) AS total_amount,
                 COALESCE(s.daily_profit, 0) AS daily_profit,
                 COALESCE(s.current_profit, 0) AS current_profit,
                 COALESCE(s.profit_rate, 0) AS profit_rate
          FROM advisory_products p
          LEFT JOIN accounts a ON p.account_id = a.id
          LEFT JOIN members m ON COALESCE(p.member_id, a.member_id) = m.id
          LEFT JOIN advisory_product_snapshots s ON s.id = (
            SELECT s2.id FROM advisory_product_snapshots s2
            WHERE s2.product_id = p.id
            ORDER BY s2.snapshot_date DESC, s2.updated_at DESC, s2.created_at DESC
            LIMIT 1
          )
          WHERE COALESCE(p.status, '正常') != '已删除' AND p.household_id = ?
          ORDER BY COALESCE(s.total_amount, 0) DESC, p.created_at DESC
        `).bind(householdId).all(),
      ]);
      const assets = assetQuery.results || [];
      const receivables = receivableQuery.results || [];
      const liabilities = liabilityQuery.results || [];
      const advisoryProducts = (advisoryQuery.results || []).map(item => ({
        ...item,
        include_in_investable_assets: Number(item.include_in_investable_assets ?? 1),
        total_amount: normalizeFamilyMoney(item.total_amount),
        daily_profit: normalizeFamilyMoney(item.daily_profit),
        current_profit: normalizeFamilyMoney(item.current_profit),
        profit_rate: Number(Number(item.profit_rate || 0).toFixed(2)),
      }));
      const advisoryValue = advisoryProducts.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
      const advisoryInvestableValue = advisoryProducts.reduce((sum, item) => sum + (item.include_in_investable_assets === 1 ? Number(item.total_amount || 0) : 0), 0);
      const summary = buildFamilySummary({
        fundValue: Number(fundQuery.results?.[0]?.fund_value || 0),
        advisoryValue,
        advisoryInvestableValue,
        assets,
        receivables,
        liabilities,
      });
      return { assets, receivables, liabilities, advisory_products: advisoryProducts, summary };
    }

    async function resolveFamilyMemberId(value) {
      const memberId = normalizeFamilyMemberId(value);
      if (!memberId) return null;
      const { results } = await env.DB.prepare('SELECT id FROM members WHERE id = ? AND household_id = ? LIMIT 1').bind(memberId, householdId).all();
      return results.length ? memberId : null;
    }

    async function captureFamilySnapshot(snapshotDate = getChinaDateString(new Date())) {
      const data = await getFamilyFinanceData();
      await env.DB.prepare(`
        INSERT INTO household_family_snapshots (snapshot_date, summary_json, household_id, created_at, updated_at)
        VALUES (?, ?, ?, unixepoch(), unixepoch())
        ON CONFLICT(household_id, snapshot_date) DO UPDATE SET summary_json = excluded.summary_json, updated_at = unixepoch()
      `).bind(normalizeFamilyDate(snapshotDate), JSON.stringify(data.summary), householdId).run();
      return data.summary;
    }

    function queueFamilySnapshot(snapshotDate) {
      context.waitUntil(
        captureFamilySnapshot(snapshotDate).catch(error => console.error('家庭财务快照写入失败:', error))
      );
    }

    async function ensureRuntimeSchemaOnce() {
      if (!runtimeSchemaInitPromise) {
        runtimeSchemaInitPromise = (async () => {
          const runtimeSchemaVersion = '2026-08-05-invite-member-link-v6';
          try {
            const { results: schemaVersions } = await env.DB.prepare(
              "SELECT meta_value FROM app_meta WHERE meta_key = 'runtime_schema_version' LIMIT 1"
            ).all();
            if (schemaVersions?.[0]?.meta_value === runtimeSchemaVersion) return;
          } catch (_) {
            // 首次部署尚未创建 app_meta，继续执行一次完整迁移。
          }

          const userTableInfo = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").all();
          if (userTableInfo.results.length === 0) {
            await env.DB.prepare(`
              CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at INTEGER DEFAULT (unixepoch())
              )
            `).run();
          }

          const tokenTableInfo = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_tokens'").all();
          if (tokenTableInfo.results.length === 0) {
            await env.DB.prepare(`
              CREATE TABLE auth_tokens (
                id TEXT PRIMARY KEY,
                token TEXT UNIQUE NOT NULL,
                created_at INTEGER DEFAULT (unixepoch()),
                expires_at INTEGER
              )
            `).run();
          }

          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS households (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              owner_user_id TEXT,
              status TEXT NOT NULL DEFAULT 'active',
              created_at INTEGER DEFAULT (unixepoch()),
              updated_at INTEGER DEFAULT (unixepoch())
            )
          `).run();
          await ensureColumn('users', 'display_name', "display_name TEXT DEFAULT ''");
          await ensureColumn('users', 'household_id', 'household_id TEXT');
          await ensureColumn('users', 'role', "role TEXT NOT NULL DEFAULT 'owner'");
          await ensureColumn('users', 'status', "status TEXT NOT NULL DEFAULT 'active'");
          await ensureColumn('users', 'updated_at', 'updated_at INTEGER');
          await ensureColumn('users', 'linked_member_id', 'linked_member_id TEXT');
          await ensureColumn('auth_tokens', 'user_id', 'user_id TEXT');

          const householdTables = [
            'members', 'accounts', 'family_assets', 'family_receivables', 'family_liabilities',
            'advisory_products', 'allocation_profiles', 'profit_snapshots', 'family_snapshots', 'events',
          ];

          await ensureMembersSchema();
          await ensureLedgerSchemas();
          await ensureFamilyFinanceSchemas();
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS fund_sync_status (
              fund_code TEXT PRIMARY KEY,
              fund_name TEXT DEFAULT '',
              category TEXT DEFAULT 'normal',
              state TEXT DEFAULT 'waiting',
              last_attempt_at INTEGER,
              last_success_at INTEGER,
              last_success_jzrq TEXT,
              consecutive_failures INTEGER DEFAULT 0,
              next_retry_at INTEGER,
              last_error TEXT,
              updated_at INTEGER DEFAULT (unixepoch())
            )
          `).run();
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS events (
              id TEXT PRIMARY KEY,
              event_type TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              event_time INTEGER NOT NULL,
              title TEXT NOT NULL,
              description TEXT DEFAULT '',
              fund_code TEXT DEFAULT '',
              fund_name TEXT DEFAULT '',
              account_id TEXT,
              account_name TEXT DEFAULT '',
              source_type TEXT NOT NULL,
              source_id TEXT NOT NULL,
              detail_json TEXT DEFAULT '{}',
              handled_at INTEGER,
              handle_note TEXT DEFAULT '',
              created_at INTEGER DEFAULT (unixepoch()),
              updated_at INTEGER DEFAULT (unixepoch()),
              UNIQUE(source_type, source_id, event_type)
            )
          `).run();
          await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_events_status_time ON events(status, event_time DESC)').run();
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS event_scan_status (
              scan_key TEXT PRIMARY KEY,
              last_scanned_at INTEGER NOT NULL DEFAULT 0
            )
          `).run();
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS allocation_profiles (
              id TEXT PRIMARY KEY,
              profile_json TEXT NOT NULL,
              created_at INTEGER DEFAULT (unixepoch()),
              updated_at INTEGER DEFAULT (unixepoch())
            )
          `).run();
          await ensureColumn('allocation_profiles', 'version', 'version INTEGER DEFAULT 1');
          await ensureColumn('allocation_profiles', 'deleted_at', 'deleted_at INTEGER');
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS allocation_profile_audit_logs (
              id TEXT PRIMARY KEY,
              profile_id TEXT NOT NULL,
              action TEXT NOT NULL,
              version INTEGER NOT NULL,
              profile_json TEXT,
              created_at INTEGER DEFAULT (unixepoch())
            )
          `).run();
          await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_allocation_audit_profile ON allocation_profile_audit_logs(profile_id, created_at DESC)').run();
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS profit_snapshots (
              snapshot_date TEXT PRIMARY KEY,
              snapshot_json TEXT NOT NULL,
              captured_at INTEGER NOT NULL,
              created_at INTEGER DEFAULT (unixepoch()),
              updated_at INTEGER DEFAULT (unixepoch())
            )
          `).run();
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS app_meta (
              meta_key TEXT PRIMARY KEY,
              meta_value TEXT NOT NULL,
              updated_at INTEGER DEFAULT (unixepoch())
            )
          `).run();
          for (const tableName of householdTables) {
            await ensureColumn(tableName, 'household_id', 'household_id TEXT');
          }

          const { results: existingUsers } = await env.DB.prepare('SELECT id, username FROM users ORDER BY created_at ASC LIMIT 1').all();
          if (existingUsers.length > 0) {
            const legacyUser = existingUsers[0];
            await env.DB.prepare(
              `INSERT OR IGNORE INTO households (id, name, owner_user_id) VALUES (?, '我的家庭', ?)`
            ).bind(DEFAULT_HOUSEHOLD_ID, legacyUser.id).run();
            await env.DB.prepare(
              `UPDATE users SET household_id = COALESCE(household_id, ?), role = COALESCE(NULLIF(role, ''), 'owner'),
                      display_name = COALESCE(NULLIF(display_name, ''), username), status = COALESCE(NULLIF(status, ''), 'active')`
            ).bind(DEFAULT_HOUSEHOLD_ID).run();
            await env.DB.prepare("UPDATE users SET role = 'super_admin', updated_at = unixepoch() WHERE username = 'admin' COLLATE NOCASE").run();
            await env.DB.prepare('UPDATE auth_tokens SET user_id = COALESCE(user_id, ?)').bind(legacyUser.id).run();
            for (const tableName of householdTables) {
              await env.DB.prepare(`UPDATE ${tableName} SET household_id = COALESCE(household_id, ?)`).bind(DEFAULT_HOUSEHOLD_ID).run();
            }
          }

          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS household_profit_snapshots (
              household_id TEXT NOT NULL,
              snapshot_date TEXT NOT NULL,
              snapshot_json TEXT NOT NULL,
              captured_at INTEGER NOT NULL,
              created_at INTEGER DEFAULT (unixepoch()),
              updated_at INTEGER DEFAULT (unixepoch()),
              PRIMARY KEY (household_id, snapshot_date)
            )
          `).run();
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS household_family_snapshots (
              household_id TEXT NOT NULL,
              snapshot_date TEXT NOT NULL,
              summary_json TEXT NOT NULL,
              created_at INTEGER DEFAULT (unixepoch()),
              updated_at INTEGER DEFAULT (unixepoch()),
              PRIMARY KEY (household_id, snapshot_date)
            )
          `).run();
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS household_invites (
              id TEXT PRIMARY KEY,
              household_id TEXT NOT NULL,
              code_hash TEXT UNIQUE NOT NULL,
              role TEXT NOT NULL DEFAULT 'viewer',
              created_by TEXT NOT NULL,
              used_by TEXT,
              expires_at INTEGER NOT NULL,
              used_at INTEGER,
              revoked_at INTEGER,
              created_at INTEGER DEFAULT (unixepoch())
            )
          `).run();
          await ensureColumn('household_invites', 'member_mode', "member_mode TEXT NOT NULL DEFAULT 'create'");
          await ensureColumn('household_invites', 'member_id', 'member_id TEXT');
          await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_household_invites_household ON household_invites(household_id, created_at DESC)').run();
          await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_linked_member_unique ON users(linked_member_id) WHERE linked_member_id IS NOT NULL').run();
          await env.DB.prepare(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_pending_member_unique
            ON household_invites(member_id)
            WHERE member_id IS NOT NULL AND used_at IS NULL AND revoked_at IS NULL
          `).run();
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS registration_whitelist (
              id TEXT PRIMARY KEY,
              household_id TEXT NOT NULL,
              username TEXT NOT NULL COLLATE NOCASE UNIQUE,
              role TEXT NOT NULL DEFAULT 'viewer',
              status TEXT NOT NULL DEFAULT 'pending',
              created_by TEXT NOT NULL,
              used_by TEXT,
              used_at INTEGER,
              created_at INTEGER DEFAULT (unixepoch())
            )
          `).run();
          await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_registration_whitelist_household ON registration_whitelist(household_id, created_at DESC)').run();
          const { results: sharedWhitelistUsers } = await env.DB.prepare(`
            SELECT u.id, u.username, u.display_name
            FROM users u
            JOIN registration_whitelist w ON w.used_by = u.id
            WHERE u.household_id = w.household_id AND u.role != 'super_admin'
          `).all();
          for (const user of sharedWhitelistUsers || []) {
            const independentHouseholdId = generateId();
            const independentHouseholdName = `${user.display_name || user.username}的家庭`;
            await env.DB.batch([
              env.DB.prepare('INSERT INTO households (id, name, owner_user_id) VALUES (?, ?, ?)')
                .bind(independentHouseholdId, independentHouseholdName, user.id),
              env.DB.prepare("UPDATE users SET household_id = ?, role = 'owner', updated_at = unixepoch() WHERE id = ?")
                .bind(independentHouseholdId, user.id),
            ]);
          }
          await env.DB.prepare(`
            INSERT OR IGNORE INTO household_profit_snapshots
              (household_id, snapshot_date, snapshot_json, captured_at, created_at, updated_at)
            SELECT COALESCE(household_id, ?), snapshot_date, snapshot_json, captured_at, created_at, updated_at
            FROM profit_snapshots
          `).bind(DEFAULT_HOUSEHOLD_ID).run();
          await env.DB.prepare(`
            INSERT OR IGNORE INTO household_family_snapshots
              (household_id, snapshot_date, summary_json, created_at, updated_at)
            SELECT COALESCE(household_id, ?), snapshot_date, summary_json, created_at, updated_at
            FROM family_snapshots
          `).bind(DEFAULT_HOUSEHOLD_ID).run();

          await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_household ON users(household_id, status)').run();
          await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, expires_at)').run();
          for (const tableName of householdTables) {
            await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_${tableName}_household ON ${tableName}(household_id)`).run();
          }
          await env.DB.prepare(`
            INSERT INTO app_meta (meta_key, meta_value, updated_at)
            VALUES ('runtime_schema_version', ?, unixepoch())
            ON CONFLICT(meta_key) DO UPDATE SET meta_value = excluded.meta_value, updated_at = unixepoch()
          `).bind(runtimeSchemaVersion).run();
        })().catch(error => {
          runtimeSchemaInitPromise = null;
          throw error;
        });
      }

      return runtimeSchemaInitPromise;
    }

    async function ensureAdvisorySchemaOnce() {
      if (!advisorySchemaInitPromise) {
        advisorySchemaInitPromise = ensureAdvisoryTables().catch(error => {
          advisorySchemaInitPromise = null;
          throw error;
        });
      }

      return advisorySchemaInitPromise;
    }

    async function seedBusinessEvents(targetHouseholdId = householdId || DEFAULT_HOUSEHOLD_ID) {
      // 分红公告自动入账生成的交易是原事件的处理结果，不应再次产生待处理事件。
      await env.DB.prepare(`
        DELETE FROM events
        WHERE household_id = ? AND source_type = 'trade'
          AND source_id IN (
            SELECT t.id FROM trades t
            JOIN accounts a ON a.id = t.account_id
            WHERE t.source_type = 'dividend_event' AND a.household_id = ?
          )
      `).bind(targetHouseholdId, targetHouseholdId).run();

      const now = new Date();
      await env.DB.prepare(`
        DELETE FROM events
        WHERE household_id = ? AND event_type = 'nav_update' AND status = 'pending' AND source_type = 'fund_nav'
      `).bind(targetHouseholdId).run();
      if (!isChinaTradingDay(now)) {
        // 周末和休市日不比较净值。
      } else {
        const { results: navPositions } = await env.DB.prepare(`
          SELECT DISTINCT p.fund_code, p.fund_name
          FROM positions p
          JOIN accounts a ON a.id = p.account_id
          WHERE a.household_id = ? AND p.fund_code IS NOT NULL AND p.fund_code != ''
        `).bind(targetHouseholdId).all();
        const { results: navSnapshots } = await env.DB.prepare(
          'SELECT fund_code, jzrq FROM market_snapshot'
        ).all();
        const pendingFunds = buildNavEventPendingFundList({
          positions: navPositions,
          snapshots: navSnapshots,
          now,
          includeQdii: true,
        });
        for (const fund of pendingFunds) {
          const detail = JSON.stringify({
            target_nav_date: fund.expected_jzrq,
            current_nav_date: fund.current_jzrq || null,
            category: fund.category || 'normal',
          });
          await env.DB.prepare(`
            INSERT OR IGNORE INTO events (
              id, event_type, status, event_time, title, description, fund_code, fund_name,
              source_type, source_id, detail_json, household_id
            ) VALUES (?, 'nav_update', 'pending', unixepoch(), ?, ?, ?, ?, 'fund_nav', ?, ?, ?)
          `).bind(
            generateId(), `${fund.fund_name || fund.fund_code}净值待更新`,
            `最新净值仍停留在 ${fund.current_jzrq || '未知日期'}，可能影响今日收益统计。`,
            fund.fund_code, fund.fund_name || '',
            `${targetHouseholdId === DEFAULT_HOUSEHOLD_ID ? '' : `${targetHouseholdId}:`}${fund.fund_code}:${fund.expected_jzrq}`,
            detail, targetHouseholdId,
          ).run();
        }
      }

      const { results: trades } = await env.DB.prepare(`
        SELECT t.*, a.name AS account_name, a.household_id
        FROM trades t LEFT JOIN accounts a ON a.id = t.account_id
        WHERE a.household_id = ? AND COALESCE(t.source_type, '') != 'dividend_event'
        ORDER BY t.created_at ASC
      `).bind(targetHouseholdId).all();
      for (const trade of trades || []) {
        const tradeType = normalizeTradeType(trade.trade_type);
        const isDividend = ['现金分红', '分红再投', '红利再投'].includes(tradeType);
        const eventType = isDividend ? 'dividend' : 'share_change';
        const eventTime = Number(trade.created_at || 0) || Math.floor(Date.parse(`${trade.trade_date}T12:00:00+08:00`) / 1000);
        const quantity = Number(trade.quantity || 0);
        const amount = Number(trade.amount || 0);
        const title = isDividend
          ? `${trade.fund_name || trade.fund_code}发生${tradeType}`
          : `${trade.fund_name || trade.fund_code}持有份额发生变化`;
        const description = isDividend
          ? tradeType === TRADE_TYPES.REINVEST_DIVIDEND
            ? `红利再投新增 ${quantity.toFixed(4)} 份，折算分红金额 ${amount.toFixed(2)} 元。`
            : `现金分红 ${amount.toFixed(2)} 元，请确认到账情况。`
          : `${tradeType}导致份额变动 ${quantity.toFixed(2)} 份，请确认记录。`;
        await env.DB.prepare(`
          INSERT OR IGNORE INTO events (
            id, event_type, status, event_time, title, description, fund_code, fund_name,
            account_id, account_name, source_type, source_id, detail_json
            , household_id
          ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, 'trade', ?, ?, ?)
        `).bind(
          generateId(), eventType, eventTime, title, description, trade.fund_code,
          trade.fund_name || '', trade.account_id, trade.account_name || '', trade.id,
          JSON.stringify({ trade_type: tradeType, quantity, amount, trade_date: trade.trade_date, note: trade.note || '' }), trade.household_id || DEFAULT_HOUSEHOLD_ID,
        ).run();
      }
    }

    async function scanUpcomingDividendEvents() {
      const now = new Date();
      const scanKey = 'upcoming_dividends_workday_window_v2';
      await env.DB.prepare('INSERT OR IGNORE INTO event_scan_status (scan_key, last_scanned_at) VALUES (?, 0)').bind(scanKey).run();
      const scanLock = await env.DB.prepare(`
        UPDATE event_scan_status SET last_scanned_at = unixepoch()
        WHERE scan_key = ? AND last_scanned_at < unixepoch() - 21600
      `).bind(scanKey).run();
      if (Number(scanLock?.meta?.changes || 0) > 0) {
        const { results: positions } = await env.DB.prepare(`
          SELECT a.household_id, p.fund_code, MAX(p.fund_name) AS fund_name, SUM(p.quantity) AS quantity
          FROM positions p
          JOIN accounts a ON a.id = p.account_id
          WHERE p.quantity > 0 AND p.fund_code IS NOT NULL AND p.fund_code != ''
          GROUP BY a.household_id, p.fund_code
        `).all();
        const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; InvestmentEventCenter/1.0)' };
        for (let index = 0; index < (positions || []).length; index += 5) {
          const batch = positions.slice(index, index + 5);
          await Promise.all(batch.map(async position => {
            try {
              const response = await fetch(`https://fundf10.eastmoney.com/fhsp_${position.fund_code}.html`, { headers });
              if (!response.ok) return;
              const dividendRows = parseUpcomingDividendRows(await response.text(), {
                now,
                businessDaysBefore: 3,
                businessDaysAfter: 3,
              });
              for (const dividend of dividendRows) {
                const estimatedAmount = Number((Number(position.quantity || 0) * dividend.dividend_per_share).toFixed(2));
                const eventTime = Math.floor(Date.parse(`${dividend.record_date}T09:00:00+08:00`) / 1000);
                await env.DB.prepare(`
                  INSERT OR IGNORE INTO events (
                    id, event_type, status, event_time, title, description, fund_code, fund_name,
                    source_type, source_id, detail_json, household_id
                  ) VALUES (?, 'dividend', 'pending', ?, ?, ?, ?, ?, 'dividend_announcement', ?, ?, ?)
                `).bind(
                  generateId(), eventTime, `${position.fund_name || position.fund_code}即将分红`,
                  `每份派现金 ${dividend.dividend_per_share.toFixed(4)} 元，预计分红 ${estimatedAmount.toFixed(2)} 元。`,
                  position.fund_code, position.fund_name || '',
                  `${position.household_id === DEFAULT_HOUSEHOLD_ID ? '' : `${position.household_id}:`}${position.fund_code}:${dividend.record_date}:${dividend.dividend_per_share}`,
                  JSON.stringify({ ...dividend, estimated_amount: estimatedAmount, shares: Number(position.quantity || 0) }),
                  position.household_id,
                ).run();
              }
            } catch (error) {
              console.error(`Failed to scan dividend for ${position.fund_code}:`, error);
            }
          }));
        }
      }
    }

    async function fetchPositionDetailById(id) {
      const { results } = await env.DB.prepare(
        `SELECT p.*, a.name as account_name, a.channel as account_channel, a.member_id, m.name as member_name, m.emoji as member_emoji,
                s.gsz as nav_gsz, s.gszzl as nav_gszzl, s.dwjz as nav_dwjz, s.jzrq as nav_jzrq, s.updated_at as nav_updated_at,
                s.prev_nav
         FROM positions p
         LEFT JOIN accounts a ON p.account_id = a.id
         LEFT JOIN members m ON a.member_id = m.id
         LEFT JOIN market_snapshot s ON p.fund_code = s.fund_code
         WHERE p.id = ?`
      ).bind(id).all();
      return results[0] || null;
    }

    async function fetchBasePositionByAccountFund(accountId, fundCode) {
      const { results } = await env.DB.prepare(
        'SELECT * FROM positions WHERE account_id = ? AND fund_code = ? ORDER BY created_at ASC, id ASC LIMIT 1'
      ).bind(accountId, fundCode).all();
      return results[0] || null;
    }

    async function seedOpeningSnapshot(position) {
      if (!position) return null;
      const openingQuantity = position.opening_quantity ?? position.quantity ?? 0;
      const openingCost = position.opening_cost ?? position.cost ?? position.amount ?? 0;
      const openingInitialProfit = position.opening_initial_profit ?? position.initial_profit ?? 0;
      if (position.opening_quantity == null || position.opening_cost == null || position.opening_initial_profit == null) {
        await env.DB.prepare(
          `UPDATE positions
           SET opening_quantity = COALESCE(opening_quantity, ?),
               opening_cost = COALESCE(opening_cost, ?),
               opening_initial_profit = COALESCE(opening_initial_profit, ?),
               updated_at = unixepoch()
           WHERE id = ?`
        ).bind(openingQuantity, openingCost, openingInitialProfit, position.id).run();
      }
      return {
        ...position,
        opening_quantity: openingQuantity,
        opening_cost: openingCost,
        opening_initial_profit: openingInitialProfit,
      };
    }

    async function countTradesForPosition(accountId, fundCode) {
      const { results } = await env.DB.prepare(
        'SELECT COUNT(1) AS total FROM trades WHERE account_id = ? AND fund_code = ?'
      ).bind(accountId, fundCode).all();
      return Number(results?.[0]?.total || 0);
    }

    function normalizeTradePayload(body = {}) {
      const tradeType = normalizeTradeType(body.trade_type || body.tradeType || '');
      return {
        account_id: (body.account_id || body.accountId || '').trim(),
        fund_code: (body.fund_code || body.fundCode || '').trim(),
        fund_name: (body.fund_name || body.fundName || '').trim(),
        trade_type: tradeType,
        quantity: body.quantity === '' || body.quantity == null ? null : toNumber(body.quantity),
        amount: body.amount === '' || body.amount == null ? null : toNumber(body.amount),
        fee: body.fee === '' || body.fee == null ? 0 : toNumber(body.fee),
        trade_date: (body.trade_date || body.tradeDate || new Date().toISOString().split('T')[0]).trim(),
        note: (body.note || '').trim(),
        target_quantity: body.target_quantity ?? body.targetQuantity ?? null,
        target_cost: body.target_cost ?? body.targetCost ?? null,
        target_initial_profit: body.target_initial_profit ?? body.targetInitialProfit ?? null,
        dividend_method: body.dividend_method || body.dividendMethod || undefined,
      };
    }

    async function ensurePositionBaseForTrade(trade) {
      let position = await fetchBasePositionByAccountFund(trade.account_id, trade.fund_code);
      if (position) return seedOpeningSnapshot(position);

      const creatableTypes = new Set([
        TRADE_TYPES.BUY,
        TRADE_TYPES.TRANSFER_IN,
        TRADE_TYPES.REINVEST_DIVIDEND,
        TRADE_TYPES.CALIBRATION,
      ]);
      if (!creatableTypes.has(trade.trade_type)) {
        throw new Error('该基金当前没有可匹配持仓，请先新增初始持仓或录入买入/转入');
      }

      const positionId = generateId();
      await env.DB.prepare(
        `INSERT INTO positions (
          id, account_id, fund_code, fund_name, quantity, cost, initial_profit, dividend_method,
          opening_quantity, opening_cost, opening_initial_profit, realized_profit, cash_dividend, total_buy_amount, total_sell_amount
        ) VALUES (?, ?, ?, ?, 0, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0)`
      ).bind(positionId, trade.account_id, trade.fund_code, trade.fund_name || '', trade.dividend_method || '红利再投').run();

      position = await fetchBasePositionByAccountFund(trade.account_id, trade.fund_code);
      return seedOpeningSnapshot(position);
    }

    async function recomputeAndPersistPosition(accountId, fundCode) {
      const basePosition = await fetchBasePositionByAccountFund(accountId, fundCode);
      if (!basePosition) return null;
      const seededPosition = await seedOpeningSnapshot(basePosition);
      const { results: trades } = await env.DB.prepare(
        'SELECT * FROM trades WHERE account_id = ? AND fund_code = ? ORDER BY trade_date ASC, created_at ASC, id ASC'
      ).bind(accountId, fundCode).all();
      const ledgerState = rebuildPositionFromTrades(seededPosition, trades);
      await env.DB.prepare(
        `UPDATE positions
         SET fund_name = ?,
             quantity = ?,
             cost = ?,
             initial_profit = ?,
             dividend_method = ?,
             realized_profit = ?,
             cash_dividend = ?,
             total_buy_amount = ?,
             total_sell_amount = ?,
             updated_at = unixepoch()
         WHERE id = ?`
      ).bind(
        ledgerState.fund_name || seededPosition.fund_name || '',
        ledgerState.quantity,
        ledgerState.cost,
        ledgerState.initial_profit,
        ledgerState.dividend_method || seededPosition.dividend_method || '红利再投',
        ledgerState.realized_profit,
        ledgerState.cash_dividend,
        ledgerState.total_buy_amount,
        ledgerState.total_sell_amount,
        seededPosition.id,
      ).run();
      return fetchPositionDetailById(seededPosition.id);
    }

    async function getDividendPositions(event) {
      const { results } = await env.DB.prepare(`
        SELECT p.*, a.name AS account_name
        FROM positions p
        LEFT JOIN accounts a ON a.id = p.account_id
        WHERE p.fund_code = ? AND p.quantity > 0
        ORDER BY p.account_id, p.id
      `).bind(event.fund_code).all();
      return results || [];
    }

    async function resolveDividendReinvestNav(event, detail, positions) {
      let reinvestNav = toNumber(detail.reinvest_nav);
      if (!positions.some(position => (position.dividend_method || '红利再投') === '红利再投') || reinvestNav > 0) {
        return reinvestNav;
      }
      const response = await fetch(`https://fund.eastmoney.com/pingzhongdata/${event.fund_code}.js?v=${Date.now()}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestmentEventCenter/1.0)' },
      });
      if (response.ok) {
        const history = parsePingzhongdataFundHistory(await response.text()).net_worth_trend;
        reinvestNav = toNumber(history.find(row => row.date === detail.ex_date)?.nav);
      }
      return reinvestNav;
    }

    async function previewDividendAnnouncement(event) {
      let detail = {};
      try { detail = JSON.parse(event.detail_json || '{}'); } catch { detail = {}; }
      const positions = await getDividendPositions(event);
      if (!positions.length) throw new Error('当前没有该基金的有效持仓，无法处理分红');
      const reinvestNav = await resolveDividendReinvestNav(event, detail, positions);
      const drafts = positions.map(position => ({
        position,
        trade: buildDividendTrade({ position, detail, confirmedNav: reinvestNav }),
      }));
      const accounts = drafts.map(({ position, trade }) => ({
        position_id: position.id,
        account_id: position.account_id,
        account_name: position.account_name || '',
        held_quantity: Number(position.quantity || 0),
        dividend_method: position.dividend_method || '红利再投',
        amount: trade.amount,
        added_quantity: trade.quantity || 0,
        reinvest_nav: trade.reinvest_nav,
      }));
      return {
        accounts,
        total_added_quantity: Number(accounts.reduce((sum, item) => sum + item.added_quantity, 0).toFixed(4)),
        total_cash_amount: Number(accounts.filter(item => item.dividend_method !== '红利再投').reduce((sum, item) => sum + item.amount, 0).toFixed(4)),
      };
    }

    async function bookDividendAnnouncement(event) {
      let detail = {};
      try { detail = JSON.parse(event.detail_json || '{}'); } catch { detail = {}; }
      const preview = await previewDividendAnnouncement(event);
      const positions = await getDividendPositions(event);
      const drafts = positions.map(position => ({
        position,
        trade: buildDividendTrade({
          position,
          detail,
          confirmedNav: preview.accounts.find(item => item.position_id === position.id)?.reinvest_nav,
        }),
      }));
      let created = 0;
      const bookings = [];
      for (const { position, trade } of drafts) {
        const sourceId = `${event.id}:${position.id}`;
        const result = await env.DB.prepare(`
          INSERT OR IGNORE INTO trades (
            id, account_id, fund_code, fund_name, trade_type, quantity, amount, fee, trade_date, note,
            source_type, source_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'dividend_event', ?, unixepoch(), unixepoch())
        `).bind(
          generateId(), position.account_id, position.fund_code, position.fund_name || event.fund_name || '',
          trade.trade_type, trade.quantity, trade.amount, trade.trade_date,
          trade.trade_type === TRADE_TYPES.REINVEST_DIVIDEND
            ? `分红事件自动入账，折算净值 ${trade.reinvest_nav}`
            : '分红事件自动入账',
          sourceId,
        ).run();
        created += Number(result?.meta?.changes || 0);
        await recomputeAndPersistPosition(position.account_id, position.fund_code);
        bookings.push({
          position_id: position.id,
          account_id: position.account_id,
          dividend_method: position.dividend_method || '红利再投',
          trade_type: trade.trade_type,
          amount: trade.amount,
          added_quantity: trade.quantity || 0,
          reinvest_nav: trade.reinvest_nav,
        });
      }
      return { created, bookings };
    }

    await ensureRuntimeSchemaOnce();

    // ========== 公开接口（无需认证）==========
    // 健康检查
    if (path === '/health' || path === '/api/health') {
      return jsonResponse({ code: 0, message: 'ok', data: { service: 'Investment API', version: '3.1.0', db: 'investment-db' } });
    }

    // 检查是否已设置过管理员
    if (path === '/api/auth/status' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id FROM users LIMIT 1').all();
      return jsonResponse({ code: 0, data: { configured: results.length > 0 } });
    }

    // 注册管理员（首次设置）
    if (path === '/api/auth/setup' && method === 'POST') {
      const body = await context.request.json();
      const username = (body.username || 'admin').trim();
      const password = body.password;
      if (username.toLowerCase() !== 'admin') {
        return jsonResponse({ code: 400, message: '超级管理员用户名固定为 admin' }, 400);
      }
      if (!password || password.length < 6) {
        return jsonResponse({ code: 400, message: '密码长度至少6位' }, 400);
      }
      const { results: existing } = await env.DB.prepare('SELECT id FROM users LIMIT 1').all();
      if (existing.length > 0) {
        return jsonResponse({ code: 403, message: '已设置过管理员，请登录' }, 403);
      }
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
      const salt = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      const hashBuffer = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      const passwordHash = `${salt}$${hashHex}`;
      const id = generateId();
      const householdId = generateId();
      await env.DB.prepare('INSERT INTO households (id, name, owner_user_id) VALUES (?, ?, ?)').bind(householdId, '我的家庭', id).run();
      await env.DB.prepare(
        `INSERT INTO users (id, username, password_hash, display_name, household_id, role, status, updated_at)
         VALUES (?, ?, ?, ?, ?, 'super_admin', 'active', unixepoch())`
      ).bind(id, username, passwordHash, username, householdId).run();
      const token = crypto.randomUUID().replace(/-/g, '');
      const tokenId = generateId();
      const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
      await env.DB.prepare('INSERT INTO auth_tokens (id, token, user_id, expires_at) VALUES (?, ?, ?, ?)').bind(tokenId, token, id, expiresAt).run();
      return jsonResponse({ code: 0, data: { token, username, expires_at: expiresAt } });
    }

    // 登录
    if (path === '/api/auth/login' && method === 'POST') {
      const body = await context.request.json();
      const username = (body.username || '').trim();
      const password = body.password || '';
      if (!username || !password) {
        return jsonResponse({ code: 400, message: '用户名和密码不能为空' }, 400);
      }
      const { results } = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).all();
      if (results.length === 0) {
        return jsonResponse({ code: 401, message: '用户名或密码错误' }, 401);
      }
      const user = results[0];
      if (user.status !== 'active') {
        return jsonResponse({ code: 403, message: '该用户已被停用，请联系家庭管理员' }, 403);
      }
      const [salt, storedHash] = (user.password_hash || '').split('$');
      if (!salt || !storedHash) {
        return jsonResponse({ code: 401, message: '用户名或密码错误' }, 401);
      }
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
      const hashBuffer = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (hashHex !== storedHash) {
        return jsonResponse({ code: 401, message: '用户名或密码错误' }, 401);
      }
      const token = crypto.randomUUID().replace(/-/g, '');
      const tokenId = generateId();
      const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
      await env.DB.prepare('INSERT INTO auth_tokens (id, token, user_id, expires_at) VALUES (?, ?, ?, ?)').bind(tokenId, token, user.id, expiresAt).run();
      return jsonResponse({ code: 0, data: { token, username: user.username, expires_at: expiresAt } });
    }

    if (path.match(/^\/api\/auth\/invite\/[A-Za-z0-9_-]+$/) && method === 'GET') {
      const code = decodeURIComponent(path.split('/').pop());
      const codeHash = await hashInviteCode(code);
      const { results } = await env.DB.prepare(`
        SELECT i.role, i.expires_at, i.member_mode, i.member_id,
               h.name AS household_name, m.name AS member_name, m.emoji AS member_emoji, m.relation AS member_relation
        FROM household_invites i JOIN households h ON h.id = i.household_id
        LEFT JOIN members m ON m.id = i.member_id AND m.household_id = i.household_id
        WHERE i.code_hash = ? AND i.used_at IS NULL AND i.revoked_at IS NULL
          AND i.expires_at > unixepoch() AND h.status = 'active'
        LIMIT 1
      `).bind(codeHash).all();
      if (!results.length) return jsonResponse({ code: 404, message: '邀请码无效或已过期' }, 404);
      return jsonResponse({ code: 0, data: results[0] });
    }

    if (path === '/api/auth/register' && method === 'POST') {
      const body = await context.request.json();
      const username = String(body.username || '').trim();
      const displayName = String(body.display_name || body.displayName || username).trim();
      const password = String(body.password || '');
      const inviteCode = String(body.invite_code || body.inviteCode || '').trim();
      const requestedMemberName = String(body.member_name || '').trim();
      const requestedMemberEmoji = String(body.member_emoji || '👤').trim() || '👤';
      const requestedMemberRelation = String(body.member_relation || '').trim();
      if (!/^[\p{L}\p{N}_]{4,30}$/u.test(username)) return jsonResponse({ code: 400, message: '用户名需为4至30位中文、英文、数字或下划线' }, 400);
      if (!displayName || displayName.length > 30) return jsonResponse({ code: 400, message: '显示名称不能为空且不能超过30位' }, 400);
      if (password.length < 8) return jsonResponse({ code: 400, message: '密码长度至少8位' }, 400);
      const { results: duplicateUsers } = await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE LIMIT 1').bind(username).all();
      if (duplicateUsers.length) return jsonResponse({ code: 409, message: '用户名已被使用' }, 409);

      let invite = null;
      let whitelist = null;
      if (inviteCode) {
        const codeHash = await hashInviteCode(inviteCode);
        const { results: inviteRows } = await env.DB.prepare(`
          SELECT i.*, h.name AS household_name, m.name AS member_name, m.emoji AS member_emoji, m.relation AS member_relation
          FROM household_invites i
          JOIN households h ON h.id = i.household_id
          LEFT JOIN members m ON m.id = i.member_id AND m.household_id = i.household_id
          WHERE i.code_hash = ? AND i.used_at IS NULL AND i.revoked_at IS NULL
            AND i.expires_at > unixepoch() AND h.status = 'active'
          LIMIT 1
        `).bind(codeHash).all();
        if (!inviteRows.length) return jsonResponse({ code: 400, message: '邀请码无效或已过期' }, 400);
        invite = inviteRows[0];
        const { results: householdUsers } = await env.DB.prepare(`
          SELECT COUNT(*) AS total FROM users
          WHERE household_id = ? AND role NOT IN ('owner', 'super_admin')
        `).bind(invite.household_id).all();
        if (Number(householdUsers[0]?.total || 0) >= 10) {
          return jsonResponse({ code: 409, message: '该家庭邀请成员已达10人上限' }, 409);
        }
        if (invite.member_mode === 'existing') {
          if (!invite.member_id || !invite.member_name) return jsonResponse({ code: 409, message: '邀请关联的资产成员不存在' }, 409);
          const { results: memberBindings } = await env.DB.prepare('SELECT id FROM users WHERE linked_member_id = ? LIMIT 1').bind(invite.member_id).all();
          if (memberBindings.length) return jsonResponse({ code: 409, message: '邀请关联的资产成员已绑定其他账号' }, 409);
        } else if (!requestedMemberName) {
          return jsonResponse({ code: 400, message: '请填写资产成员姓名' }, 400);
        }
      } else {
        const { results: whitelistRows } = await env.DB.prepare(`
          SELECT w.* FROM registration_whitelist w
          WHERE w.username = ? COLLATE NOCASE AND w.status = 'pending' AND w.used_at IS NULL
          LIMIT 1
        `).bind(username).all();
        if (!whitelistRows.length) {
          return jsonResponse({ code: 403, message: '该用户名不在注册白名单中，请联系超级管理员添加，或使用家庭邀请码注册' }, 403);
        }
        whitelist = whitelistRows[0];
      }

      const userId = generateId();
      const memberId = invite?.member_mode === 'existing' ? invite.member_id : generateId();
      const effectiveDisplayName = invite?.member_mode === 'existing' ? invite.member_name : displayName;
      const passwordHash = await derivePasswordHash(password);
      const householdId = invite ? invite.household_id : generateId();
      const householdName = invite ? invite.household_name : `${displayName}的家庭`;
      const role = invite ? (invite.role === 'admin' ? 'admin' : 'viewer') : 'owner';

      const token = crypto.randomUUID().replace(/-/g, '');
      const tokenId = generateId();
      const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
      if (invite) {
        const claim = await env.DB.prepare(`
          UPDATE household_invites SET used_by = ?, used_at = unixepoch()
          WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > unixepoch()
            AND (SELECT COUNT(*) FROM users WHERE household_id = ? AND role NOT IN ('owner', 'super_admin')) < 10
        `).bind(userId, invite.id, householdId).run();
        if (Number(claim?.meta?.changes || 0) !== 1) {
          return jsonResponse({ code: 409, message: '邀请码已被使用或家庭成员已达上限' }, 409);
        }
      } else {
        const claim = await env.DB.prepare(`
          UPDATE registration_whitelist SET used_by = ?, used_at = unixepoch(), status = 'used'
          WHERE id = ? AND status = 'pending' AND used_at IS NULL
        `).bind(userId, whitelist.id).run();
        if (Number(claim?.meta?.changes || 0) !== 1) {
          return jsonResponse({ code: 409, message: '该白名单名额已被使用，请联系超级管理员' }, 409);
        }
      }
      const statements = [];
      if (!invite) statements.push(env.DB.prepare('INSERT INTO households (id, name, owner_user_id) VALUES (?, ?, ?)').bind(householdId, householdName, userId));
      if (!invite || invite.member_mode !== 'existing') {
        statements.push(env.DB.prepare(`
          INSERT INTO members (id, name, emoji, relation, household_id)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          memberId,
          invite ? requestedMemberName : displayName,
          requestedMemberEmoji,
          invite ? requestedMemberRelation : '本人',
          householdId,
        ));
      }
      statements.push(env.DB.prepare(`
        INSERT INTO users (id, username, password_hash, display_name, household_id, role, status, linked_member_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, unixepoch())
      `).bind(userId, username, passwordHash, effectiveDisplayName, householdId, role, memberId));
      statements.push(env.DB.prepare('INSERT INTO auth_tokens (id, token, user_id, expires_at) VALUES (?, ?, ?, ?)').bind(tokenId, token, userId, expiresAt));
      try {
        await env.DB.batch(statements);
      } catch (error) {
        if (invite) {
          await env.DB.prepare('UPDATE household_invites SET used_by = NULL, used_at = NULL WHERE id = ? AND used_by = ?').bind(invite.id, userId).run();
        } else {
          await env.DB.prepare(`
            UPDATE registration_whitelist SET used_by = NULL, used_at = NULL, status = 'pending'
            WHERE id = ? AND used_by = ?
          `).bind(whitelist.id, userId).run();
        }
        throw error;
      }
      return jsonResponse({ code: 0, data: { token, username, display_name: effectiveDisplayName, household_id: householdId, household_name: householdName, role, linked_member_id: memberId, expires_at: expiresAt } });
    }

    // 登出
    if (path === '/api/auth/logout' && method === 'POST') {
      const authHeader = context.request.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (token) {
        await env.DB.prepare('DELETE FROM auth_tokens WHERE token = ?').bind(token).run();
      }
      return jsonResponse({ code: 0, message: '已登出' });
    }

    // 除健康检查和认证入口外，所有业务接口都需要认证。
    // 部分 GET 路由会触发行情同步或返回敏感投资数据，不能按 HTTP 方法放行。
    let authUser = null;
    if (requiresAuthentication(path, method) && !isCronAuthorized) {
      authUser = await verifyToken(context.request);
      if (!authUser) {
        return jsonResponse({ code: 401, message: '请先登录' }, 401);
      }
      if (method !== 'GET' && !canWriteHouseholdData(authUser.role)) {
        return jsonResponse({ code: 403, message: '当前家庭角色只有查看权限' }, 403);
      }
    }
    const householdId = authUser?.household_id || null;
    async function accountBelongsToHousehold(accountId) {
      if (!accountId || !householdId) return false;
      const { results } = await env.DB.prepare('SELECT id FROM accounts WHERE id = ? AND household_id = ? LIMIT 1').bind(accountId, householdId).all();
      return results.length > 0;
    }
    async function memberBelongsToHousehold(memberId) {
      if (!memberId) return true;
      const { results } = await env.DB.prepare('SELECT id FROM members WHERE id = ? AND household_id = ? LIMIT 1').bind(memberId, householdId).all();
      return results.length > 0;
    }

    if (path === '/api/auth/me' && method === 'GET') {
      return jsonResponse({ code: 0, data: {
        id: authUser.user_id,
        username: authUser.username,
        display_name: authUser.display_name || authUser.username,
        household_id: householdId,
        household_name: authUser.household_name,
        role: authUser.role,
        linked_member_id: authUser.linked_member_id || null,
        linked_member_name: authUser.linked_member_name || null,
        linked_member_emoji: authUser.linked_member_emoji || null,
        linked_member_relation: authUser.linked_member_relation || null,
      } });
    }

    const requireHouseholdOwner = () => ['super_admin', 'owner'].includes(authUser?.role)
      ? null
      : jsonResponse({ code: 403, message: '仅家庭所有者可以执行此操作' }, 403);
    const requireSuperAdmin = () => authUser?.role === 'super_admin' && String(authUser?.username || '').toLowerCase() === 'admin'
      ? null
      : jsonResponse({ code: 403, message: '仅超级管理员 admin 可以管理注册白名单' }, 403);

    if (path === '/api/household' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, name, owner_user_id, status, created_at FROM households WHERE id = ? LIMIT 1').bind(householdId).all();
      return jsonResponse({ code: 0, data: { household: results[0] || null } });
    }

    if (path === '/api/household' && method === 'PATCH') {
      const denied = requireHouseholdOwner();
      if (denied) return denied;
      const body = await context.request.json().catch(() => ({}));
      const name = String(body.name || '').trim();
      if (!name || name.length > 20) return jsonResponse({ code: 400, message: '家庭名称请输入1至20个字符' }, 400);
      await env.DB.prepare('UPDATE households SET name = ?, updated_at = unixepoch() WHERE id = ?').bind(name, householdId).run();
      return jsonResponse({ code: 0, message: '家庭名称已更新', data: { household: { id: householdId, name } } });
    }

    if (path === '/api/household/users' && method === 'GET') {
      const { results } = await env.DB.prepare(`
        SELECT u.id, u.username, u.display_name, u.role, u.status, u.linked_member_id, u.created_at,
               m.name AS linked_member_name, m.emoji AS linked_member_emoji
        FROM users u LEFT JOIN members m ON m.id = u.linked_member_id AND m.household_id = u.household_id
        WHERE u.household_id = ? ORDER BY CASE u.role WHEN 'super_admin' THEN 0 WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, u.created_at
      `).bind(householdId).all();
      return jsonResponse({ code: 0, data: { users: results || [] } });
    }

    if (path.match(/^\/api\/household\/users\/[\w-]+$/) && method === 'PATCH') {
      const denied = requireHouseholdOwner();
      if (denied) return denied;
      const targetId = path.split('/').pop();
      const body = await context.request.json();
      const { results } = await env.DB.prepare('SELECT id, role, status, linked_member_id FROM users WHERE id = ? AND household_id = ? LIMIT 1').bind(targetId, householdId).all();
      if (!results.length) return jsonResponse({ code: 404, message: '家庭用户不存在' }, 404);
      const protectedOwner = ['super_admin', 'owner'].includes(results[0].role);
      if (protectedOwner && (body.role !== undefined || body.status !== undefined)) {
        return jsonResponse({ code: 400, message: '超级管理员或家庭所有者只能修改成员关联' }, 400);
      }
      const nextRole = body.role === undefined ? results[0].role : String(body.role);
      const nextStatus = body.status === undefined ? results[0].status : String(body.status);
      const linkedMemberId = body.linked_member_id === undefined ? results[0].linked_member_id : (String(body.linked_member_id || '').trim() || null);
      if (!['admin', 'viewer'].includes(nextRole)) return jsonResponse({ code: 400, message: '用户角色无效' }, 400);
      if (!['active', 'disabled'].includes(nextStatus)) return jsonResponse({ code: 400, message: '用户状态无效' }, 400);
      if (linkedMemberId && !(await memberBelongsToHousehold(linkedMemberId))) return jsonResponse({ code: 400, message: '关联成员不存在' }, 400);
      if (linkedMemberId) {
        const { results: bindings } = await env.DB.prepare('SELECT id FROM users WHERE linked_member_id = ? AND id != ? LIMIT 1').bind(linkedMemberId, targetId).all();
        if (bindings.length) return jsonResponse({ code: 409, message: '该资产成员已绑定其他登录用户' }, 409);
      }
      await env.DB.prepare(`
        UPDATE users SET role = ?, status = ?, linked_member_id = ?, updated_at = unixepoch()
        WHERE id = ? AND household_id = ?
      `).bind(nextRole, nextStatus, linkedMemberId, targetId, householdId).run();
      if (nextStatus === 'disabled') await env.DB.prepare('DELETE FROM auth_tokens WHERE user_id = ?').bind(targetId).run();
      return jsonResponse({ code: 0, message: nextStatus === 'disabled' ? '用户已停用' : '用户权限已更新' });
    }

    if (path === '/api/household/registration-whitelist' && method === 'GET') {
      const denied = requireSuperAdmin();
      if (denied) return denied;
      const { results } = await env.DB.prepare(`
        SELECT w.id, w.username, w.role, w.status, w.used_at, w.created_at,
               used.username AS registered_username, used.display_name AS used_by_name,
               used.role AS registered_role, used.status AS registered_status,
               registered_household.name AS registered_household_name
        FROM registration_whitelist w
        LEFT JOIN users used ON used.id = w.used_by
        LEFT JOIN households registered_household ON registered_household.id = used.household_id
        WHERE w.household_id = ?
        ORDER BY CASE w.status WHEN 'pending' THEN 0 ELSE 1 END, w.created_at DESC
        LIMIT 100
      `).bind(householdId).all();
      return jsonResponse({ code: 0, data: { whitelist: results || [] } });
    }

    if (path === '/api/household/registration-whitelist' && method === 'POST') {
      const denied = requireSuperAdmin();
      if (denied) return denied;
      const body = await context.request.json().catch(() => ({}));
      const username = String(body.username || '').trim();
      const role = 'owner';
      if (!/^[\p{L}\p{N}_]{4,30}$/u.test(username)) {
        return jsonResponse({ code: 400, message: '用户名需为4至30位中文、英文、数字或下划线' }, 400);
      }
      const { results: existingUsers } = await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE LIMIT 1').bind(username).all();
      if (existingUsers.length) return jsonResponse({ code: 409, message: '该用户名已经注册' }, 409);
      const { results: existingEntries } = await env.DB.prepare('SELECT id, status FROM registration_whitelist WHERE username = ? COLLATE NOCASE LIMIT 1').bind(username).all();
      if (existingEntries.length) return jsonResponse({ code: 409, message: '该用户名已在白名单中' }, 409);
      const id = generateId();
      await env.DB.prepare(`
        INSERT INTO registration_whitelist (id, household_id, username, role, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).bind(id, householdId, username, role, authUser.user_id).run();
      return jsonResponse({ code: 0, data: { id, username, role, status: 'pending' } });
    }

    if (path.match(/^\/api\/household\/registration-whitelist\/[\w-]+$/) && method === 'DELETE') {
      const denied = requireSuperAdmin();
      if (denied) return denied;
      const id = path.split('/').pop();
      const result = await env.DB.prepare(`
        DELETE FROM registration_whitelist
        WHERE id = ? AND household_id = ? AND status = 'pending' AND used_at IS NULL
      `).bind(id, householdId).run();
      if (Number(result?.meta?.changes || 0) !== 1) return jsonResponse({ code: 400, message: '仅可移除尚未注册的白名单用户' }, 400);
      return jsonResponse({ code: 0, message: '已移出注册白名单' });
    }

    if (path === '/api/household/invites' && method === 'GET') {
      const denied = requireHouseholdOwner();
      if (denied) return denied;
      await env.DB.prepare(`
        UPDATE household_invites SET revoked_at = unixepoch()
        WHERE household_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at <= unixepoch()
      `).bind(householdId).run();
      const { results } = await env.DB.prepare(`
        SELECT i.id, i.role, i.member_mode, i.member_id, i.expires_at, i.used_at, i.revoked_at, i.created_at,
               creator.display_name AS created_by_name, used.display_name AS used_by_name,
               m.name AS member_name, m.emoji AS member_emoji, m.relation AS member_relation
        FROM household_invites i
        LEFT JOIN users creator ON creator.id = i.created_by
        LEFT JOIN users used ON used.id = i.used_by
        LEFT JOIN members m ON m.id = i.member_id AND m.household_id = i.household_id
        WHERE i.household_id = ? ORDER BY i.created_at DESC LIMIT 50
      `).bind(householdId).all();
      const { results: memberRows } = await env.DB.prepare(`
        SELECT m.id, m.name, m.emoji, m.relation,
               u.username AS linked_username,
               CASE WHEN pending.id IS NULL THEN 0 ELSE 1 END AS has_pending_invite
        FROM members m
        LEFT JOIN users u ON u.linked_member_id = m.id
        LEFT JOIN household_invites pending ON pending.member_id = m.id
          AND pending.used_at IS NULL AND pending.revoked_at IS NULL AND pending.expires_at > unixepoch()
        WHERE m.household_id = ?
        ORDER BY m.created_at ASC
      `).bind(householdId).all();
      return jsonResponse({ code: 0, data: { invites: results || [], members: memberRows || [] } });
    }

    if (path === '/api/household/invites' && method === 'POST') {
      const denied = requireHouseholdOwner();
      if (denied) return denied;
      const body = await context.request.json().catch(() => ({}));
      const role = body.role === 'admin' ? 'admin' : 'viewer';
      const memberMode = body.member_mode === 'existing' ? 'existing' : 'create';
      const memberId = memberMode === 'existing' ? String(body.member_id || '').trim() : null;
      const { results: householdUsers } = await env.DB.prepare(`
        SELECT COUNT(*) AS total FROM users
        WHERE household_id = ? AND role NOT IN ('owner', 'super_admin')
      `).bind(householdId).all();
      if (Number(householdUsers[0]?.total || 0) >= 10) {
        return jsonResponse({ code: 409, message: '该家庭邀请成员已达10人上限' }, 409);
      }
      if (memberMode === 'existing') {
        if (!memberId) return jsonResponse({ code: 400, message: '请选择要关联的资产成员' }, 400);
        await env.DB.prepare(`
          UPDATE household_invites SET revoked_at = unixepoch()
          WHERE household_id = ? AND member_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at <= unixepoch()
        `).bind(householdId, memberId).run();
        const { results: memberRows } = await env.DB.prepare(`
          SELECT m.id,
                 (SELECT COUNT(*) FROM users u WHERE u.linked_member_id = m.id) AS linked_count,
                 (SELECT COUNT(*) FROM household_invites i WHERE i.member_id = m.id AND i.used_at IS NULL
                    AND i.revoked_at IS NULL AND i.expires_at > unixepoch()) AS pending_count
          FROM members m WHERE m.id = ? AND m.household_id = ? LIMIT 1
        `).bind(memberId, householdId).all();
        if (!memberRows.length) return jsonResponse({ code: 404, message: '资产成员不存在' }, 404);
        if (Number(memberRows[0].linked_count || 0) > 0) return jsonResponse({ code: 409, message: '该资产成员已经绑定登录账号' }, 409);
        if (Number(memberRows[0].pending_count || 0) > 0) return jsonResponse({ code: 409, message: '该资产成员已有待使用邀请' }, 409);
      }
      const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      const codeHash = await hashInviteCode(inviteCode);
      const id = generateId();
      const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
      await env.DB.prepare(`
        INSERT INTO household_invites (id, household_id, code_hash, role, member_mode, member_id, created_by, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, householdId, codeHash, role, memberMode, memberId, authUser.user_id, expiresAt).run();
      return jsonResponse({ code: 0, data: { id, invite_code: inviteCode, role, member_mode: memberMode, member_id: memberId, expires_at: expiresAt } });
    }

    if (path.match(/^\/api\/household\/invites\/[\w-]+$/) && method === 'DELETE') {
      const denied = requireHouseholdOwner();
      if (denied) return denied;
      const id = path.split('/').pop();
      await env.DB.prepare('UPDATE household_invites SET revoked_at = unixepoch() WHERE id = ? AND household_id = ? AND used_at IS NULL').bind(id, householdId).run();
      return jsonResponse({ code: 0, message: '邀请码已撤销' });
    }

    // ========== 家庭财务记账 API ==========
    // 与基金 positions/trades 完全隔离，只在总览中读取基金市值。
    if (path === '/api/family-finance/overview' && method === 'GET') {
      const data = await getFamilyFinanceData();
      const [snapshotQuery, assetRecordQuery, advisoryHistoryQuery, receivableHistoryQuery, receivablePaymentQuery] = await Promise.all([
        env.DB.prepare('SELECT snapshot_date, summary_json FROM household_family_snapshots WHERE household_id = ? ORDER BY snapshot_date DESC LIMIT 24').bind(householdId).all(),
        env.DB.prepare(`
          SELECT r.*, a.name AS asset_name, a.category_code, a.member_id,
                 m.name AS member_name, m.emoji AS member_emoji
          FROM family_asset_records r
          JOIN family_assets a ON r.asset_id = a.id
          LEFT JOIN members m ON a.member_id = m.id
          WHERE a.status != 'archived' AND a.household_id = ?
          ORDER BY r.record_date ASC, r.created_at ASC, r.id ASC
          LIMIT 120
        `).bind(householdId).all(),
        env.DB.prepare(`
          SELECT s.id, s.product_id, s.snapshot_date, s.total_amount, s.created_at, s.updated_at,
                 p.product_name AS asset_name, COALESCE(p.member_id, a.member_id) AS member_id,
                 m.name AS member_name, m.emoji AS member_emoji
          FROM advisory_product_snapshots s
          JOIN advisory_products p ON s.product_id = p.id
          LEFT JOIN accounts a ON p.account_id = a.id
          LEFT JOIN members m ON COALESCE(p.member_id, a.member_id) = m.id
          WHERE COALESCE(p.status, '正常') != '已删除' AND p.household_id = ?
          ORDER BY s.snapshot_date ASC, s.created_at ASC, s.id ASC
          LIMIT 120
        `).bind(householdId).all(),
        env.DB.prepare(`
          SELECT r.*, m.name AS member_name, m.emoji AS member_emoji
          FROM family_receivables r LEFT JOIN members m ON r.member_id = m.id
          WHERE r.household_id = ?
          ORDER BY r.created_at ASC, r.id ASC
        `).bind(householdId).all(),
        env.DB.prepare(`
          SELECT p.*, r.name AS receivable_name, r.category_code, r.member_id,
                 m.name AS member_name, m.emoji AS member_emoji
          FROM family_receivable_payments p
          JOIN family_receivables r ON p.receivable_id = r.id
          LEFT JOIN members m ON r.member_id = m.id
          WHERE r.household_id = ?
          ORDER BY p.payment_date ASC, p.created_at ASC, p.id ASC
        `).bind(householdId).all(),
      ]);
      const assetEvents = (assetRecordQuery.results || []).map(record => ({
        key: record.id,
        type: 'manual',
        asset_id: record.asset_id,
        date: record.record_date,
        created_at: record.created_at,
        updated_at: record.created_at,
        current_value: normalizeFamilyMoney(record.current_value),
        operation: {
          id: record.id,
          asset_id: record.asset_id,
          asset_name: record.asset_name,
          category_code: record.category_code,
          member_id: record.member_id,
          member_name: record.member_name,
          member_emoji: record.member_emoji,
          change_value: normalizeFamilyMoney(record.change_value),
          remark: record.remark,
        },
      }));
      const advisoryBalancesByProduct = new Map();
      (advisoryHistoryQuery.results || []).forEach(record => {
        const previousValue = Number(advisoryBalancesByProduct.get(record.product_id) || 0);
        const currentValue = normalizeFamilyMoney(record.total_amount);
        advisoryBalancesByProduct.set(record.product_id, currentValue);
        assetEvents.push({
          key: `advisory-${record.id}`,
          type: 'advisory',
          asset_id: `advisory-${record.product_id}`,
          date: record.snapshot_date,
          created_at: record.created_at,
          updated_at: record.updated_at,
          current_value: currentValue,
          operation: {
            id: `advisory-${record.id}`,
            asset_id: `advisory-${record.product_id}`,
            asset_name: record.asset_name,
            category_code: 'advisory',
            member_id: record.member_id,
            member_name: record.member_name,
            member_emoji: record.member_emoji,
            change_value: normalizeFamilyMoney(currentValue - previousValue),
            remark: previousValue === 0 ? '初始录入顾投资产' : '更新顾投资产',
          },
        });
      });
      assetEvents.sort((a, b) => String(a.date).localeCompare(String(b.date))
        || Number(a.created_at || 0) - Number(b.created_at || 0)
        || Number(a.updated_at || 0) - Number(b.updated_at || 0)
        || String(a.key).localeCompare(String(b.key)));
      const assetBalances = new Map();
      const assetTrend = assetEvents.map(event => {
        assetBalances.set(event.asset_id, normalizeFamilyMoney(event.current_value));
        const totalValue = normalizeFamilyMoney([...assetBalances.values()].reduce((sum, value) => sum + value, 0));
        return {
          key: event.key,
          date: event.date,
          created_at: event.created_at,
          total_value: totalValue,
          operations: [event.operation],
        };
      });
      const receivableRows = receivableHistoryQuery.results || [];
      const receivableEvents = receivableRows.map(row => ({
        key: `create-${row.id}`,
        type: 'create',
        receivable_id: row.id,
        date: row.lent_date || getChinaDateString(new Date(Number(row.created_at || 0) * 1000)),
        created_at: row.created_at,
        amount: normalizeFamilyMoney(row.original_amount),
        receivable_name: row.name,
        category_code: row.category_code,
        member_id: row.member_id,
        member_name: row.member_name,
        member_emoji: row.member_emoji,
        remark: row.remark || '新增应收款',
      }));
      (receivablePaymentQuery.results || []).forEach(row => receivableEvents.push({
        key: `payment-${row.id}`,
        type: 'payment',
        receivable_id: row.receivable_id,
        date: row.payment_date,
        created_at: row.created_at,
        amount: normalizeFamilyMoney(row.amount),
        receivable_name: row.receivable_name,
        category_code: row.category_code,
        member_id: row.member_id,
        member_name: row.member_name,
        member_emoji: row.member_emoji,
        remark: row.remark || '记录回款',
      }));
      receivableEvents.sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.created_at || 0) - Number(b.created_at || 0) || a.key.localeCompare(b.key));
      const receivableBalances = new Map();
      const receivableTrend = receivableEvents.map(event => {
        const previous = Number(receivableBalances.get(event.receivable_id) || 0);
        const changeValue = event.type === 'create' ? event.amount : -event.amount;
        receivableBalances.set(event.receivable_id, normalizeFamilyMoney(previous + changeValue));
        const totalValue = normalizeFamilyMoney([...receivableBalances.values()].reduce((sum, value) => sum + value, 0));
        return {
          key: event.key,
          date: event.date,
          total_value: totalValue,
          operations: [{ ...event, change_value: changeValue }],
        };
      });
      const todayDate = getChinaDateString(new Date());
      const activeReceivables = data.receivables || [];
      const overdueReceivables = activeReceivables.filter(item => item.due_date && item.due_date < todayDate);
      const receivableSummary = {
        total_amount: normalizeFamilyMoney(activeReceivables.reduce((sum, item) => sum + Number(item.outstanding_amount || 0), 0)),
        total_count: activeReceivables.length,
        overdue_amount: normalizeFamilyMoney(overdueReceivables.reduce((sum, item) => sum + Number(item.outstanding_amount || 0), 0)),
        overdue_count: overdueReceivables.length,
      };
      const snapshots = snapshotQuery.results || [];
      return jsonResponse({
        code: 0,
        data: {
          ...data,
          categories: {
            assets: Object.values(FAMILY_ASSET_CATEGORY_MAP),
            receivables: FAMILY_RECEIVABLE_CATEGORIES,
            liabilities: FAMILY_LIABILITY_CATEGORIES,
          },
          snapshots: (snapshots || []).map(row => ({ date: row.snapshot_date, ...JSON.parse(row.summary_json) })).reverse(),
          asset_trend: assetTrend,
          receivable_trend: receivableTrend,
          receivable_summary: receivableSummary,
        },
      });
    }

    if (path === '/api/family-finance/assets' && method === 'POST') {
      const body = await context.request.json();
      const category = FAMILY_ASSET_CATEGORY_MAP[body.category_code];
      const payload = {
        name: String(body.name || '').trim(),
        category_code: String(body.category_code || ''),
        current_value: normalizeFamilyMoney(body.current_value),
      };
      const errors = validateFamilyAsset(payload);
      if (errors.length) return jsonResponse({ code: 400, message: errors[0], errors }, 400);
      const memberId = await resolveFamilyMemberId(body.member_id);
      if (!memberId) return jsonResponse({ code: 400, message: '请选择有效的家庭成员' }, 400);
      const id = generateId();
      const valuationDate = normalizeFamilyDate(body.valuation_date);
      const investable = body.include_in_investable_assets === undefined
        ? Number(Boolean(category?.investable))
        : Number(Boolean(body.include_in_investable_assets));
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO family_assets (
            id, member_id, name, category_code, institution, current_value, valuation_date,
            include_in_net_worth, include_in_investable_assets, remark, household_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(id, memberId, payload.name, payload.category_code,
          String(body.institution || '').trim(), payload.current_value, valuationDate,
          Number(body.include_in_net_worth !== false), investable, String(body.remark || '').trim(), householdId),
        env.DB.prepare(`
          INSERT INTO family_asset_records (id, asset_id, previous_value, current_value, change_value, record_date, remark)
          VALUES (?, ?, 0, ?, ?, ?, ?)
        `).bind(generateId(), id, payload.current_value, payload.current_value, valuationDate, '初始录入'),
      ]);
      queueFamilySnapshot();
      return jsonResponse({ code: 0, data: { id } });
    }

    if (path.match(/^\/api\/family-finance\/assets\/[\w-]+$/) && method === 'PUT') {
      const id = path.split('/').pop();
      const body = await context.request.json();
      const { results } = await env.DB.prepare('SELECT * FROM family_assets WHERE id = ? AND status != ? AND household_id = ?').bind(id, 'archived', householdId).all();
      if (!results.length) return jsonResponse({ code: 404, message: '资产不存在' }, 404);
      const current = results[0];
      const previousValue = normalizeFamilyMoney(current.current_value);
      const hasAmountChange = Object.prototype.hasOwnProperty.call(body, 'change_value');
      const changeValue = normalizeFamilyMoney(body.change_value ?? 0);
      const nextValue = normalizeFamilyMoney(previousValue + changeValue);
      const payload = {
        name: String(body.name ?? current.name).trim(),
        category_code: String(body.category_code ?? current.category_code),
        current_value: nextValue,
      };
      if (!Number.isFinite(changeValue)) return jsonResponse({ code: 400, message: '本次金额变化无效' }, 400);
      if (nextValue < 0) return jsonResponse({ code: 400, message: '本次减少金额不能大于当前金额' }, 400);
      const errors = validateFamilyAsset(payload);
      if (errors.length) return jsonResponse({ code: 400, message: errors[0], errors }, 400);
      const memberId = await resolveFamilyMemberId(body.member_id ?? current.member_id);
      if (!memberId) return jsonResponse({ code: 400, message: '请选择有效的家庭成员' }, 400);
      const valuationDate = normalizeFamilyDate(body.valuation_date || current.valuation_date);
      const changed = changeValue !== 0;
      const statements = [env.DB.prepare(`
        UPDATE family_assets SET member_id = ?, name = ?, category_code = ?, institution = ?, current_value = ?,
          valuation_date = ?, include_in_net_worth = ?, include_in_investable_assets = ?, remark = ?, updated_at = unixepoch()
        WHERE id = ? AND household_id = ?
      `).bind(memberId, payload.name, payload.category_code,
        String(body.institution ?? current.institution ?? '').trim(), payload.current_value, valuationDate,
        Number(body.include_in_net_worth ?? current.include_in_net_worth ?? 1),
        Number(body.include_in_investable_assets ?? current.include_in_investable_assets ?? 0),
        String(body.remark ?? current.remark ?? '').trim(), id, householdId)];
      if (hasAmountChange) statements.push(env.DB.prepare(`
          INSERT INTO family_asset_records (id, asset_id, previous_value, current_value, change_value, record_date, remark)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(generateId(), id, previousValue, payload.current_value, changeValue,
          valuationDate, String(body.update_remark || '更新资产金额').trim()));
      await env.DB.batch(statements);
      queueFamilySnapshot();
      return jsonResponse({ code: 0, data: { id, value_changed: hasAmountChange && changed } });
    }

    if (path.match(/^\/api\/family-finance\/assets\/[\w-]+$/) && method === 'GET') {
      const id = path.split('/').pop();
      const [assetQuery, recordQuery] = await Promise.all([
        env.DB.prepare(`
          SELECT a.*, m.name AS member_name, m.emoji AS member_emoji
          FROM family_assets a LEFT JOIN members m ON a.member_id = m.id
          WHERE a.id = ? AND a.status != 'archived' AND a.household_id = ?
          LIMIT 1
        `).bind(id, householdId).all(),
        env.DB.prepare(
          'SELECT * FROM family_asset_records WHERE asset_id = ? ORDER BY record_date DESC, created_at DESC'
        ).bind(id).all(),
      ]);
      const results = assetQuery.results || [];
      if (!results.length) return jsonResponse({ code: 404, message: '资产不存在' }, 404);
      const records = recordQuery.results || [];
      const category = FAMILY_ASSET_CATEGORY_MAP[results[0].category_code] || null;
      return jsonResponse({ code: 0, data: { asset: results[0], records: records || [], category, categories: Object.values(FAMILY_ASSET_CATEGORY_MAP) } });
    }

    if (path.match(/^\/api\/family-finance\/assets\/[\w-]+$/) && method === 'DELETE') {
      const id = path.split('/').pop();
      await env.DB.prepare("UPDATE family_assets SET status = 'archived', updated_at = unixepoch() WHERE id = ? AND household_id = ?").bind(id, householdId).run();
      queueFamilySnapshot();
      return jsonResponse({ code: 0, message: '资产已删除' });
    }

    if (path.match(/^\/api\/family-finance\/assets\/[\w-]+\/records$/) && method === 'GET') {
      const id = path.split('/').slice(-2)[0];
      const { results } = await env.DB.prepare(
        `SELECT r.* FROM family_asset_records r JOIN family_assets a ON a.id = r.asset_id
         WHERE r.asset_id = ? AND a.household_id = ? ORDER BY r.record_date DESC, r.created_at DESC`
      ).bind(id, householdId).all();
      return jsonResponse({ code: 0, data: { records: results || [] } });
    }

    if (path === '/api/family-finance/receivables' && method === 'POST') {
      const body = await context.request.json();
      const name = String(body.name || '').trim();
      const amount = normalizeFamilyMoney(body.original_amount ?? body.outstanding_amount);
      const outstanding = normalizeFamilyMoney(body.outstanding_amount ?? amount);
      if (!name) return jsonResponse({ code: 400, message: '应收款名称不能为空' }, 400);
      if (!familyReceivableCategoryCodes.has(body.category_code)) return jsonResponse({ code: 400, message: '应收款类别无效' }, 400);
      if (!Number.isFinite(amount) || !Number.isFinite(outstanding) || amount < 0 || outstanding < 0 || outstanding > amount) return jsonResponse({ code: 400, message: '应收金额无效' }, 400);
      const id = generateId();
      await env.DB.prepare(`
        INSERT INTO family_receivables (id, member_id, category_code, name, debtor_name, original_amount,
          outstanding_amount, lent_date, due_date, status, risk_level, remark, household_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, normalizeFamilyMemberId(body.member_id), body.category_code, name, String(body.debtor_name || '').trim(),
        amount, outstanding, body.lent_date || null, body.due_date || null, outstanding === 0 ? 'settled' : 'normal',
        String(body.risk_level || 'normal'), String(body.remark || '').trim(), householdId).run();
      queueFamilySnapshot();
      return jsonResponse({ code: 0, data: { id } });
    }

    if (path.match(/^\/api\/family-finance\/receivables\/[\w-]+$/) && method === 'PUT') {
      const id = path.split('/').pop();
      const body = await context.request.json();
      const { results } = await env.DB.prepare('SELECT * FROM family_receivables WHERE id = ? AND household_id = ?').bind(id, householdId).all();
      if (!results.length) return jsonResponse({ code: 404, message: '应收款不存在' }, 404);
      const current = results[0];
      const name = String(body.name ?? current.name ?? '').trim();
      const categoryCode = String(body.category_code ?? current.category_code ?? '');
      const originalAmount = normalizeFamilyMoney(body.original_amount ?? current.original_amount);
      const paidAmount = normalizeFamilyMoney(Number(current.original_amount || 0) - Number(current.outstanding_amount || 0));
      const outstandingAmount = normalizeFamilyMoney(originalAmount - paidAmount);
      if (!name) return jsonResponse({ code: 400, message: '应收款名称不能为空' }, 400);
      if (!familyReceivableCategoryCodes.has(categoryCode)) return jsonResponse({ code: 400, message: '应收款类别无效' }, 400);
      if (!Number.isFinite(originalAmount) || originalAmount < paidAmount) return jsonResponse({ code: 400, message: `原始金额不能低于已回款金额 ${paidAmount.toFixed(2)}` }, 400);
      await env.DB.prepare(`
        UPDATE family_receivables SET member_id = ?, category_code = ?, name = ?, debtor_name = ?,
          original_amount = ?, outstanding_amount = ?, due_date = ?, status = ?, updated_at = unixepoch()
        WHERE id = ? AND household_id = ?
      `).bind(normalizeFamilyMemberId(body.member_id ?? current.member_id), categoryCode, name,
        String(body.debtor_name ?? current.debtor_name ?? '').trim(), originalAmount, outstandingAmount,
        body.due_date || null, outstandingAmount === 0 ? 'settled' : paidAmount > 0 ? 'partially_paid' : 'normal', id, householdId).run();
      queueFamilySnapshot();
      return jsonResponse({ code: 0, data: { id, original_amount: originalAmount, outstanding_amount: outstandingAmount } });
    }

    if (path.match(/^\/api\/family-finance\/receivables\/[\w-]+\/payments$/) && method === 'POST') {
      const id = path.split('/').slice(-2)[0];
      const body = await context.request.json();
      const amount = normalizeFamilyMoney(body.amount);
      const { results } = await env.DB.prepare('SELECT * FROM family_receivables WHERE id = ? AND household_id = ?').bind(id, householdId).all();
      if (!results.length) return jsonResponse({ code: 404, message: '应收款不存在' }, 404);
      if (!Number.isFinite(amount) || amount <= 0 || amount > Number(results[0].outstanding_amount || 0)) return jsonResponse({ code: 400, message: '回款金额无效' }, 400);
      const remaining = normalizeFamilyMoney(Number(results[0].outstanding_amount) - amount);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO family_receivable_payments (id, receivable_id, amount, payment_date, remark) VALUES (?, ?, ?, ?, ?)')
          .bind(generateId(), id, amount, normalizeFamilyDate(body.payment_date), String(body.remark || '').trim()),
        env.DB.prepare("UPDATE family_receivables SET outstanding_amount = ?, status = ?, updated_at = unixepoch() WHERE id = ?")
          .bind(remaining, remaining === 0 ? 'settled' : 'partially_paid', id),
      ]);
      queueFamilySnapshot();
      return jsonResponse({ code: 0, data: { id, outstanding_amount: remaining } });
    }

    if (path.match(/^\/api\/family-finance\/receivables\/[\w-]+$/) && method === 'DELETE') {
      const id = path.split('/').pop();
      const { results } = await env.DB.prepare('SELECT outstanding_amount FROM family_receivables WHERE id = ? AND household_id = ?').bind(id, householdId).all();
      if (!results.length) return jsonResponse({ code: 404, message: '应收款不存在' }, 404);
      const outstanding = normalizeFamilyMoney(results[0].outstanding_amount);
      const statements = [env.DB.prepare("UPDATE family_receivables SET status = 'settled', outstanding_amount = 0, updated_at = unixepoch() WHERE id = ?").bind(id)];
      if (outstanding > 0) statements.unshift(env.DB.prepare(
        'INSERT INTO family_receivable_payments (id, receivable_id, amount, payment_date, remark) VALUES (?, ?, ?, ?, ?)'
      ).bind(generateId(), id, outstanding, normalizeFamilyDate(), '直接结清'));
      await env.DB.batch(statements);
      queueFamilySnapshot();
      return jsonResponse({ code: 0, message: '应收款已结清' });
    }

    if (path === '/api/family-finance/liabilities' && method === 'POST') {
      const body = await context.request.json();
      const name = String(body.name || '').trim();
      const amount = normalizeFamilyMoney(body.original_amount ?? body.outstanding_principal);
      const outstanding = normalizeFamilyMoney(body.outstanding_principal ?? amount);
      if (!name) return jsonResponse({ code: 400, message: '负债名称不能为空' }, 400);
      if (!familyLiabilityCategoryCodes.has(body.category_code)) return jsonResponse({ code: 400, message: '负债类别无效' }, 400);
      if (!Number.isFinite(amount) || !Number.isFinite(outstanding) || amount < 0 || outstanding < 0 || outstanding > amount) return jsonResponse({ code: 400, message: '负债金额无效' }, 400);
      const id = generateId();
      await env.DB.prepare(`
        INSERT INTO family_liabilities (id, member_id, category_code, name, creditor_name, original_amount,
          outstanding_principal, interest_rate, monthly_payment, due_date, status, remark, household_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, normalizeFamilyMemberId(body.member_id), body.category_code, name, String(body.creditor_name || '').trim(),
        amount, outstanding, Number(body.interest_rate || 0), normalizeFamilyMoney(body.monthly_payment),
        body.due_date || null, outstanding === 0 ? 'settled' : 'normal', String(body.remark || '').trim(), householdId).run();
      queueFamilySnapshot();
      return jsonResponse({ code: 0, data: { id } });
    }

    if (path.match(/^\/api\/family-finance\/liabilities\/[\w-]+\/payments$/) && method === 'POST') {
      const id = path.split('/').slice(-2)[0];
      const body = await context.request.json();
      const amount = normalizeFamilyMoney(body.amount);
      const { results } = await env.DB.prepare('SELECT * FROM family_liabilities WHERE id = ? AND household_id = ?').bind(id, householdId).all();
      if (!results.length) return jsonResponse({ code: 404, message: '负债不存在' }, 404);
      if (!Number.isFinite(amount) || amount <= 0 || amount > Number(results[0].outstanding_principal || 0)) return jsonResponse({ code: 400, message: '还款金额无效' }, 400);
      const remaining = normalizeFamilyMoney(Number(results[0].outstanding_principal) - amount);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO family_liability_payments (id, liability_id, amount, payment_date, remark) VALUES (?, ?, ?, ?, ?)')
          .bind(generateId(), id, amount, normalizeFamilyDate(body.payment_date), String(body.remark || '').trim()),
        env.DB.prepare("UPDATE family_liabilities SET outstanding_principal = ?, status = ?, updated_at = unixepoch() WHERE id = ?")
          .bind(remaining, remaining === 0 ? 'settled' : 'normal', id),
      ]);
      queueFamilySnapshot();
      return jsonResponse({ code: 0, data: { id, outstanding_principal: remaining } });
    }

    if (path.match(/^\/api\/family-finance\/liabilities\/[\w-]+$/) && method === 'DELETE') {
      const id = path.split('/').pop();
      await env.DB.prepare("UPDATE family_liabilities SET status = 'settled', outstanding_principal = 0, updated_at = unixepoch() WHERE id = ? AND household_id = ?").bind(id, householdId).run();
      queueFamilySnapshot();
      return jsonResponse({ code: 0, message: '负债已结清' });
    }

    if (path === '/api/family-finance/snapshots' && method === 'POST') {
      const snapshotDate = normalizeFamilyDate((await context.request.json().catch(() => ({}))).snapshot_date);
      const summary = await captureFamilySnapshot(snapshotDate);
      return jsonResponse({ code: 0, data: { snapshot_date: snapshotDate, summary } });
    }

    // ========== 事件中心 API ==========
    // ========== 家庭共享配置策略 API ==========
    if (path === '/api/allocation-profiles' && method === 'GET') {
      const includeDeleted = url.searchParams.get('deleted') === 'true';
      const { results } = await env.DB.prepare(
        `SELECT profile_json, version, deleted_at FROM allocation_profiles WHERE household_id = ? AND ${includeDeleted ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'} ORDER BY updated_at DESC, created_at DESC`
      ).bind(householdId).all();
      const profiles = (results || []).map(row => {
        try { return { ...JSON.parse(row.profile_json), version: Number(row.version || 1), deletedAt: row.deleted_at || null }; } catch { return null; }
      }).filter(Boolean);
      return jsonResponse({ code: 0, data: { profiles } });
    }

    if (path.match(/^\/api\/allocation-profiles\/[\w-]+$/) && method === 'PUT') {
      const id = path.split('/').pop();
      const body = await context.request.json();
      const profile = body?.profile || body;
      const errors = validateAllocationProfile(profile);
      if (String(profile?.id || '') !== id) errors.push('策略ID与请求路径不一致');
      if (errors.length) return jsonResponse({ code: 400, message: errors[0], errors }, 400);
      const fundIds = [...new Set((profile.funds || []).map(fund => fund.positionId))];
      let cleanedProfile = profile;
      let prunedPositionIds = [];
      if (fundIds.length) {
        const placeholders = fundIds.map(() => '?').join(',');
        const { results: positionRows } = await env.DB.prepare(`SELECT p.id FROM positions p JOIN accounts a ON a.id = p.account_id WHERE a.household_id = ? AND p.id IN (${placeholders})`).bind(householdId, ...fundIds).all();
        const existingPositionIds = new Set((positionRows || []).map(row => row.id));
        const pruned = pruneAllocationProfileFunds(profile, existingPositionIds);
        cleanedProfile = pruned.profile;
        prunedPositionIds = pruned.prunedPositionIds;
      }
      const { results: existingRows } = await env.DB.prepare('SELECT version, deleted_at FROM allocation_profiles WHERE id = ? AND household_id = ?').bind(id, householdId).all();
      const existing = existingRows[0] || null;
      const expectedVersion = Number(body?.expectedVersion ?? profile.version ?? 0);
      if (existing && Number(existing.version || 1) !== expectedVersion) {
        return jsonResponse({ code: 409, message: '策略已在其他设备更新，请刷新后重试', data: { current_version: Number(existing.version || 1) } }, 409);
      }
      const nextVersion = existing ? Number(existing.version || 1) + 1 : 1;
      const savedProfile = { ...cleanedProfile, id, version: nextVersion, updatedAt: new Date().toISOString() };
      const payload = JSON.stringify(savedProfile);
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO allocation_profiles (id, profile_json, version, deleted_at, household_id, created_at, updated_at)
          VALUES (?, ?, ?, NULL, ?, unixepoch(), unixepoch())
          ON CONFLICT(id) DO UPDATE SET profile_json = excluded.profile_json, version = excluded.version, deleted_at = NULL, updated_at = unixepoch()
          WHERE allocation_profiles.household_id = excluded.household_id
        `).bind(id, payload, nextVersion, householdId),
        env.DB.prepare('INSERT INTO allocation_profile_audit_logs (id, profile_id, action, version, profile_json) VALUES (?, ?, ?, ?, ?)')
          .bind(generateId(), id, existing ? 'update' : 'create', nextVersion, payload),
      ]);
      return jsonResponse({ code: 0, data: { profile: savedProfile, pruned_position_ids: prunedPositionIds } });
    }

    if (path.match(/^\/api\/allocation-profiles\/[\w-]+$/) && method === 'DELETE') {
      const id = path.split('/').pop();
      const expectedVersion = Number(url.searchParams.get('version') || 0);
      const { results } = await env.DB.prepare('SELECT profile_json, version FROM allocation_profiles WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(id, householdId).all();
      if (!results.length) return jsonResponse({ code: 404, message: '配置策略不存在' }, 404);
      const currentVersion = Number(results[0].version || 1);
      if (expectedVersion !== currentVersion) return jsonResponse({ code: 409, message: '策略已在其他设备更新，请刷新后重试' }, 409);
      await env.DB.batch([
        env.DB.prepare('UPDATE allocation_profiles SET deleted_at = unixepoch(), version = version + 1, updated_at = unixepoch() WHERE id = ? AND household_id = ?').bind(id, householdId),
        env.DB.prepare('INSERT INTO allocation_profile_audit_logs (id, profile_id, action, version, profile_json) VALUES (?, ?, ?, ?, ?)')
          .bind(generateId(), id, 'delete', currentVersion + 1, results[0].profile_json),
      ]);
      return jsonResponse({ code: 0, message: '配置策略已删除' });
    }

    if (path.match(/^\/api\/allocation-profiles\/[\w-]+\/restore$/) && method === 'POST') {
      const id = path.split('/')[3];
      const { results } = await env.DB.prepare('SELECT profile_json, version FROM allocation_profiles WHERE id = ? AND household_id = ? AND deleted_at IS NOT NULL').bind(id, householdId).all();
      if (!results.length) return jsonResponse({ code: 404, message: '已删除策略不存在' }, 404);
      const nextVersion = Number(results[0].version || 1) + 1;
      await env.DB.batch([
        env.DB.prepare('UPDATE allocation_profiles SET deleted_at = NULL, version = ?, updated_at = unixepoch() WHERE id = ? AND household_id = ?').bind(nextVersion, id, householdId),
        env.DB.prepare('INSERT INTO allocation_profile_audit_logs (id, profile_id, action, version, profile_json) VALUES (?, ?, ?, ?, ?)')
          .bind(generateId(), id, 'restore', nextVersion, results[0].profile_json),
      ]);
      return jsonResponse({ code: 0, message: '配置策略已恢复' });
    }

    if (path.match(/^\/api\/allocation-profiles\/[\w-]+\/audit-logs$/) && method === 'GET') {
      const id = path.split('/')[3];
      const { results } = await env.DB.prepare(
        'SELECT id, profile_id, action, version, created_at FROM allocation_profile_audit_logs WHERE profile_id = ? ORDER BY created_at DESC LIMIT 100'
      ).bind(id).all();
      return jsonResponse({ code: 0, data: { logs: results || [] } });
    }

    if (path === '/api/profit-snapshots' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT snapshot_json FROM household_profit_snapshots WHERE household_id = ? ORDER BY snapshot_date DESC'
      ).bind(householdId).all();
      const snapshots = (results || []).map(row => {
        try { return JSON.parse(row.snapshot_json); } catch { return null; }
      }).filter(Boolean);
      return jsonResponse({ code: 0, data: { snapshots } });
    }

    if (path === '/api/profit-snapshots/capture' && method === 'POST') {
      try {
        if (isCronAuthorized) {
          const { results: households } = await env.DB.prepare("SELECT id FROM households WHERE status = 'active' ORDER BY created_at ASC").all();
          const snapshots = [];
          for (const item of households || []) {
            snapshots.push(await captureCurrentProfitSnapshot(item.id));
          }
          return jsonResponse({
            code: 0,
            message: '收益快照已生成',
            data: { snapshot: snapshots[0] || null, snapshots, household_count: snapshots.length },
          });
        }
        const snapshot = await captureCurrentProfitSnapshot(householdId);
        return jsonResponse({ code: 0, message: '收益快照已生成', data: { snapshot, snapshots: [snapshot], household_count: 1 } });
      } catch (error) {
        return jsonResponse({ code: 500, message: error.message || '收益快照生成失败' }, 500);
      }
    }

    if (path.match(/^\/api\/profit-snapshots\/\d{4}-\d{2}-\d{2}$/) && method === 'PUT') {
      const snapshotDate = path.split('/').pop();
      const body = await context.request.json();
      const snapshot = body?.snapshot || body;
      if (!snapshot || String(snapshot.date || '') !== snapshotDate || !Array.isArray(snapshot.positions)) {
        return jsonResponse({ code: 400, message: '收益快照数据无效' }, 400);
      }
      await env.DB.prepare(`
        INSERT INTO household_profit_snapshots (snapshot_date, snapshot_json, captured_at, household_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
        ON CONFLICT(household_id, snapshot_date) DO UPDATE SET
          snapshot_json = excluded.snapshot_json,
          captured_at = excluded.captured_at,
          updated_at = unixepoch()
        WHERE excluded.captured_at > household_profit_snapshots.captured_at
      `).bind(snapshotDate, JSON.stringify(snapshot), Number(snapshot.captured_at || Date.now()), householdId).run();
      return jsonResponse({ code: 0, data: { snapshot } });
    }

    if (path === '/api/events' && method === 'GET') {
      const requestedGroup = url.searchParams.get('group');
      const group = requestedGroup === 'confirmed' ? 'confirmed' : (requestedGroup === 'all' ? 'all' : 'pending');
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 5)));
      const statements = group === 'all'
        ? [
            env.DB.prepare("SELECT * FROM events WHERE household_id = ? AND status = 'pending' ORDER BY event_time DESC, created_at DESC LIMIT ?").bind(householdId, limit),
            env.DB.prepare("SELECT * FROM events WHERE household_id = ? AND status IN ('processed', 'ignored') ORDER BY event_time DESC, created_at DESC LIMIT ?").bind(householdId, limit),
          ]
        : [env.DB.prepare(
            `SELECT * FROM events WHERE household_id = ? AND ${group === 'confirmed' ? "status IN ('processed', 'ignored')" : "status = 'pending'"} ORDER BY event_time DESC, created_at DESC LIMIT ?`
          ).bind(householdId, limit)];
      statements.push(env.DB.prepare(`
          SELECT
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status IN ('processed', 'ignored') THEN 1 ELSE 0 END) AS confirmed
          FROM events WHERE household_id = ?
        `).bind(householdId));
      const queryResults = await env.DB.batch(statements);
      const parseEvents = rows => (rows || []).map(row => ({
        ...row,
        detail: (() => { try { return JSON.parse(row.detail_json || '{}'); } catch { return {}; } })(),
      }));
      const countRows = queryResults.at(-1)?.results || [];
      const counts = { pending: Number(countRows?.[0]?.pending || 0), confirmed: Number(countRows?.[0]?.confirmed || 0) };
      if (group === 'all') {
        return jsonResponse({ code: 0, data: {
          groups: {
            pending: parseEvents(queryResults[0]?.results),
            confirmed: parseEvents(queryResults[1]?.results),
          },
          counts,
        } });
      }
      return jsonResponse({ code: 0, data: { events: parseEvents(queryResults[0]?.results), counts } });
    }

    if (path === '/api/events/reconcile' && method === 'POST') {
      await seedBusinessEvents(householdId);
      return jsonResponse({ code: 0, message: '事件已更新' });
    }

    if (path.match(/^\/api\/events\/[\w-]+$/) && method === 'GET') {
      const id = path.split('/').pop();
      const { results } = await env.DB.prepare('SELECT * FROM events WHERE id = ? AND household_id = ? LIMIT 1').bind(id, householdId).all();
      if (!results.length) return jsonResponse({ code: 404, message: '事件不存在' }, 404);
      const event = results[0];
      try { event.detail = JSON.parse(event.detail_json || '{}'); } catch { event.detail = {}; }
      if (event.source_type === 'dividend_announcement') {
        try {
          event.dividend_preview = await previewDividendAnnouncement(event);
        } catch (error) {
          event.dividend_preview = { accounts: [], error: error.message || '暂时无法计算分红结果' };
        }
      }
      return jsonResponse({ code: 0, data: event });
    }

    if (path.match(/^\/api\/events\/[\w-]+\/status$/) && method === 'PATCH') {
      const id = path.split('/')[3];
      const body = await context.request.json();
      const status = String(body.status || '');
      if (!['pending', 'processed', 'ignored'].includes(status)) {
        return jsonResponse({ code: 400, message: '无效的事件状态' }, 400);
      }
      const note = String(body.note || '').trim();
      const { results: existingRows } = await env.DB.prepare('SELECT * FROM events WHERE id = ? AND household_id = ? LIMIT 1').bind(id, householdId).all();
      if (!existingRows.length) return jsonResponse({ code: 404, message: '事件不存在' }, 404);
      const existingEvent = existingRows[0];
      let bookingResult = null;
      if (status === 'processed' && existingEvent.source_type === 'dividend_announcement') {
        try {
          bookingResult = await bookDividendAnnouncement(existingEvent);
        } catch (error) {
          return jsonResponse({ code: 400, message: error.message || '分红入账失败' }, 400);
        }
      }
      await env.DB.prepare(`
        UPDATE events SET status = ?, handle_note = ?, handled_at = ?, updated_at = unixepoch() WHERE id = ? AND household_id = ?
      `).bind(status, note, status === 'pending' ? null : Math.floor(Date.now() / 1000), id, householdId).run();
      const { results } = await env.DB.prepare('SELECT * FROM events WHERE id = ? AND household_id = ? LIMIT 1').bind(id, householdId).all();
      return jsonResponse({ code: 0, data: { ...results[0], booking_result: bookingResult } });
    }

    // ========== 成员 API ==========

    // 获取成员列表
    if (path === '/api/members' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM members WHERE household_id = ? ORDER BY created_at DESC').bind(householdId).all();
      const members = results.map(r => ({
        id: r.id,
        name: r.name,
        emoji: r.emoji || '👤',
        relation: r.relation || '',
        remark: r.remark || '',
        created_at: r.created_at,
      }));
      return jsonResponse({ code: 0, data: { total: members.length, members } });
    }

    // 创建成员
    if (path === '/api/members' && method === 'POST') {
      const body = await context.request.json();
      const id = generateId();
      const name = body.name || '未命名';
      const emoji = body.emoji || '👤';
      const relation = String(body.relation || '').trim();

      await env.DB.prepare(
        'INSERT INTO members (id, name, emoji, relation, household_id) VALUES (?, ?, ?, ?, ?)'
      ).bind(id, name, emoji, relation, householdId).run();

      return jsonResponse({ code: 0, data: { id, name, emoji, relation } });
    }

    // 更新成员
    if (path.match(/^\/api\/members\/[\w-]+$/) && method === 'PUT') {
      const id = path.split('/').pop();
      const body = await context.request.json();
      const name = body.name;
      const remark = body.remark;
      const emoji = body.emoji;
      const relation = body.relation;

      const fields = [];
      const values = [];
      if (name !== undefined) { fields.push('name = ?'); values.push(name); }
      if (remark !== undefined) { fields.push('remark = ?'); values.push(remark); }
      if (emoji !== undefined) { fields.push('emoji = ?'); values.push(emoji); }
      if (relation !== undefined) { fields.push('relation = ?'); values.push(relation); }

      if (fields.length > 0) {
        values.push(id, householdId);
        await env.DB.prepare(`UPDATE members SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ? AND household_id = ?`).bind(...values).run();
      }

      const { results } = await env.DB.prepare('SELECT * FROM members WHERE id = ? AND household_id = ?').bind(id, householdId).all();
      if (results.length === 0) {
        return jsonResponse({ code: 404, message: 'Member not found' }, 404);
      }
      const r = results[0];
      return jsonResponse({ code: 0, data: { id: r.id, name: r.name, emoji: r.emoji || '👤', relation: r.relation || '', remark: r.remark || '' } });
    }

    // 删除成员
    if (path.match(/^\/api\/members\/[\w-]+$/) && method === 'DELETE') {
      const id = path.split('/').pop();
      const { results: linkedUsers } = await env.DB.prepare('SELECT username FROM users WHERE linked_member_id = ? AND household_id = ? LIMIT 1').bind(id, householdId).all();
      if (linkedUsers.length) return jsonResponse({ code: 409, message: `该成员已绑定登录用户 @${linkedUsers[0].username}，请先解除关联` }, 409);
      const { results: pendingInvites } = await env.DB.prepare(`
        SELECT id FROM household_invites WHERE member_id = ? AND household_id = ?
          AND used_at IS NULL AND revoked_at IS NULL AND expires_at > unixepoch() LIMIT 1
      `).bind(id, householdId).all();
      if (pendingInvites.length) return jsonResponse({ code: 409, message: '该成员存在待使用邀请，请先撤销邀请' }, 409);
      const { results: familyRows } = await env.DB.prepare(`
        SELECT
          (SELECT COUNT(1) FROM family_assets WHERE member_id = ? AND status != 'archived') +
          (SELECT COUNT(1) FROM family_receivables WHERE member_id = ? AND status != 'settled') +
          (SELECT COUNT(1) FROM family_liabilities WHERE member_id = ? AND status != 'settled') AS total
      `).bind(id, id, id).all();
      if (Number(familyRows?.[0]?.total || 0) > 0) {
        return jsonResponse({ code: 409, message: '该成员仍有家庭资产、应收款或负债，请先处理归属' }, 409);
      }
      // 先解除账户绑定
      await env.DB.prepare('UPDATE accounts SET member_id = NULL WHERE member_id = ? AND household_id = ?').bind(id, householdId).run();
      // 删除成员
      await env.DB.prepare('DELETE FROM members WHERE id = ? AND household_id = ?').bind(id, householdId).run();
      return jsonResponse({ code: 0, message: 'Member deleted' });
    }

    // ========== 账户 API ==========

    // 获取账户列表
    if (path === '/api/accounts' && method === 'GET') {
      const memberId = url.searchParams.get('member_id');
      let query = 'SELECT a.*, m.name as member_name FROM accounts a LEFT JOIN members m ON a.member_id = m.id WHERE a.household_id = ?';
      let stmt;
      if (memberId) {
        query += ' AND a.member_id = ?';
        stmt = env.DB.prepare(query + ' ORDER BY a.created_at DESC').bind(householdId, memberId);
      } else {
        stmt = env.DB.prepare(query + ' ORDER BY a.created_at DESC').bind(householdId);
      }
      const { results } = await stmt.all();
      const accounts = results.map(serializeAccountRow);
      return jsonResponse({ code: 0, data: { total: accounts.length, accounts } });
    }

    // 创建账户
    if (path === '/api/accounts' && method === 'POST') {
      const body = await context.request.json();
      const id = generateId();
      const name = body.name || body.accountName || '未命名';
      const channel = body.channel || '其他';
      const status = body.status || '正常';
      const remark = body.remark || '';
      const member_id = body.member_id || null;
      const emoji = body.emoji || '';
      if (!(await memberBelongsToHousehold(member_id))) {
        return jsonResponse({ code: 400, message: '家庭成员不存在' }, 400);
      }

      await env.DB.prepare(
        'INSERT INTO accounts (id, name, channel, status, remark, member_id, emoji, household_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, name, channel, status, remark, member_id, emoji, householdId).run();

      return jsonResponse({ code: 0, data: serializeAccountRow({
        id,
        name,
        channel,
        status,
        remark,
        emoji,
        member_id,
        member_name: '',
        created_at: Math.floor(Date.now() / 1000),
      }) });
    }

    // 获取单个账户
    if (path.match(/^\/api\/accounts\/[\w-]+$/) && method === 'GET') {
      const id = path.split('/').pop();
      const { results } = await env.DB.prepare(
        'SELECT a.*, m.name as member_name FROM accounts a LEFT JOIN members m ON a.member_id = m.id WHERE a.id = ? AND a.household_id = ?'
      ).bind(id, householdId).all();
      if (results.length === 0) {
        return jsonResponse({ code: 404, message: 'Account not found' }, 404);
      }
      return jsonResponse({ code: 0, data: serializeAccountRow(results[0]) });
    }

    // 删除账户
    if (path.match(/^\/api\/accounts\/[\w-]+$/) && method === 'DELETE') {
      const id = path.split('/').pop();
      if (!(await accountBelongsToHousehold(id))) return jsonResponse({ code: 404, message: 'Account not found' }, 404);
      await env.DB.prepare('DELETE FROM positions WHERE account_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM trades WHERE account_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run();
      return jsonResponse({ code: 0, message: 'Account deleted' });
    }

    // 更新账户
    if (path.match(/^\/api\/accounts\/[\w-]+$/) && method === 'PUT') {
      const id = path.split('/').pop();
      const body = await context.request.json();
      const name = body.name || body.accountName;
      const channel = body.channel;
      const status = body.status;
      const remark = body.remark;
      const member_id = body.member_id;
      const emoji = body.emoji;
      if (!(await accountBelongsToHousehold(id))) return jsonResponse({ code: 404, message: 'Account not found' }, 404);
      if (!(await memberBelongsToHousehold(member_id))) return jsonResponse({ code: 400, message: '家庭成员不存在' }, 400);

      const fields = [];
      const values = [];
      if (name !== undefined) { fields.push('name = ?'); values.push(name); }
      if (channel !== undefined) { fields.push('channel = ?'); values.push(channel); }
      if (status !== undefined) { fields.push('status = ?'); values.push(status); }
      if (remark !== undefined) { fields.push('remark = ?'); values.push(remark); }
      if (member_id !== undefined) { fields.push('member_id = ?'); values.push(member_id); }
      if (emoji !== undefined) { fields.push('emoji = ?'); values.push(emoji); }

      if (fields.length > 0) {
        values.push(id, householdId);
        await env.DB.prepare(`UPDATE accounts SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ? AND household_id = ?`).bind(...values).run();
      }

      const { results } = await env.DB.prepare(
        'SELECT a.*, m.name as member_name FROM accounts a LEFT JOIN members m ON a.member_id = m.id WHERE a.id = ? AND a.household_id = ?'
      ).bind(id, householdId).all();
      if (results.length === 0) {
        return jsonResponse({ code: 404, message: 'Account not found' }, 404);
      }
      return jsonResponse({ code: 0, data: serializeAccountRow(results[0]) });
    }

    // ========== 顾投组合 API ==========

    if (path === '/api/advisory-products' && method === 'GET') {
      await ensureAdvisorySchemaOnce();
      const accountId = url.searchParams.get('account_id');
      const memberId = url.searchParams.get('member_id');
      let query = `
        SELECT p.*, a.name as account_name, a.channel as account_channel,
               m.name as member_name, m.emoji as member_emoji,
               s.snapshot_date, s.total_amount, s.daily_profit, s.current_profit, s.profit_rate
        FROM advisory_products p
        LEFT JOIN accounts a ON p.account_id = a.id
        LEFT JOIN members m ON COALESCE(p.member_id, a.member_id) = m.id
        LEFT JOIN advisory_product_snapshots s ON s.id = (
          SELECT s2.id FROM advisory_product_snapshots s2
          WHERE s2.product_id = p.id
          ORDER BY s2.snapshot_date DESC, s2.updated_at DESC, s2.created_at DESC
          LIMIT 1
        )
      `;
      const conditions = ['p.household_id = ?'];
      const params = [householdId];
      if (accountId && accountId !== 'all') {
        conditions.push('p.account_id = ?');
        params.push(accountId);
      }
      if (memberId) {
        conditions.push('COALESCE(p.member_id, a.member_id) = ?');
        params.push(memberId);
      }
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY COALESCE(s.total_amount, 0) DESC, p.created_at DESC';
      let stmt = env.DB.prepare(query);
      if (params.length > 0) stmt = stmt.bind(...params);
      const { results } = await stmt.all();
      const products = results.map(r => ({
        id: r.id,
        product_name: r.product_name,
        platform: r.platform || 'xueqiu',
        account_id: r.account_id,
        account_name: r.account_name || '',
        account_channel: r.account_channel || '',
        member_id: r.member_id || null,
        member_name: r.member_name || '',
        member_emoji: r.member_emoji || '👤',
        status: r.status || '正常',
        include_in_investable_assets: Number(r.include_in_investable_assets ?? 1),
        remark: r.remark || '',
        snapshot_date: r.snapshot_date || null,
        total_amount: Number((r.total_amount || 0).toFixed ? r.total_amount.toFixed(2) : Number(r.total_amount || 0).toFixed(2)),
        daily_profit: Number((r.daily_profit || 0).toFixed ? r.daily_profit.toFixed(2) : Number(r.daily_profit || 0).toFixed(2)),
        current_profit: Number((r.current_profit || 0).toFixed ? r.current_profit.toFixed(2) : Number(r.current_profit || 0).toFixed(2)),
        profit_rate: Number((r.profit_rate || 0).toFixed ? r.profit_rate.toFixed(2) : Number(r.profit_rate || 0).toFixed(2)),
        current_market_value: Number((r.total_amount || 0).toFixed ? r.total_amount.toFixed(2) : Number(r.total_amount || 0).toFixed(2)),
        yesterday_profit: Number((r.daily_profit || 0).toFixed ? r.daily_profit.toFixed(2) : Number(r.daily_profit || 0).toFixed(2)),
        kind: 'advisory',
      }));
      return jsonResponse({ code: 0, data: { total: products.length, products } });
    }

    if (path === '/api/advisory-products' && method === 'POST') {
      await ensureAdvisorySchemaOnce();
      const body = await context.request.json();
      const productName = (body.product_name || body.productName || '').trim();
      if (!productName) {
        return jsonResponse({ code: 400, message: '产品名称不能为空' }, 400);
      }
      const id = generateId();
      const account_id = body.account_id || body.accountId || null;
      const member_id = body.member_id || body.memberId || null;
      const platform = body.platform || 'xueqiu';
      const status = body.status || '正常';
      const include_in_investable_assets = Number(Boolean(body.include_in_investable_assets ?? true));
      const remark = body.remark || '';
      if (account_id && !(await accountBelongsToHousehold(account_id))) return jsonResponse({ code: 404, message: '账户不存在' }, 404);
      if (!(await memberBelongsToHousehold(member_id))) return jsonResponse({ code: 400, message: '家庭成员不存在' }, 400);
      await env.DB.prepare(
        'INSERT INTO advisory_products (id, account_id, member_id, platform, product_name, status, include_in_investable_assets, remark, household_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, account_id, member_id, platform, productName, status, include_in_investable_assets, remark, householdId).run();
      return jsonResponse({ code: 0, data: { id, product_name: productName, account_id, member_id, platform, status, include_in_investable_assets, remark } });
    }

    if (path.match(/^\/api\/advisory-products\/[\w-]+$/) && method === 'GET') {
      await ensureAdvisorySchemaOnce();
      const id = path.split('/').pop();
      const { results } = await env.DB.prepare(`
        SELECT p.*, a.name AS account_name, a.channel AS account_channel,
               m.name AS member_name, m.emoji AS member_emoji
        FROM advisory_products p
        LEFT JOIN accounts a ON p.account_id = a.id
        LEFT JOIN members m ON COALESCE(p.member_id, a.member_id) = m.id
        WHERE p.id = ? AND p.household_id = ? LIMIT 1
      `).bind(id, householdId).all();
      if (!results.length) return jsonResponse({ code: 404, message: 'Advisory product not found' }, 404);
      const { results: snapshots } = await env.DB.prepare(`
        SELECT id, product_id, snapshot_date, total_amount, daily_profit, current_profit, profit_rate, created_at, updated_at
        FROM advisory_product_snapshots WHERE product_id = ?
        ORDER BY snapshot_date DESC, updated_at DESC, created_at DESC
      `).bind(id).all();
      const latest = snapshots[0] || {};
      return jsonResponse({ code: 0, data: {
        product: {
          ...results[0],
          member_emoji: results[0].member_emoji || '👤',
          snapshot_date: latest.snapshot_date || null,
          total_amount: normalizeFamilyMoney(latest.total_amount),
          daily_profit: normalizeFamilyMoney(latest.daily_profit),
          current_profit: normalizeFamilyMoney(latest.current_profit),
          profit_rate: Number(Number(latest.profit_rate || 0).toFixed(2)),
        },
        snapshots: snapshots.map(item => ({
          ...item,
          total_amount: normalizeFamilyMoney(item.total_amount),
          daily_profit: normalizeFamilyMoney(item.daily_profit),
          current_profit: normalizeFamilyMoney(item.current_profit),
          profit_rate: Number(Number(item.profit_rate || 0).toFixed(2)),
        })),
      } });
    }

    if (path.match(/^\/api\/advisory-products\/[\w-]+$/) && method === 'PUT') {
      await ensureAdvisorySchemaOnce();
      const id = path.split('/').pop();
      const body = await context.request.json();
      const product_name = body.product_name ?? body.productName;
      const account_id = body.account_id ?? body.accountId;
      const member_id = body.member_id ?? body.memberId;
      const platform = body.platform;
      const status = body.status;
      const include_in_investable_assets = body.include_in_investable_assets;
      const remark = body.remark;
      const { results: ownedProducts } = await env.DB.prepare('SELECT id FROM advisory_products WHERE id = ? AND household_id = ?').bind(id, householdId).all();
      if (!ownedProducts.length) return jsonResponse({ code: 404, message: 'Advisory product not found' }, 404);
      if (account_id && !(await accountBelongsToHousehold(account_id))) return jsonResponse({ code: 404, message: '账户不存在' }, 404);
      if (!(await memberBelongsToHousehold(member_id))) return jsonResponse({ code: 400, message: '家庭成员不存在' }, 400);
      const fields = [];
      const values = [];
      if (product_name !== undefined) { fields.push('product_name = ?'); values.push(product_name); }
      if (account_id !== undefined) { fields.push('account_id = ?'); values.push(account_id); }
      if (member_id !== undefined) { fields.push('member_id = ?'); values.push(member_id); }
      if (platform !== undefined) { fields.push('platform = ?'); values.push(platform); }
      if (status !== undefined) { fields.push('status = ?'); values.push(status); }
      if (include_in_investable_assets !== undefined) { fields.push('include_in_investable_assets = ?'); values.push(Number(Boolean(include_in_investable_assets))); }
      if (remark !== undefined) { fields.push('remark = ?'); values.push(remark); }
      if (fields.length > 0) {
        values.push(id, householdId);
        await env.DB.prepare(`UPDATE advisory_products SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ? AND household_id = ?`).bind(...values).run();
      }
      const { results } = await env.DB.prepare('SELECT * FROM advisory_products WHERE id = ? AND household_id = ?').bind(id, householdId).all();
      if (results.length === 0) return jsonResponse({ code: 404, message: 'Advisory product not found' }, 404);
      return jsonResponse({ code: 0, data: results[0] });
    }

    if (path.match(/^\/api\/advisory-products\/[\w-]+$/) && method === 'DELETE') {
      await ensureAdvisorySchemaOnce();
      const id = path.split('/').pop();
      const { results: ownedProducts } = await env.DB.prepare('SELECT id FROM advisory_products WHERE id = ? AND household_id = ?').bind(id, householdId).all();
      if (!ownedProducts.length) return jsonResponse({ code: 404, message: 'Advisory product not found' }, 404);
      await env.DB.prepare('DELETE FROM advisory_product_snapshots WHERE product_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM advisory_products WHERE id = ? AND household_id = ?').bind(id, householdId).run();
      return jsonResponse({ code: 0, message: 'Advisory product deleted' });
    }

    if (path === '/api/advisory-snapshots' && method === 'POST') {
      await ensureAdvisorySchemaOnce();
      const body = await context.request.json();
      const product_id = body.product_id || body.productId;
      const snapshot_date = body.snapshot_date || body.snapshotDate;
      if (!product_id || !snapshot_date) {
        return jsonResponse({ code: 400, message: 'product_id 和 snapshot_date 必填' }, 400);
      }
      const { results: ownedProducts } = await env.DB.prepare('SELECT id FROM advisory_products WHERE id = ? AND household_id = ?').bind(product_id, householdId).all();
      if (!ownedProducts.length) return jsonResponse({ code: 404, message: 'Advisory product not found' }, 404);
      const total_amount = Number(body.total_amount ?? body.totalAmount ?? 0);
      const daily_profit = 0;
      const current_profit = Number(body.current_profit ?? body.currentProfit ?? 0);
      const invested_amount = total_amount - current_profit;
      const profit_rate = invested_amount > 0 ? Number(((current_profit / invested_amount) * 100).toFixed(2)) : 0;
      const existing = await env.DB.prepare('SELECT id FROM advisory_product_snapshots WHERE product_id = ? AND snapshot_date = ?').bind(product_id, snapshot_date).all();
      if (existing.results.length > 0) {
        await env.DB.prepare(
          'UPDATE advisory_product_snapshots SET total_amount = ?, daily_profit = ?, current_profit = ?, profit_rate = ?, updated_at = unixepoch() WHERE id = ?'
        ).bind(total_amount, daily_profit, current_profit, profit_rate, existing.results[0].id).run();
        queueFamilySnapshot(snapshot_date);
        return jsonResponse({ code: 0, data: { id: existing.results[0].id, product_id, snapshot_date, total_amount, daily_profit, current_profit, profit_rate } });
      }
      const id = generateId();
      await env.DB.prepare(
        'INSERT INTO advisory_product_snapshots (id, product_id, snapshot_date, total_amount, daily_profit, current_profit, profit_rate) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, product_id, snapshot_date, total_amount, daily_profit, current_profit, profit_rate).run();
      queueFamilySnapshot(snapshot_date);
      return jsonResponse({ code: 0, data: { id, product_id, snapshot_date, total_amount, daily_profit, current_profit, profit_rate } });
    }

    // ========== 持仓 API ==========

    // 获取持仓列表
    if (path === '/api/positions' && method === 'GET') {
      const accountId = url.searchParams.get('account_id');
      const memberId = url.searchParams.get('member_id');
      
      let query = `SELECT p.*, a.name as account_name, a.channel as account_channel, a.member_id, m.name as member_name, m.emoji as member_emoji,
                   s.gsz as nav_gsz, s.gszzl as nav_gszzl, s.dwjz as nav_dwjz, s.jzrq as nav_jzrq, s.updated_at as nav_updated_at,
                   s.prev_nav, fs.state as sync_state, fs.last_attempt_at as sync_last_attempt_at,
                   fs.consecutive_failures as sync_consecutive_failures, fs.last_error as sync_last_error,
                   (SELECT COUNT(1) FROM trades t WHERE t.account_id = p.account_id AND t.fund_code = p.fund_code) as trade_count
                   FROM positions p
                   LEFT JOIN accounts a ON p.account_id = a.id
                   LEFT JOIN members m ON a.member_id = m.id
                   LEFT JOIN market_snapshot s ON p.fund_code = s.fund_code
                   LEFT JOIN fund_sync_status fs ON p.fund_code = fs.fund_code`;
      const conditions = ['a.household_id = ?'];
      const params = [householdId];
      
      if (accountId && accountId !== 'all') {
        conditions.push('p.account_id = ?');
        params.push(accountId);
      }
      if (memberId) {
        conditions.push('a.member_id = ?');
        params.push(memberId);
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY p.created_at DESC';
      
      let stmt = env.DB.prepare(query);
      if (params.length > 0) {
        stmt = stmt.bind(...params);
      }
      const { results } = await stmt.all();
      
      const positions = results
        .map(serializePositionRow)
        .filter(position => Number(position.shares || 0) > 0);
      return jsonResponse({ code: 0, data: { total: positions.length, positions } });
    }

    // 获取单个持仓
    if (path.match(/^\/api\/positions\/[\w-]+$/) && method === 'GET') {
      const id = path.split('/').pop();
      const { results } = await env.DB.prepare(
        `SELECT p.*, a.name as account_name, a.channel as account_channel, a.member_id, m.name as member_name, m.emoji as member_emoji,
                s.gsz as nav_gsz, s.gszzl as nav_gszzl, s.dwjz as nav_dwjz, s.jzrq as nav_jzrq, s.updated_at as nav_updated_at,
                s.prev_nav
         FROM positions p
         LEFT JOIN accounts a ON p.account_id = a.id
         LEFT JOIN members m ON a.member_id = m.id
         LEFT JOIN market_snapshot s ON p.fund_code = s.fund_code
         WHERE p.id = ? AND a.household_id = ?`
      ).bind(id, householdId).all();
      if (results.length === 0) {
        return jsonResponse({ code: 404, message: 'Position not found' }, 404);
      }
      return jsonResponse({ code: 0, data: serializePositionRow(results[0]) });
    }

    // 创建持仓（作为该基金在该账户的初始基准仓位）
    if (path === '/api/positions' && method === 'POST') {
      const body = await context.request.json();
      const id = generateId();
      const account_id = body.accountId || body.account_id;
      const fund_code = (body.fundCode || body.fund_code || '').trim();
      const fund_name = body.fundName || body.fund_name;
      const shares = toNumber(body.shares ?? body.quantity ?? 0);
      const cost = toNumber(body.cost ?? body.amount ?? 0);
      const initial_profit = toNumber(body.initialProfit ?? body.initial_profit ?? 0);
      const dividend_method = body.dividendMethod || body.dividend_method || '红利再投';

      if (!account_id || !fund_code) {
        return jsonResponse({ code: 400, message: '账户和基金代码不能为空' }, 400);
      }
      if (!(await accountBelongsToHousehold(account_id))) return jsonResponse({ code: 404, message: '账户不存在' }, 404);

      const existing = await fetchBasePositionByAccountFund(account_id, fund_code);
      if (existing) {
        return jsonResponse({ code: 409, message: '该账户下此基金已存在，请直接编辑持仓或录入交易' }, 409);
      }

      await env.DB.prepare(
        `INSERT INTO positions (
          id, account_id, fund_code, fund_name, quantity, cost, initial_profit, dividend_method,
          opening_quantity, opening_cost, opening_initial_profit, realized_profit, cash_dividend, total_buy_amount, total_sell_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)`
      ).bind(id, account_id, fund_code, fund_name || '', shares, cost, initial_profit, dividend_method, shares, cost, initial_profit).run();

      const detail = await fetchPositionDetailById(id);
      return jsonResponse({ code: 0, data: serializePositionRow(detail) });
    }

    // 更新持仓：无交易时更新初始仓位；有交易时自动追加一条“手动校准”交易
    if (path.match(/^\/api\/positions\/[\w-]+$/) && method === 'PUT') {
      const id = path.split('/').pop();
      const body = await context.request.json();
      const existing = await fetchPositionDetailById(id);
      if (!existing) {
        return jsonResponse({ code: 404, message: 'Position not found' }, 404);
      }
      if (!(await accountBelongsToHousehold(existing.account_id))) return jsonResponse({ code: 404, message: 'Position not found' }, 404);

      const fund_name = body.fundName || body.fund_name;
      const shares = body.shares ?? body.quantity;
      const amount = body.amount;
      const cost = body.cost;
      const normalizedCost = cost ?? amount;
      const initial_profit = body.initialProfit ?? body.initial_profit;
      const dividend_method = body.dividendMethod ?? body.dividend_method;
      const account_id = body.accountId || body.account_id;
      const tradeCount = await countTradesForPosition(existing.account_id, existing.fund_code);

      if (tradeCount > 0) {
        if (account_id && account_id !== existing.account_id) {
          return jsonResponse({ code: 400, message: '该持仓已有交易记录，不能直接切换账户，请使用转出/转入交易处理' }, 400);
        }

        if (fund_name !== undefined || dividend_method !== undefined) {
          const fields = [];
          const values = [];
          if (fund_name !== undefined) { fields.push('fund_name = ?'); values.push(fund_name); }
          if (dividend_method !== undefined) { fields.push('dividend_method = ?'); values.push(dividend_method); }
          if (fields.length > 0) {
            values.push(id);
            await env.DB.prepare(`UPDATE positions SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`).bind(...values).run();
          }
        }

        if (shares !== undefined || normalizedCost !== undefined || initial_profit !== undefined) {
          const calibrationTrade = normalizeTradePayload({
            account_id: existing.account_id,
            fund_code: existing.fund_code,
            fund_name: fund_name ?? existing.fund_name,
            trade_type: TRADE_TYPES.CALIBRATION,
            trade_date: body.tradeDate || body.trade_date || new Date().toISOString().split('T')[0],
            target_quantity: shares,
            target_cost: normalizedCost,
            target_initial_profit: initial_profit,
            note: '通过持仓编辑自动生成的校准记录',
            dividend_method: dividend_method ?? existing.dividend_method,
          });
          const tradeId = generateId();
          await env.DB.prepare(
            `INSERT INTO trades (
              id, account_id, fund_code, fund_name, trade_type, quantity, amount, fee, trade_date, note,
              target_quantity, target_cost, target_initial_profit, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`
          ).bind(
            tradeId,
            calibrationTrade.account_id,
            calibrationTrade.fund_code,
            calibrationTrade.fund_name,
            calibrationTrade.trade_type,
            calibrationTrade.trade_date,
            calibrationTrade.note,
            calibrationTrade.target_quantity,
            calibrationTrade.target_cost,
            calibrationTrade.target_initial_profit,
          ).run();
        }

        const detail = await recomputeAndPersistPosition(existing.account_id, existing.fund_code);
        return jsonResponse({ code: 0, data: serializePositionRow(detail) });
      }

      const fields = [];
      const values = [];
      if (fund_name !== undefined) { fields.push('fund_name = ?'); values.push(fund_name); }
      if (shares !== undefined) { fields.push('quantity = ?'); values.push(toNumber(shares)); fields.push('opening_quantity = ?'); values.push(toNumber(shares)); }
      if (normalizedCost !== undefined) { fields.push('cost = ?'); values.push(toNumber(normalizedCost)); fields.push('opening_cost = ?'); values.push(toNumber(normalizedCost)); }
      if (initial_profit !== undefined) { fields.push('initial_profit = ?'); values.push(toNumber(initial_profit)); fields.push('opening_initial_profit = ?'); values.push(toNumber(initial_profit)); }
      if (dividend_method !== undefined) { fields.push('dividend_method = ?'); values.push(dividend_method); }
      if (account_id !== undefined) { fields.push('account_id = ?'); values.push(account_id); }

      if (fields.length > 0) {
        values.push(id);
        await env.DB.prepare(`UPDATE positions SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`).bind(...values).run();
      }

      const detail = await fetchPositionDetailById(id);
      return jsonResponse({ code: 0, data: serializePositionRow(detail) });
    }

    // 删除持仓：同时清空该持仓下交易流水
    if (path.match(/^\/api\/positions\/[\w-]+$/) && method === 'DELETE') {
      const id = path.split('/').pop();
      const position = await fetchPositionDetailById(id);
      if (!position) {
        return jsonResponse({ code: 404, message: 'Position not found' }, 404);
      }
      if (!(await accountBelongsToHousehold(position.account_id))) return jsonResponse({ code: 404, message: 'Position not found' }, 404);
      await env.DB.prepare('DELETE FROM trades WHERE account_id = ? AND fund_code = ?').bind(position.account_id, position.fund_code).run();
      await env.DB.prepare('DELETE FROM positions WHERE id = ?').bind(id).run();
      return jsonResponse({ code: 0, message: 'Position deleted' });
    }

    // ========== 交易 API ==========

    // 获取交易列表
    if (path === '/api/trades' && method === 'GET') {
      const accountId = url.searchParams.get('account_id') || url.searchParams.get('accountId');
      const tradeType = url.searchParams.get('trade_type') || url.searchParams.get('tradeType');
      let query = `
        SELECT t.*, a.name as account_name, COALESCE(t.fund_name, s.name, p.fund_name, '') as resolved_fund_name
        FROM trades t
        LEFT JOIN accounts a ON t.account_id = a.id
        LEFT JOIN market_snapshot s ON t.fund_code = s.fund_code
        LEFT JOIN positions p ON p.account_id = t.account_id AND p.fund_code = t.fund_code
      `;
      const conditions = ['a.household_id = ?'];
      const values = [householdId];
      if (accountId) {
        conditions.push('t.account_id = ?');
        values.push(accountId);
      }
      if (tradeType) {
        conditions.push('t.trade_type = ?');
        values.push(normalizeTradeType(tradeType));
      }
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      query += ' ORDER BY t.trade_date DESC, t.created_at DESC, t.id DESC';
      let stmt = env.DB.prepare(query);
      if (values.length > 0) {
        stmt = stmt.bind(...values);
      }
      const { results } = await stmt.all();
      const trades = results.map(r => ({
        id: r.id,
        account_id: r.account_id,
        account_name: r.account_name || '',
        fund_code: r.fund_code,
        fund_name: r.resolved_fund_name || '',
        trade_type: normalizeTradeType(r.trade_type),
        quantity: r.quantity,
        amount: r.amount,
        fee: r.fee,
        note: r.note || '',
        target_quantity: r.target_quantity,
        target_cost: r.target_cost,
        target_initial_profit: r.target_initial_profit,
        trade_date: r.trade_date,
        created_at: r.created_at,
      }));
      return jsonResponse({ code: 0, data: { total: trades.length, trades } });
    }

    // 基金转换：以一组配对的转出/转入流水原子化呈现给前端
    if (path === '/api/trades/convert' && method === 'POST') {
      const body = await context.request.json();
      const accountId = body.accountId || body.account_id;
      const fromFundCode = String(body.fromFundCode || body.from_fund_code || '').trim();
      const toFundCode = String(body.toFundCode || body.to_fund_code || '').trim();
      const fromQuantity = toNumber(body.fromQuantity ?? body.from_quantity);
      const toQuantity = toNumber(body.toQuantity ?? body.to_quantity);
      const transferCost = toNumber(body.amount ?? body.transferCost ?? body.transfer_cost);
      const tradeDate = body.tradeDate || body.trade_date || new Date().toISOString().slice(0, 10);
      if (!accountId || !fromFundCode || !toFundCode) {
        return jsonResponse({ code: 400, message: '账户、转出基金和转入基金不能为空' }, 400);
      }
      if (!(await accountBelongsToHousehold(accountId))) return jsonResponse({ code: 404, message: '账户不存在' }, 404);
      if (fromFundCode === toFundCode) {
        return jsonResponse({ code: 400, message: '转出基金和转入基金不能相同' }, 400);
      }
      if (fromQuantity <= 0 || toQuantity <= 0 || transferCost <= 0) {
        return jsonResponse({ code: 400, message: '转出份额、转入份额和转换成本必须大于0' }, 400);
      }

      const groupId = generateId();
      const outId = generateId();
      const inId = generateId();
      const userNote = String(body.note || '').trim();
      const note = `[转换:${groupId}]${userNote ? ` ${userNote}` : ''}`;
      try {
        await ensurePositionBaseForTrade({
          account_id: accountId, fund_code: fromFundCode, fund_name: body.fromFundName || body.from_fund_name || '',
          trade_type: TRADE_TYPES.TRANSFER_OUT,
        });
        await ensurePositionBaseForTrade({
          account_id: accountId, fund_code: toFundCode, fund_name: body.toFundName || body.to_fund_name || '',
          trade_type: TRADE_TYPES.TRANSFER_IN,
        });
        const insertSql = `INSERT INTO trades (
          id, account_id, fund_code, fund_name, trade_type, quantity, amount, fee, trade_date, note,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, unixepoch(), unixepoch())`;
        await env.DB.batch([
          env.DB.prepare(insertSql).bind(outId, accountId, fromFundCode, body.fromFundName || body.from_fund_name || '', TRADE_TYPES.TRANSFER_OUT, fromQuantity, transferCost, tradeDate, note),
          env.DB.prepare(insertSql).bind(inId, accountId, toFundCode, body.toFundName || body.to_fund_name || '', TRADE_TYPES.TRANSFER_IN, toQuantity, transferCost, tradeDate, note),
        ]);
        const [fromPosition, toPosition] = await Promise.all([
          recomputeAndPersistPosition(accountId, fromFundCode),
          recomputeAndPersistPosition(accountId, toFundCode),
        ]);
        return jsonResponse({ code: 0, data: {
          group_id: groupId,
          trade_ids: [outId, inId],
          from_position: fromPosition ? serializePositionRow(fromPosition) : null,
          to_position: toPosition ? serializePositionRow(toPosition) : null,
        } });
      } catch (error) {
        await env.DB.prepare('DELETE FROM trades WHERE id IN (?, ?)').bind(outId, inId).run();
        await Promise.allSettled([
          recomputeAndPersistPosition(accountId, fromFundCode),
          recomputeAndPersistPosition(accountId, toFundCode),
        ]);
        return jsonResponse({ code: 400, message: error.message || '基金转换失败' }, 400);
      }
    }

    // 创建交易
    if (path === '/api/trades' && method === 'POST') {
      const body = await context.request.json();
      const trade = normalizeTradePayload(body);
      if (!trade.account_id || !trade.fund_code || !trade.trade_type) {
        return jsonResponse({ code: 400, message: '账户、基金代码、交易类型不能为空' }, 400);
      }
      if (!(await accountBelongsToHousehold(trade.account_id))) return jsonResponse({ code: 404, message: '账户不存在' }, 404);

      try {
        const basePosition = await ensurePositionBaseForTrade(trade);
        const id = generateId();
        await env.DB.prepare(
          `INSERT INTO trades (
            id, account_id, fund_code, fund_name, trade_type, quantity, amount, fee, trade_date, note,
            target_quantity, target_cost, target_initial_profit, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`
        ).bind(
          id,
          trade.account_id,
          trade.fund_code,
          trade.fund_name || basePosition.fund_name || '',
          trade.trade_type,
          trade.quantity,
          trade.amount,
          trade.fee,
          trade.trade_date,
          trade.note,
          trade.target_quantity,
          trade.target_cost,
          trade.target_initial_profit,
        ).run();

        const detail = await recomputeAndPersistPosition(trade.account_id, trade.fund_code);
        return jsonResponse({
          code: 0,
          data: {
            id,
            ...trade,
            position: detail ? serializePositionRow(detail) : null,
          },
        });
      } catch (error) {
        return jsonResponse({ code: 400, message: error.message || '交易录入失败' }, 400);
      }
    }

    // 删除交易
    if (path.match(/^\/api\/trades\/[\w-]+$/) && method === 'DELETE') {
      const id = path.split('/').pop();
      const { results } = await env.DB.prepare('SELECT * FROM trades WHERE id = ? LIMIT 1').bind(id).all();
      const trade = results[0];
      if (!trade) {
        return jsonResponse({ code: 404, message: 'Trade not found' }, 404);
      }
      if (!(await accountBelongsToHousehold(trade.account_id))) return jsonResponse({ code: 404, message: 'Trade not found' }, 404);
      await env.DB.prepare('DELETE FROM trades WHERE id = ?').bind(id).run();
      const detail = await recomputeAndPersistPosition(trade.account_id, trade.fund_code);
      return jsonResponse({ code: 0, message: 'Trade deleted', data: { position: detail ? serializePositionRow(detail) : null } });
    }

    // ========== 行情 API ==========

    // 获取行情列表
    if (path === '/api/market' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT fund_code, name, gsz, dwjz, gszzl, jzrq FROM market_snapshot ORDER BY updated_at DESC').all();
      const markets = results.map(r => ({
        fund_code: r.fund_code,
        fund_name: r.name,
        nav: r.gsz || r.dwjz,
        confirmed_nav: r.dwjz,
        daily_change: r.gszzl,
        date: r.jzrq,
      }));
      return jsonResponse({ code: 0, data: { total: markets.length, markets } });
    }

    // 获取单只基金行情
    if (path.match(/^\/api\/market\/[\w.]+$/) && method === 'GET') {
      const fundCode = path.split('/').pop();
      const { results } = await env.DB.prepare('SELECT fund_code, name, gsz, dwjz, gszzl, jzrq FROM market_snapshot WHERE fund_code = ? LIMIT 1').bind(fundCode).all();
      if (results.length === 0) {
        return jsonResponse({ code: 404, message: 'Market data not found' }, 404);
      }
      const r = results[0];
      return jsonResponse({ code: 0, data: { fund_code: r.fund_code, fund_name: r.name, fundName: r.name, nav: r.gsz || r.dwjz, confirmed_nav: r.dwjz, daily_change: r.gszzl, date: r.jzrq } });
    }

    // ========== 统计 API ==========

    // 收益总览
    if (path === '/api/stats/overview' && method === 'GET') {
      const memberId = url.searchParams.get('member_id');
      await ensureAdvisorySchemaOnce();

      const { results: members } = await env.DB.prepare('SELECT * FROM members WHERE household_id = ? ORDER BY created_at DESC').bind(householdId).all();
      const { results: accounts } = await env.DB.prepare('SELECT * FROM accounts WHERE household_id = ? ORDER BY created_at DESC').bind(householdId).all();
      const { results: positions } = await env.DB.prepare('SELECT p.* FROM positions p JOIN accounts a ON a.id = p.account_id WHERE a.household_id = ?').bind(householdId).all();
      const { results: snapshots } = await env.DB.prepare('SELECT * FROM market_snapshot').all();
      const { results: advisoryProducts } = await env.DB.prepare('SELECT * FROM advisory_products WHERE household_id = ?').bind(householdId).all();
      const { results: advisorySnapshots } = await env.DB.prepare('SELECT s.* FROM advisory_product_snapshots s JOIN advisory_products p ON p.id = s.product_id WHERE p.household_id = ?').bind(householdId).all();

      const snapshotMap = {};
      snapshots.forEach(m => {
        snapshotMap[m.fund_code] = m;
      });

      const advisorySnapshotMap = {};
      advisorySnapshots.forEach(row => {
        const current = advisorySnapshotMap[row.product_id];
        if (!current || row.snapshot_date > current.snapshot_date || (row.snapshot_date === current.snapshot_date && (row.updated_at || 0) > (current.updated_at || 0))) {
          advisorySnapshotMap[row.product_id] = row;
        }
      });

      const heldFundCodes = [...new Set(positions.filter(position => Number(position.quantity || 0) > 0).map(position => position.fund_code))];
      const heldSnapshots = heldFundCodes.map(code => snapshotMap[code]).filter(Boolean);
      const dailyProfitDate = heldSnapshots.map(snapshot => {
        const updatedAt = Number(snapshot.updated_at || 0);
        return updatedAt > 0 ? getChinaDateString(new Date(updatedAt * 1000)) : (snapshot.jzrq || '');
      }).sort().pop() || null;

      const accountStatsMap = {};
      let totalInvested = 0;
      let totalMarketValue = 0;
      let totalPositionYesterdayProfit = 0;
      let totalAdvisoryYesterdayProfit = 0;
      let totalCumulativeProfit = 0;
      const totalContributionMap = new Map();

      accounts.forEach(acc => {
        accountStatsMap[acc.id] = {
          accountId: acc.id,
          accountName: acc.name,
          channel: acc.channel,
          member_id: acc.member_id,
          invested: 0,
          marketValue: 0,
          profit: 0,
          profitRate: 0,
          dailyProfit: 0,
          hasAdvisory: false,
          hasPositions: false,
        };
      });

      positions.forEach(pos => {
        const accountStats = accountStatsMap[pos.account_id];
        if (!accountStats) return;
        accountStats.hasPositions = true;
        const cost = pos.cost || 0;
        const snap = snapshotMap[pos.fund_code];
        // 首页主资产与持仓页保持一致：优先使用确认净值，估算净值只在缺少确认值时兜底。
        const nav = (snap && snap.dwjz) ? snap.dwjz : (snap && snap.gsz) ? snap.gsz : null;
        const marketValue = (nav && pos.quantity) ? (pos.quantity * nav) : cost;
        accountStats.invested += cost;
        accountStats.marketValue += marketValue;
        totalInvested += cost;
        totalMarketValue += marketValue;
        const positionDailyProfit = calculateOverviewPositionDailyProfitForDate(pos, snap, dailyProfitDate);
        accountStats.dailyProfit += positionDailyProfit;
        totalPositionYesterdayProfit += positionDailyProfit;

        if (Number(pos.quantity || 0) > 0) {
          const positionProfit = marketValue - cost;
          const contributionKey = `${pos.account_id}:${pos.fund_code}`;
          const contribution = totalContributionMap.get(contributionKey) || {
            positionId: pos.id,
            fundCode: pos.fund_code,
            fundName: pos.fund_name || pos.fund_code,
            accountId: pos.account_id,
            accountName: accountStats.accountName || '',
            memberId: accountStats.member_id || null,
            invested: 0,
            marketValue: 0,
            totalProfit: 0,
            totalProfitRate: 0,
          };
          contribution.invested += cost;
          contribution.marketValue += marketValue;
          contribution.totalProfit += positionProfit;
          totalContributionMap.set(contributionKey, contribution);
        }
      });

      const advisoryStats = advisoryProducts.map(product => {
        const latest = advisorySnapshotMap[product.id];
        const totalAmount = Number(latest?.total_amount || 0);
        const currentProfit = Number(latest?.current_profit || 0);
        const invested = Math.max(0, totalAmount - currentProfit);
        const profitRate = latest?.profit_rate !== undefined && latest?.profit_rate !== null
          ? Number(latest.profit_rate || 0)
          : (invested > 0 ? Number(((currentProfit / invested) * 100).toFixed(2)) : 0);
        const dailyProfit = Number(latest?.daily_profit || 0);
        const fallbackMemberId = product.member_id || accounts.find(acc => acc.id === product.account_id)?.member_id || null;
        return {
          id: product.id,
          product_name: product.product_name,
          account_id: product.account_id,
          member_id: fallbackMemberId,
          marketValue: totalAmount,
          invested,
          profit: currentProfit,
          profitRate,
          dailyProfit,
          snapshot_date: latest?.snapshot_date || null,
        };
      });

      // 首页与基金收益统计只汇总真实基金持仓。顾投归入家庭财务的增值资产，
      // 不在这里叠加到账户、成员或基金资产总额，避免混入基金口径。
      totalAdvisoryYesterdayProfit = advisoryStats.reduce((sum, item) => sum + item.dailyProfit, 0);

      Object.values(accountStatsMap).forEach(accountStats => {
        accountStats.profit = Number((accountStats.marketValue - accountStats.invested).toFixed(2));
        accountStats.profitRate = Number((accountStats.invested > 0 ? (accountStats.profit / accountStats.invested * 100) : 0).toFixed(2));
        accountStats.dailyProfit = Number(accountStats.dailyProfit.toFixed(2));
        accountStats.invested = Number(accountStats.invested.toFixed(2));
        accountStats.marketValue = Number(accountStats.marketValue.toFixed(2));
      });

      const memberStats = members
        .map(member => {
          const memberAccounts = Object.values(accountStatsMap).filter(a => a.member_id === member.id && a.hasPositions);
          const memberMarketValue = memberAccounts.reduce((sum, a) => sum + a.marketValue, 0);
          const memberInvested = memberAccounts.reduce((sum, a) => sum + a.invested, 0);
          const memberProfit = memberMarketValue - memberInvested;
          const memberProfitRate = memberInvested > 0 ? (memberProfit / memberInvested * 100) : 0;
          const memberDailyProfit = memberAccounts.reduce((sum, account) => sum + account.dailyProfit, 0);
          return {
            member_id: member.id,
            member_name: member.name,
            emoji: member.emoji || '👤',
            accounts: memberAccounts,
            marketValue: Number(memberMarketValue.toFixed(2)),
            invested: Number(memberInvested.toFixed(2)),
            profit: Number(memberProfit.toFixed(2)),
            profitRate: Number(memberProfitRate.toFixed(2)),
            dailyProfit: Number(memberDailyProfit.toFixed(2)),
          };
        })
        .filter(member => !memberId || member.member_id === memberId);

      const filteredAccounts = Object.values(accountStatsMap).filter(a => a.hasPositions && (!memberId || a.member_id === memberId));
      const unassignedAccounts = filteredAccounts.filter(a => !a.member_id);
      const totalProfit = totalMarketValue - totalInvested;
      const totalProfitRate = totalInvested > 0 ? (totalProfit / totalInvested * 100) : 0;
      const totalHoldingProfit = totalProfit;
      totalCumulativeProfit = totalProfit + positions.reduce((sum, position) => sum + Number(position.realized_profit || 0), 0);
      const dailyProfitSummary = summarizeOverviewDailyProfits(totalPositionYesterdayProfit, 0);
      const navFreshness = summarizeFundNavFreshness({ positions, snapshotMap, now: new Date() });
      const contributionMap = new Map();
      positions.forEach(position => {
        if (Number(position.quantity || 0) <= 0) return;
        const account = accountStatsMap[position.account_id];
        const dailyProfit = calculateOverviewPositionDailyProfitForDate(position, snapshotMap[position.fund_code], dailyProfitDate);
        const key = `${position.account_id}:${position.fund_code}`;
        const current = contributionMap.get(key) || {
          positionId: position.id,
          fundCode: position.fund_code,
          fundName: position.fund_name || position.fund_code,
          accountId: position.account_id,
          accountName: account?.accountName || '',
          memberId: account?.member_id || null,
          dailyProfit: 0,
          dailyChangeRate: Number(snapshotMap[position.fund_code]?.gszzl || 0),
        };
        current.dailyProfit += dailyProfit;
        contributionMap.set(key, current);
      });
      const dailyContributions = [...contributionMap.values()]
        .map(item => ({ ...item, dailyProfit: Number(item.dailyProfit.toFixed(2)) }))
        .sort((a, b) => Math.abs(b.dailyProfit) - Math.abs(a.dailyProfit));
      const totalContributions = [...totalContributionMap.values()]
        .map(item => ({
          ...item,
          invested: Number(item.invested.toFixed(2)),
          marketValue: Number(item.marketValue.toFixed(2)),
          totalProfit: Number(item.totalProfit.toFixed(2)),
          totalProfitRate: Number((item.invested > 0 ? item.totalProfit / item.invested * 100 : 0).toFixed(2)),
        }))
        .sort((a, b) => Math.abs(b.totalProfit) - Math.abs(a.totalProfit));

      return jsonResponse({
        code: 0,
        data: {
          summary: {
            totalInvested: Number(totalInvested.toFixed(2)),
            totalMarketValue: Number(totalMarketValue.toFixed(2)),
            totalProfit: Number(totalProfit.toFixed(2)),
            totalProfitRate: Number(totalProfitRate.toFixed(2)),
            totalYesterdayProfit: dailyProfitSummary.totalYesterdayProfit,
            totalPositionYesterdayProfit: dailyProfitSummary.totalPositionYesterdayProfit,
            totalAdvisoryYesterdayProfit: dailyProfitSummary.totalAdvisoryYesterdayProfit,
            totalHoldingProfit: Number(totalHoldingProfit.toFixed(2)),
            totalCumulativeProfit: Number(totalCumulativeProfit.toFixed(2)),
            dailyProfitDate,
            updatedFundCount: navFreshness.updatedFundCount,
            totalFundCount: navFreshness.totalFundCount,
            staleFundCount: navFreshness.staleFundCount,
          },
          members: memberStats,
          accounts: filteredAccounts,
          unassignedAccounts,
          dailyContributions,
          totalContributions,
        },
      });
    }

    // iOS Chrome 测试端点
    if (path === '/api/test') {
      return new Response(JSON.stringify({
        success: true,
        message: 'D1 direct access works!',
        timestamp: Date.now()
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    if (path.match(/^\/api\/funds\/[\w.-]+\/detail$/) && method === 'GET') {
      try {
        const fundCode = path.split('/')[3];
        const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' };
        const [response, htmlResponse] = await Promise.all([
          fetch(`https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`, { headers }),
          fetch(`https://fund.eastmoney.com/${fundCode}.html`, { headers }),
        ]);
        if (!response.ok) {
          return jsonResponse({ code: 502, message: `Fetch fund detail failed: ${response.status}` }, 502);
        }

        const text = await response.text();
        const htmlText = htmlResponse.ok ? await htmlResponse.text() : '';
        const parsed = parsePingzhongdataFundHistory(text, htmlText);
        const { results: snapshotRows } = await env.DB.prepare(
          'SELECT dwjz, gsz, gszzl, jzrq FROM market_snapshot WHERE fund_code = ? LIMIT 1'
        ).bind(fundCode).all();
        const snapshot = snapshotRows?.[0] || null;
        const confirmedNav = Number(snapshot?.dwjz || snapshot?.gsz || 0);
        const netWorthTrend = mergeLatestConfirmedNavIntoHistory(parsed.net_worth_trend, {
          date: snapshot?.jzrq || '',
          nav: confirmedNav,
          daily_return_pct: snapshot?.gszzl,
        });
        return jsonResponse({
          code: 0,
          data: {
            fund_code: fundCode,
            fund_name: parsed.fund_name,
            net_worth_trend: netWorthTrend,
            performance_stats: buildFundPerformanceStats(netWorthTrend, parsed.official_returns),
          },
        });
      } catch (error) {
        return jsonResponse({ code: 500, message: error.message }, 500);
      }
    }

    // 数据库迁移接口（确保表结构完整）
    if (path === '/api/migrate' && method === 'POST') {
      try {
        // 检查 members 表是否有 emoji 列
        const tableInfo = await env.DB.prepare('PRAGMA table_info(members)').all();
        const hasEmoji = tableInfo.results.some(col => col.name === 'emoji');

        if (!hasEmoji) {
          await env.DB.prepare('ALTER TABLE members ADD COLUMN emoji TEXT DEFAULT "👤"').run();
        }

        const accountTableInfo = await env.DB.prepare('PRAGMA table_info(accounts)').all();
        const hasAccountEmoji = accountTableInfo.results.some(col => col.name === 'emoji');
        if (!hasAccountEmoji) {
          await env.DB.prepare("ALTER TABLE accounts ADD COLUMN emoji TEXT DEFAULT ''").run();
        }

        // market_snapshot 表：加 prev_nav（前日净值）、last_nav（上次同步时的净值）、last_gszzl（上次同步时的涨跌幅）
        const marketTableInfo = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='market_snapshot'").all();
        if (marketTableInfo.results.length === 0) {
          await env.DB.prepare(`
            CREATE TABLE market_snapshot (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              fund_code TEXT UNIQUE NOT NULL,
              name TEXT,
              dwjz REAL,
              gsz REAL,
              gszzl REAL,
              jzrq TEXT,
              gztime TEXT,
              prev_nav REAL,
              last_nav REAL,
              last_gszzl REAL,
              updated_at INTEGER
            )
          `).run();
        } else {
          const msInfo = await env.DB.prepare('PRAGMA table_info(market_snapshot)').all();
          const colNames = msInfo.results.map(c => c.name);
          if (!colNames.includes('prev_nav')) {
            await env.DB.prepare('ALTER TABLE market_snapshot ADD COLUMN prev_nav REAL').run();
          }
          if (!colNames.includes('last_nav')) {
            await env.DB.prepare('ALTER TABLE market_snapshot ADD COLUMN last_nav REAL').run();
          }
          if (!colNames.includes('last_gszzl')) {
            await env.DB.prepare('ALTER TABLE market_snapshot ADD COLUMN last_gszzl REAL').run();
          }
        }

        // positions 表：total_profit（累计持有收益）、yesterday_profit（昨日收益）、initial_profit（录入时的历史收益）
        const posInfo = await env.DB.prepare('PRAGMA table_info(positions)').all();
        if (!posInfo.results.some(col => col.name === 'total_profit')) {
          await env.DB.prepare('ALTER TABLE positions ADD COLUMN total_profit REAL DEFAULT 0').run();
        }
        if (!posInfo.results.some(col => col.name === 'yesterday_profit')) {
          await env.DB.prepare('ALTER TABLE positions ADD COLUMN yesterday_profit REAL DEFAULT 0').run();
        }
        if (!posInfo.results.some(col => col.name === 'initial_profit')) {
          await env.DB.prepare('ALTER TABLE positions ADD COLUMN initial_profit REAL DEFAULT 0').run();
        }

        await ensureAdvisorySchemaOnce();

        return jsonResponse({ code: 0, message: 'Migration completed' });
      } catch (error) {
        return jsonResponse({ code: 500, message: error.message }, 500);
      }
    }

    // 查询待补同步基金列表
    if (path === '/api/fund/pending' && method === 'GET') {
      try {
        const mode = normalizeSyncMode(url.searchParams.get('mode') || 'night');
        const includeQdii = parseBooleanLike(url.searchParams.get('includeQdii'), false);
        const now = new Date();
        const funds = await getPendingFunds(env, { now, mode, includeQdii });
        const { results: statusRows } = await env.DB.prepare(
          'SELECT fund_code, state, last_attempt_at, last_success_at, last_success_jzrq, consecutive_failures, next_retry_at, last_error FROM fund_sync_status'
        ).all();
        const statusMap = new Map((statusRows || []).map(row => [String(row.fund_code), row]));
        const enrichedFunds = funds.map((fund) => {
          const status = statusMap.get(String(fund.fund_code)) || {};
          const enriched = {
            ...fund,
            sync_state: status.state || 'pending',
            last_attempt_at: status.last_attempt_at || null,
            last_success_at: status.last_success_at || null,
            last_success_jzrq: status.last_success_jzrq || null,
            consecutive_failures: Number(status.consecutive_failures || 0),
            next_retry_at: status.next_retry_at || null,
            last_error: status.last_error || null,
          };
          return { ...enriched, overdue: isPendingFundOverdue(enriched, now) };
        });

        return jsonResponse({
          code: 0,
          mode,
          include_qdii: includeQdii,
          expected_jzrq: getExpectedNavDateForSyncMode({ now, mode }),
          pending: enrichedFunds.length,
          overdue: enrichedFunds.filter(item => item.overdue).length,
          funds: enrichedFunds,
        });
      } catch (error) {
        return jsonResponse({ code: 500, message: error.message }, 500);
      }
    }

    // 只同步待补基金
    if (path === '/api/fund/sync/pending' && (method === 'GET' || method === 'POST')) {
      try {
        const mode = normalizeSyncMode(url.searchParams.get('mode') || 'night');
        const includeQdii = parseBooleanLike(url.searchParams.get('includeQdii'), false);
        const batchSize = normalizeBatchSize(url.searchParams.get('batchSize'), 3);
        const result = await syncPendingFunds(env, {
          now: new Date(),
          mode,
          includeQdii,
          batchSize,
        });
        await scanUpcomingDividendEvents();

        return jsonResponse({
          code: 0,
          message: `Synced ${result.synced}/${result.total_pending_before_sync} pending funds`,
          ...result,
        });
      } catch (error) {
        return jsonResponse({ code: 500, message: error.message }, 500);
      }
    }

    // 净值同步接口
    // 支持 GET（登录用户手动触发）和 POST（登录用户或 cron secret 触发）
    if (path === '/api/fund/sync' && (method === 'GET' || method === 'POST')) {
      try {
        // 1. 获取所有持仓（带份额）
        const { results: allPositions } = await env.DB.prepare(
          'SELECT id, fund_code, fund_name, quantity FROM positions'
        ).all();
        if (allPositions.length === 0) {
          return jsonResponse({ code: 0, message: 'No positions found', synced: 0 });
        }

        const fundCodes = [...new Set(allPositions.map(p => p.fund_code).filter(Boolean))];
        const fundNameMap = {};
        allPositions.forEach(p => { fundNameMap[p.fund_code] = p.fund_name || ''; });

        // 2. 批量调 pingzhongdata、fundgz 实时估算及 F10 历史净值（并行）
        const syncResults = {};
        for (const code of fundCodes) {
          try {
            let nav = null, navDate = null, gszzl = null, prev_nav = null, name = fundNameMap[code] || '';
            let estimateNav = null, estimateDate = null, estimateChange = null;
            let dwjz = null;              // 真正要写入 market_snapshot.dwjz 的值
            let dwjzFromFundGz = null;    // fundgz 返回的 dwjz（仅在确认需要替换时才采用）

            // 同时请求三个接口；F10 历史净值只作为较新确认净值的兜底
            const [res2, resGz, resHistory] = await Promise.all([
              fetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
              }),
              fetch(`https://fundgz.1234567.com.cn/js/${code}.js?v=${Date.now()}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Referer': 'http://fundgz.1234567.com.cn/' }
              }),
              fetch(`https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=2&startDate=&endDate=`, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                  'Referer': 'https://fundf10.eastmoney.com/'
                }
              }).catch(() => null)
            ]);

            // 解析 pingzhongdata（官方净值）
            const text2 = await res2.text();
            const nameMatch = text2.match(/f_S_name\s*=\s*["']([^"']+)["']/);
            if (nameMatch) name = nameMatch[1];
            const latestNetWorth = parsePingzhongdataNetWorth(text2);
            if (latestNetWorth) {
              nav = latestNetWorth.currentNAV;
              prev_nav = latestNetWorth.prevNAV;
              navDate = latestNetWorth.navDate;
              gszzl = latestNetWorth.changeRate;
            }

            // 解析 fundgz 实时估算（兜底：pingzhongdata 日期非今日时用这个）
            const textGz = await resGz.text();
            const gzMatch = textGz.match(/jsonpgz\((.+)\)/);
            if (gzMatch) {
              try {
                const gzData = JSON.parse(gzMatch[1]);
                if (gzData && (gzData.gsz || gzData.dwjz || gzData.jzrq)) {
                  estimateNav = parseFloat(gzData.gsz);
                  estimateChange = parseFloat(gzData.gszzl);
                  dwjzFromFundGz = parseFloat(gzData.dwjz);
                // jzrq 是 fundgz 返回的「净值日期」（即实际交易日），不是 gztime（估算发布时间）
                // QDII基金在非交易日 fundgz 仍返回上一交易日作为 jzrq，此时 jzrq < navDate
                // 先用 jzrq 做日期比较；随后再由 F10 历史净值接口补齐更晚发布的确认净值
                const fundGzNavDate = (gzData.jzrq || '').split(' ')[0];
                const officialNavYesterday = parseFloat(gzData.dwjz);
                const mergedSnapshot = mergeFundEstimateIntoSnapshot({
                  nav,
                  navDate,
                  gszzl,
                  prev_nav,
                  estimateNav,
                  estimateChange,
                  officialNavYesterday,
                  fundGzNavDate,
                });
                nav = mergedSnapshot.nav;
                navDate = mergedSnapshot.navDate;
                gszzl = mergedSnapshot.gszzl;
                prev_nav = mergedSnapshot.prev_nav;
                dwjz = mergedSnapshot.dwjz || dwjz;
              }
              } catch (_) {}
            }
            if (resHistory?.ok) {
              const historicalSnapshot = parseEastmoneyHistoricalSnapshot(await resHistory.text());
              const mergedSnapshot = mergeConfirmedHistoricalSnapshot({
                nav,
                navDate,
                gszzl,
                prev_nav,
                dwjz,
                historicalSnapshot,
              });
              nav = mergedSnapshot.nav;
              navDate = mergedSnapshot.navDate;
              gszzl = mergedSnapshot.gszzl;
              prev_nav = mergedSnapshot.prev_nav;
              dwjz = mergedSnapshot.dwjz;
            }
            // upsert market_snapshot（含 prev_nav）
            const { results: oldSnap } = await env.DB.prepare(
              'SELECT last_nav, last_gszzl FROM market_snapshot WHERE fund_code = ?'
            ).bind(code).all();
            const oldLastNav = oldSnap.length > 0 ? oldSnap[0].last_nav : null;
            const oldLastGszzl = oldSnap.length > 0 ? oldSnap[0].last_gszzl : null;

            await env.DB.prepare(`
              INSERT INTO market_snapshot (fund_code, name, dwjz, gsz, gszzl, jzrq, gztime, prev_nav, last_nav, last_gszzl, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
              ON CONFLICT(fund_code) DO UPDATE SET
                name = excluded.name,
                dwjz = excluded.dwjz,
                gsz = excluded.gsz,
                gszzl = excluded.gszzl,
                jzrq = excluded.jzrq,
                gztime = excluded.gztime,
                prev_nav = excluded.prev_nav,
                last_nav = excluded.last_nav,
                last_gszzl = excluded.last_gszzl,
                updated_at = unixepoch()
            `).bind(code, name, dwjz || nav, nav, gszzl, navDate, navDate ? `${navDate} 00:00:00` : null, prev_nav, prev_nav, gszzl).run();
            syncResults[code] = { ok: !!nav, gsz: nav, gszzl, prev_nav, dwjz: dwjz || nav, confirmed_nav: dwjz || nav, last_nav: oldLastNav, last_gszzl: oldLastGszzl, jzrq: navDate };
          } catch (e) {
            syncResults[code] = { ok: false, reason: e.message };
          }
        }

        // 3. 更新每个持仓的昨日收益
        for (const pos of allPositions) {
          const snap = syncResults[pos.fund_code];
          if (!snap || !snap.ok) continue;
          const shares = pos.quantity || 0;
          if (shares <= 0) continue;

          const yesterdayProfit = resolveDisplayedYesterdayProfit({
            shares,
            confirmedNav: snap.dwjz || snap.confirmed_nav || snap.gsz || 0,
            prevNav: snap.prev_nav || 0,
            storedChangeRate: snap.gszzl,
            navDate: snap.jzrq || null,
            fundName: pos.fund_name || snap.fund_name || '',
          });
          await env.DB.prepare(`
            UPDATE positions SET
              yesterday_profit = ?,
              updated_at = unixepoch()
            WHERE id = ?
          `).bind(yesterdayProfit, pos.id).run();
        }

        const successCount = Object.values(syncResults).filter(r => r.ok).length;
        await scanUpcomingDividendEvents();
        return jsonResponse({
          code: 0,
          message: `Synced ${successCount}/${fundCodes.length} funds`,
          synced: successCount,
          total: fundCodes.length,
          results: syncResults,
        });
      } catch (error) {
        return jsonResponse({ code: 500, message: error.message }, 500);
      }
    }

    // 单基金净值同步接口
    if (path.match(/^\/api\/fund\/sync\/[\w.]+$/) && method === 'GET') {
      const fundCode = path.split('/').pop();
      
      try {
        const result = await syncOneFundSnapshot(env, fundCode, '');
        return jsonResponse({
          code: 0,
          message: result.ok ? 'Synced successfully' : 'Fund data not found',
          fund_code: fundCode,
          gsz: result.gsz,
          gszzl: result.gszzl,
          prev_nav: result.prev_nav,
          last_nav: result.last_nav,
          jzrq: result.jzrq,
        });
      } catch (error) {
        return jsonResponse({ code: 500, message: error.message }, 500);
      }
    }

    // 获取基金当前净值（从东方财富API）
    if (path === '/api/fund/nav' && method === 'GET') {
      const fundCode = url.searchParams.get('code');
      if (!fundCode) {
        return jsonResponse({ code: 400, message: '缺少基金代码' }, 400);
      }

      try {
        // 先尝试 fundgz 接口（实时估值）
        const url2 = `https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${Date.now()}`;
        const res = await fetch(url2, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://fund.eastmoney.com/',
          }
        });
        const text = await res.text();
        const match = text.match(/jsonpgz\((.+)\)/);
        if (match) {
          const data = JSON.parse(match[1]);
          return jsonResponse({ code: 0, data });
        }

        // 如果 fundgz 无数据，从 pingzhongdata 页面提取历史净值
        const res2 = await fetch(`https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const text2 = await res2.text();
        // 格式: Data_netWorthTrend = [{"x":timestamp,"y":nav},...]
        const navMatch = text2.match(/Data_netWorthTrend\s*=\s*\[([\s\S]*?)\];/);
        if (navMatch) {
          const points = navMatch[1];
          const allPoints = [...points.matchAll(/\"x\":(\d+),\s*\"y\":([\d.]+)/g)];
          if (allPoints.length > 0) {
            const last = allPoints[allPoints.length - 1];
            const navDate = new Date(parseInt(last[1])).toISOString().split('T')[0];
            return jsonResponse({
              code: 0,
              data: {
                fundCode,
                nav: parseFloat(last[2]),
                navDate,
                source: 'eastmoney_pingzhongdata'
              }
            });
          }
        }
        return jsonResponse({ code: 404, message: '未找到该基金数据' }, 404);
      } catch (error) {
        return jsonResponse({ code: 500, message: error.message }, 500);
      }
    }

    // 批量获取基金净值（从东方财富pingzhongdata页面解析）
    if (path === '/api/fund/batch-nav' && method === 'GET') {
      const codes = url.searchParams.get('codes');
      if (!codes) {
        return jsonResponse({ code: 400, message: '缺少基金代码列表' }, 400);
      }

      const fundCodes = codes.split(',').map(c => c.trim()).filter(Boolean);
      const results = {};

      // 并行获取每个基金的最新净值
      await Promise.all(fundCodes.map(async (code) => {
        try {
          const res = await fetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
          });
          const text = await res.text();
          const navMatch = text.match(/Data_netWorthTrend\s*=\s*\[([\s\S]*?)\];/);
          if (navMatch) {
            const points = navMatch[1];
            const allPoints = [...points.matchAll(/\"x\":(\d+),\s*\"y\":([\d.]+)/g)];
            if (allPoints.length > 0) {
              const last = allPoints[allPoints.length - 1];
              const navDate = new Date(parseInt(last[1])).toISOString().split('T')[0];
              results[code] = { nav: parseFloat(last[2]), navDate };
              return;
            }
          }
          results[code] = { nav: null, navDate: null };
        } catch (e) {
          results[code] = { nav: null, navDate: null, error: e.message };
        }
      }));

      return jsonResponse({ code: 0, data: results });
    }

    // 非 API 路径交给静态文件处理
    return context.next();
  } catch (error) {
    return jsonResponse({ code: 500, message: error.message }, 500);
  }
}
