---
title: "Next.js 实战小技巧"
date: "2025-03-10"
category: "技术栈"
description: "记录在 Next.js App Router 开发中积累的一些实用技巧与踩坑经验。"
---

## 服务端组件与客户端组件

在 App Router 中，默认所有组件都是 **Server Component**。只有在需要交互（如 `useState`、`onClick`）或浏览器 API 时，才在文件顶部加上 `"use client"`。

合理划分可以减小客户端 bundle，提升首屏性能。

## 动态路由与 generateStaticParams

对于内容站点的文章详情页，可以在构建时通过 `generateStaticParams` 预渲染所有文章路径，既享受静态生成的性能，又无需在运行时读文件系统。

```ts
export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map((p) => ({ slug: p.slug }));
}
```

## 小结

以上是近期在个人博客项目中的一点总结，后续会继续补充。
