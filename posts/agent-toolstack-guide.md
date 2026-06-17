---
title: "Agent 工具栈指南"
date: "2026-06-17"
category: "技术栈"
description: "整理自学习 Agent 过程中的实践与踩坑记录，涵盖网络环境、大模型、开发工具的关系与选型建议。"
---

> 整理自学习 Agent 过程中的实践与踩坑记录，涵盖网络环境、大模型、开发工具的关系与选型建议。

## 整体架构

```
你（人）→ 工具/Agent（怎么干活）→ 大模型（脑子）→ 网络环境（在哪连网）
```

| 层级 | 组件 | 一句话 |
|------|------|--------|
| 网络基础设施 | Vultr、Novproxy | 解决「在哪、用什么 IP 连网」 |
| 大模型 | Claude、GPT、DeepSeek 等 | 负责理解、推理、生成 |
| Agent 工具 | Cursor、Claude Code、Codex、OpenClaw | 负责读文件、跑命令、自动化 |

## 网络基础设施

### Vultr（美国 VPS）

**是什么**：一台放在美国机房的远程 Linux 服务器，通过 SSH 远程操作。

**能做什么**：

- 提供美国 IP，环境稳定、独享（不像机场多人共用）
- 跑脚本、Claude Code、OpenClaw、爬虫
- 作为稳定出口访问 Claude / OpenAI API

**不能做什么**：

- 不是 AI，不会写代码
- IP 仍是机房 IP，部分网站能识别

**推荐配置（学习阶段）**：

- 类型：Cloud Compute → Shared CPU
- 地区：Los Angeles（国内延迟相对较低）
- 系统：Ubuntu 22.04 LTS
- 套餐：vc2-1c-1gb（$5/月，1 核 1G）
- 关闭自动备份（省 $2/月）

**常用命令**：

```bash
# 本机连接 VPS
ssh root@你的VPS的IP

# 基础环境初始化
apt update && apt upgrade -y
apt install -y curl git python3 python3-pip python3-venv
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 验证 IP
curl ipinfo.io
```

**费用提醒**：Vultr 按小时计费，不用时可在控制台 Destroy 实例，避免持续扣费。

### Novproxy（住宅 IP 代理）

**是什么**：动态住宅 IP 代理服务，流量看起来像美国家庭宽带用户。

**能做什么**：

- 降低 Claude / 网站封号、风控风险（比机房 IP、机场更自然）
- 浏览器养号、跨境电商、强反爬采集
- 与 VPS 配合：`VPS → Novproxy 住宅 IP → 目标网站`

**不能做什么**：

- 不是服务器，不能跑程序
- 国内直连往往失败（源 IP 被拒、端口超时）

**正确连接方式**（在 VPS 上测试）：

```bash
# HTTP 代理（端口 1000，不是 443）
curl -x us.novproxy.io:1000 -U "用户名:密码" ipinfo.io

# SOCKS5 代理
curl --socks5 us.novproxy.io:1000 -U "用户名:密码" ipinfo.io
```

**国内直连常见报错**：

| 报错 | 原因 |
|------|------|
| `forbidden ip=xxx not supported` | 国内源 IP 不被支持 |
| `invalid version in initial SOCKS5 response` | 用 443 端口跑 SOCKS5（443 只支持 HTTP 代理） |
| 连接超时 | 1000 端口在国内不可达 |

**结论**：住宅 IP 主要用于浏览器/反爬场景；学 Agent、调 API **通常不需要**；若要用，建议配合海外 VPS。

### 两种网络方案对比

```
方案 A（学 Agent / 写代码）—— 推荐起步
  本机或 VPS → 直接调 Claude/GPT API
  需要：Vultr（可选但推荐）

方案 B（浏览器养号 / 强反爬）
  本机 → VPS → Novproxy 住宅 IP → 目标网站
  需要：Vultr + Novproxy
```

## 大模型（脑子）

模型只负责**思考**，不会自动改文件或跑命令；「动手」要靠 Agent 工具。

| 模型 | 厂商 | 特点 |
|------|------|------|
| Claude（Opus / Sonnet 等） | Anthropic | 长上下文、推理与改代码较稳 |
| GPT（GPT-4o / o3 等） | OpenAI | 生态大、工具多 |
| DeepSeek 等 | 国产 | 便宜、国内访问方便 |

