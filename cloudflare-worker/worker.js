/**
 * 4D天性测评 - Cloudflare Worker 后端
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (path === '/health') {
      return json({ status: 'ok', time: new Date().toISOString() });
    }

    if (path === '/api/submit' && request.method === 'POST') {
      let data;
      try { data = await request.json(); } catch (e) {
        return json({ success: false, error: 'Invalid JSON' }, 400);
      }
      const result = await saveResult(env.DB, data);
      if (result.error) return json({ success: false, error: result.error }, 500);
      return json({ success: true, message: 'Saved' });
    }

    if (path === '/api/import' && request.method === 'POST') {
      if (!checkAdminKey(url, env, request)) return json({ error: 'Unauthorized' }, 401);
      let data;
      try { data = await request.json(); } catch (e) {
        return json({ success: false, error: 'Invalid JSON' }, 400);
      }
      const items = data.items || [];
      let inserted = 0;
      for (const item of items) {
        item.source = 'manual';
        const result = await saveResult(env.DB, item);
        if (!result.error) inserted++;
      }
      return json({ success: true, inserted, total: items.length });
    }

    if (path === '/api/results') {
      if (!checkAdminKey(url, env, request)) return json({ error: 'Unauthorized' }, 401);
      try {
        const { results } = await env.DB.prepare('SELECT * FROM results ORDER BY created_at DESC').all();
        return json(results);
      } catch (e) { return json({ error: 'Database error' }, 500); }
    }

    if (path === '/api/export') {
      if (!checkAdminKey(url, env, request)) return new Response('Unauthorized', { status: 401 });
      try {
        const { results } = await env.DB.prepare('SELECT * FROM results ORDER BY created_at DESC').all();
        const csv = buildCSV(results);
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="4d_results_${new Date().toISOString().slice(0,10)}.csv"`,
          },
        });
      } catch (e) { return new Response('Error: ' + e.message, { status: 500 }); }
    }

    // ==================== 管理页面（GET/POST）====================
    if (path === '/admin' || path === '/admin/') {
      const key = getAdminKey(url, env, request);

      // POST 登录
      if (request.method === 'POST') {
        let postKey = '';
        try {
          const formData = await request.formData();
          postKey = formData.get('key') || '';
        } catch (e) {}

        if (!postKey || postKey !== env.ADMIN_KEY) {
          return new Response(adminLoginHTML('密码错误'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        // 验证通过，设置 cookie 并重定向到管理页面
        return new Response('', {
          status: 302,
          headers: {
            'Location': '/admin',
            'Set-Cookie': 'admin_key=' + encodeURIComponent(postKey) + '; Path=/admin; Max-Age=86400; SameSite=Lax',
          },
        });
      }

      // GET 请求：检查 cookie 或 URL key
      if (!key || key !== env.ADMIN_KEY) {
        return new Response(adminLoginHTML(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      try {
        const { results } = await env.DB.prepare('SELECT * FROM results ORDER BY created_at DESC').all();
        return new Response(adminHTML(results), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Set-Cookie': 'admin_key=' + encodeURIComponent(key) + '; Path=/admin; Max-Age=86400; SameSite=Lax',
          },
        });
      } catch (e) {
        return new Response(`<h1>Error</h1><p>${e.message}</p>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 500 });
      }
    }

    return json({ error: 'Not found' }, 404);
  }
};

async function saveResult(db, data) {
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
  const source = data.source || 'web';
  try {
    await db.prepare(`
      INSERT INTO results (name, f, t, n, s, green, yellow, blue, orange, primary_color, primary_type, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(name, f, t, n, s, g, y, b, o, primaryColor, primaryType, source).run();
    return { success: true };
  } catch (e) { console.error('D1 insert error:', e); return { error: e.message }; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    }
  });
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : '';
}

function getAdminKey(url, env, request) {
  return url.searchParams.get('key') || request.headers.get('X-Admin-Key') || getCookie(request, 'admin_key');
}

function checkAdminKey(url, env, request) {
  const key = getAdminKey(url, env, request);
  return key && key === env.ADMIN_KEY;
}

function buildCSV(rows) {
  const headers = ['ID', '姓名', '情感F', '逻辑T', '直觉N', '感觉S', '绿色', '黄色', '蓝色', '橙色', '主导色彩', '主导类型', '来源', '提交时间'];
  let csv = '\uFEFF' + headers.join(',') + '\n';
  for (const r of rows) {
    csv += [r.id, csvQuote(r.name), r.f, r.t, r.n, r.s, r.green, r.yellow, r.blue, r.orange, csvQuote(r.primary_color), csvQuote(r.primary_type), csvQuote(r.source), r.created_at].join(',') + '\n';
  }
  return csv;
}

function csvQuote(s) { if (!s) return ''; if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"'; return s; }
function escapeHtml(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function formatTime(s) { if (!s) return '-'; try { const d = new Date(s); return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return s; } }

function sourceBadge(source) {
  if (source === 'web') return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#e8f5ee;color:#2d9d5d;font-size:11px;font-weight:600">浏览器</span>';
  if (source === 'manual') return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#faf3d9;color:#c99500;font-size:11px;font-weight:600">飞书导入</span>';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#e8e8ed;color:#666;font-size:11px;font-weight:600">-</span>';
}

function adminLoginHTML(errorMsg) {
  const errorHtml = errorMsg ? `<p style="color:#c45c5c;font-size:13px;margin-bottom:12px">${escapeHtml(errorMsg)}</p>` : '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>4D测评管理 - 登录</title>
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
  ${errorHtml}
  <form method="POST" action="/admin">
    <input type="password" name="key" placeholder="访问密码" onkeydown="if(event.key==='Enter')this.form.submit()">
    <button type="submit">进入</button>
  </form>
</div>
</body>
</html>`;
}

function adminHTML(rows) {
  const total = rows.length;
  const colorMap = { '绿色': 'green', '黄色': 'yellow', '蓝色': 'blue', '橙色': 'orange' };
  const colorCount = { green: 0, yellow: 0, blue: 0, orange: 0 };
  for (const r of rows) { const c = (r.primary_color || '').trim(); const k = colorMap[c]; if (k && colorCount[k] !== undefined) colorCount[k]++; }

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
    tableRows += `<tr><td>${r.id}</td><td><strong>${escapeHtml(r.name)}</strong></td><td><span class="badge" style="background:${color}20;color:${color}">${escapeHtml(r.primary_color || '-')}</span></td><td>${r.f}</td><td>${r.t}</td><td>${r.n}</td><td>${r.s}</td><td>${r.green}</td><td>${r.yellow}</td><td>${r.blue}</td><td>${r.orange}</td><td>${sourceBadge(r.source)}</td><td class="time">${formatTime(r.created_at)}</td></tr>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>4D测评数据管理</title>
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
.btn-success{background:#2d9d5d;color:#fff}
.btn:hover{opacity:.88}
.stats{background:#fff;border-radius:16px;padding:24px;margin-bottom:20px;box-shadow:0 2px 12px rgba(0,0,0,0.04)}
.stats h2{font-size:16px;margin-bottom:16px;color:#5e5a66}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.stat-item{background:#f8f8fa;border-radius:10px;padding:14px 16px}
.stat-bar{height:4px;border-radius:2px;margin-bottom:10px;transition:width .6s ease}
.stat-text{display:flex;justify-content:space-between;font-size:13px}
.import-box{background:#fff;border-radius:16px;padding:24px;margin-bottom:20px;box-shadow:0 2px 12px rgba(0,0,0,0.04)}
.import-box h2{font-size:16px;margin-bottom:12px;color:#5e5a66}
.import-box p{color:#888;font-size:13px;margin-bottom:12px}
textarea{width:100%;padding:12px;border-radius:10px;border:1.5px solid #eee;font-size:13px;resize:vertical;outline:none;font-family:inherit;line-height:1.7}
textarea:focus{border-color:#a090b8}
.import-actions{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
#previewTable{margin-top:16px;overflow-x:auto}
#importStatus{font-size:13px;margin-top:8px;min-height:20px}
.table-wrap{background:#fff;border-radius:16px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,0.04);overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #eee;white-space:nowrap}
th{background:#f8f8fa;font-weight:600;color:#555;position:sticky;top:0}
tr:hover{background:#f8f8fa}
.badge{padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600}
.time{color:#888;font-size:12px}
.empty{text-align:center;color:#999;padding:60px 0}
@media(max-width:640px){.table-wrap{padding:12px}th,td{padding:8px 10px;font-size:12px}}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>4D天性测评数据管理</h1>
    <div class="actions">
      <button class="btn btn-primary" onclick="downloadCSV()">下载 CSV</button>
      <button class="btn btn-secondary" onclick="location.reload()">刷新</button>
    </div>
  </header>

  <div class="import-box">
    <h2>从飞书消息导入</h2>
    <p>把飞书群里的测评消息批量粘贴到下方（多条消息之间至少空一行），解析确认后导入数据库。</p>
    <textarea id="importArea" rows="8" placeholder="粘贴飞书群消息..."></textarea>
    <div class="import-actions">
      <button class="btn btn-secondary" onclick="parseImport()">解析预览</button>
      <button class="btn btn-success" onclick="doImport()">确认导入</button>
    </div>
    <div id="importStatus"></div>
    <div id="previewTable"></div>
  </div>

  <div class="stats">
    <h2>数据统计（共 ${total} 人）</h2>
    <div class="stat-grid">${statsHTML}</div>
  </div>

  <div class="table-wrap">
    ${rows.length === 0 ? '<div class="empty">暂无数据</div>' : `
    <table>
      <thead><tr><th>ID</th><th>姓名</th><th>主导色彩</th><th>F</th><th>T</th><th>N</th><th>S</th><th>绿</th><th>黄</th><th>蓝</th><th>橙</th><th>来源</th><th>提交时间</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>`}
  </div>
</div>

<script>
function getCookie(name) {
  var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

var importItems = [];
var apiKey = getCookie('admin_key');

function parseImport() {
  var text = document.getElementById('importArea').value;
  var lines = text.split('\n');

  // 按标题分块（不按空行，避免同一条消息被劈开）
  var blocks = [];
  var current = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (line.indexOf('【4D天性测评结果') !== -1) {
      if (current) blocks.push(current);
      current = [];
    }
    if (current) current.push(line);
  }
  if (current) blocks.push(current);

  importItems = [];
  for (var i = 0; i < blocks.length; i++) {
    var blockLines = blocks[i];
    var item = {};

    for (var j = 0; j < blockLines.length; j++) {
      var line = blockLines[j];
      var colon = line.indexOf('：');
      if (colon === -1) colon = line.indexOf(':');

      if (line.indexOf('姓名') !== -1 && colon > -1) {
        item.username = line.substring(colon + 1).trim();
      }
      if (line.indexOf('主导色彩') !== -1 && colon > -1) {
        item.mainColor = line.substring(colon + 1).split('（')[0].trim();
      }
      if (line.indexOf('绿色') !== -1 && line.indexOf('培养型') !== -1 && colon > -1) {
        item.green = parseInt(line.substring(colon + 1)) || 0;
      }
      if (line.indexOf('黄色') !== -1 && line.indexOf('包融型') !== -1 && colon > -1) {
        item.yellow = parseInt(line.substring(colon + 1)) || 0;
      }
      if (line.indexOf('蓝色') !== -1 && line.indexOf('展望型') !== -1 && colon > -1) {
        item.blue = parseInt(line.substring(colon + 1)) || 0;
      }
      if (line.indexOf('橙色') !== -1 && line.indexOf('指导型') !== -1 && colon > -1) {
        item.orange = parseInt(line.substring(colon + 1)) || 0;
      }
      if (line.indexOf('情感') !== -1 && line.indexOf('F') !== -1 && colon > -1) {
        item.F = parseInt(line.substring(colon + 1)) || 0;
      }
      if (line.indexOf('逻辑') !== -1 && line.indexOf('T') !== -1 && colon > -1) {
        item.T = parseInt(line.substring(colon + 1)) || 0;
      }
      if (line.indexOf('直觉') !== -1 && line.indexOf('N') !== -1 && colon > -1) {
        item.N = parseInt(line.substring(colon + 1)) || 0;
      }
      if (line.indexOf('感觉') !== -1 && line.indexOf('S') !== -1 && colon > -1) {
        item.S = parseInt(line.substring(colon + 1)) || 0;
      }
    }

    if (item.username && item.mainColor) {
      item.scores = { green: item.green || 0, yellow: item.yellow || 0, blue: item.blue || 0, orange: item.orange || 0 };
      importItems.push(item);
    }
  }

  var status = document.getElementById('importStatus');
  var preview = document.getElementById('previewTable');

  if (importItems.length === 0) {
    status.textContent = '未解析到任何测评结果';
    status.style.color = '#c45c5c';
    preview.innerHTML = '';
    return;
  }

  status.textContent = '共解析到 ' + importItems.length + ' 条，点击「确认导入」写入数据库';
  status.style.color = '#2d9d5d';

  var html = '<table><thead><tr><th>姓名</th><th>主导色彩</th><th>F</th><th>T</th><th>N</th><th>S</th><th>绿</th><th>黄</th><th>蓝</th><th>橙</th></tr></thead><tbody>';
  for (var j = 0; j < importItems.length; j++) {
    var it = importItems[j];
    html += '<tr><td>' + (it.username || '-') + '</td><td>' + (it.mainColor || '-') + '</td><td>' + (it.F || 0) + '</td><td>' + (it.T || 0) + '</td><td>' + (it.N || 0) + '</td><td>' + (it.S || 0) + '</td><td>' + (it.green || 0) + '</td><td>' + (it.yellow || 0) + '</td><td>' + (it.blue || 0) + '</td><td>' + (it.orange || 0) + '</td></tr>';
  }
  html += '</tbody></table>';
  preview.innerHTML = html;
}

function doImport() {
  if (importItems.length === 0) { alert('请先点击「解析预览」'); return; }
  var status = document.getElementById('importStatus');
  status.textContent = '正在导入...';
  status.style.color = '#888';

  fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': apiKey },
    body: JSON.stringify({ items: importItems })
  }).then(function(res){return res.json();})
  .then(function(data){
    if (data.success) {
      status.textContent = '导入成功：' + data.inserted + '/' + data.total + ' 条';
      status.style.color = '#2d9d5d';
      setTimeout(function(){location.reload();}, 1500);
    } else {
      status.textContent = '导入失败：' + (data.error || '未知错误');
      status.style.color = '#c45c5c';
    }
  }).catch(function(err){
    status.textContent = '导入失败：' + err.message;
    status.style.color = '#c45c5c';
  });
}

function downloadCSV() {
  fetch('/api/export', { headers: { 'X-Admin-Key': apiKey } })
  .then(function(res){return res.blob();})
  .then(function(blob){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '4d_results_' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}
</script>
</body>
</html>`;
}
