---
title: "Claude 浏览器住宅代理配置指南"
date: "2026-06-17"
category: "技术栈"
description: "本机（国内）通过 VPS + Novproxy 住宅 IP 稳定访问 claude.ai 的完整配置流程与排错手册。"
---

> 本机（国内）通过 **VPS + Novproxy 住宅 IP** 稳定访问 claude.ai / console.anthropic.com 的完整流程与排错手册。

## 方案原理

国内本机无法直连 Novproxy（443 被拒、1000 超时），因此采用 **VPS 中转**：

```
本机浏览器
  → ZeroOmega（HTTP 127.0.0.1:7890）
  → SSH 隧道（本机 → VPS）
  → gost（VPS 本地 7890）
  → Novproxy 住宅 IP（us.novproxy.io:1000）
  → claude.ai / ipinfo.io
```

**三个组件分工**：

| 组件 | 作用 |
|------|------|
| **Vultr VPS** | 美国服务器，能连 Novproxy，做中转 |
| **Novproxy** | 提供住宅/宽带 IP，降低封号风险 |
| **gost** | 在 VPS 上把本地请求转发到 Novproxy（处理账号密码） |

## 前置条件

- [x] Vultr VPS 已创建，状态 **Running**（示例 IP：`45.77.124.231`，Los Angeles）
- [x] 能通过 SSH 登录：`ssh root@你的VPS的IP`
- [x] Novproxy 账号可用，控制台能生成 **账密模式** 用户名
- [x] Chrome 已安装 **Proxy SwitchyOmega 3（ZeroOmega）**

**Novproxy 关键参数**（以控制台为准）：

| 项 | 值 |
|----|-----|
| 主机 | `us.novproxy.io` |
| 端口 | `1000`（HTTP / SOCKS5，**不是 443**） |
| 用户名 | 控制台生成，如 `puv478244-region-US-sid-xxx-t-120` |
| 密码 | 控制台显示 |

> 用户名中的 `sid-xxx` 会过期，失效后去控制台重新生成，并更新 gost 启动命令。

## 一次性配置（VPS 上）

### 安装正确的 gost

**不要用** `apt install gost`（装的是错误的老软件，只有 `-v` 参数）。

```bash
ssh root@你的VPS的IP

cd /tmp
wget https://github.com/ginuerzh/gost/releases/download/v2.12.0/gost_2.12.0_linux_amd64.tar.gz
mkdir -p ~/tools/gost && cd ~/tools/gost
tar -xzf /tmp/gost_2.12.0_linux_amd64.tar.gz -C .
mv gost /usr/local/bin/
chmod +x /usr/local/bin/gost

# 若之前装过 apt 版 gost，刷新路径缓存
hash -r
gost -V
# 应输出：gost 2.12.0
```

### 验证 Novproxy 在 VPS 上可用

```bash
curl -x us.novproxy.io:1000 -U "你的用户名:你的密码" ipinfo.io
```

应返回美国住宅/宽带 IP（如 Florida、Comcast 等），而不是 Vultr 机房 IP。

## 每次使用前的启动流程

需要 **同时保持两个终端运行**。

### 终端 1：VPS 上启动 gost

```bash
ssh root@你的VPS的IP

gost -L=:7890 -F=http://你的Novproxy用户名:你的密码@us.novproxy.io:1000
```

示例：

```bash
gost -L=:7890 -F=http://puv478244-region-US-sid-xxx-t-120:你的密码@us.novproxy.io:1000
```

- 无报错、持续运行 = 正常
- **不要关闭此终端**

**VPS 上自测**（另开 SSH 窗口）：

```bash
curl -x http://127.0.0.1:7890 ipinfo.io
```

### 终端 2：本机建立 SSH 隧道

在本机执行：

```bash
ssh -L 7890:127.0.0.1:7890 -N root@你的VPS的IP
```

示例：

```bash
ssh -L 7890:127.0.0.1:7890 -N root@45.77.124.231
```

- 无输出 = 正常
- **不要关闭此终端**

**本机自测**（另开本机终端）：

```bash
curl -x http://127.0.0.1:7890 ipinfo.io
```

应返回与 VPS 上相同的美国住宅 IP。

### 浏览器：ZeroOmega 配置

1. 扩展选 **Proxy SwitchyOmega 3（ZeroOmega）**
2. **选项** → 情景模式 **proxy**：

| 项 | 值 |
|----|-----|
| 协议 | **HTTP** |
| 代理服务器 | `127.0.0.1` |
| 端口 | `7890` |
| 用户名 / 密码 | **留空** |

3. 点 **应用选项** → 保存
4. 点击扩展图标 → 选择 **proxy** 情景模式

### 验证与访问

```
1. 浏览器打开 https://ipinfo.io     → 确认是美国住宅 IP
2. 浏览器打开 https://claude.ai      → 登录使用
3. 或打开 https://console.anthropic.com → 创建 API Key
```

不用代理时，ZeroOmega 切回 **直接连接**。

## 完整检查清单

```
□ VPS 终端：gost 正在运行
□ VPS 测试：curl -x http://127.0.0.1:7890 ipinfo.io 成功
□ 本机终端：ssh -L 7890:127.0.0.1:7890 -N root@VPS_IP 正在运行
□ 本机测试：curl -x http://127.0.0.1:7890 ipinfo.io 成功
□ ZeroOmega：HTTP / 127.0.0.1 / 7890 / 无认证
□ ZeroOmega：已切换到 proxy 模式
□ 浏览器 ipinfo.io 显示住宅 IP
```

## 常见错误与解决方法

### Novproxy 相关