**两种接入方式**：

| 方式 | 说明 | 适用场景 |
|------|------|----------|
| API Key | 按量付费，`utils.py` 中 `get_response()` 即此类 | 开发、Agent、自动化 |
| 订阅账号（Claude Pro 等） | 网页聊天用 | 日常对话，不适合塞进代码 |

**API Key 安全实践**（见课程项目 `utils.py`）：

- 密钥放在 `.env`，不提交 Git（`.gitignore` 已忽略）
- 提供 `.env.example` 作模板
- 不在代码里显式保存 `api_key` 变量，由 SDK 从环境变量读取
- 客户端懒加载，缺密钥时明确报错

## Agent / 开发工具

### Cursor

**形态**：带 AI 的代码编辑器（IDE）

```
你 ↔ Cursor 界面 ↔ 选择模型（Claude/GPT）↔ 读写本地项目
```

- 图形界面，适合日常写代码、跟课程学习
- Agent 可读文件、改代码、跑终端
- 跑在本机，非 24 小时后台服务

**适合**：初学 Agent、完成 `lesson2_4` 等课程。

### Claude Code

**形态**：Anthropic 出品的命令行编程 Agent

```
终端输入 claude → 读文件、改代码、执行 shell
```

- 与 Cursor Agent 类似，但纯终端、无图形界面
- 适合在 VPS 上远程开发
- 需要 Anthropic 账号或 API Key

**安装（VPS 上）**：

```bash
npm install -g @anthropic-ai/claude-code
export ANTHROPIC_API_KEY="你的key"
claude
```

### Codex

**形态**：OpenAI 出品的命令行编程 Agent

- 与 Claude Code 是**竞品**（不是一个产品的两个版本）
- 使用 GPT 系列模型
- 选型看模型偏好和已有账号

### OpenClaw

**形态**：开源个人 AI 助手 / Agent 网关（非编辑器）

```
微信 / Telegram / Discord ↔ OpenClaw Gateway ↔ 大模型 ↔ 本机工具（文件/Shell/浏览器）
```

- 24 小时运行的自动化中枢
- 可从手机发消息，让 AI 在服务器上执行任务
- 支持记忆、多 Agent、浏览器自动化
- 自托管（本机或 VPS），数据自己掌控
- 支持 Claude、GPT、DeepSeek 等

