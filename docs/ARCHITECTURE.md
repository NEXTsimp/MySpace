# My Space 博客项目：技术架构与运行原理

本文档面向二次开发，说明当前仓库的技术栈、目录职责、页面加载方式，并以 **PDF 小工具** 为例说明「纯前端处理」的实现与数据流。

---

## 1. 技术栈总结

### 1.1 核心框架与运行时

| 技术 | 版本（见 `package.json`） | 说明 |
|------|---------------------------|------|
| **Next.js** | `16.1.6` | App Router、服务端/客户端组件、静态生成与元数据 |
| **React** | `19.2.3` | UI 与客户端状态 |
| **TypeScript** | `^5` | 类型检查 |
| **Node.js** | `>=18`（`engines`） | 本地开发、`next build` / `next start` 运行环境 |

### 1.2 样式与 UI

| 技术 | 版本 | 说明 |
|------|------|------|
| **Tailwind CSS** | `4.2.1` | 原子化样式（`@tailwindcss/postcss`） |
| **@tailwindcss/typography** | `^0.5.19` | 博客正文 `prose` 排版 |
| **next-themes** | `^0.4.6` | 明暗主题（`ThemeProvider` + `class` 策略） |
| **Geist / Geist Mono** | `next/font/google` | 根布局中的字体变量 |

### 1.3 博客与内容

| 库 | 用途 |
|----|------|
| **gray-matter** | 解析 Markdown 前置元数据（`lib/posts.ts`） |
| **react-markdown** + **remark-gfm** + **rehype-raw** | 文章正文渲染 |
| **@notionhq/client** | 游戏日常等数据（`lib/notion.ts`，服务端拉取） |

### 1.4 工具页（浏览器端）

| 库 | 用途 |
|----|------|
| **pdf-lib** | PDF 创建、合并、拆分、旋转、N-up 排版、`copyPages` |
| **pdfjs-dist** | 在浏览器中解析 PDF、渲染缩略图/预览（Canvas） |
| **sortablejs** | N-up 场景下缩略图拖拽排序 |
| **jszip** | 打包下载（如 N-up ZIP、按章节拆分 ZIP） |
| **browser-image-compression** | 图片工具箱 |
| **qr-code-styling** | 二维码工具 |

### 1.5 其他

| 库 | 用途 |
|----|------|
| **@vercel/analytics** | Web 分析（根布局挂载 `<Analytics />`） |
| **@giscus/react** | 文章评论（GitHub Discussions，需环境变量） |

---

## 2. 架构梳理：纯前端 PDF 与页面如何加载

### 2.1 根布局 `app/layout.tsx` 做什么

- **服务端组件**（默认，无 `"use client"`）：在构建/请求时生成整站外壳的 HTML 结构。
- 定义全站 **`metadata`**、`viewport`、`metadataBase`（用于 RSS、OG 等绝对 URL）。
- 结构大致为：
  - `<html lang="zh-CN">` + `<body>`（字体变量、Tailwind 类名）
  - **`<ThemeProvider>`**（`next-themes`）：包裹导航、主内容、页脚、音乐组件等。
  - **`<main>`**：子路由通过 `{children}` **插槽**注入各页面内容。
  - **`<Analytics />`**：放在 `</ThemeProvider>` 之后、`</body>` 末尾，符合 Vercel 建议挂载位置。

**结论**：用户访问任意路由时，先得到带 Navbar/Footer 的壳；**具体路由页面**是 `children`，由 Next.js 按 URL 选择 `app/.../page.tsx` 渲染。

### 2.2 PDF 页 `app/tools/pdf/page.tsx` 如何实现「纯前端 PDF 处理」

1. **文件顶部有 `"use client"`**  
   表示该模块在**浏览器**中作为客户端组件运行，可使用 `File`、`FileReader`、`ArrayBuffer`、`Canvas`、动态 `import("pdfjs-dist")` 等 Web API。

