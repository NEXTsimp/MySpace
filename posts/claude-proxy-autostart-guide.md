---
title: "Claude 代理开机自启配置指南"
date: "2026-06-17"
category: "技术栈"
description: "VPS gost 与 PC SSH 隧道 systemd 自启方案，开机即可用 ZeroOmega 访问 claude.ai，无需每次手动连接。"
---

> PC 浏览器访问 Claude 的自动化方案：**VPS gost 开机自启 + PC SSH 隧道登录自启**，无需每次手动连接。

## 最终方案（PC 专用）

```
开机 / 登录后自动运行：

VPS（systemd）  → gost 监听 127.0.0.1:7890 → 转发 Novproxy 住宅 IP
PC（systemd）   → SSH 隧道 127.0.0.1:7890 → VPS:7890
浏览器          → ZeroOmega 选 proxy → claude.ai
```

**不需要**：

- 手机 Clash（已放弃可忽略）
- `claude_phone` 自设密码（仅手机/8890 方案才需要）
- 每次手动 `ssh` 或 `gost`

## 前置条件

确认以下已完成（参见 [Claude 浏览器住宅代理配置指南](/blog/claude-browser-residential-proxy-guide)）：

- [x] VPS 已安装 gost v2.12.0（`/usr/local/bin/gost`）
- [x] Novproxy 在 VPS 上测试通过
- [x] ZeroOmega 已配置：HTTP `127.0.0.1:7890`，无用户名密码
- [x] 手动 `curl -x http://127.0.0.1:7890 ipinfo.io` 能返回美国 IP

**环境信息（示例）**：

| 项 | 值 |
|----|-----|
| VPS IP | `45.77.124.231` |
| Novproxy 主机 | `us.novproxy.io:1000` |
| Novproxy 密码 | 控制台查看 |
| Novproxy 用户名 | 控制台生成，如 `puv478244-region-US-sid-xxx-t-120`（会过期） |

## 第一步：SSH 免密登录（必做）

PC 隧道自启依赖免密 SSH，否则 systemd 无法自动连 VPS。

在 **本机** 执行：

```bash
# 若还没有密钥
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519

# 上传公钥（输入一次 VPS 密码）
ssh-copy-id root@45.77.124.231

# 验证：应直接输出 ok
ssh root@45.77.124.231 "echo ok"
```

## 第二步：VPS 上 gost 开机自启

### 创建服务文件

在 **VPS** 上执行：

```bash
nano /etc/systemd/system/gost-claude.service
```

> ⚠️ 路径必须是 `/etc/systemd/system/`，**不是** `/etc/systemd/`

粘贴以下内容（**改 Novproxy 用户名和密码**）：

```ini
[Unit]
Description=gost proxy for Claude
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/gost -L=127.0.0.1:7890 -F=http://你的Novproxy用户名:你的密码@us.novproxy.io:1000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**示例**（用户名和密码换成你控制台当前的）：

```ini
ExecStart=/usr/local/bin/gost -L=127.0.0.1:7890 -F=http://puv478244-region-US-sid-xxx-t-120:你的密码@us.novproxy.io:1000
```

### 启用服务

```bash
systemctl daemon-reload
systemctl enable --now gost-claude
systemctl status gost-claude
```

应显示 **`active (running)`**。

> ⚠️ 正确命令是 `systemctl enable --now gost-claude`  
> ❌ 不是 `systemctl --now gost-claude`

### 验证

```bash
curl -x http://127.0.0.1:7890 ipinfo.io
```

应返回美国住宅/宽带 IP。

### Novproxy 用户名过期时

```bash
nano /etc/systemd/system/gost-claude.service   # 更新用户名
systemctl daemon-reload
systemctl restart gost-claude
```

## 第三步：PC 上 SSH 隧道自启

### 创建用户级服务

在 **本机** 执行：

```bash
mkdir -p ~/.config/systemd/user

nano ~/.config/systemd/user/claude-ssh-tunnel.service
```

粘贴（**改 VPS IP**）：

```ini
[Unit]
Description=SSH tunnel for Claude browser proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/ssh -N -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -L 7890:127.0.0.1:7890 root@45.77.124.231
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

### 启用服务

```bash
systemctl --user daemon-reload
systemctl --user enable --now claude-ssh-tunnel
systemctl --user status claude-ssh-tunnel
```

应显示 **`active (running)`**。

### 开机即启动（可选）

