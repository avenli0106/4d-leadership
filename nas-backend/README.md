# 4D天性测评 - NAS 数据收集服务

部署在绿联云 NAS 上的全自动数据收集后端。测评结果通过 **natfrp（樱花 frp）** 内网穿透暴露公网访问，自动写入 NAS 本地的 CSV 文件。

> 不需要域名！natfrp 免费提供二级域名（如 `xxx.natfrp.cloud`）。

---

## 部署步骤（约 10 分钟）

### 第一步：注册 natfrp 并获取访问密钥

1. 打开 [www.natfrp.com](https://www.natfrp.com) 或 [natfrp.org](https://natfrp.org)
2. 用邮箱注册账号
3. **实名认证**（国内法规要求，上传身份证照片，1 分钟审核通过）
4. 登录后进入「用户中心」→「访问密钥」，**复制访问密钥**（一串字母数字）

### 第二步：把部署包上传到绿联云 NAS

1. 在 NAS 上创建文件夹，比如 `/docker/4d-collector/`
2. 把本目录下的所有文件（`docker-compose.yml`、`Dockerfile`、`requirements.txt`、`app.py`）上传到这个文件夹
3. 在这个文件夹里创建两个子文件夹：
   - `data/`（放 CSV 数据）
   - `natfrp/`（放 natfrp 配置）

### 第三步：配置环境变量并启动

1. 在 `/docker/4d-collector/` 文件夹里创建一个 `.env` 文件，内容如下：
   ```
   NATFRP_TOKEN=你复制的访问密钥
   NATFRP_REMOTE=你自己设一个8位以上管理密码
   ```
2. 打开绿联云的 **终端/SSH**，进入该文件夹：
   ```bash
   cd /docker/4d-collector
   ```
3. 运行：
   ```bash
   docker-compose up -d
   ```
4. 等 30 秒，查看日志确认启动成功：
   ```bash
   docker-compose logs -f tunnel
   ```
   看到「登录成功」「远程管理连接成功」即可。

### 第四步：创建隧道并获得公网地址

1. 打开 natfrp 的「远程管理」页面（日志里会有链接，通常是 `https://www.natfrp.com/remote/`）
2. 用 `.env` 里设的 `NATFRP_REMOTE` 密码登录
3. 点击「添加隧道」：
   - **隧道类型**: HTTP
   - **本地 IP**: `127.0.0.1`
   - **本地端口**: `5000`
   - **远程端口**: 留空（系统自动分配）
   - **绑定域名**: 留空（系统分配免费二级域名）
4. 点击「启动隧道」
5. 系统会分配一个公网地址，比如 `https://xxx.natfrp.cloud`

### 第五步：验证服务

在浏览器访问：
- `https://xxx.natfrp.cloud/health` → 应该返回 `{"status":"ok"}`
- `https://xxx.natfrp.cloud/data` → 返回 CSV 表头

如果都能正常访问，把 `https://xxx.natfrp.cloud` 发给前端开发者，改代码对接。

---

## 查看数据

CSV 文件保存在 NAS 的 `/docker/4d-collector/data/4d_results.csv`，直接用 Excel/WPS 打开即可。

也可以随时通过公网下载：
```
https://xxx.natfrp.cloud/data
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