2. **没有调用后端 API**  
   PDF 字节来自 `input[type=file]` 或 `file.arrayBuffer()`，处理在 **tab 主线程 + pdfjs worker（CDN）** 中完成；结果通过 `Blob` / `URL.createObjectURL` / `<a download>` 触发下载。

3. **两套能力分工**  
   - **pdfjs-dist**：`getDocument({ data: cloneBytes(...) })` 读入 PDF，渲染页到 Canvas 得到缩略图、预览图；按章节拆分时还可 `getOutline()`、`getTextContent()` 等。  
   - **pdf-lib**：`PDFDocument.load` / `create`、`copyPages`、`embedPdf`、`drawPage` 等生成/修改 PDF 二进制。

4. **`cloneBytes`（`Uint8Array` 拷贝）**  
   避免同一份 `ArrayBuffer` 被多个库转移或销毁后出现 **detached ArrayBuffer** 错误；凡传入 `pdfjs` 或 `pdf-lib` 的入口，优先使用拷贝后的字节。

5. **与「服务端」的关系**  
   - 部署到 Vercel 时：Node 只负责把 **HTML + JS 静态资源** 下发；**PDF 运算不在 Node 里执行**。  
   - 本地 `npm run dev` 时同理，运算仍在浏览器。

### 2.3 页面是如何被加载和渲染的（Next.js App Router）

1. 用户访问 `/tools/pdf`。  
2. Next.js 匹配 **`app/tools/pdf/page.tsx`**，与 **`app/layout.tsx`**（及上级的 `layout` 若存在）组合。  
3. `page.tsx` 为 Client Component 时：服务端仍会输出其**占位与骨架**，再在客户端 **hydration** 后执行 hooks、事件与 PDF 逻辑。  
4. 构建时（`next build`）该路由一般为 **静态预渲染**（`○ /tools/pdf`），HTML 可缓存；交互仍全部在客户端。

---

## 3. 文件目录结构（职责说明）

### 3.1 `app/`

| 路径 | 职责 |
|------|------|
| **`layout.tsx`** | 根布局、字体、全局元数据、主题、导航、Footer、Analytics |
| **`page.tsx`** | 首页 |
| **`globals.css`** | 全局 CSS 与 Tailwind 入口 |
| **`blog/`** | 博客列表、文章详情 `[slug]`、标签/归档/搜索等 |
| **`gaming/`** | 游戏日常（服务端拉 Notion） |
| **`tools/`** | 工具箱首页 `page.tsx`；`image`、`pdf`、`qr` 各为独立页面 |
| **`components/`** | 共用组件（Navbar、Footer、Theme、Comments、音乐等） |
| **`feed.xml/route.ts`** | RSS 路由处理器 |
| **`subscribe/`** | 订阅说明等 |

### 3.2 `lib/`

| 文件 | 职责 |
|------|------|
| **`posts.ts`** | 从仓库内 `posts/*.md` 读文件、`gray-matter` 解析，提供 `getAllPosts`、`getPostBySlug` 等（**构建/服务端**读文件系统） |
| **`notion.ts`** | Notion API 客户端与 `getGames()` 等（**仅服务端**，需环境变量） |
| **`data/tools.ts`** | **工具箱数据**（`ToolItem[]`）：名称、链接、描述、图标、分类；供 `app/tools/page.tsx` 渲染卡片列表；**不**包含 PDF 逻辑本身 |

### 3.3 `posts/`（若存在）

- 存放 Markdown 博文，与 `lib/posts.ts` 约定路径一致。

### 3.4 其他

- **`.env.example` / `.env.local`**：站点 URL、Notion、Giscus 等（勿提交密钥）。  
- **`package.json`**：依赖与脚本。

---

## 4. 数据流分析：以 N-up 为例（上传 PDF → 生成新 PDF 下载）

下列路径对应 `app/tools/pdf/page.tsx` 中的典型流程，便于你二次开发时定位代码。

### 4.1 用户选择文件

1. 用户通过 `<input type="file" accept="application/pdf">` 选择 PDF。  
2. **`onPickPdf(file)`**（或等价逻辑）：
   - `setSrcFile(file)`、`setError(null)` 等。  
   - `const bytes = new Uint8Array(await file.arrayBuffer())` → **`setSrcBytes(bytes)`**。

