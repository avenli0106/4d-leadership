/**
 * 4D天性测评 - Cloudflare Worker 后端
 * 
 * 功能：
 * - POST /api/submit    接收测评结果，存入 D1，推送飞书
 * - GET  /api/results   查询所有结果（JSON）
 * - GET  /admin         内置管理页面（查看数据+下载CSV）
 * - GET  /api/export    直接下载 CSV
 * - GET  /health        健康检查
 * 
 * 环境变量（在 Cloudflare 控制台设置）：
 * - FEISHU_WEBHOOK : 飞书群机器人 Webhook URL
 * - ADMIN_KEY      : 管理页面访问密码
 * 
 * D1 绑定：
 * - 变量名：DB
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 支持（GitHub Pages 跨域调用）
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ==================== 健康检查 ====================
    if (path === '/health') {
      return json({ status: 'ok', time: new Date().toISOString() });
    }

    // ==================== 提交测评结果 ====================
    if (path === '/api/submit' && request.method === 'POST') {
      let data;
      try {
        data = await request.json();
      } catch (e) {
        return json({ success: false, error: 'Invalid JSON' }, 400);
      }

      const name = (data.username || '匿名').trim().slice(0, 50);
      const f = parseInt(data.F) || 0;
      const t = parseInt(data.T) || 0;
      const n = parseInt(data.N) || 0;
      const s = parseInt(data.S) || 0;
      const scores = data.scores || {};
      const g = parseInt(scores.green) || (f + n);
      const y = parseInt(scores.yellow) || (f + s);
      const b = parseInt(scores.blue) || (t + n);
      const o = parseInt(scores.orange) || (t + s);
      const primaryColor = (data.mainColor || '').split('·')[0]?.trim() || '';
      const primaryType = (data.mainColor || '').split('·')[1]?.trim() || '';
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      const ua = request.headers.get('user-agent')?.slice(0, 200) || '';

      try {
        // 写入 D1
        await env.DB.prepare(`
          INSERT INTO results 
          (name, f, t, n, s, green, yellow, blue, orange, primary_color, primary_type, ip, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(name, f, t, n, s, g, y, b, o, primaryColor, primaryType, ip, ua).run();
      } catch (e) {
        console.error('D1 insert error:', e);
        return json({ success: false, error: 'Database error' }, 500);
      }

      // 异步推送飞书（不阻塞响应）
      if (env.FEISHU_WEBHOOK) {
        ctx.waitUntil(
          sendFeishu(env.FEISHU_WEBHOOK, { name, f, t, n, s, g, y, b, o, primaryColor, primaryType })
        );
      }

      return json({ success: true, message: 'Saved' });
    }

    // ==================== 查询结果（JSON）====================
    if (path === '/api/results') {
      if (!checkAdminKey(url, env)) {
        return json({ error: 'Unauthorized' }, 401);
      }
      try {
        const { results } = await env.DB.prepare(
          'SELECT * FROM results ORDER BY created_at DESC'
        ).all();
        return json(results);
      } catch (e) {
        return json({ error: 'Database error' }, 500);
      }
    }

    // ==================== CSV 导出 ====================
    if (path === '/api/export') {
      if (!checkAdminKey(url, env)) {
        return new Response('Unauthorized', { status: 401 });
      }
      try {
        const { results } = await env.DB.prepare(
          'SELECT * FROM results ORDER BY created_at DESC'
        ).all();
        const csv = buildCSV(results);
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="4d_results_${new Date().toISOString().slice(0,10)}.csv"`,
          },
        });
      } catch (e) {
        return new Response('Error: ' + e.message, { status: 500 });
      }
    }

    // ==================== 管理页面 ====================
    if (path === '/admin' || path === '/admin/') {
      if (!checkAdminKey(url, env)) {
        return new Response(adminLoginHTML(), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      try {
        const { results } = await env.DB.prepare(
          'SELECT * FROM results ORDER BY created_at DESC'
        ).all();
        return new Response(adminHTML(results, url.searchParams.get('key')), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      } catch (e) {
        return new Response(`<h1>Error</h1><p>${e.message}</p>`, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          status: 500,
        });
      }
    }

    // 404
    return json({ error: 'Not found' }, 404);
  }
};

// ==================== 工具函数 ====================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function checkAdminKey(url, env) {
  const key = url.searchParams.get('key');
  return key && key === env.ADMIN_KEY;
}

async function sendFeishu(webhook, data) {
  const text = `【4D天性测评结果】\n` +
    `姓名：${data.name}\n` +
    `主导色彩：${data.primaryColor}·${data.primaryType}\n\n` +
    `四项得分：\n` +
    `绿色（培养型）：${data.g}分\n` +
    `黄色（包融型）：${data.y}分\n` +
    `蓝色（展望型）：${data.b}分\n` +
    `橙色（指导型）：${data.o}分\n\n` +
    `基础维度：\n` +
    `情感(F)：${data.f} | 逻辑(T)：${data.t}\n` +
    `直觉(N)：${data.n} | 感觉(S)：${data.s}`;

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text } }),
    });
  } catch (e) {
    console.error('Feishu push failed:', e);
  }
}

function buildCSV(rows) {
  const headers = ['ID', '姓名', '情感F', '逻辑T', '直觉N', '感觉S', '绿色', '黄色', '蓝色', '橙色', '主导色彩', '主导类型', 'IP', '提交时间'];
  let csv = '\uFEFF' + headers.join(',') + '\n';
  for (const r of rows) {
    csv += [
      r.id, csvQuote(r.name), r.f, r.t, r.n, r.s,
      r.green, r.yellow, r.blue, r.orange,
      csvQuote(r.primary_color), csvQuote(r.primary_type),
      r.ip, r.created_at
    ].join(',') + '\n';
  }
  return csv;
}

function csvQuote(s) {
  if (!s) return '';
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ==================== 管理页面 HTML ====================

function adminLoginHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>4D测评管理 - 登录</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:linear-gradient(180deg,#e8e0f0 0%,#f3e6ea 50%,#eef3ec 100%);min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:rgba(255,255,255,0.7);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.6);border-radius:24px;padding:40px 36px;box-shadow:0 8px 32px rgba(0,0,0,0.06);width:100%;max-width:380px;text-align:center}
h1{font-size:22px;margin-bottom:8px;color:#2d2a33}
p{color:#5e5a66;font-size:14px;margin-bottom:24px}
input{width:100%;padding:14px 16px;border-radius:14px;border:1.5px solid rgba(0,0,0,0.1);font-size:15px;outline:none;margin-bottom:16px;background:rgba(255,255,255,0.5)}
input:focus{border-color:#a090b8}
button{width:100%;padding:14px;border-radius:14px;border:none;background:#2d2a33;color:#fff;font-size:15px;cursor:pointer;transition:opacity .2s}
button:hover{opacity:.88}
</style>
</head>
<body>
<div class="card">
  <h1>4D 测评数据管理</h1>
  <p>请输入访问密码</p>
  <input type="password" id="key" placeholder="访问密码" onkeydown="if(event.key==='Enter')login()">
  <button onclick="login()">进入</button>
</div>
<script>
function login(){var k=document.getElementById('key').value;if(!k)return;location.href=location.pathname+'?key='+encodeURIComponent(k);}
</script>
</body>
</html>`;
}

function adminHTML(rows, key) {
  // 统计
  const total = rows.length;
  const colorCount = { green: 0, yellow: 0, blue: 0, orange: 0 };
  for (const r of rows) {
    const c = (r.primary_color || '').trim();
    if (colorCount[c] !== undefined) colorCount[c]++;
  }

  const colorNames = { green: '绿色·培养型', yellow: '黄色·包融型', blue: '蓝色·展望型', orange: '橙色·指导型' };
  const colorHex = { green: '#2d9d5d', yellow: '#c99500', blue: '#2563eb', orange: '#d96e1e' };

  let statsHTML = '';
  for (const c of ['green', 'yellow', 'blue', 'orange']) {
    const pct = total > 0 ? Math.round(colorCount[c] / total * 100) : 0;
    statsHTML += `<div class="stat-item"><div class="stat-bar" style="background:${colorHex[c]};width:${pct}%"></div><div class="stat-text"><span style="color:${colorHex[c]};font-weight:600">${colorNames[c]}</span><span>${colorCount[c]}人 (${pct}%)</span></div></div>`;
  }

  let tableRows = '';
  for (const r of rows) {
    const c = (r.primary_color || '').trim();
    const color = colorHex[c] || '#888';
    tableRows += `<tr>
      <td>${r.id}</td>
      <td><strong>${escapeHtml(r.name)}</strong></td>
      <td><span class="badge" style="background:${color}20;color:${color}">${escapeHtml(r.primary_color || '-')}</span></td>
      <td>${r.f}</td><td>${r.t}</td><td>${r.n}</td><td>${r.s}</td>
      <td>${r.green}</td><td>${r.yellow}</td><td>${r.blue}</td><td>${r.orange}</td>
      <td class="time">${formatTime(r.created_at)}</td>
    </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>4D测评数据管理</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#f5f5f7;color:#2d2a33;line-height:1.6;padding:20px}
.container{max-width:1200px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px}
h1{font-size:22px}
.actions{display:flex;gap:10px;flex-wrap:wrap}
.btn{padding:10px 20px;border-radius:10px;border:none;font-size:14px;cursor:pointer;transition:opacity .2s;text-decoration:none;display:inline-block}
.btn-primary{background:#2d2a33;color:#fff}
.btn-secondary{background:#e8e8ed;color:#333}
.btn:hover{opacity:.88}

.stats{background:#fff;border-radius:16px;padding:24px;margin-bottom:20px;box-shadow:0 2px 12px rgba(0,0,0,0.04)}
.stats h2{font-size:16px;margin-bottom:16px;color:#5e5a66}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.stat-item{background:#f8f8fa;border-radius:10px;padding:14px 16px}
.stat-bar{height:4px;border-radius:2px;margin-bottom:10px;transition:width .6s ease}
.stat-text{display:flex;justify-content:space-between;font-size:13px}
.total{font-size:13px;color:#888;margin-top:12px}

.table-wrap{background:#fff;border-radius:16px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,0.04);overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #eee;white-space:nowrap}
th{background:#f8f8fa;font-weight:600;color:#555;position:sticky;top:0}
tr:hover{background:#f8f8fa}
.badge{padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600}
.time{color:#888;font-size:12px}
.empty{text-align:center;color:#999;padding:60px 0}

@media(max-width:640px){
  .table-wrap{padding:12px}
  th,td{padding:8px 10px;font-size:12px}
}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>4D天性测评数据管理</h1>
    <div class="actions">
      <a class="btn btn-primary" href="/api/export?key=${encodeURIComponent(key || '')}">下载 CSV</a>
      <button class="btn btn-secondary" onclick="location.reload()">刷新</button>
    </div>
  </header>

  <div class="stats">
    <h2>数据统计（共 ${total} 人）</h2>
    <div class="stat-grid">${statsHTML}</div>
  </div>

  <div class="table-wrap">
    ${rows.length === 0 ? '<div class="empty">暂无数据</div>' : `
    <table>
      <thead>
        <tr>
          <th>ID</th><th>姓名</th><th>主导色彩</th>
          <th>F</th><th>T</th><th>N</th><th>S</th>
          <th>绿</th><th>黄</th><th>蓝</th><th>橙</th>
          <th>提交时间</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>`}
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(s) {
  if (!s) return '-';
  try {
    const d = new Date(s);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return s; }
}
