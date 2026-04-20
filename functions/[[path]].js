/**
 * 投资管理系统 - Cloudflare Pages Function (直接访问 D1)
 * 不依赖外部 API，中国可直接访问
 */

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
    // ========== 认证：建表（自动初始化） ==========
    // users 表：存储管理员账户
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
    // auth_tokens 表：存储登录令牌
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
      const accounts = results.map(r => ({
        id: r.id,
        '账户名称': r.name,
        '渠道': r.channel,
        '账户状态': r.status,
        '备注': r.remark || '',
        member_id: r.member_id,
        member_name: r.member_name || '',
        created_at: r.created_at,
      }));
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

      return jsonResponse({ code: 0, data: { id, '账户名称': name, '渠道': channel, '账户状态': status, '备注': remark, member_id } });
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
      const r = results[0];
      return jsonResponse({ code: 0, data: {
        id: r.id,
        '账户名称': r.name,
        '渠道': r.channel,
        '账户状态': r.status,
        '备注': r.remark || '',
        member_id: r.member_id,
        member_name: r.member_name || '',
      }});
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
      const r = results[0];
      return jsonResponse({ code: 0, data: {
        id: r.id,
        '账户名称': r.name,
        '渠道': r.channel,
        '账户状态': r.status,
        '备注': r.remark || '',
        member_id: r.member_id,
        member_name: r.member_name || '',
      }});
    }

    // ========== 持仓 API ==========

    // 获取持仓列表
    if (path === '/api/positions' && method === 'GET') {
      const accountId = url.searchParams.get('account_id');
      const memberId = url.searchParams.get('member_id');
      
      let query = `SELECT p.*, a.name as account_name, a.member_id, m.name as member_name, m.emoji as member_emoji,
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
      
        const positions = results.map(r => {
          const shares = r.quantity || 0;
          const cost = r.cost || 0;              // 买入成本（来自数据库 cost 列）
          const nav = r.nav_gsz || r.nav_dwjz || 0; // 最新净值
          const prevNav = r.prev_nav || 0; // 前一日净值

          // 昨日收益 = (最新净值 - 前一日净值) × 持有份额
          const yesterdayProfit = shares > 0 && nav > 0 && prevNav > 0
            ? parseFloat(((nav - prevNav) * shares).toFixed(4))
            : 0;

          // 当前市值 = 持有份额 × 最新净值
          const currentMarketValue = shares > 0 && nav > 0
            ? parseFloat((shares * nav).toFixed(4))
            : 0;

          // 持有收益 = 当前市值 - 买入成本（不含历史收益，历史收益已固化在成本中）
          const totalProfit = parseFloat((currentMarketValue - cost).toFixed(4));
          const currentProfit = totalProfit;

          // 持有收益率 = 持有收益 / 买入成本 × 100%
          const profitRate = cost > 0
            ? parseFloat(((currentProfit / cost) * 100).toFixed(4))
            : 0;

          // 日涨幅：从 market_snapshot 的 prev_nav 实时计算，避免 gszzl=0 被 || 误判为 null
          const navGsz = r.nav_gsz || null;
          const navGszzl = (navGsz && prevNav && prevNav > 0)
            ? parseFloat(((navGsz - prevNav) / prevNav * 100).toFixed(4))
            : (r.nav_gszzl != null ? r.nav_gszzl : null);

          return {
            id: r.id,
            account_id: r.account_id,
            account_name: r.account_name || '',
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
            initial_profit: r.initial_profit || 0,
            dividend_method: r.dividend_method || '红利再投',
            created_at: r.created_at,
            nav_gsz: navGsz,
            nav_gszzl: navGszzl,
            nav_dwjz: r.nav_dwjz || null,
            nav_jzrq: r.nav_jzrq || null,
          };
        });
      return jsonResponse({ code: 0, data: { total: positions.length, positions } });
    }

    // 创建持仓
    if (path === '/api/positions' && method === 'POST') {
      const body = await context.request.json();
      const id = generateId();
      const account_id = body.accountId || body.account_id;
      const fund_code = body.fundCode || body.fund_code;
      const fund_name = body.fundName || body.fund_name;
      const shares = body.shares || body.quantity || 0;
      const cost = body.cost || body.amount || 0;
      const initial_profit = body.initialProfit || body.initial_profit || 0;
      const dividend_method = body.dividendMethod || body.dividend_method || '红利再投';

      await env.DB.prepare(
        'INSERT INTO positions (id, account_id, fund_code, fund_name, quantity, cost, initial_profit, dividend_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, account_id, fund_code, fund_name || '', shares, cost, initial_profit, dividend_method).run();

      // 查询关联的账户和成员信息
      const { results: posResults } = await env.DB.prepare(
        `SELECT p.*, a.name as account_name, a.member_id, m.name as member_name, m.emoji as member_emoji 
         FROM positions p 
         LEFT JOIN accounts a ON p.account_id = a.id 
         LEFT JOIN members m ON a.member_id = m.id 
         WHERE p.id = ?`
      ).bind(id).all();
      
      const r = posResults[0];
      return jsonResponse({ code: 0, data: {
        id: r.id,
        account_id: r.account_id,
        account_name: r.account_name || '',
        member_id: r.member_id,
        member_name: r.member_name || '',
        member_emoji: r.member_emoji || '👤',
        fund_code: r.fund_code,
        fund_name: r.fund_name,
        shares: r.quantity,
        cost: r.cost || 0,
        current_profit: r.current_profit || 0,
        dividend_method: r.dividend_method,
      }});
    }

    // 更新持仓
    if (path.match(/^\/api\/positions\/[\w-]+$/) && method === 'PUT') {
      const id = path.split('/').pop();
      const body = await context.request.json();

      const fund_name = body.fundName || body.fund_name;
      const shares = body.shares || body.quantity;
      const amount = body.amount;
      const cost = body.cost;
      const initial_profit = body.initialProfit ?? body.initial_profit;
      const dividend_method = body.dividendMethod ?? body.dividend_method;
      const account_id = body.accountId || body.account_id;

      const fields = [];
      const values = [];
      if (fund_name !== undefined) { fields.push('fund_name = ?'); values.push(fund_name); }
      if (shares !== undefined) { fields.push('quantity = ?'); values.push(shares); }
      if (amount !== undefined) { fields.push('cost = ?'); values.push(amount); }
      if (cost !== undefined) { fields.push('cost = ?'); values.push(cost); }
      if (initial_profit !== undefined) { fields.push('initial_profit = ?'); values.push(initial_profit); }
      if (dividend_method !== undefined) { fields.push('dividend_method = ?'); values.push(dividend_method); }
      if (account_id !== undefined) { fields.push('account_id = ?'); values.push(account_id); }

      if (fields.length > 0) {
        values.push(id);
        await env.DB.prepare(`UPDATE positions SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`).bind(...values).run();
      }

      // 查询关联的账户和成员信息
      const { results: posResults } = await env.DB.prepare(
        `SELECT p.*, a.name as account_name, a.member_id, m.name as member_name, m.emoji as member_emoji 
         FROM positions p 
         LEFT JOIN accounts a ON p.account_id = a.id 
         LEFT JOIN members m ON a.member_id = m.id 
         WHERE p.id = ?`
      ).bind(id).all();
      
      if (posResults.length === 0) {
        return jsonResponse({ code: 404, message: 'Position not found' }, 404);
      }
      
      const r = posResults[0];
      // 计算当前收益和收益率（实时计算，不依赖存储字段）
      const _shares = r.quantity || 0;
      const _cost = r.cost || 0;
      const nav = r.nav_gsz || r.nav_dwjz || 0;
      const currentMarketValue = _shares > 0 && nav > 0 ? parseFloat((_shares * nav).toFixed(4)) : 0;
      const currentProfit = parseFloat((currentMarketValue - _cost).toFixed(4));
      const profitRate = _cost > 0 ? parseFloat(((currentProfit / _cost) * 100).toFixed(4)) : 0;
      const prevNav = r.prev_nav || 0;
      const yesterdayProfit = _shares > 0 && nav > 0 && prevNav > 0 ? parseFloat(((nav - prevNav) * _shares).toFixed(4)) : 0;
      return jsonResponse({ code: 0, data: {
        id: r.id,
        account_id: r.account_id,
        account_name: r.account_name || '',
        member_id: r.member_id,
        member_name: r.member_name || '',
        member_emoji: r.member_emoji || '👤',
        fund_code: r.fund_code,
        fund_name: r.fund_name,
        shares: r.quantity,
        cost: r.cost || 0,
        current_profit: currentProfit,
        profit_rate: profitRate,
        yesterday_profit: yesterdayProfit,
        initial_profit: r.initial_profit || 0,
        dividend_method: r.dividend_method,
      }});
    }

    // 删除持仓
    if (path.match(/^\/api\/positions\/[\w-]+$/) && method === 'DELETE') {
      const id = path.split('/').pop();
      await env.DB.prepare('DELETE FROM positions WHERE id = ?').bind(id).run();
      return jsonResponse({ code: 0, message: 'Position deleted' });
    }

    // ========== 交易 API ==========

    // 获取交易列表
    if (path === '/api/trades' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM trades ORDER BY trade_date DESC').all();
      const trades = results.map(r => ({
        id: r.id,
        account_id: r.account_id,
        fund_code: r.fund_code,
        trade_type: r.trade_type,
        quantity: r.quantity,
        amount: r.amount,
        fee: r.fee,
        trade_date: r.trade_date,
        created_at: r.created_at,
      }));
      return jsonResponse({ code: 0, data: { total: trades.length, trades } });
    }

    // 创建交易
    if (path === '/api/trades' && method === 'POST') {
      const body = await context.request.json();
      const id = generateId();
      const { account_id, fund_code, trade_type, quantity, amount, fee, trade_date } = body;

      await env.DB.prepare(
        'INSERT INTO trades (id, account_id, fund_code, trade_type, quantity, amount, fee, trade_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, account_id, fund_code, trade_type, quantity || 0, amount || 0, fee || 0, trade_date || Date.now()).run();

      return jsonResponse({ code: 0, data: { id, account_id, fund_code, trade_type, quantity, amount, fee, trade_date } });
    }

    // ========== 行情 API ==========

    // 获取行情列表
    if (path === '/api/market' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM market ORDER BY date DESC').all();
      const markets = results.map(r => ({
        id: r.id,
        fund_code: r.fund_code,
        fund_name: r.fund_name,
        nav: r.nav,
        daily_change: r.daily_change,
        date: r.date,
      }));
      return jsonResponse({ code: 0, data: { total: markets.length, markets } });
    }

    // 获取单只基金行情
    if (path.match(/^\/api\/market\/[\w.]+$/) && method === 'GET') {
      const fundCode = path.split('/').pop();
      const { results } = await env.DB.prepare('SELECT * FROM market WHERE fund_code = ? ORDER BY date DESC LIMIT 1').bind(fundCode).all();
      if (results.length === 0) {
        return jsonResponse({ code: 404, message: 'Market data not found' }, 404);
      }
      const r = results[0];
      return jsonResponse({ code: 0, data: { fund_code: r.fund_code, fund_name: r.fund_name, nav: r.nav, daily_change: r.daily_change, date: r.date } });
    }

    // ========== 统计 API ==========

    // 收益总览
    if (path === '/api/stats/overview' && method === 'GET') {
      const memberId = url.searchParams.get('member_id');

      // 查询所有成员
      const { results: members } = await env.DB.prepare('SELECT * FROM members ORDER BY created_at DESC').all();
      // 查询所有账户
      const { results: accounts } = await env.DB.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all();
      // 查询所有持仓
      const { results: positions } = await env.DB.prepare('SELECT * FROM positions').all();
      // 查询最新净值快照
      const { results: snapshots } = await env.DB.prepare('SELECT * FROM market_snapshot').all();

      // 建立基金最新净值快照映射
      const snapshotMap = {};
      snapshots.forEach(m => {
        snapshotMap[m.fund_code] = m;
      });

      // 计算每个账户的统计数据
      const accountStatsMap = {};
      let totalInvested = 0;
      let totalMarketValue = 0;

      accounts.forEach(acc => {
        const accPositions = positions.filter(p => p.account_id === acc.id);
        let invested = 0;
        let marketValue = 0;

        accPositions.forEach(pos => {
          invested += pos.cost || 0;
          const snap = snapshotMap[pos.fund_code];
          // 优先用估算净值 gsz，盘中用这个；没有则用单位净值 dwjz；都没有则 fallback 到 cost
          const nav = (snap && snap.gsz) ? snap.gsz : (snap && snap.dwjz) ? snap.dwjz : null;
          if (nav && pos.quantity) {
            marketValue += pos.quantity * nav;
          } else {
            marketValue += pos.cost || 0;
          }
        });

        const profit = marketValue - invested;
        const profitRate = marketValue > 0 ? (profit / marketValue * 100) : 0;
        totalInvested += invested;
        totalMarketValue += marketValue;

        accountStatsMap[acc.id] = {
          accountId: acc.id,
          accountName: acc.name,
          channel: acc.channel,
          member_id: acc.member_id,
          invested: Number(invested.toFixed(2)),
          marketValue: Number(marketValue.toFixed(2)),
          profit: Number(profit.toFixed(2)),
          profitRate: Number(profitRate.toFixed(2)),
        };
      });

      // 按成员分组计算成员统计数据
      const memberStats = members.map(member => {
        const memberAccounts = Object.values(accountStatsMap).filter(a => a.member_id === member.id);
        const memberMarketValue = memberAccounts.reduce((sum, a) => sum + a.marketValue, 0);
        const memberInvested = memberAccounts.reduce((sum, a) => sum + a.invested, 0);
        const memberProfit = memberMarketValue - memberInvested;
        const memberProfitRate = memberMarketValue > 0 ? (memberProfit / memberMarketValue * 100) : 0;

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
      });

      // 未分配账户（member_id 为 NULL 或空）
      const unassignedAccounts = Object.values(accountStatsMap).filter(a => !a.member_id);

      const totalProfit = totalMarketValue - totalInvested;
      const totalProfitRate = totalMarketValue > 0 ? (totalProfit / totalMarketValue * 100) : 0;

      // 昨日收益 = sum((今日净值 - 昨日净值) * 持有份额)
      let totalYesterdayProfit = 0;
      positions.forEach(pos => {
        const snap = snapshotMap[pos.fund_code];
        if (snap && snap.gsz && snap.prev_nav && pos.quantity) {
          totalYesterdayProfit += (snap.gsz - snap.prev_nav) * pos.quantity;
        }
      });

      // 持有收益（不含历史累计收益）
      const totalHoldingProfit = totalProfit;
      // 累计收益（含历史卖出盈亏）
      const totalCumulativeProfit = positions.reduce((sum, pos) => sum + (pos.initial_profit || 0), 0);

      return jsonResponse({
        code: 0,
        data: {
          summary: {
            totalInvested: Number(totalInvested.toFixed(2)),
            totalMarketValue: Number((totalInvested + totalProfit).toFixed(2)),
            totalProfit: Number(totalProfit.toFixed(2)),
            totalProfitRate: Number(totalProfitRate.toFixed(2)),
            totalYesterdayProfit: Number(totalYesterdayProfit.toFixed(2)),
            totalHoldingProfit: Number(totalHoldingProfit.toFixed(2)),
            totalCumulativeProfit: Number(totalCumulativeProfit.toFixed(2)),
          },
          members: memberStats,
          accounts: Object.values(accountStatsMap),
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

        return jsonResponse({ code: 0, message: 'Migration completed' });
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
        await Promise.all(fundCodes.map(async (code) => {
          try {
            let nav = null, navDate = null, gszzl = null, prev_nav = null, name = fundNameMap[code] || '';
            let estimateNav = null, estimateDate = null, estimateChange = null;

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
            const navMatch = text2.match(/Data_netWorthTrend\s*=\s*\[([\s\S]*?)\];/);
            if (navMatch) {
              const allPoints = [...navMatch[1].matchAll(/"x":(\d+),\s*"y":([\d.]+)/g)];
              if (allPoints.length >= 2) {
                const last = allPoints[allPoints.length - 1];
                const prev = allPoints[allPoints.length - 2];
                const currentNAV = parseFloat(last[2]);
                const currentDate = new Date(parseInt(last[1]) + 8 * 3600 * 1000).toISOString().split('T')[0];
                const prevNAV = parseFloat(prev[2]);
                if (prevNAV > 0) {
                  gszzl = parseFloat(((currentNAV - prevNAV) / prevNAV * 100).toFixed(4));
                }
                nav = currentNAV;
                prev_nav = prevNAV;
                navDate = currentDate;
              }
            }

            // 解析 fundgz 实时估算（兜底：pingzhongdata 日期非今日时用这个）
            const textGz = await resGz.text();
            const gzMatch = textGz.match(/jsonpgz\((.+)\)/);
            if (gzMatch) {
              try {
                const gzData = JSON.parse(gzMatch[1]);
                if (gzData.gsz) {
                  estimateNav = parseFloat(gzData.gsz);
                  estimateChange = parseFloat(gzData.gszzl);
                  // jzrq 是 fundgz 返回的「净值日期」（即实际交易日），不是 gztime（估算发布时间）
                  // QDII基金在非交易日 fundgz 仍返回上一交易日作为 jzrq，完美满足需求
                  // gztime 格式如 "2026-04-20 15:00"，jzrq 格式如 "2026-04-17"
                  const fundGzNavDate = (gzData.jzrq || '').split(' ')[0];
                  // dwjz 是昨日官方净值（fundgz给出）
                  const officialNavYesterday = parseFloat(gzData.dwjz);
                  // gsz === dwjz 说明估算净值和官方净值相同，尚未形成新的有效估算（尤其QDII节假日）
                  // 两种情况替换：
                  // 1. fundgz jzrq 日期更新（> navDate）——fundgz 有今日新净值
                  // 2. 日期相同但 |gszzl| > 0.05% ——fundgz 产生了实质的今日估算
                  // 不替换：日期相同且 |gszzl| <= 0.05%（QDII非交易日/估算噪声）
                  const shouldReplace = navDate && fundGzNavDate && estimateNav > 0 && estimateNav !== officialNavYesterday;
                  const dateIsNewer = fundGzNavDate > navDate;
                  const hasSignificantEstimate = fundGzNavDate === navDate && estimateNav !== officialNavYesterday && Math.abs(estimateChange) > 0.05;
                  if (shouldReplace && (dateIsNewer || hasSignificantEstimate)) {
                    prev_nav = officialNavYesterday > 0 ? officialNavYesterday : prev_nav;
                    nav = estimateNav;
                    navDate = fundGzNavDate;
                    gszzl = estimateChange;
                  }
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
            `).bind(code, name, nav, nav, gszzl, navDate, navDate ? `${navDate} 00:00:00` : null, prev_nav, prev_nav, gszzl).run();
            syncResults[code] = { ok: !!nav, gsz: nav, gszzl, prev_nav, last_nav: oldLastNav, last_gszzl: oldLastGszzl, jzrq: navDate };
          } catch (e) {
            syncResults[code] = { ok: false, reason: e.message };
          }
        }));

        // 3. 更新每个持仓的昨日收益（实时计算，由 positions GET 时动态算出）
        // 昨日收益 = (本次 prev_nav − 上次 last_nav) × 份额
        for (const pos of allPositions) {
          const snap = syncResults[pos.fund_code];
          if (!snap || !snap.ok) continue;
          const shares = pos.quantity || 0;
          if (shares <= 0) continue;

          let yesterdayProfit = 0;
          if (snap.last_nav && snap.prev_nav) {
            yesterdayProfit = parseFloat(((snap.prev_nav - snap.last_nav) * shares).toFixed(4));
          }
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
        let nav = null, navDate = null, gszzl = null, prev_nav = null, name = '';

        // 同时请求 pingzhongdata + fundgz
        const [res2, resGz] = await Promise.all([
          fetch(`https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
          }),
          fetch(`https://fundgz.1234567.com.cn/js/${fundCode}.js?v=${Date.now()}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Referer': 'http://fundgz.1234567.com.cn/' }
          })
        ]);

        // 解析 pingzhongdata（官方净值）
        const text2 = await res2.text();
        const nameMatch = text2.match(/f_S_name\s*=\s*["']([^"']+)["']/);
        if (nameMatch) name = nameMatch[1];
        const navMatch = text2.match(/Data_netWorthTrend\s*=\s*\[([\s\S]*?)\];/);
        if (navMatch) {
          const allPoints = [...navMatch[1].matchAll(/"x":(\d+),\s*"y":([\d.]+)/g)];
          if (allPoints.length >= 2) {
            const last = allPoints[allPoints.length - 1];
            const prev = allPoints[allPoints.length - 2];
            const currentNAV = parseFloat(last[2]);
            const currentDate = new Date(parseInt(last[1]) + 8 * 3600 * 1000).toISOString().split('T')[0];
            const prevNAV = parseFloat(prev[2]);
            if (prevNAV > 0) {
              gszzl = parseFloat(((currentNAV - prevNAV) / prevNAV * 100).toFixed(4));
            }
            nav = currentNAV;
            prev_nav = prevNAV;
            navDate = currentDate;
          }
        }

        // 解析 fundgz 实时估算（兜底）
        const textGz = await resGz.text();
        const gzMatch = textGz.match(/jsonpgz\((.+)\)/);
        if (gzMatch) {
          try {
              const gzData = JSON.parse(gzMatch[1]);
              if (gzData.gsz) {
                const estimateNav = parseFloat(gzData.gsz);
                const estimateChange = parseFloat(gzData.gszzl);
                // jzrq 是 fundgz 返回的「净值日期」（即实际交易日），不是 gztime（估算发布时间）
                const fundGzNavDate = (gzData.jzrq || '').split(' ')[0];
                const officialNavYesterday = parseFloat(gzData.dwjz);
                // 只有当 gsz 有实质更新（gsz !== dwjz 且净值日期更新）才替换 pingzhongdata 数据
                const shouldReplace = navDate && fundGzNavDate && estimateNav > 0 && estimateNav !== officialNavYesterday;
                const dateIsNewer = fundGzNavDate > navDate;
                const hasSignificantEstimate = fundGzNavDate === navDate && estimateNav !== officialNavYesterday && Math.abs(estimateChange) > 0.05;
                if (shouldReplace && (dateIsNewer || hasSignificantEstimate)) {
                  prev_nav = officialNavYesterday > 0 ? officialNavYesterday : prev_nav;
                  nav = estimateNav;
                  navDate = fundGzNavDate;
                  gszzl = estimateChange;
                }
              }
          } catch (_) {}
        }
        
        const { results: oldSnap } = await env.DB.prepare(
          'SELECT last_nav, last_gszzl FROM market_snapshot WHERE fund_code = ?'
        ).bind(fundCode).all();
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
        `).bind(fundCode, name, nav, nav, gszzl, navDate, navDate ? `${navDate} 00:00:00` : null, prev_nav, prev_nav, gszzl).run();
        
        // 更新该基金所有持仓的昨日收益
        const { results: positions } = await env.DB.prepare(
          'SELECT id, quantity FROM positions WHERE fund_code = ?'
        ).bind(fundCode).all();
        
        for (const pos of positions) {
          let yesterdayProfit = 0;
          if (prev_nav && oldLastNav) {
            yesterdayProfit = parseFloat(((prev_nav - oldLastNav) * (pos.quantity || 0)).toFixed(4));
          }
          await env.DB.prepare(`
            UPDATE positions SET yesterday_profit = ?, updated_at = unixepoch() WHERE id = ?
          `).bind(yesterdayProfit, pos.id).run();
        }
        
        return jsonResponse({
          code: 0,
          message: nav ? 'Synced successfully' : 'Fund data not found',
          fund_code: fundCode,
          gsz: nav,
          gszzl,
          prev_nav,
          last_nav: oldLastNav,
          jzrq: navDate,
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