### 4.2 生成缩略图（仅 UI / 排序）

3. **`renderPdfThumbnails(bytes)`**（pdfjs）：
   - `loadPdfJs()` → `getDocument({ data: cloneBytes(bytes) })`  
   - 逐页 `getPage` → `render` 到 Canvas → `toDataURL`  
   - 得到 **`PdfPageThumb[]`** → **`setThumbs(...)`**。

4. **SortableJS**（`useEffect` 挂载在 `thumbsRef` 上）拖拽结束时，**重排 `thumbs` 数组**，从而改变「顺序页索引」**`orderedIndices`**（由 `useMemo` 从 `thumbs` 推导）。

### 4.3 生成排版 PDF（N-up）

5. 参数变化或点击「生成」时触发 **`runNup()`** / 防抖 effect（内部调用 **`buildNupPdf({...})`**）：
   - `PDFDocument.load(cloneBytes(srcBytes))`  
   - 按 `preset`（2/4/6/9）、纸张、边距、间距等，用 **`embedPdf` + `drawPage`** 等在新页上排版。  
   - 输出 **`out.save()`** → **`Uint8Array`** → **`setOutBytes`**。

### 4.4 预览图

6. 对输出字节可再次用 pdfjs **`renderPdfPageToDataUrl`** 或类似逻辑，得到 **`previewUrl`**（Data URL），用于右侧预览；**非必须**与最终 PDF 同引擎，但坐标算法在 `buildNupPdf` 中与「contain」缩放一致。

### 4.5 下载

7. **`downloadBytes(outBytes, filename)`**：
   - `Blob` + 临时 `<a download>` + `URL.revokeObjectURL`，**不经过服务器**。

### 4.6 状态变化小结（N-up）

| 阶段 | 主要 state / 含义 |
|------|-------------------|
| 未选文件 | `srcFile`、`srcBytes` 为空 |
| 已读入 | `srcBytes`、`thumbs`、`status` |
| 参数调整 | `preset`、`paperSize`、`orientation`、`marginMm` 等 |
| 已生成 | `outBytes`、`previewUrl`（若有） |
| 下载 | 读取 `outBytes` 触发浏览器下载 |

### 4.7 其他 Tab（简述）

- **合并**：`mergePdfs` → 多文件 `copyPages` 追加。  
- **拆分**：`splitPdf` → 指定页范围 `copyPages`。  
- **按章节拆分**：`analyzePdfChapters`（outline / 文本扫描）→ `buildChapterRanges` → `extractChapterPdfStripped` → **JSZip** 打包 ZIP。  
- **旋转 / 图片转 PDF**：`rotatePdf`、`imagesToA4Pdf` 等。

---

## 5. 博客整体数据流（简要）

- **文章列表/详情**：`lib/posts.ts` 在 **构建时或 Node 服务端** 读 `posts/*.md`，与 PDF 工具无关。  
- **游戏日常**：`app/gaming/page.tsx` 等调用 **`getGames()`**（`lib/notion.ts`），数据来自 Notion API，**非** PDF 工具流。  
- **RSS**：`app/feed.xml/route.ts` 动态路由输出 XML。

---

## 6. 二次开发建议

1. **改 PDF 功能**：主要编辑 **`app/tools/pdf/page.tsx`**；注意 **`cloneBytes`** 与异步大文件 UI（进度、防抖）。  
2. **新工具页**：在 `app/tools/<name>/page.tsx` 新增路由，并在 **`lib/data/tools.ts`** 增加条目以便工具箱首页展示。  
3. **新博文**：在 `posts/` 增加 Markdown，并保证 frontmatter 与 `lib/posts.ts` 约定一致。  
4. **环境变量**：复制 `.env.example`，在 Vercel/本地配置 `NEXT_PUBLIC_*` 与密钥类变量。

---

*文档生成自当前仓库结构；若依赖版本或文件路径变更，请以 `package.json` 与仓库实际文件为准。*
