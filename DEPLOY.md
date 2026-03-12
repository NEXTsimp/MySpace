# 博客部署清单

按顺序完成以下步骤即可把博客从「仅本地」部署到公网。

---

## 一、部署前准备

### 1. 代码推送到 Git

确保项目已推送到 GitHub / GitLab / Gitee 等（Vercel 需要连 Git 仓库）。

```bash
git add .
git commit -m "chore: ready for deploy"
git push origin main
```

（若主分支叫 `master` 则改为 `git push origin master`。）

### 2. 环境变量（上线后必配）

博客和 RSS 里会用到的站点地址，部署完成后在 Vercel 里配置即可（见下文）。

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `NEXT_PUBLIC_SITE_URL` | 网站完整地址，用于 RSS、Open Graph 等 | `https://your-blog.vercel.app` 或自定义域名 |

不配置也能跑，但 RSS 和分享链接会变成默认的 `https://example.com`，建议上线后尽快填上。

---

## 二、用 Vercel 部署（推荐）

### 1. 注册 / 登录

- 打开 [vercel.com](https://vercel.com)，用 GitHub（或 GitLab/Bitbucket）登录。

### 2. 导入项目

- 点击 **Add New… → Project**。
- 选择你的博客仓库（如 `your-name/blog`）。
- **Framework Preset** 选 **Next.js**（一般会自动识别）。
- **Root Directory** 保持默认（项目根目录）。
- 无需改 **Build and Output Settings**，直接下一步。

### 3. 配置环境变量

在 **Environment Variables** 里添加：

- **Name**: `NEXT_PUBLIC_SITE_URL`
- **Value**: 先填 Vercel 给的预览地址，例如 `https://blog-xxx.vercel.app`（部署成功后会在项目里看到）。
- 环境勾选 **Production**（以及需要的话 Preview、Development）。

然后点击 **Deploy**。

### 4. 等待构建

- 构建约 1～3 分钟。
- 完成后会得到一个 **Production URL**，例如 `https://blog-xxx.vercel.app`。

### 5. 把正式地址写回环境变量（重要）

- 进入 Vercel 项目 → **Settings → Environment Variables**。
- 把 `NEXT_PUBLIC_SITE_URL` 改成你的**正式访问地址**（上一步的 Production URL 或后面绑定的自定义域名）。
- 保存后到 **Deployments** 里对最新一次部署点 **Redeploy**，让新环境变量生效。

---

## 三、部署后自检

在浏览器里过一遍，确认没问题：

| 项 | 操作 |
|----|------|
| 首页 | 打开首页，看排版和链接是否正常。 |
| 博客列表 | 点「博客」，看文章列表和分类筛选。 |
| 文章页 | 点进一篇文章，看正文、返回链接。 |
| 工具箱 | 点「工具箱」，看卡片和跳转。 |
| RSS | 打开 `/feed.xml` 或从订阅页复制地址，用 RSS 阅读器添加一次。 |
| 移动端 | 用手机或开发者工具设备模拟，看导航、正文、按钮是否正常。 |

---

## 四、可选：绑定自定义域名

1. 在 Vercel 项目里点 **Settings → Domains**。
2. 添加你的域名（如 `blog.yourdomain.com`），按提示在域名服务商处添加 CNAME 或 A 记录。
3. 域名生效后，把 **Settings → Environment Variables** 里的 `NEXT_PUBLIC_SITE_URL` 改为该域名（含 `https://`），再 **Redeploy** 一次。

---

## 五、之后更新博客

每次把新文章或改动用 Git 推送到同一分支（如 `main`），Vercel 会自动重新构建并发布，无需手动再点部署。

```bash
git add .
git commit -m "新文章：xxx"
git push origin main
```

---

## 常见问题

- **构建失败**：在 Vercel 的 **Deployments** 里点进失败的那次，看 **Building** 日志里的报错（常见是依赖或 Node 版本问题）。
- **RSS 里链接不对**：检查 `NEXT_PUBLIC_SITE_URL` 是否设为当前实际访问的完整地址（含 `https://`），并已 Redeploy。
- **样式或功能与本地不一致**：确认分支、环境变量与本地一致，必要时清缓存再 Redeploy。

完成上述步骤后，博客就可以在公网访问了；之后有需要再逐步加功能即可。
