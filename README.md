# Crab — 四端智能体平台 / Four-Tier Agent Platform

> 一个由四个服务组成的本地化智能体（Agent）平台：**cclaw**（代理端）+ **eclaw**（后端）+ **wclaw**（前端）+ **xCrab**（AI 网关）。
>
> A four-service local-first agent platform: **cclaw** (agent client) + **eclaw** (backend) + **wclaw** (frontend) + **xCrab** (AI gateway).

[![Repo](https://img.shields.io/badge/repo-CrabAgent-blue)](https://github.com/yzp100911/CrabAgent)
[![License](https://img.shields.io/badge/license-MIT-green)](#license)

---

## 目录 / Table of Contents

- [项目简介 / Overview](#项目简介--overview)
- [架构图 / Architecture](#架构图--architecture)
- [端口分配 / Port Allocation](#端口分配--port-allocation)
- [仓库结构 / Repository Layout](#仓库结构--repository-layout)
- [快速开始 / Quick Start](#快速开始--quick-start)
- [部署到新服务器 / Deploy to a New Server](#部署到新服务器--deploy-to-a-new-server)
  - [前置准备 / Prerequisites](#前置准备--prerequisites)
  - [阶段 1：系统初始化 / Stage 1: System Setup](#阶段-1系统初始化--stage-1-system-setup)
  - [阶段 2：推送代码 / Stage 2: Push Code](#阶段-2推送代码--stage-2-push-code)
  - [阶段 3：安装依赖 / Stage 3: Install Dependencies](#阶段-3安装依赖--stage-3-install-dependencies)
  - [阶段 4：systemd + nginx / Stage 4: systemd + nginx](#阶段-4systemd--nginx--stage-4-systemd--nginx)
  - [阶段 5：初始化数据库 / Stage 5: Init Database](#阶段-5初始化数据库--stage-5-init-database)
  - [阶段 6：环境变量 / Stage 6: Environment Variables](#阶段-6环境变量--stage-6-environment-variables)
  - [阶段 7：启动服务 / Stage 7: Start Services](#阶段-7启动服务--stage-7-start-services)
  - [阶段 8：验证 / Stage 8: Verify](#阶段-8验证--stage-8-verify)
- [配置说明 / Configuration Reference](#配置说明--configuration-reference)
- [常见问题 / FAQ](#常见问题--faq)
- [许可证 / License](#许可证--license)

---

## 项目简介 / Overview

**Crab** 是一个面向个人/小团队的全栈智能体平台，提供：

- **wclaw**：浏览器端聊天 UI（Vanilla JS + WebSocket）
- **eclaw**：Node.js + Express 后端，负责用户、会话、消息、AI 调用编排、YOLO 视觉集成
- **cclaw**：本地代理端，可挂载浏览器自动化、Codex、OpenClaw、Playwright 等工具
- **xCrab**：AI 模型网关，对外暴露 `/anthropic/v1/messages` 兼容接口，支持多模型动态切换

四端之间通过 HTTP + WebSocket 协作，AI 调用链：`wclaw → eclaw → xCrab → 模型供应商`。

Crab is a full-stack agent platform targeting individuals and small teams. The four services collaborate via HTTP + WebSocket, with the AI call chain being `wclaw → eclaw → xCrab → model provider`.

---

## 架构图 / Architecture

```
┌────────────────┐      HTTP/WS       ┌────────────────┐
│   wclaw (前端) │ ─────────────────▶ │  eclaw (后端)  │
│   浏览器 UI    │ ◀───────────────── │   Node + DB    │
└────────────────┘                    └────────┬───────┘
                                               │ HTTP
                                               ▼
                                     ┌──────────────────┐
                                     │ xCrab (AI 网关)  │
                                     │ Anthropic 兼容   │
                                     └────────┬─────────┘
                                              │
                  ┌───────────────────────────┼───────────────────────────┐
                  ▼                           ▼                           ▼
            ┌──────────┐                ┌──────────┐                ┌──────────┐
            │ DeepSeek │                │  Mimo    │                │ 其他模型 │
            └──────────┘                └──────────┘                └──────────┘

┌────────────────┐
│ cclaw (代理端) │  ──▶ eclaw （注册、转发、本地工具调用）
│ Playwright 等  │
└────────────────┘
```

---

## 端口分配 / Port Allocation

| 端口 / Port | 服务 / Service | 用途 / Purpose            | 暴露范围 / Exposure |
| ----------- | -------------- | ------------------------- | ------------------- |
| **10090**   | nginx → wclaw  | 前端入口 / Frontend entry | `0.0.0.0/0`         |
| 10001       | eclaw          | 后端 API / Backend API    | `127.0.0.1`         |
| 10091       | cclaw          | 代理端 / Agent client     | `127.0.0.1`         |
| 60016       | xCrab          | AI 网关 / AI gateway      | `127.0.0.1`         |
| 60017       | YOLO（可选）   | 视觉推理 / Vision inference（可选） | `127.0.0.1` |
| 3306        | MariaDB        | 数据库 / Database         | `127.0.0.1`         |

> ⚠️ **只有 10090 需要对外暴露**。其他端口仅本机回环访问，防止后端被直接攻击。
>
> ⚠️ Only port 10090 should be exposed publicly. All other ports are bound to 127.0.0.1.

---

## 仓库结构 / Repository Layout

```
CrabAgent/                        ← monorepo 根
├── cclaw/                        ← 代理端（本地工具调度）
│   ├── index.js
│   ├── package.json
│   └── .env.example
├── eclaw/                        ← 后端（用户/会话/AI 编排）
│   ├── server.js
│   ├── package.json
│   └── wclaw/                    ← 前端（被 nginx 静态托管）
│       ├── index.html
│       └── app.js
├── wclaw/                        ← 前端的独立开发副本
├── xCrab/                        ← AI 模型网关
│   ├── index.js
│   ├── package.json
│   └── .env.example
├── .gitignore
└── README.md                     ← 你正在阅读的文件
```

每个子目录都有自己的 `.gitignore` 用于排除用户数据、模型权重、备份等。
Each subdirectory ships its own `.gitignore` to keep user data, model weights, and backups out of the repo.

---

## 快速开始 / Quick Start

> 假设你要在本地一台 Ubuntu 24.04 机器上跑通整套 Crab。
> The following assumes a fresh Ubuntu 24.04 host.

```bash
# 1. 克隆仓库 / Clone the repo
git clone https://github.com/yzp100911/CrabAgent.git
cd CrabAgent

# 2. 安装依赖（每个端都要做一次）/ Install deps per service
( cd cclaw  && npm install --production )
( cd eclaw  && npm install --production )
( cd xCrab  && npm install --production )

# 3. 复制环境变量模板 / Copy env templates
cp cclaw/.env.example  cclaw/.env
cp eclaw/.env.example  eclaw/.env
cp xCrab/.env.example  xCrab/.env

# 4. 编辑 .env，至少填好 DB_PASS、JWT_SECRET、XCRAB_TOKEN / Edit .env files

# 5. 启动 MariaDB（仅本地需要）/ Start MariaDB
sudo systemctl enable --now mariadb

# 6. 依次启动四端 / Start services in order
( cd xCrab  && npm start ) &       # AI gateway first
( cd eclaw  && npm start ) &       # then backend
( cd cclaw  && npm start ) &       # then agent client
# 浏览器打开 http://localhost:10001（开发模式由 eclaw 直接托管前端）
```

更完整的多机生产部署见下一节。
For full multi-host production deployment, see the next section.

---

## 部署到新服务器 / Deploy to a New Server

本节面向"在一台全新的 Ubuntu 24.04 VPS 上从零部署完整 Crab"。
This section walks through a clean deployment of all four services on a fresh Ubuntu 24.04 VPS.

### 前置准备 / Prerequisites

#### 服务器要求 / Server Requirements

| 项目 / Item | 要求 / Requirement                                   |
| ----------- | ---------------------------------------------------- |
| 系统 / OS   | Ubuntu 24.04 LTS                                     |
| Node        | v22.22.2                                             |
| 内存 / RAM  | ≥ 4 GB（xCrab + Playwright 较重）                   |
| 磁盘 / Disk | ≥ 30 GB（代码 ~2 GB + xCrab models 约 5–10 GB）      |
| 公网 IP     | 1 个，用于 10090 端口对外                            |
| 用户 / User | `ubuntu`，具备 `sudo` 权限 / with `sudo` privileges  |

#### 防火墙放行端口 / Firewall Rules

| 端口 / Port | 用途 / Purpose                | 开放范围 / Scope    |
| ----------- | ----------------------------- | ------------------- |
| **10090**   | 前端入口 / Frontend entry     | `0.0.0.0/0`         |
| 22          | SSH                           | 受限 IP / restricted |
| 其他 / Others | eclaw / xCrab / cclaw        | 仅 `127.0.0.1`       |

#### 部署前需提供的信息 / Information to Gather

1. 新服务器 IP 与 SSH 端口 / new server IP & SSH port
2. SSH 登录方式（密钥或密码） / SSH method (key or password)
3. 可选：域名 / Optional: domain name
4. 数据库密码（建议自定义） / DB password (recommend choosing your own)

---

### 阶段 1：系统初始化 / Stage 1: System Setup

```bash
# 1.1 更新系统 / Update system
sudo apt update && sudo apt upgrade -y

# 1.2 基础依赖 / Base packages
sudo DEBIAN_FRONTEND=noninteractive apt install -y \
  nginx mariadb-server git curl wget unzip \
  build-essential python3 python3-pip

# 1.3 Node 22 / Install Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # 应输出 v22.x

# 1.4 启动 nginx + mariadb / Start nginx & mariadb
sudo systemctl enable --now nginx mariadb
```

---

### 阶段 2：推送代码 / Stage 2: Push Code

**在 VPS 上** / On the VPS:

```bash
sudo mkdir -p /opt/cclaw-client/UbuntuClaw
sudo mkdir -p /www/wwwroot/eclaw
sudo chown -R $USER:$USER /opt/cclaw-client /www/wwwroot
```

**在本地终端推送** / Push from local terminal:

```bash
# 推送四个端代码 / Push four services
scp -r crabagent-repo/cclaw \
  ubuntu@<NEW_IP>:/opt/cclaw-client/UbuntuClaw/

scp -r crabagent-repo/xCrab \
  ubuntu@<NEW_IP>:/opt/cclaw-client/UbuntuClaw/

scp -r crabagent-repo/eclaw \
  ubuntu@<NEW_IP>:/www/wwwroot/

# 推送 systemd + nginx 配置（如未使用 systemd 也可手动启动）
# scp cclaw/cclaw.service eclaw/eclaw.service xCrab/xcrab.service \
#   ubuntu@<NEW_IP>:/tmp/
# scp eclaw/eclaw.conf ubuntu@<NEW_IP>:/tmp/
```

> 💡 也可以直接在 VPS 上 `git clone https://github.com/yzp100911/CrabAgent.git`，更轻量。
> 💡 Alternatively, `git clone` directly on the VPS — lighter and version-controlled.

---

### 阶段 3：安装依赖 / Stage 3: Install Dependencies

```bash
# eclaw / cclaw / xCrab 各自一次 / once per service
( cd /www/wwwroot/eclaw                          && npm install --production )
( cd /opt/cclaw-client/UbuntuClaw/cclaw          && npm install --production )
( cd /opt/cclaw-client/UbuntuClaw/xCrab          && npm install --production )
```

> xCrab 依赖较重（含 playwright / chromium），首次 install 可能 5–10 分钟。
> xCrab is heavy (playwright / chromium); the first install may take 5–10 minutes.

---

### 阶段 4：systemd + nginx / Stage 4: systemd + nginx

```bash
# 4.1 安装 systemd unit（可选，演示用）/ Install systemd units (optional)
sudo cp /tmp/{cclaw,eclaw,xcrab}.service /etc/systemd/system/
sudo systemctl daemon-reload

# 4.2 nginx 站点 / nginx site
sudo cp /tmp/eclaw.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/eclaw.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

如果 `eclaw.conf` 不在你仓库中，可以手动写一个最小可用版本：

```nginx
# /etc/nginx/sites-available/eclaw.conf
server {
    listen 10090 default_server;
    server_name _;

    root /www/wwwroot/eclaw/wclaw;
    index index.html;

    location /api/   { proxy_pass http://127.0.0.1:10001; }
    location /ws     { proxy_pass http://127.0.0.1:10001; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
    location /uploads/ { alias /www/wwwroot/eclaw/uploads/; }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

### 阶段 5：初始化数据库 / Stage 5: Init Database

```bash
sudo mysql <<'SQL'
CREATE USER IF NOT EXISTS 'wclaw_db'@'localhost' IDENTIFIED BY 'YOUR_DB_PASSWORD';
CREATE DATABASE IF NOT EXISTS wclaw_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON wclaw_db.* TO 'wclaw_db'@'localhost';
GRANT ALL PRIVILEGES ON wclaw_db.* TO 'wclaw_db'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
```

> 将 `YOUR_DB_PASSWORD` 替换为你的真实密码，并与 `eclaw/.env` 中的 `DB_PASS` 一致。
> Replace `YOUR_DB_PASSWORD` with your real password and keep it in sync with `DB_PASS` in `eclaw/.env`.

数据库表结构会在 eclaw 首次启动时自动创建。
Tables are auto-created on first start of eclaw.

---

### 阶段 6：环境变量 / Stage 6: Environment Variables

每个端都有一个 `.env.example` 模板，复制并填入真实值：

Each service ships an `.env.example`. Copy and fill in real values:

```bash
cp /www/wwwroot/eclaw/.env.example                  /www/wwwroot/eclaw/.env
cp /opt/cclaw-client/UbuntuClaw/cclaw/.env.example /opt/cclaw-client/UbuntuClaw/cclaw/.env
cp /opt/cclaw-client/UbuntuClaw/xCrab/.env.example /opt/cclaw-client/UbuntuClaw/xCrab/.env
nano /www/wwwroot/eclaw/.env
# ... etc.
```

必填项：

| 端 / Service | 必填项 / Required                                                  |
| ------------ | ------------------------------------------------------------------ |
| eclaw        | `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASS` / `DB_NAME` / `JWT_SECRET` / `XCRAB_TOKEN` |
| xCrab        | `GATEWAY_TOKEN`（与 eclaw 的 `XCRAB_TOKEN` 一致）、至少一个模型 API Key |
| cclaw        | `ECLAW_API_URL` / `ECLAW_WS_URL` / `CCLAW_USERNAME`               |

---

### 阶段 7：启动服务 / Stage 7: Start Services

启动顺序：`mariadb → xcrab → eclaw → cclaw → nginx`
Start order: `mariadb → xcrab → eclaw → cclaw → nginx`

```bash
sudo systemctl enable --now mariadb
sudo systemctl enable --now xcrab
sleep 5
sudo systemctl enable --now eclaw
sleep 3
sudo systemctl enable --now cclaw
sudo systemctl reload nginx

sudo systemctl status cclaw eclaw xcrab nginx mariadb
```

如果你没有用 systemd，直接前台或后台运行：

```bash
# xCrab
( cd /opt/cclaw-client/UbuntuClaw/xCrab && nohup node index.js > xcrab.log 2>&1 & )

# eclaw
( cd /www/wwwroot/eclaw && nohup node server.js > eclaw.log 2>&1 & )

# cclaw
( cd /opt/cclaw-client/UbuntuClaw/cclaw && nohup node index.js > cclaw.log 2>&1 & )
```

---

### 阶段 8：验证 / Stage 8: Verify

```bash
# 8.1 端口监听 / Port listeners
ss -tln | grep -E ':10090|:10001|:60016|:10091|:3306'

# 8.2 浏览器打开 / Open in browser
# http://<NEW_IP>:10090  → 应看到 wclaw 登录页
# 看到登录页 = 前端通了

# 8.3 后端连通性 / Backend reachability
curl -X POST http://127.0.0.1:10001/api/check_username \
  -H "Content-Type: application/json" \
  -d '{"username":"newuser"}'
# 返回 {"exist":false} 即通

# 8.4 AI 网关 / AI gateway
curl -X POST http://127.0.0.1:60016/anthropic/v1/messages \
  -H "Authorization: Bearer YOUR_XCRAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_MODEL","max_tokens":50,"messages":[{"role":"user","content":"hi"}]}'
```

---

## 配置说明 / Configuration Reference

### eclaw `.env` 关键项

```ini
# 数据库
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=wclaw_db
DB_PASS=your_db_password
DB_NAME=wclaw_db

# AI 端
XCRAB_API_URL=http://127.0.0.1:60016
XCRAB_TOKEN=your_xcrab_token

# JWT 签名密钥
JWT_SECRET=your_jwt_secret

# 对外域名 / IP（写入返回给前端的 URL）
PUBLIC_HOST=localhost:10090

# 可选：SMS / YOLO
SMSBAO_PASSWORD=your_sms_password
YOLO_API_URL=http://127.0.0.1:60017
```

### xCrab `.env` 关键项

```ini
GATEWAY_PORT=60016
GATEWAY_TOKEN=your_xcrab_token      # 必须与 eclaw 的 XCRAB_TOKEN 一致
HF_ENDPOINT=https://hf-mirror.com
HF_HUB_DISABLE_TELEMETRY=1

# 模型 API Key（按需填）
DEEPSEEK_API_KEY=...
MINIMAX_API_KEY=...
ANTHROPIC_API_KEY=...
```

### cclaw `.env` 关键项

```ini
ECLAW_API_URL=http://127.0.0.1:10001
ECLAW_WS_URL=ws://127.0.0.1:10001/ws
LOCAL_API_PORT=10091
CCLAW_AI_BACKEND=hermes
CCLAW_USERNAME=your_username
```

---

## 常见问题 / FAQ

**Q: 数据库密码应该用什么？** / What should my DB password be?
A: 任意非空字符串即可；务必同时填入 `.env` 和 `mysql` 创建用户的 SQL 中。
A: Any non-empty string. Make sure it matches between `.env` and the MySQL `CREATE USER` statement.

**Q: 必须用 systemd 吗？** / Do I have to use systemd?
A: 不必须。直接 `node index.js` 或 `nohup node ... &` 都可以，但 systemd 能自动拉起崩溃进程。
A: No. `node index.js` or `nohup node ... &` works fine; systemd just auto-restarts on crash.

**Q: 10090 端口已经被占用了？** / Port 10090 is already in use?
A: 先 `sudo ss -tlnp | grep 10090` 找到占用进程，停掉它；或修改 `eclaw.conf` 换一个端口。
A: `sudo ss -tlnp | grep 10090` to find the conflicting process and stop it, or change the port in `eclaw.conf`.

**Q: xCrab 启动报 `playwright` 错误？** / xCrab fails with `playwright` errors?
A: 跑一次 `npx playwright install chromium` 即可。
A: Run `npx playwright install chromium` once.

**Q: 部署到新服务器会影响现有服务器吗？** / Does this affect existing servers?
A: 不会。各服务器配置相互独立，不共享任何状态（除非用同一个 MySQL）。
A: No. Each server has independent config and state (unless they share the same MySQL).

---

## 许可证 / License

本仓库基于 [MIT License](LICENSE) 发布 — 详情见 [`LICENSE`](LICENSE) 文件。
Released under the [MIT License](LICENSE) — see the [`LICENSE`](LICENSE) file for full text.

Copyright © 2026 yzp100911

---

> 仓库地址 / Repo: <https://github.com/yzp100911/CrabAgent>
> 问题反馈 / Issues: <https://github.com/yzp100911/CrabAgent/issues>