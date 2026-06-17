---
title: "Claude Code 本机代理配置指南"
date: "2026-06-17"
category: "技术栈"
description: "国内本机运行 claude 时通过 HTTP_PROXY 走 VPS + Novproxy 代理链访问 api.anthropic.com 的配置方法与排错。"
---

> 国内本机运行 `claude` 时，需让终端流量走 **VPS + Novproxy** 代理，才能连上 `api.anthropic.com`。  
> 与浏览器 ZeroOmega 共用同一条链路，但配置方式不同。

## 问题现象

安装 Claude Code 成功后，直接运行：

```bash
claude
```

可能出现：

```
Unable to connect to Anthropic services
Failed to connect to api.anthropic.com: ECONNREFUSED
```

**不是安装失败**，而是本机**无法直连** Anthropic API（国内网络限制）。

## 浏览器 vs 终端：为什么浏览器能开、claude 不行？

| | 浏览器（claude.ai） | Claude Code（终端） |
|--|---------------------|---------------------|
| 代理 | ZeroOmega 自动走 `127.0.0.1:7890` | **默认不走代理** |
| 目标 | claude.ai / console.anthropic.com | api.anthropic.com |
| 你要做的 | 切换 proxy 情景模式 | 设置 `HTTP_PROXY` / `HTTPS_PROXY` |

两者共用同一条物理链路：

```
本机 127.0.0.1:7890
  → SSH 隧道（本机 → VPS）
  → VPS gost（127.0.0.1:7890）
  → Novproxy 住宅 IP
  → 目标网站 / API
```

## 前置条件（代理链必须已就绪）

### VPS 上 gost 自启

```bash
ssh root@45.77.124.231 systemctl status gost-claude
```

应显示 **active (running)**。

若未配置，参见 [Claude 代理开机自启配置指南](/blog/claude-proxy-autostart-guide)。

### 本机 SSH 隧道自启

```bash
systemctl --user status claude-ssh-tunnel
```

应显示 **active (running)**。

若未配置，参见 [Claude 代理开机自启配置指南](/blog/claude-proxy-autostart-guide) 中的 PC SSH 隧道 systemd 服务部分。

### 快速验证代理

```bash
curl -x http://127.0.0.1:7890 ipinfo.io
```

应返回美国住宅/宽带 IP。若失败，先修代理链，再开 `claude`。

## 让 Claude Code 走代理

### 一次性测试

```bash
# 确认 API 可达
curl -x http://127.0.0.1:7890 https://api.anthropic.com -I

# 带代理启动
HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 claude
```

### 推荐：别名 `claude-proxy`（不影响其他命令）

```bash
echo 'alias claude-proxy="HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 claude"' >> ~/.bashrc
source ~/.bashrc
```

日常使用：

```bash
cd ~/codes/你的项目
claude-proxy
```

### 可选：每次手动 export

```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
claude
```

> 不建议把 `HTTP_PROXY` 写进 `~/.bashrc` 全局生效，会影响其他不需要代理的程序。

### API Key 仍需配置

代理只解决**网络连通**，还需：

```bash
export ANTHROPIC_API_KEY="sk-ant-你的key"
# 或已写入 ~/.bashrc
echo $ANTHROPIC_API_KEY | head -c 20
```

安装步骤见 [Claude Code 本机安装指南](/blog/claude-code-local-install-guide)。

## 完整日常使用流程

```
1. 开机（VPS gost + 本机 SSH 隧道已 systemd 自启）
2. 验证：curl -x http://127.0.0.1:7890 ipinfo.io
3. 进入项目：cd ~/codes/你的项目
4. 启动：claude-proxy
5. 浏览器 Claude（可选）：ZeroOmega 选 proxy
```

## 在 Cursor 里使用

Cursor 内置终端同样适用：

```bash
# 在 Cursor 终端中
claude-proxy
```

或先 export 再 `claude`。Cursor 的 AI 功能与 Claude Code CLI 是独立的；CLI 不会自动继承 ZeroOmega 设置。

## 常见问题

| 现象 | 原因 | 解决 |
|------|------|------|
| `ECONNREFUSED` api.anthropic.com | 未设代理 | 用 `claude-proxy` 或设置 `HTTP_PROXY` |
| `curl 127.0.0.1:7890` 失败 | SSH 隧道未运行 | `systemctl --user start claude-ssh-tunnel` |
| VPS 上 curl 7890 失败 | gost 未运行 | `systemctl restart gost-claude` |
| 代理通但 claude 仍报错 | 无 API Key | 配置 `ANTHROPIC_API_KEY` |
| 401 Unauthorized | Key 无效/过期 | console.anthropic.com 重新生成 |
| 浏览器能开、终端不行 | 正常，终端未走 ZeroOmega | 按本文配置 `HTTP_PROXY` |
| Novproxy 用户名过期 | sid 失效 | VPS 上更新 gost-claude.service 并 restart |

## 检查清单

```
□ systemctl status gost-claude（VPS）        → active
□ systemctl --user status claude-ssh-tunnel → active
□ curl -x http://127.0.0.1:7890 ipinfo.io   → 美国 IP
□ curl -x http://127.0.0.1:7890 https://api.anthropic.com -I → 有响应
□ echo $ANTHROPIC_API_KEY                   → sk-ant-...
□ claude-proxy                              → 进入交互界面
```

## 命令速查

```bash
# 验证代理
curl -x http://127.0.0.1:7890 ipinfo.io
curl -x http://127.0.0.1:7890 https://api.anthropic.com -I

# 配置别名（一次性）
echo 'alias claude-proxy="HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 claude"' >> ~/.bashrc
source ~/.bashrc

# 启动
cd ~/codes/你的项目
claude-proxy

# 重启代理链
systemctl --user restart claude-ssh-tunnel
ssh root@45.77.124.231 systemctl restart gost-claude
```

## 架构图

```
┌─────────────┐     ZeroOmega      ┌──────────────┐
│   浏览器     │ ──→ 127.0.0.1:7890 │              │
└─────────────┘                    │   本机 PC     │
┌─────────────┐  HTTP_PROXY        │              │
│ Claude Code │ ──→ 127.0.0.1:7890 │              │
└─────────────┘                    └──────┬───────┘
                                          │ SSH -L 7890
                                          ▼
                                   ┌──────────────┐
                                   │  VPS gost    │
                                   │  :7890       │
                                   └──────┬───────┘
                                          │ Novproxy :1000
                                          ▼
                              api.anthropic.com / claude.ai
```

## 相关文档

| 文章 | 说明 |
|------|------|
| [Claude Code 本机安装指南](/blog/claude-code-local-install-guide) | Node、npm、安装、API Key |
| [Claude 代理开机自启配置指南](/blog/claude-proxy-autostart-guide) | gost 与 SSH 隧道 systemd 自启 |
| [Claude 浏览器住宅代理配置指南](/blog/claude-browser-residential-proxy-guide) | 浏览器 ZeroOmega 手动配置 |
| [Agent 工具栈指南](/blog/agent-toolstack-guide) | 整体工具栈 |
