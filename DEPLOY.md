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

## 五、国内直连（可选）

当前站点部署在 Vercel，服务器在海外。在国内部分网络下，`*.vercel.app` 可能被限速或需代理才能访问（如手机报 `ERR_CONNECTION_RESET`）。若希望**国内不挂代理也能稳定打开**，可考虑以下方式。

### 方案 A：备案 + 国内云（真正国内直连）

- 购买**国内服务器或静态托管**（如阿里云 OSS + CDN、腾讯云 Web 托管、华为云等）。
- 对域名做 **ICP 备案**（用国内服务必须备案）。
- 将本项目 `npm run build` 后的产物（或对接 CI）部署到国内云，域名解析到国内节点。
- 这样国内访问走国内网络，无需代理，速度和稳定性最好。

### 方案 B（推荐）：Cloudflare CDN + 自定义域名

**架构**：用户 → Cloudflare CDN → Vercel → 你的 Next.js 博客  

**优点**：全球 CDN、国内访问通常比直连 vercel.app 更稳定、**无需备案**、免费。很多技术博客采用此方案。

**步骤**：

1. **购买域名**  
   Namecheap、阿里云等，例如 `liangtong.dev`、`liangtong.site`，一年几十元。

2. **域名接入 Cloudflare**  
   - 打开 [dash.cloudflare.com](https://dash.cloudflare.com)，添加站点（你的域名）。  
   - Cloudflare 会给出两个 NS，例如 `xxx.ns.cloudflare.com`。  
   - 到域名注册商处把域名的 **Nameserver** 改为这两个，等待 5～10 分钟生效。

3. **Cloudflare DNS 指向 Vercel**  
   在 Cloudflare 的 **DNS** 里添加：  
   - **Type**：CNAME  
   - **Name**：`blog`（或 `@` 若要用根域名）  
   - **Target**：`你的项目.vercel.app`（如 `my-space-lovat.vercel.app`）  
   - 保存。

4. **Vercel 添加该域名**  
   - Vercel 项目 → **Settings → Domains → Add**。  
   - 填写：`blog.你的域名.com`（与上一步 Name 对应）。  
   - 按提示在 DNS 里添加 CNAME（若已按上一步在 Cloudflare 配好，通常会自动验证通过）。

5. **开启 Cloudflare 代理（橙色云朵）**  
   - 回到 Cloudflare **DNS**，找到刚才的 CNAME 记录。  
   - 把该记录右侧的 **代理状态** 点成 **已代理**（橙色云朵 ☁️），这样流量会经 Cloudflare CDN 再转发到 Vercel。

6. **可选：加速与压缩**  
   - **Speed → Optimization → Auto Minify**：勾选 HTML、CSS、JavaScript。  
   - **Speed → Optimization → Brotli**：开启 Brotli 压缩。

7. **更新环境变量**  
   - 在 Vercel **Settings → Environment Variables** 中，将 `NEXT_PUBLIC_SITE_URL` 改为 `https://blog.你的域名.com`，然后 **Redeploy** 一次。

**访问**：使用 `https://blog.你的域名.com`。国内访问通常会比直接打开 `xxx.vercel.app` 更稳定，具体效果因运营商而异。

### 方案 C：双线部署（海外 Vercel + 国内镜像）

- 海外继续用 Vercel（国外访问快）。
- 国内单独部署一份：备案后把构建产物部署到阿里云 / 腾讯云等，或使用支持国内加速的静态托管。
- 域名解析可做「智能解析」：国内 IP 走国内服务器，海外 IP 走 Vercel。

**小结**：要稳定国内直连，通常需要**备案 + 国内机房/CDN**；仅用 Vercel 且不备案时，国内访问可能仍需代理或受网络环境影响。

---

## 六、之后更新博客

每次把新文章或改动用 Git 推送到同一分支（如 `main`），Vercel 会自动重新构建并发布，无需手动再点部署。

```bash
git add .
git commit -m "新文章：xxx"
git push origin main
```

---

## 常见问题

- **Deployment failed**：
  1. 在 Vercel 的 **Deployments** 里点进失败的那次，展开 **Build Logs**，拉到最下面看**具体报错行**（你贴的日志若在 “Installing dependencies...” 就断掉，需要看后面的报错）。
  2. 确认部署的是**最新提交**：日志里会写 `Commit: xxx`，若还是旧 commit（如 f3affe4），到 GitHub 确认已 push 最新代码，再在 Vercel 点 **Redeploy**。
  3. 在 Vercel 项目 **Settings → General** 里可勾选 **Override** 将 Node.js 版本设为 **18.x** 或 **20.x**。
  4. 若报错与依赖有关，可在 **Settings → General** 里启用 **Clear build cache** 后重新部署。
- **构建失败（本地可复现）**：本地执行 `npm run build` 看报错，常见是依赖或 Node 版本（本项目需 Node ≥18）。
- **RSS 里链接不对**：检查 `NEXT_PUBLIC_SITE_URL` 是否设为当前实际访问的完整地址（含 `https://`），并已 Redeploy。
- **样式或功能与本地不一致**：确认分支、环境变量与本地一致，必要时清缓存再 Redeploy。
- **国内无法直连 / 必须开代理**：Vercel 在海外，国内部分网络会限速或重置连接。若需国内直连，请参考上文 **五、国内直连**（备案 + 国内云，或自定义域名/双线等方案）。

完成上述步骤后，博客就可以在公网访问了；之后有需要再逐步加功能即可。
