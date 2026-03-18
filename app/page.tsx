import Link from "next/link";
import { getLatestPosts } from "@/lib/posts";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "个人空间",
  description:
    "热爱技术的开发者，喜欢折腾好玩的工具。这里记录技术栈的实践与生活里的一点感悟。",
};

export default function HomePage() {
  const latestPosts = getLatestPosts(3);

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="text-center sm:text-left">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
          欢迎来到 My Space
        </h1>
        <p className="mt-4 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          热爱技术的开发者，喜欢折腾好玩的工具。这里记录技术栈的实践与生活里的一点感悟。
        </p>
        <div className="mt-8 flex flex-wrap gap-3 sm:gap-4">
          <Link
            href="/blog"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            阅读博客
          </Link>
          <Link
            href="/tools"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-5 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            探索工具箱
          </Link>
          <Link
            href="/gaming"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-5 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            游戏日常
          </Link>
        </div>
      </section>

      {/* Latest posts */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            最新文章
          </h2>
          <Link
            href="/blog"
            className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            查看全部 →
          </Link>
        </div>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {latestPosts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="block rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-4 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {post.meta.category}
                </span>
                <h3 className="mt-2 font-semibold text-zinc-900 dark:text-zinc-100">
                  {post.meta.title}
                </h3>
                <time
                  dateTime={post.meta.date}
                  className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400"
                >
                  {post.meta.date}
                </time>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                  {post.meta.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
        {latestPosts.length === 0 && (
          <p className="mt-4 text-zinc-500 dark:text-zinc-400">暂无文章，去写第一篇吧。</p>
        )}
      </section>
    </div>
  );
}
