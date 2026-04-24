# Cloudflare Worker + D1 部署指南

## 概述

- **Cloudflare Workers**：每天 10 万次请求免费额度，永久有效
- **Cloudflare D1**：SQLite 数据库，免费 5GB 存储
- **总成本**：0 元

---

## 第一步：创建 D1 数据库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧菜单 → **Workers & Pages** → **D1**
3. 点击 **Create database**
4. 名称填：`d4-assessment-db`
5. 创建完成后，点击 **Console** 标签
6. 把 `schema.sql` 的内容全部粘贴进去，点击执行

```sql
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  f INTEGER DEFAULT 0,
  t INTEGER DEFAULT 0,
  n INTEGER DEFAULT 0,
  s INTEGER DEFAULT 0,
  green INTEGER DEFAULT 0,
  yellow INTEGER DEFAULT 0,
  blue INTEGER DEFAULT 0,
  orange INTEGER DEFAULT 0,
  primary_color TEXT,
  primary_type TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_created_at ON results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_primary_color ON results(primary_color);
```

---

## 第二步：创建 Worker

1. 左侧菜单 → **Workers & Pages** → **Create application**
2. 点击 **Create Worker**
3. Worker 名称填：`d4-assessment-api`（这个名称会出现在 URL 中）
4. 点击 **Deploy**（先部署空 Worker）
5. 部署完成后，点击 **Edit code**

### 粘贴代码

把 `worker.js` 的全部内容粘贴到代码编辑器中，替换原有内容。

### 绑定 D1 数据库

1. 在代码编辑器左侧，点击 **Settings** 标签
2. 找到 **Variables and Secrets** 下面的 **Bindings**
3. 点击 **Add** → 选择 **D1 database binding**
4. 配置：
   - **Variable name**：`DB`（必须大写，代码里用的 `env.DB`）
   - **Database**：选择刚才创建的 `d4-assessment-db`
5. 点击 **Deploy** 保存

---

## 第三步：设置环境变量

在 Worker 的 **Settings** → **Variables and Secrets** 中添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `FEISHU_WEBHOOK` | `https://open.feishu.cn/open-apis/bot/v2/hook/...` | 你的飞书群机器人地址 |
| `ADMIN_KEY` | 你自己设一个密码，如 `your-secret-123` | 管理页面访问密码 |

点击 **Deploy** 保存。

---

## 第四步：获取 Worker URL

1. 回到 Worker 的 **Triggers** 标签
2. 找到 **Custom Domains** 或默认域名
3. 默认 URL 格式：`https://d4-assessment-api.你的用户名.workers.dev`
4. 复制这个 URL

---

## 第五步：更新前端代码

把 Worker URL 填入 `index.html` 第 13 行：

```javascript
const CF_API = 'https://d4-assessment-api.你的用户名.workers.dev';
```

然后推送代码到 GitHub：

```bash
git add index.html cloudflare-worker/
git commit -m "feat: 接入 Cloudflare Worker + D1 数据收集"
git push
```

---

## 第六步：验证

### 测试数据提交
1. 打开测评页面（GitHub Pages）
2. 完成一次测评
3. 查看飞书群，确认收到通知
4. 打开管理页面验证数据是否入库：
   ```
   https://d4-assessment-api.你的用户名.workers.dev/admin?key=your-secret-123
   ```

### 管理页面功能
- 查看所有测评数据（表格形式）
- 查看统计图表（各色彩人数占比）
- 点击「下载 CSV」导出 Excel

---

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/submit` | 提交测评结果（公开） |
| GET | `/api/results?key=xxx` | JSON 查询所有结果（需密码） |
| GET | `/api/export?key=xxx` | 下载 CSV 文件（需密码） |
| GET | `/admin?key=xxx` | 网页管理后台（需密码） |
| GET | `/health` | 健康检查 |

---

## 后续复用

如果你有新的测评/表单需求：
1. 同一个 Worker 里加新路由（如 `/api/survey2/submit`）
2. 同一个 D1 数据库里建新表
3. **成本始终为 0**
