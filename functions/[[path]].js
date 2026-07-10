/**
 * 投资管理系统 - Cloudflare Pages Function (直接访问 D1)
 * 不依赖外部 API，中国可直接访问
 */

import { rebuildPositionFromTrades, normalizeTradeType, toNumber, TRADE_TYPES } from '../shared/tradeEngine.js'

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
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
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

function getPreviousChinaTradingDateString(now = new Date()) {
  let cursor = addDays(now, -1);

  while (true) {
    const weekday = new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Shanghai',
      weekday: 'short',
    }).format(cursor);

    if (weekday !== 'Sat' && weekday !== 'Sun') {
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
    const weekday = new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Shanghai',
      weekday: 'short',
    }).format(cursor);

    if (weekday !== 'Sat' && weekday !== 'Sun') {
      remaining -= 1;
    }
  }

  return getChinaDateString(cursor);
}

function isQdiiFund(fundName = '') {
  return /QDII/i.test(String(fundName || ''));
}

export function getDailyProfitMeta(navDate, now = new Date(), fundName = '') {
  const chinaToday = getChinaDateString(now);
  const previousChinaTradingDate = getPreviousChinaTradingDateString(now);
  const isTodayUpdated = Boolean(navDate) && navDate === chinaToday;
  const isQdiiLatestUpdated = Boolean(navDate)
    && !isTodayUpdated
    && isQdiiFund(fundName)
    && navDate === previousChinaTradingDate;

  return {
    daily_profit_label: isTodayUpdated ? '今日收益' : '昨日收益',
    daily_profit_rate_label: isTodayUpdated ? '今日收益率' : '昨日收益率',
    daily_profit_updated: isTodayUpdated || isQdiiLatestUpdated,
    daily_profit_update_text: isTodayUpdated
      ? '今日收益更新'
      : (isQdiiLatestUpdated ? '最新收益已更新' : ''),
  };
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

export function calculateOverviewPositionDailyProfit(position = {}, snapshot = null) {
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
  });
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
  const date = new Date(Number(timestamp));
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
  };
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
} = {}) {
  const quantity = Number(shares || 0);

  // 如果有净值日期，判断是否为最新（普通基金：今天/上一交易日；QDII 允许额外晚一个交易日）
  if (navDate !== null && navDate !== undefined && navDate !== '') {
    const today = getChinaDateString(new Date());
    const previousTradingDate = getPreviousChinaTradingDateString(new Date());
    const secondPreviousTradingDate = getNthPreviousChinaTradingDateString(new Date(), 2);
    const thirdPreviousTradingDate = getNthPreviousChinaTradingDateString(new Date(), 3);
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

function getChinaHour(date = new Date()) {
  const hour = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hour12: false,
  }).format(date);

  return Number(hour);
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

  if (normalizedMode === 'night' && getChinaHour(now) < 21) {
    return getPreviousChinaTradingDateString(now);
  }

  return getChinaDateString(now);
}

