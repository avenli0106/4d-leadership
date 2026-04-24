# 4D天性测评 - NAS 数据收集服务

部署在绿联云 NAS 上的全自动数据收集后端。测评结果通过 Cloudflare Tunnel 公网地址接收，自动写入 NAS 本地的 CSV 文件。

---

## 部署步骤（约 10 分钟）

### 第一步：注册 Cloudflare 并创建 Tunnel

1. 打开 [dash.cloudflare.com](https://dash.cloudflare.com)，用邮箱注册（免费）
2. 登录后，左侧菜单找到 **Zero Trust** → **Networks** → **Tunnels**
3. 点击 **Create a tunnel**
4. 选择 **Cloudflared**，点击 **Next**
5. 输入 Tunnel 名称，比如 `nas-4d`，点击 **Save tunnel**
6. 在 **Choose your environment** 页面，选择 **Docker**
7. **复制那串 token**（看起来像这样：`eyJhIjoiNTNhM...`），保存好，下一步要用
8. 在 **Public Hostnames** 页面，添加一条路由：
   - **Subdomain**: 填 `4d`（或你喜欢的名字）
   - **Domain**: 选择你的域名（如果没有，Cloudflare 会给你一个 `*.workers.dev` 的免费子域名）
   - **Type**: HTTP
   - **URL**: 填 `http://api:5000`（注意：因为 tunnel 和 api 在同一个 Docker 网络里，可以直接用服务名访问）
9. 点击 **Save hostname**

你的公网地址就是：`https://4d.你的域名.workers.dev`

### 第二步：把部署包上传到绿联云 NAS

1. 在 NAS 上创建一个文件夹，比如 `/docker/4d-collector/`
2. 把本目录下的所有文件（`docker-compose.yml`、`Dockerfile`、`requirements.txt`、`app.py`）上传到这个文件夹
3. 在这个文件夹里创建一个 `data` 子文件夹（放 CSV 数据用）

### 第三步：配置环境变量并启动

1. 在 `/docker/4d-collector/` 文件夹里创建一个 `.env` 文件，内容如下：
   ```
   TUNNEL_TOKEN=你刚才复制的token
   ```
2. 打开绿联云的 **终端/SSH**，进入该文件夹：
   ```bash
   cd /docker/4d-collector
   ```
3. 运行：
   ```bash
   docker-compose up -d
   ```
4. 等 30 秒，服务就启动好了

### 第四步：验证服务

在浏览器访问这两个地址：
- `https://4d.你的域名.workers.dev/health` → 应该返回 `{"status":"ok"}`
- `https://4d.你的域名.workers.dev/data` → 返回 CSV 内容（刚开始只有表头）

如果都能正常访问，把 `https://4d.你的域名.workers.dev` 发给前端开发者，改代码对接。

---

## 查看数据

CSV 文件保存在 NAS 的 `/docker/4d-collector/data/4d_results.csv`，直接用 Excel/WPS 打开即可。

也可以随时通过公网下载：
```
https://4d.你的域名.workers.dev/data
```

---

## 常用命令

```bash
# 查看服务日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 更新代码后重新构建
docker-compose up -d --build
```

---

## 数据文件位置

| 位置 | 说明 |
|------|------|
| NAS 本地: `/docker/4d-collector/data/4d_results.csv` | 主数据文件 |
| 容器内: `/app/data/4d_results.csv` | 容器内部路径（通过 volume 映射到上面） |