默认在用户**登录后**才启动隧道。若希望开机就建隧道：

```bash
sudo loginctl enable-linger $USER
```

### 验证

```bash
curl -x http://127.0.0.1:7890 ipinfo.io
```

应返回美国住宅 IP。浏览器 ZeroOmega 选 **proxy** → 打开 https://claude.ai

## 日常使用

```
1. 开机（VPS 和 PC 服务自动运行）
2. ZeroOmega 切换到 proxy 情景模式
3. 打开 claude.ai
```

**不用再开终端、不用手动 ssh 或 gost。**

不用 Claude 时，ZeroOmega 切回 **直接连接** 即可。

## 常用管理命令

### VPS gost

```bash
systemctl status gost-claude       # 查看状态
systemctl restart gost-claude      # 重启
systemctl stop gost-claude         # 停止
systemctl is-enabled gost-claude   # 是否开机自启
journalctl -u gost-claude -f       # 查看日志
```

### PC SSH 隧道

```bash
systemctl --user status claude-ssh-tunnel
systemctl --user restart claude-ssh-tunnel
systemctl --user stop claude-ssh-tunnel
journalctl --user -u claude-ssh-tunnel -f
```

## 常见错误与解决

| 错误 | 原因 | 解决 |
|------|------|------|
| `Unknown command verb gost-claude` | 写成 `systemctl --now gost-claude` | 改为 `systemctl enable --now gost-claude` |
| `Unit gost-claude.service not found` | 文件建在 `/etc/systemd/` 而非 `system/` | 移到 `/etc/systemd/system/gost-claude.service` |
| gost 服务启动失败 | Novproxy 用户名过期或 gost 路径错 | `journalctl -u gost-claude -f` 查日志；确认 `/usr/local/bin/gost -V` |
| PC curl 7890 失败 | SSH 隧道未运行 | `systemctl --user status claude-ssh-tunnel` |
| 隧道一直重启 | SSH 免密未配置 | 重新 `ssh-copy-id root@45.77.124.231` |
| 浏览器代理失败但 curl 成功 | ZeroOmega 未切到 proxy 或协议错误 | 确认 HTTP `127.0.0.1:7890`，无密码 |
| VPS 重启后失效 | 未 enable | `systemctl is-enabled gost-claude` 应为 `enabled` |

## 凭证说明（避免混淆）

systemd 里 **只需 Novproxy 的账密**：

| 凭证 | 来源 | 用途 |
|------|------|------|
| `puv478244-region-US-sid-xxx-t-120` | Novproxy 控制台生成 | gost 连接 Novproxy |
| Novproxy 账号密码 | Novproxy 控制台 | gost 连接 Novproxy |
| ~~`claude_phone` + 自设密码~~ | ~~自己编的~~ | ~~仅手机 Clash / 8890 方案~~，**当前不需要** |

## 附录：手机 Clash 方案（可选，当前未使用）

若以后想在手机上用 Clash，需额外：

1. gost 增加公网端口：`-L=http://自设用户名:自设密码@:8890`
2. 开放防火墙：`ufw allow 8890/tcp`
3. 手机导入 Clash 配置文件

## 附录：PC 不用 SSH 隧道（可选）

若不想在 PC 跑隧道服务，可让 ZeroOmega **直连 VPS 公网 8890**（需先按上文附录配置 gost 8890 + 自设密码）。

当前推荐方案仍是 **SSH 隧道 + 7890**（更安全，8890 不暴露公网）。

## 相关文档

| 文章 | 说明 |
|------|------|
| [Claude 浏览器住宅代理配置指南](/blog/claude-browser-residential-proxy-guide) | 手动配置与排错 |
| [Agent 工具栈指南](/blog/agent-toolstack-guide) | 整体工具栈 |

## 配置检查清单

```
□ SSH 免密：ssh root@45.77.124.231 "echo ok" 无需密码
□ VPS：/etc/systemd/system/gost-claude.service 存在
□ VPS：systemctl is-enabled gost-claude → enabled
□ VPS：curl -x http://127.0.0.1:7890 ipinfo.io 成功
□ PC：~/.config/systemd/user/claude-ssh-tunnel.service 存在
□ PC：systemctl --user is-enabled claude-ssh-tunnel → enabled
□ PC：curl -x http://127.0.0.1:7890 ipinfo.io 成功
□ 浏览器：ZeroOmega HTTP 127.0.0.1:7890，选 proxy 可开 claude.ai
```
