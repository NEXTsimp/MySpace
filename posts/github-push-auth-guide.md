---
title: "GitHub 推送鉴权指南：SSH 与 Token 两种方式"
date: "2026-06-17"
category: "技术栈"
description: "GitHub 已不支持密码推送，本文记录 SSH 公钥与 HTTPS Personal Access Token 两种鉴权方式的配置步骤与常见问题。"
---

> GitHub 从 2021 年起不再支持用**账号密码**推送代码。执行 `git push` 时若出现 `Invalid username or token` 或 `Permission denied (publickey)`，需要改用 **SSH 公钥** 或 **Personal Access Token（PAT）** 之一。

## 为什么会失败

| 报错 | 常见原因 |
|------|----------|
| `Invalid username or token. Password authentication is not supported` | 远程地址是 HTTPS，却在 Password 处填了 GitHub 登录密码 |
| `Permission denied (publickey)` | 远程地址是 SSH，但公钥未添加到 GitHub 账号 |

查看当前远程地址：

```bash
git remote -v
```

- `https://github.com/用户名/仓库.git` → 需用 **Token**
- `git@github.com:用户名/仓库.git` → 需用 **SSH 公钥**

## 方案 A：SSH 推送（推荐）

配置一次后无需反复输入密码，适合日常开发。

### 1. 检查本机是否已有密钥

```bash
ls ~/.ssh/id_ed25519.pub
```

若文件不存在，生成新密钥：

```bash
ssh-keygen -t ed25519 -C "你的邮箱"
# 一路回车即可使用默认路径和空密码
```

### 2. 复制公钥

```bash
cat ~/.ssh/id_ed25519.pub
```

输出类似：

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... 15991304821@163.com
```

### 3. 添加到 GitHub

1. 打开 [GitHub SSH Keys 设置页](https://github.com/settings/keys)
2. 点击 **New SSH key**
3. **Title** 填设备名（如 `simple-CREFG-XX`）
4. **Key** 粘贴整行公钥
5. 保存

### 4. 切换远程地址并测试

```bash
cd ~/codes/simple_projects/MySpace

# 改用 SSH 地址
git remote set-url origin git@github.com:NEXTsimp/MySpace.git

# 测试连接（成功会提示 Hi NEXTsimp! ...）
ssh -T git@github.com
```

若提示 `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED`，说明本机 `known_hosts` 里 GitHub 的旧指纹过期，执行：

```bash
ssh-keygen -f ~/.ssh/known_hosts -R "github.com"
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
ssh -T git@github.com
```

### 5. 推送

```bash
git push origin master
```

## 方案 B：HTTPS + Token

不想配置 SSH 时可用此方案。Token 相当于「专用密码」，**不能填 GitHub 登录密码**。

### 1. 生成 Personal Access Token

1. 打开 [GitHub Tokens 设置页](https://github.com/settings/tokens)
2. **Generate new token (classic)**
3. 勾选 **`repo`** 权限（推送私有/公开仓库都需要）
4. 生成后**立即复制 Token**（页面关闭后不再显示）

### 2. 推送时用 Token 当密码

```bash
git push origin master
```

- **Username**：GitHub 用户名（如 `NEXTsimp`）
- **Password**：粘贴 Token（不是登录密码）

### 3. 可选：让 Git 记住凭据

```bash
git config --global credential.helper store
```

下次输入一次 Token 后会保存到 `~/.git-credentials`，不必每次粘贴。

## 两种方案对比

| | SSH | HTTPS + Token |
|--|-----|---------------|
| 配置难度 | 需生成密钥并上传到 GitHub | 需生成 Token |
| 日常使用 | 免输入，一劳永逸 | 首次或过期时需输入 |
| 安全性 | 私钥留在本机 | Token 可设过期时间和权限范围 |
| 推荐场景 | 长期开发、多台设备 | 临时推送、CI 脚本 |

## 常见问题

| 问题 | 解决 |
|------|------|
| SSH 测试仍 `Permission denied` | 确认公钥已添加到**当前登录的 GitHub 账号**，且复制的是 `.pub` 公钥而非私钥 |
| HTTPS 填 Token 仍失败 | 确认 Token 未过期，且勾选了 `repo` 权限 |
| 推送成功但 Vercel 未更新 | 确认推送到正确分支（如 `master`），在 Vercel Deployments 查看构建状态 |
| 想切换回 HTTPS | `git remote set-url origin https://github.com/NEXTsimp/MySpace.git` |

## 小结

- GitHub **不支持**用登录密码推送
- **SSH**：`git@github.com:用户/仓库.git` + 本机公钥绑定 GitHub
- **HTTPS**：`https://github.com/用户/仓库.git` + Token 当密码

本博客部署在 Vercel，每次 `git push origin master` 成功后会自动重新构建发布。
