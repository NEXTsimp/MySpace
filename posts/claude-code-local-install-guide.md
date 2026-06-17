---
title: "Claude Code 本机安装指南"
date: "2026-06-17"
category: "技术栈"
description: "在本机 Linux 安装 Claude Code 终端 Agent：Node.js 20 升级、npm 安装、API Key 配置与常见问题排查。"
---

> 在 **本机 Linux** 安装 Claude Code 终端 Agent，用于写代码、跑任务、多 Agent 并行。  
> 浏览器访问 claude.ai 的代理方案见其他文档；**开发写代码在本机完成，不必 SSH 到 VPS**。

## 整体分工

| 用途 | 在哪里做 | 工具 |
|------|----------|------|
| 浏览器聊 claude.ai | 本机 + VPS 代理 | ZeroOmega + SSH 隧道 + gost |
| **写代码 / 终端 Agent** | **本机** | **Claude Code + API Key** |
| 学 Agent 课程 | 本机 | Cursor 或 Claude Code |
| 24h 自动多任务（进阶） | VPS | OpenClaw（可选） |

```
本机 Claude Code  →  Anthropic API（按量付费）
本机 Cursor       →  同一 API Key 亦可
VPS               →  仅负责浏览器代理，不负责写代码
```

## 前置条件

1. **Anthropic API Key**
   - 打开 [console.anthropic.com](https://console.anthropic.com)
   - API Keys → Create Key
   - 充值少量余额（学习阶段 $5–10 通常够用）
   - ⚠️ 用 **API Key**，不要用 Claude Pro 订阅登录 Claude Code（违反条款）

2. **本机系统**
   - Ubuntu 22.04（或其他 Linux）
   - 能访问 npm / NodeSource（或可用 nvm 镜像）

3. **不必**
   - 不必在 VPS 上开发
   - 不必为 Claude Code 配置住宅 IP（API 调用与浏览器代理分开）

国内网络若无法直连 `api.anthropic.com`，参见 [Claude Code 本机代理配置指南](/blog/claude-code-local-proxy-guide)。

## 安装 Node.js 20

Claude Code 要求 **Node.js ≥ 18**，推荐 **20 LTS**。

### 检查当前版本

```bash
node -v
npm -v
```

若显示 `v12.x` 或更低，必须升级。

### 安装 NodeSource 源并安装 Node 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # 应显示 v20.x
```

### 若与旧包冲突（常见）

报错类似：

```
trying to overwrite '/usr/include/node/common.gypi',
which is also in package libnode-dev 12.22.9~dfsg-...
```

**先卸掉 Ubuntu 自带的旧 Node，再重装：**

```bash
sudo apt remove -y nodejs libnode-dev npm
sudo apt autoremove -y
sudo dpkg --configure -a
sudo apt -f install -y

sudo apt-get install -y nodejs
node -v
```

### 若 /boot 分区满导致安装失败

报错：`No space left on device`（写 initramfs 时）

```bash
df -h /boot
```

若 `/boot` 可用空间 < 50MB：

```bash
# 查看当前内核（保留这个）
uname -r

# 删除旧内核
sudo apt autoremove --purge -y
sudo apt purge -y linux-image-5.19.0-051900-generic linux-headers-5.19.0-051900-generic 2>/dev/null
sudo apt purge -y linux-image-6.8.0-59-generic linux-headers-6.8.0-59-generic 2>/dev/null

sudo apt clean
df -h /boot   # 应有 100MB+ 可用

# 再装 Node
sudo apt-get install -y nodejs
```

### 备选：nvm（不碰系统包，免 sudo 冲突）

apt 一直失败时可用：

```bash
curl -o- https://gitee.com/mirrors/nvm/raw/master/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node -v
```

## 安装 Claude Code

### 配置 npm 用户目录（避免 EACCES 权限错误）

**不要用** `sudo npm install -g`（易搞乱权限）。

```bash
mkdir -p ~/.npm-global
npm config set prefix "$HOME/.npm-global"

echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### 安装

```bash
npm install -g @anthropic-ai/claude-code
```

> ⚠️ 包名是 `@anthropic-ai/claude-code`，末尾不要多写 `e`。

### 验证

```bash
claude --version
```

若提示 `command not found`：

```bash
hash -r
which claude
echo $PATH   # 应含 ~/.npm-global/bin
```

## 配置 API Key

### 环境变量（推荐）

```bash
echo 'export ANTHROPIC_API_KEY="sk-ant-你的key"' >> ~/.bashrc
source ~/.bashrc

# 验证（应有输出，勿泄露给他人）
echo $ANTHROPIC_API_KEY | head -c 20
```

### 项目级 .env（与 lesson2_4 共用）

在课程目录：

```bash
cd ~/codes/Agent_Lesson_WUENDA/lesson2_4
cp .env.example .env
nano .env
```

```env
ANTHROPIC_API_KEY=sk-ant-你的key
OPENAI_API_KEY=你的openai-key（可选）
```

`.env` 已在 `.gitignore` 中，勿提交 Git。

## 首次启动与登录

### 进入项目目录并启动

```bash
cd ~/codes/Agent_Lesson_WUENDA/lesson2_4
claude
```

或在 **Cursor 内置终端** 中执行 `claude`（左边编辑、右边 Agent）。

### 首次配置向导

| 步骤 | 建议选择 |
|------|----------|
| 主题 | Dark mode |
| 登录方式 | **② Anthropic Console · API usage billing** |
| OAuth / 浏览器 | 本机浏览器完成；失败则直接用 API Key 环境变量 |

若 OAuth 页面显示「控制台暂时不可用」：

1. 用 ZeroOmega 代理打开 console.anthropic.com（参见 [Claude 浏览器住宅代理配置指南](/blog/claude-browser-residential-proxy-guide)）
2. 或跳过 OAuth，确保 `ANTHROPIC_API_KEY` 已 export 后重新 `claude`

### 简单试用

在 `claude` 里输入：

```
读取当前目录有哪些文件，并简要说明 main.py 做什么
```

或：

```
创建一个 hello.py，打印 Hello World，然后运行它
```

## 多 Agent 并行（进阶）

Claude Code 支持在同一终端会话中派出多个子 Agent：

```
请并行派出 3 个子 agent：
1. 分析 utils.py 的结构
2. 检查 .env 安全配置是否合理
3. 给 lesson2_4 写一段 README 大纲
完成后汇总结果
```

| 模式 | 说明 |
|------|------|
| **Subagents** | 主会话内并行派工，适合调研、分项审查（建议 3～5 个） |
| **Agent Teams** | 多个独立会话协作（实验功能） |
| **OpenClaw** | VPS 上 7×24 自动多 Agent（另见 OpenClaw 文档） |

官方文档：[Run agents in parallel](https://code.claude.com/docs/en/agents)

## 与 Cursor 的关系

| | Cursor | Claude Code |
|--|--------|-------------|
| 形态 | 图形 IDE | 终端 CLI |
| 适合 | 跟课程、可视化改代码 | 终端党、脚本化、Subagents |
| 是否都要装 | 否，二选一或一起用 | 否 |

**建议**：课程用 Cursor；想玩终端多 Agent 用 Claude Code；共用同一个 API Key。

## 常见问题

| 现象 | 原因 | 解决 |
|------|------|------|
| `EBADENGINE` Node < 18 | Node 太旧 | 按上文升级到 Node 20 |
| `EACCES` mkdir node_modules | 全局安装无权限 | 用 `~/.npm-global` |
| `No space left on device` | `/boot` 满 | 删旧内核 |
| `libnode-dev` 冲突 | 旧 Node 12 未卸 | `apt remove libnode-dev nodejs` 后重装 |
| `command not found: claude` | PATH 未生效 | `source ~/.bashrc`；检查 `~/.npm-global/bin` |
| 装了 `claude-codee` | 包名拼写错误 | 卸载后装 `@anthropic-ai/claude-code` |
| OAuth 打不开 | 国内网络 | 代理访问 console 或只用 API Key |
| API 401 | Key 无效 | 在 console 重新生成 Key |
| `ECONNREFUSED` api.anthropic.com | 国内无法直连 API | 参见 [Claude Code 本机代理配置指南](/blog/claude-code-local-proxy-guide) |

## 安装检查清单

```
□ node -v  →  v20.x
□ npm -v   →  10.x
□ claude --version  →  有版本号
□ echo $ANTHROPIC_API_KEY  →  有值（sk-ant-...）
□ cd lesson2_4 && claude  →  能进入交互界面
□ 能执行读文件、写文件、跑命令
```

## 完整命令速查（复制执行）

```bash
# --- Node.js 20 ---
sudo apt remove -y nodejs libnode-dev npm 2>/dev/null
sudo apt autoremove -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v

# --- Claude Code ---
mkdir -p ~/.npm-global
npm config set prefix "$HOME/.npm-global"
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
echo 'export ANTHROPIC_API_KEY="sk-ant-你的key"' >> ~/.bashrc
source ~/.bashrc
npm install -g @anthropic-ai/claude-code
claude --version

# --- 启动 ---
cd ~/codes/Agent_Lesson_WUENDA/lesson2_4
claude
```

## 相关文档

| 文章 | 说明 |
|------|------|
| [Claude Code 本机代理配置指南](/blog/claude-code-local-proxy-guide) | 终端 HTTP_PROXY 配置 |
| [Claude 浏览器住宅代理配置指南](/blog/claude-browser-residential-proxy-guide) | 浏览器 ZeroOmega 配置 |
| [Agent 工具栈指南](/blog/agent-toolstack-guide) | 整体工具栈 |