| 错误 | 原因 | 解决 |
|------|------|------|
| `forbidden ip=xxx not supported` | 国内 IP 直连 Novproxy | 必须在 **VPS 上**使用，不要本机直连 |
| `invalid version in initial SOCKS5 response` | 用 443 端口跑 SOCKS5 | 改用端口 **1000** |
| 连接 1000 端口超时 | 国内网络封锁 | 通过 VPS 中转（本指南方案） |
| 代理突然失效 | Novproxy 用户名 `sid` 过期 | 控制台重新生成用户名，更新 gost 命令 |

### gost 相关

| 错误 | 原因 | 解决 |
|------|------|------|
| `flag provided but not defined: -L` | 装了错误的 gost（apt 版） | 按上文安装 ginuerzh gost **v2.12.0** |
| `bash: /usr/bin/gost: No such file or directory` | bash 缓存了旧的 gost 路径 | `hash -r`，或用 `/usr/local/bin/gost -V` |
| `wget ... 404 Not Found` | 旧版下载链接失效 | 使用 v2.12.0 链接（见上文） |
| `Cannot open: No such file or directory`（tar） | 压缩包路径不对 | `tar -xzf ../xxx.tar.gz -C .`（包在上一级目录时） |
| 把 `-U` 和 `ipinfo.io` 写在 gost 命令里 | 混用了 curl 语法 | gost 正确格式见下 |

**gost 正确命令**（账号密码写在 URL 里）：

```bash
# ✅ 正确
gost -L=:7890 -F=http://用户名:密码@us.novproxy.io:1000

# ❌ 错误（这是 curl 写法）
gost -L=:7890 -F=http://us.novproxy.io:1000 -U "用户名:密码" ipinfo.io
```

### SSH 隧道相关

| 错误 | 原因 | 解决 |
|------|------|------|
| 本机 `curl 127.0.0.1:7890` 连接失败，VPS 上 gost 正常 | **未开 SSH 隧道** | 本机执行 `ssh -L 7890:127.0.0.1:7890 -N root@VPS_IP` |
| 隧道断开 | SSH 终端被关闭 | 重新执行 ssh -L 命令，保持终端运行 |

### 浏览器 / ZeroOmega 相关

| 错误 | 原因 | 解决 |
|------|------|------|
| `ERR_PROXY_CONNECTION_FAILED` | 隧道未开 / gost 未跑 / 配置错误 | 按检查清单逐项检查 |
| curl 成功但浏览器失败 | ZeroOmega 协议或端口配错 | 必须是 **HTTP** `127.0.0.1:7890`，不是 SOCKS5 |
| 「浏览器不支持 socks5 代理认证」 | 在 ZeroOmega 填了 Novproxy 账号 | 本机代理 **不留密码**；认证由 VPS 上 gost 处理 |
| 直连 Novproxy 地址到浏览器 | 本机无法直连 Novproxy | 浏览器只填 `127.0.0.1:7890` |

### Claude / Anthropic 相关

| 错误 | 原因 | 解决 |
|------|------|------|
| `控制台暂时不可用` | 国内 IP 或未走代理 | 确认 ipinfo.io 已是美国 IP 后再访问 |
| OAuth 在 VPS 上打不开浏览器 | VPS 无图形界面 | 本机浏览器 + 住宅代理完成登录，或直接用 API Key |
| Claude Code 登录 | 推荐 API 方式 | 选「Anthropic Console · API usage billing」 |

## 一键命令速查

### VPS（终端 1）

```bash
ssh root@45.77.124.231
gost -L=:7890 -F=http://你的用户名:你的密码@us.novproxy.io:1000
```

### 本机（终端 2）

```bash
ssh -L 7890:127.0.0.1:7890 -N root@45.77.124.231
```

### 本机测试

```bash
curl -x http://127.0.0.1:7890 ipinfo.io
```

### 浏览器

ZeroOmega → **proxy** → 打开 `https://claude.ai`

## 可选优化

### gost 后台运行（VPS）

```bash
nohup gost -L=:7890 -F=http://用户名:密码@us.novproxy.io:1000 > /tmp/gost.log 2>&1 &
```

查看日志：

```bash
tail -f /tmp/gost.log
```

停止：

```bash
pkill -f "gost -L=:7890"
```

### 本机一键启动脚本（示例）

保存为 `~/start-claude-proxy.sh`：

```bash
#!/bin/bash
VPS_IP="45.77.124.231"
echo "正在建立 SSH 隧道到 $VPS_IP ..."
ssh -L 7890:127.0.0.1:7890 -N root@$VPS_IP
```

```bash
chmod +x ~/start-claude-proxy.sh
./start-claude-proxy.sh
```

> 使用前仍需确保 VPS 上 gost 已启动。

### 稳定使用建议

1. **固定地区**：用户名保持 `-region-US`，不要频繁换国家
2. **专用浏览器配置**：单独 Chrome 配置文件只走 proxy，避免与直连混用
3. **sid 过期**：定期从 Novproxy 控制台更新用户名
4. **不用时切回直接连接**：节省 Novproxy 流量
5. **写代码优先用 API**：浏览器住宅代理主要用于 claude.ai 网页；开发用 VPS + API Key 更稳

## 与 Claude Code / API 的分工

| 场景 | 推荐方式 |
|------|----------|
| 浏览器聊天 claude.ai | 本指南（VPS + gost + SSH + ZeroOmega） |
| 写代码、学 Agent | VPS 上 Claude Code + API Key |
| 本机 Cursor 学课程 | Cursor + API Key（不必开浏览器代理） |

## 相关文档

| 文章 | 说明 |
|------|------|
| [Agent 工具栈指南](/blog/agent-toolstack-guide) | Vultr、Novproxy、Cursor、Claude Code、OpenClaw 总览 |