**仓库**：[openclaw/openclaw](https://github.com/openclaw/openclaw)

**定位对比**：

- Cursor = 带 AI 的 VS Code
- Claude Code / Codex = 终端里的编程助手
- OpenClaw = 可从聊天软件遥控电脑的 24 小时私人秘书

### 工具对比总表

| | Cursor | Claude Code | Codex | OpenClaw |
|--|--------|-------------|-------|----------|
| 形态 | 图形 IDE | 终端 CLI | 终端 CLI | 后台服务 + 聊天 |
| 主要用途 | 写代码、学开发 | 写代码 | 写代码 | 自动化、远程操控 |
| 模型 | 多模型可选 | Claude | GPT | 多模型可选 |
| 运行方式 | 本机 | 本机 / VPS | 本机 / VPS | 本机 / VPS 常驻 |
| 手机触发 | ❌ | ❌ | ❌ | ✅ |
| 适合阶段 | 学习入门 | VPS 远程开发 | 同上 | 进阶自动化 |

## 关系示意图

```
手机 / 电脑
    │
    ├── Cursor（写代码）─────────────┐
    ├── Claude Code / Codex ──→ Vultr 美国服务器 ──→ Novproxy 住宅 IP ──→ 目标网站
    └── OpenClaw（24h 自动化）──────┘         │
                                              ├── Claude API
                                              └── GPT API
```

## 国内使用 Claude 的注意事项

### 为什么机场容易封号

| 机场特征 | 平台判断 |
|----------|----------|
| 机房 IP（AWS/GCP 等） | 高风险 |
| 多人共用同一 IP | 批量滥用嫌疑 |
| IP 国家频繁变化 | 异常行为 |

### 降低封号风险

1. 使用固定地区 IP（如美国），避免频繁切换
2. 账号注册信息、付款方式与常用 IP 国家一致
3. 优先用 **API**，少登录网页版
4. 需要浏览器时：VPS 美国 IP，或 VPS + 住宅 IP

### 账号与 IP 策略

| 使用方式 | 封号风险 | 说明 |
|----------|----------|------|
| 浏览器 + 机场 | ⚠️⚠️⚠️ 高 | 最易被封 |
| 浏览器 + 稳定美国住宅 IP | ⚠️⚠️ 较低 | 养号场景 |
| 仅 API Key | ⚠️ 相对低 | 学 Agent 推荐 |
| Claude Code CLI 登录 | ⚠️⚠️ 中等 | 会检测 IP |

## 推荐学习路径

### 现阶段（1–2 周）

```
本机 Cursor + API Key → 完成 lesson2_4 课程
Vultr 作为备用（跑脚本、以后装 Claude Code）
Novproxy 暂不刚需
```

**课程目标**：

1. 让 Agent 读 CSV、回答问题
2. 让 Agent 写 Python 画图
3. 理解「感知 → 思考 → 调用工具 → 观察结果」循环

### 中期（2–4 周）

- 在 VPS 上部署项目、测试代理
- 尝试 Claude Code 或继续深化 Cursor Agent
- 做一个小项目：个人效率 / 数据分析 / 内容辅助

### 进阶

```
VPS 上跑 OpenClaw
  → 接 Telegram / 微信
  → 接 Claude API
  → 24 小时自动化任务
```

### 关于「Agent 自动挣钱」

现实路径通常是：

```
学会 Agent → 做出能用的自动化 → 给自己/他人省时间 → 接单或小产品
```

常见方向：评论汇总周报、素材搜集、求职信息监控、小商家数据报告等。Agent 是放大器，仍需业务判断。

## Vultr 购买与部署备忘

### 付款

- 优惠码 `250VULTRFLY`（$250 试用）**不支持支付宝**，需信用卡或 PayPal
- 去掉优惠码后可用支付宝充值 $10
- 账单地址示例（西安理工大学金花校区）：

| 字段 | 内容 |
|------|------|
| Name | Liang Tong |
| Country | China |
| Address | No. 5 Jinhua South Road, Jinhua Campus |
| Address line 2 | Xi'an University of Technology, Beilin District |
| City | Xi'an |
| Postal Code | 710048 |

### 部署检查清单

- [ ] 邮箱已验证（否则部署页可能白屏）
- [ ] 使用正式部署页 `console.vultr.com/deploy/`（非 beta）
- [ ] Shared CPU，非 Dedicated CPU
- [ ] 套餐 $5/月（vc2-1c-1gb），非 $10+ 高配
- [ ] 关闭自动备份
- [ ] Ubuntu 22.04 LTS
- [ ] 状态 Running 后记录 IP 与 root 密码

### 上传项目到 VPS

```bash
# 在本机执行
scp -r /home/simple/codes/Agent_Lesson_WUENDA/lesson2_4 root@你的VPS的IP:~/projects/

# 在 VPS 上
cd ~/projects/lesson2_4
pip3 install pandas matplotlib pillow python-dotenv openai anthropic ipython
nano .env   # 填入 API Key
python3 main.py
```

## 费用粗算

| 项目 | 月费（约） | 是否必需（学习阶段） |
|------|-----------|---------------------|
| Vultr 1核1G | $5（≈¥35） | 推荐 |
| Novproxy 住宅 IP | 按流量 | 非必需 |
| Claude / GPT API | $5–20 按用量 | 必需 |
| Cursor | 免费版或订阅 | 已有 |

## 一句话速查

| 组件 | 作用 |
|------|------|
| **Vultr** | 美国远程电脑，稳定网络环境 |
| **Novproxy** | 伪装成家庭用户的 IP，防封 / 反爬 |
| **大模型 API** | 脑子，只思考不动手 |
| **Cursor** | 带 AI 的编辑器，最适合入门 |
| **Claude Code** | 终端编程 Agent，适合 VPS |
| **Codex** | OpenAI 版终端编程 Agent |
| **OpenClaw** | 聊天遥控电脑的 24h 自动化平台 |

## 课程相关文件

| 文件 | 说明 |
|------|------|
| `utils.py` | API 客户端、数据处理、HTML 展示 |
| `.env` | API 密钥（勿提交 Git） |
| `.env.example` | 环境变量模板 |
| `.gitignore` | 忽略 `.env` 等敏感文件 |
| `main.py` | 课程入口示例 |
