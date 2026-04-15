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
    // 健康检查
    if (path === '/health' || path === '/api/health') {
      return jsonResponse({ code: 0, message: 'ok', data: { service: 'Investment API', version: '3.0.0', db: 'investment-db' } });
    }

    // ========== 成员 API ==========

    // 获取成员列表
    if (path === '/api/members' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM members ORDER BY created_at DESC').all();
      const members = results.map(r => ({
        id: r.id,
        name: r.name,
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

      await env.DB.prepare(
        'INSERT INTO members (id, name) VALUES (?, ?)'
      ).bind(id, name).run();

      return jsonResponse({ code: 0, data: { id, name } });
    }

    // 更新成员
    if (path.match(/^\/api\/members\/[\w-]+$/) && method === 'PUT') {
      const id = path.split('/').pop();
      const body = await context.request.json();
      const name = body.name;
      const remark = body.remark;

      const fields = [];
      const values = [];
      if (name !== undefined) { fields.push('name = ?'); values.push(name); }
      if (remark !== undefined) { fields.push('remark = ?'); values.push(remark); }

      if (fields.length > 0) {
        values.push(id);
        await env.DB.prepare(`UPDATE members SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`).bind(...values).run();
      }

      const { results } = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(id).all();
      if (results.length === 0) {
        return jsonResponse({ code: 404, message: 'Member not found' }, 404);
      }
      const r = results[0];
      return jsonResponse({ code: 0, data: { id: r.id, name: r.name, remark: r.remark || '' } });
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
      let stmt;
      if (accountId) {
        stmt = env.DB.prepare('SELECT * FROM positions WHERE account_id = ? ORDER BY created_at DESC').bind(accountId);
      } else {
        stmt = env.DB.prepare('SELECT * FROM positions ORDER BY created_at DESC');
      }
      const { results } = await stmt.all();
      const positions = results.map(r => ({
        id: r.id,
        '账户ID': r.account_id,
        '所属账户': r.account_name || '',
        '基金代码': r.fund_code,
        '基金名称': r.fund_name,
        '持有份额': r.quantity,
        '持有金额': r.amount || 0,
        '当前收益': r.current_profit || 0,
        '分红方式': r.dividend_method || '红利再投',
        created_at: r.created_at,
      }));
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
      const amount = body.amount || 0;
      const current_profit = body.currentProfit || body.current_profit || 0;
      const dividend_method = body.dividendMethod || body.dividend_method || '红利再投';

      await env.DB.prepare(
        'INSERT INTO positions (id, account_id, fund_code, fund_name, quantity, amount, current_profit, dividend_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, account_id, fund_code, fund_name || '', shares, amount, current_profit, dividend_method).run();

      return jsonResponse({ code: 0, data: {
        id,
        '账户ID': account_id,
        '所属账户': '',
        '基金代码': fund_code,
        '基金名称': fund_name || '',
        '持有份额': shares,
        '持有金额': amount,
        '当前收益': current_profit,
        '分红方式': dividend_method,
      }});
    }

    // 更新持仓
    if (path.match(/^\/api\/positions\/[\w-]+$/) && method === 'PUT') {
      const id = path.split('/').pop();
      const body = await context.request.json();

      const fund_name = body.fundName || body.fund_name;
      const shares = body.shares || body.quantity;
      const amount = body.amount;
      const current_profit = body.currentProfit || body.current_profit;
      const dividend_method = body.dividendMethod || body.dividend_method;

      const fields = [];
      const values = [];
      if (fund_name !== undefined) { fields.push('fund_name = ?'); values.push(fund_name); }
      if (shares !== undefined) { fields.push('quantity = ?'); values.push(shares); }
      if (amount !== undefined) { fields.push('amount = ?'); values.push(amount); }
      if (current_profit !== undefined) { fields.push('current_profit = ?'); values.push(current_profit); }
      if (dividend_method !== undefined) { fields.push('dividend_method = ?'); values.push(dividend_method); }

      if (fields.length > 0) {
        values.push(id);
        await env.DB.prepare(`UPDATE positions SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`).bind(...values).run();
      }

      const { results } = await env.DB.prepare('SELECT * FROM positions WHERE id = ?').bind(id).all();
      if (results.length === 0) {
        return jsonResponse({ code: 404, message: 'Position not found' }, 404);
      }
      const r = results[0];
      return jsonResponse({ code: 0, data: {
        id: r.id,
        '账户ID': r.account_id,
        '所属账户': '',
        '基金代码': r.fund_code,
        '基金名称': r.fund_name,
        '持有份额': r.quantity,
        '持有金额': r.amount,
        '当前收益': r.current_profit,
        '分红方式': r.dividend_method,
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

      // 构建账户查询
      let accountsQuery = 'SELECT * FROM accounts';
      let positionsQuery = 'SELECT * FROM positions';
      if (memberId) {
        accountsQuery += ' WHERE member_id = ?';
        positionsQuery += ' WHERE account_id IN (SELECT id FROM accounts WHERE member_id = ?)';
      }

      const { results: accounts } = memberId
        ? await env.DB.prepare(accountsQuery).bind(memberId).all()
        : await env.DB.prepare(accountsQuery).all();
      const { results: positions } = memberId
        ? await env.DB.prepare(positionsQuery).bind(memberId).all()
        : await env.DB.prepare(positionsQuery).all();
      const { results: markets } = await env.DB.prepare('SELECT * FROM market ORDER BY date DESC').all();

      // 建立基金最新行情映射
      const marketMap = {};
      markets.forEach(m => {
        if (!marketMap[m.fund_code] || m.date > marketMap[m.fund_code].date) {
          marketMap[m.fund_code] = m;
        }
      });

      let totalInvested = 0;
      let totalMarketValue = 0;

      const accountStats = accounts.map(acc => {
        const accPositions = positions.filter(p => p.account_id === acc.id);
        let invested = 0;
        let marketValue = 0;

        accPositions.forEach(pos => {
          invested += pos.amount || 0;
          const marketData = marketMap[pos.fund_code];
          if (marketData && marketData.nav && pos.quantity) {
            marketValue += pos.quantity * marketData.nav;
          } else {
            marketValue += pos.amount || 0;
          }
        });

        const profit = marketValue - invested;
        const profitRate = invested > 0 ? (profit / invested * 100) : 0;
        totalInvested += invested;
        totalMarketValue += marketValue;

        return {
          accountId: acc.id,
          accountName: acc.name,
          channel: acc.channel,
          invested: Number(invested.toFixed(2)),
          marketValue: Number(marketValue.toFixed(2)),
          profit: Number(profit.toFixed(2)),
          profitRate: Number(profitRate.toFixed(2)),
        };
      });

      const totalProfit = totalMarketValue - totalInvested;
      const totalProfitRate = totalInvested > 0 ? (totalProfit / totalInvested * 100) : 0;

      return jsonResponse({
        code: 0,
        data: {
          summary: {
            totalInvested: Number(totalInvested.toFixed(2)),
            totalMarketValue: Number(totalMarketValue.toFixed(2)),
            totalProfit: Number(totalProfit.toFixed(2)),
            totalProfitRate: Number(totalProfitRate.toFixed(2)),
          },
          accounts: accountStats,
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

    // 非 API 路径交给静态文件处理
    return context.next();
  } catch (error) {
    return jsonResponse({ code: 500, message: error.message }, 500);
  }
}