export function buildPendingFundList({
  positions = [],
  snapshots = [],
  now = new Date(),
  mode = 'night',
  includeQdii = false,
} = {}) {
  const snapshotMap = new Map(
    (snapshots || []).map(row => [String(row.fund_code || ''), row])
  );
  const seen = new Set();
  const pending = [];
  const expectedJzrq = getExpectedNavDateForSyncMode({ now, mode });

  for (const position of positions || []) {
    const fundCode = String(position.fund_code || '').trim();
    if (!fundCode || seen.has(fundCode)) continue;
    seen.add(fundCode);

    const fundName = position.fund_name || position.name || '';
    const category = isDelayedNavFund(fundName) ? 'qdii' : 'normal';
    if (category === 'qdii' && !includeQdii) continue;

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

async function syncOneFundSnapshot(env, fundCode, fundNameFallback = '') {
  let nav = null;
  let navDate = null;
  let gszzl = null;
  let prev_nav = null;
  let dwjz = null;
  let name = fundNameFallback || '';

  const [res2, resGz] = await Promise.all([
    fetch(`https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    }),
    fetch(`https://fundgz.1234567.com.cn/js/${fundCode}.js?v=${Date.now()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'http://fundgz.1234567.com.cn/'
      }
    })
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

  for (let i = 0; i < pendingFunds.length; i += batchSize) {
    const batch = pendingFunds.slice(i, i + batchSize);
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
  }

  const stillPendingFunds = await getPendingFunds(env, { now, mode, includeQdii });
  const syncedCount = Object.values(results).filter(item => item.ok).length;

  return {
    mode: normalizeSyncMode(mode),
    include_qdii: includeQdii,
    batch_size: batchSize,
    total_pending_before_sync: pendingFunds.length,
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

  // CORS 预检
  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
        'SELECT t.* FROM auth_tokens t WHERE t.token = ? AND (t.expires_at IS NULL OR t.expires_at > ?)'
      ).bind(token, Math.floor(Date.now() / 1000)).all();
      return results.length > 0 ? results[0] : null;
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
            remark TEXT DEFAULT '',
            created_at INTEGER DEFAULT (unixepoch()),
            updated_at INTEGER DEFAULT (unixepoch())
          )
        `).run();
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
    }

    function serializeAccountRow(r) {
      return {
        id: r.id,
        account_name: r.name,
        channel: r.channel,
        status: r.status,
        remark: r.remark || '',
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
      const dailyProfitMeta = getDailyProfitMeta(navDate, new Date(), r.fund_name || '');

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
      };
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

    async function ensureRuntimeSchemaOnce() {
      if (!runtimeSchemaInitPromise) {
        runtimeSchemaInitPromise = (async () => {
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

          await ensureMembersSchema();
          await ensureLedgerSchemas();
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

    async function fetchPositionDetailById(id) {
      const { results } = await env.DB.prepare(
        `SELECT p.*, a.name as account_name, a.channel as account_channel, a.member_id, m.name as member_name, m.emoji as member_emoji,
                s.gsz as nav_gsz, s.gszzl as nav_gszzl, s.dwjz as nav_dwjz, s.jzrq as nav_jzrq,
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

    await ensureRuntimeSchemaOnce();

    // ========== 公开接口（无需认证）==========
    // 健康检查
    if (path === '/health' || path === '/api/health') {
      return jsonResponse({ code: 0, message: 'ok', data: { service: 'Investment API', version: '3.1.0', db: 'investment-db' } });
    }

    // 检查是否已设置过管理员
    if (path === '/api/auth/status' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, username, created_at FROM users LIMIT 1').all();
      return jsonResponse({ code: 0, data: { configured: results.length > 0, username: results.length > 0 ? results[0].username : null } });
    }

    // 注册管理员（首次设置）
    if (path === '/api/auth/setup' && method === 'POST') {
      const body = await context.request.json();
      const username = (body.username || 'admin').trim();
      const password = body.password;
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
      await env.DB.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').bind(id, username, passwordHash).run();
      const token = crypto.randomUUID().replace(/-/g, '');
      const tokenId = generateId();
      const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
      await env.DB.prepare('INSERT INTO auth_tokens (id, token, expires_at) VALUES (?, ?, ?)').bind(tokenId, token, expiresAt).run();
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
      await env.DB.prepare('INSERT INTO auth_tokens (id, token, expires_at) VALUES (?, ?, ?)').bind(tokenId, token, expiresAt).run();
      return jsonResponse({ code: 0, data: { token, username: user.username, expires_at: expiresAt } });
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

    // 读操作暂不强制认证（可按需开启）
    const isReadOnly = method === 'GET' || method === 'OPTIONS';

    // 写操作需要认证
    if (!isReadOnly) {
      const authUser = await verifyToken(context.request);
      if (!authUser) {
        return jsonResponse({ code: 401, message: '请先登录' }, 401);
      }
    }

    // ========== 成员 API ==========

    // 获取成员列表
    if (path === '/api/members' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM members ORDER BY created_at DESC').all();
      const members = results.map(r => ({
        id: r.id,
        name: r.name,
        emoji: r.emoji || '👤',
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

      await env.DB.prepare(
        'INSERT INTO members (id, name, emoji) VALUES (?, ?, ?)'
      ).bind(id, name, emoji).run();

      return jsonResponse({ code: 0, data: { id, name, emoji } });
    }

    // 更新成员
    if (path.match(/^\/api\/members\/[\w-]+$/) && method === 'PUT') {
      const id = path.split('/').pop();
      const body = await context.request.json();
      const name = body.name;
      const remark = body.remark;
      const emoji = body.emoji;

      const fields = [];
      const values = [];
      if (name !== undefined) { fields.push('name = ?'); values.push(name); }
      if (remark !== undefined) { fields.push('remark = ?'); values.push(remark); }
      if (emoji !== undefined) { fields.push('emoji = ?'); values.push(emoji); }

      if (fields.length > 0) {
        values.push(id);
        await env.DB.prepare(`UPDATE members SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`).bind(...values).run();
      }

      const { results } = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(id).all();
      if (results.length === 0) {
        return jsonResponse({ code: 404, message: 'Member not found' }, 404);
      }
      const r = results[0];
      return jsonResponse({ code: 0, data: { id: r.id, name: r.name, emoji: r.emoji || '👤', remark: r.remark || '' } });
    }

    // 删除成员
    if (path.match(/^\/api\/members\/[\w-]+$/) && method === 'DELETE') {
      const id = path.split('/').pop();
      // 先解除账户绑定
      await env.DB.prepare('UPDATE accounts SET member_id = NULL WHERE member_id = ?').bind(id).run();
      // 删除成员
      await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(id).run();
      return jsonResponse({ code: 0, message: 'Member deleted' });
    }

    // ========== 账户 API ==========

    // 获取账户列表
    if (path === '/api/accounts' && method === 'GET') {
      const memberId = url.searchParams.get('member_id');
      let query = 'SELECT a.*, m.name as member_name FROM accounts a LEFT JOIN members m ON a.member_id = m.id';
      let stmt;
      if (memberId) {
        query += ' WHERE a.member_id = ?';
        stmt = env.DB.prepare(query + ' ORDER BY a.created_at DESC').bind(memberId);
      } else {
        stmt = env.DB.prepare(query + ' ORDER BY a.created_at DESC');
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

      await env.DB.prepare(
        'INSERT INTO accounts (id, name, channel, status, remark, member_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(id, name, channel, status, remark, member_id).run();

      return jsonResponse({ code: 0, data: serializeAccountRow({
        id,
        name,
        channel,
        status,
        remark,
        member_id,
        member_name: '',
        created_at: Math.floor(Date.now() / 1000),
      }) });
    }

    // 获取单个账户
    if (path.match(/^\/api\/accounts\/[\w-]+$/) && method === 'GET') {
      const id = path.split('/').pop();
      const { results } = await env.DB.prepare(
        'SELECT a.*, m.name as member_name FROM accounts a LEFT JOIN members m ON a.member_id = m.id WHERE a.id = ?'
      ).bind(id).all();
      if (results.length === 0) {
        return jsonResponse({ code: 404, message: 'Account not found' }, 404);
      }
      return jsonResponse({ code: 0, data: serializeAccountRow(results[0]) });
    }

    // 删除账户
    if (path.match(/^\/api\/accounts\/[\w-]+$/) && method === 'DELETE') {
      const id = path.split('/').pop();
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

      const fields = [];
      const values = [];
      if (name !== undefined) { fields.push('name = ?'); values.push(name); }
      if (channel !== undefined) { fields.push('channel = ?'); values.push(channel); }
      if (status !== undefined) { fields.push('status = ?'); values.push(status); }
      if (remark !== undefined) { fields.push('remark = ?'); values.push(remark); }
      if (member_id !== undefined) { fields.push('member_id = ?'); values.push(member_id); }

      if (fields.length > 0) {
        values.push(id);
        await env.DB.prepare(`UPDATE accounts SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`).bind(...values).run();
      }

      const { results } = await env.DB.prepare(
        'SELECT a.*, m.name as member_name FROM accounts a LEFT JOIN members m ON a.member_id = m.id WHERE a.id = ?'
      ).bind(id).all();
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
      const conditions = [];
      const params = [];
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
      const remark = body.remark || '';
      await env.DB.prepare(
        'INSERT INTO advisory_products (id, account_id, member_id, platform, product_name, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, account_id, member_id, platform, productName, status, remark).run();
      return jsonResponse({ code: 0, data: { id, product_name: productName, account_id, member_id, platform, status, remark } });
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
      const remark = body.remark;
      const fields = [];
      const values = [];
      if (product_name !== undefined) { fields.push('product_name = ?'); values.push(product_name); }
      if (account_id !== undefined) { fields.push('account_id = ?'); values.push(account_id); }
      if (member_id !== undefined) { fields.push('member_id = ?'); values.push(member_id); }
      if (platform !== undefined) { fields.push('platform = ?'); values.push(platform); }
      if (status !== undefined) { fields.push('status = ?'); values.push(status); }
      if (remark !== undefined) { fields.push('remark = ?'); values.push(remark); }
      if (fields.length > 0) {
        values.push(id);
        await env.DB.prepare(`UPDATE advisory_products SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`).bind(...values).run();
      }
      const { results } = await env.DB.prepare('SELECT * FROM advisory_products WHERE id = ?').bind(id).all();
      if (results.length === 0) return jsonResponse({ code: 404, message: 'Advisory product not found' }, 404);
      return jsonResponse({ code: 0, data: results[0] });
    }

    if (path.match(/^\/api\/advisory-products\/[\w-]+$/) && method === 'DELETE') {
      await ensureAdvisorySchemaOnce();
      const id = path.split('/').pop();
      await env.DB.prepare('DELETE FROM advisory_product_snapshots WHERE product_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM advisory_products WHERE id = ?').bind(id).run();
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
      const total_amount = Number(body.total_amount ?? body.totalAmount ?? 0);
      const daily_profit = Number(body.daily_profit ?? body.dailyProfit ?? 0);
      const current_profit = Number(body.current_profit ?? body.currentProfit ?? 0);
      const inputProfitRate = body.profit_rate ?? body.profitRate;
      const profit_rate = inputProfitRate !== undefined && inputProfitRate !== null && inputProfitRate !== ''
        ? Number(inputProfitRate)
        : ((total_amount - current_profit) > 0 ? Number(((current_profit / (total_amount - current_profit)) * 100).toFixed(2)) : 0);
      const existing = await env.DB.prepare('SELECT id FROM advisory_product_snapshots WHERE product_id = ? AND snapshot_date = ?').bind(product_id, snapshot_date).all();
      if (existing.results.length > 0) {
        await env.DB.prepare(
          'UPDATE advisory_product_snapshots SET total_amount = ?, daily_profit = ?, current_profit = ?, profit_rate = ?, updated_at = unixepoch() WHERE id = ?'
        ).bind(total_amount, daily_profit, current_profit, profit_rate, existing.results[0].id).run();
        return jsonResponse({ code: 0, data: { id: existing.results[0].id, product_id, snapshot_date, total_amount, daily_profit, current_profit, profit_rate } });
      }
      const id = generateId();
      await env.DB.prepare(
        'INSERT INTO advisory_product_snapshots (id, product_id, snapshot_date, total_amount, daily_profit, current_profit, profit_rate) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, product_id, snapshot_date, total_amount, daily_profit, current_profit, profit_rate).run();
      return jsonResponse({ code: 0, data: { id, product_id, snapshot_date, total_amount, daily_profit, current_profit, profit_rate } });
    }

    // ========== 持仓 API ==========

    // 获取持仓列表
    if (path === '/api/positions' && method === 'GET') {
      const accountId = url.searchParams.get('account_id');
      const memberId = url.searchParams.get('member_id');
      
      let query = `SELECT p.*, a.name as account_name, a.channel as account_channel, a.member_id, m.name as member_name, m.emoji as member_emoji,
                   s.gsz as nav_gsz, s.gszzl as nav_gszzl, s.dwjz as nav_dwjz, s.jzrq as nav_jzrq,
                   s.prev_nav
                   FROM positions p
                   LEFT JOIN accounts a ON p.account_id = a.id
                   LEFT JOIN members m ON a.member_id = m.id
                   LEFT JOIN market_snapshot s ON p.fund_code = s.fund_code`;
      const conditions = [];
      const params = [];
      
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
                s.gsz as nav_gsz, s.gszzl as nav_gszzl, s.dwjz as nav_dwjz, s.jzrq as nav_jzrq,
                s.prev_nav
         FROM positions p
         LEFT JOIN accounts a ON p.account_id = a.id
         LEFT JOIN members m ON a.member_id = m.id
         LEFT JOIN market_snapshot s ON p.fund_code = s.fund_code
         WHERE p.id = ?`
      ).bind(id).all();
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
      const conditions = [];
      const values = [];
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

    // 创建交易
    if (path === '/api/trades' && method === 'POST') {
      const body = await context.request.json();
      const trade = normalizeTradePayload(body);
      if (!trade.account_id || !trade.fund_code || !trade.trade_type) {
        return jsonResponse({ code: 400, message: '账户、基金代码、交易类型不能为空' }, 400);
      }

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

      const { results: members } = await env.DB.prepare('SELECT * FROM members ORDER BY created_at DESC').all();
      const { results: accounts } = await env.DB.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all();
      const { results: positions } = await env.DB.prepare('SELECT * FROM positions').all();
      const { results: snapshots } = await env.DB.prepare('SELECT * FROM market_snapshot').all();
      const { results: advisoryProducts } = await env.DB.prepare('SELECT * FROM advisory_products').all();
      const { results: advisorySnapshots } = await env.DB.prepare('SELECT * FROM advisory_product_snapshots').all();

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

      const accountStatsMap = {};
      let totalInvested = 0;
      let totalMarketValue = 0;
      let totalPositionYesterdayProfit = 0;
      let totalAdvisoryYesterdayProfit = 0;
      let totalCumulativeProfit = positions.reduce((sum, pos) => sum + (pos.initial_profit || 0), 0);

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
        };
      });

      positions.forEach(pos => {
        const accountStats = accountStatsMap[pos.account_id];
        if (!accountStats) return;
        const cost = pos.cost || 0;
        const snap = snapshotMap[pos.fund_code];
        const nav = (snap && snap.gsz) ? snap.gsz : (snap && snap.dwjz) ? snap.dwjz : null;
        const marketValue = (nav && pos.quantity) ? (pos.quantity * nav) : cost;
        accountStats.invested += cost;
        accountStats.marketValue += marketValue;
        totalInvested += cost;
        totalMarketValue += marketValue;
        const positionDailyProfit = calculateOverviewPositionDailyProfit(pos, snap);
        totalPositionYesterdayProfit += positionDailyProfit;
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

      advisoryStats.forEach(item => {
        totalInvested += item.invested;
        totalMarketValue += item.marketValue;
        totalAdvisoryYesterdayProfit += item.dailyProfit;
        totalCumulativeProfit += item.profit;
        if (item.account_id && accountStatsMap[item.account_id]) {
          const accountStats = accountStatsMap[item.account_id];
          accountStats.invested += item.invested;
          accountStats.marketValue += item.marketValue;
        } else if (item.account_id) {
          const account = accounts.find(acc => acc.id === item.account_id);
          accountStatsMap[item.account_id] = {
            accountId: item.account_id,
            accountName: account?.name || item.product_name,
            channel: account?.channel || '雪球顾投',
            member_id: item.member_id,
            invested: item.invested,
            marketValue: item.marketValue,
            profit: 0,
            profitRate: 0,
          };
        }
      });

      Object.values(accountStatsMap).forEach(accountStats => {
        accountStats.profit = Number((accountStats.marketValue - accountStats.invested).toFixed(2));
        accountStats.profitRate = Number((accountStats.invested > 0 ? (accountStats.profit / accountStats.invested * 100) : 0).toFixed(2));
        accountStats.invested = Number(accountStats.invested.toFixed(2));
        accountStats.marketValue = Number(accountStats.marketValue.toFixed(2));
      });

      const memberStats = members
        .map(member => {
          const memberAccounts = Object.values(accountStatsMap).filter(a => a.member_id === member.id);
          const memberMarketValue = memberAccounts.reduce((sum, a) => sum + a.marketValue, 0);
          const memberInvested = memberAccounts.reduce((sum, a) => sum + a.invested, 0);
          const memberProfit = memberMarketValue - memberInvested;
          const memberProfitRate = memberInvested > 0 ? (memberProfit / memberInvested * 100) : 0;
          return {
            member_id: member.id,
            member_name: member.name,
            emoji: member.emoji || '👤',
            accounts: memberAccounts,
            marketValue: Number(memberMarketValue.toFixed(2)),
            invested: Number(memberInvested.toFixed(2)),
            profit: Number(memberProfit.toFixed(2)),
            profitRate: Number(memberProfitRate.toFixed(2)),
          };
        })
        .filter(member => !memberId || member.member_id === memberId);

      const filteredAccounts = Object.values(accountStatsMap).filter(a => !memberId || a.member_id === memberId);
      const unassignedAccounts = filteredAccounts.filter(a => !a.member_id);
      const totalProfit = totalMarketValue - totalInvested;
      const totalProfitRate = totalInvested > 0 ? (totalProfit / totalInvested * 100) : 0;
      const totalHoldingProfit = totalProfit;
      const dailyProfitSummary = summarizeOverviewDailyProfits(totalPositionYesterdayProfit, totalAdvisoryYesterdayProfit);

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
          },
          members: memberStats,
          accounts: filteredAccounts,
          unassignedAccounts,
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
        return jsonResponse({
          code: 0,
          data: {
            fund_code: fundCode,
            ...parsed,
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

        return jsonResponse({
          code: 0,
          mode,
          include_qdii: includeQdii,
          expected_jzrq: getExpectedNavDateForSyncMode({ now, mode }),
          pending: funds.length,
          funds,
        });
      } catch (error) {
        return jsonResponse({ code: 500, message: error.message }, 500);
      }
    }

    // 只同步待补基金
    if (path === '/api/fund/sync/pending' && (method === 'GET' || method === 'POST')) {
      if (method === 'POST' && !env.CLOUDFLARE_CRON_TRIGGER) {
        return jsonResponse({ code: 403, message: 'Forbidden: cron trigger only' }, 403);
      }

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
    // 支持 GET（手动触发）和 POST（cron 触发，校验 CLOUDFLARE_CRON_TRIGGER）
    if (path === '/api/fund/sync' && (method === 'GET' || method === 'POST')) {
      if (method === 'POST' && !env.CLOUDFLARE_CRON_TRIGGER) {
        return jsonResponse({ code: 403, message: 'Forbidden: cron trigger only' }, 403);
      }

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

        // 2. 批量调 pingzhongdata + fundgz 实时估算（并行）
        const syncResults = {};
        for (const code of fundCodes) {
          try {
            let nav = null, navDate = null, gszzl = null, prev_nav = null, name = fundNameMap[code] || '';
            let estimateNav = null, estimateDate = null, estimateChange = null;
            let dwjz = null;              // 真正要写入 market_snapshot.dwjz 的值
            let dwjzFromFundGz = null;    // fundgz 返回的 dwjz（仅在确认需要替换时才采用）

            // 同时请求两个接口
            const [res2, resGz] = await Promise.all([
              fetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
              }),
              fetch(`https://fundgz.1234567.com.cn/js/${code}.js?v=${Date.now()}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Referer': 'http://fundgz.1234567.com.cn/' }
              })
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
                // pingzhongdata 的 navDate 永远是真实最新净值日期（哪怕是节假日后的第一个交易日）
                // 所以用 jzrq 做日期比较：fundgz 的 jzrq > navDate 才说明 fundgz 有更新的净值
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
