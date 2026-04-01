import type { Metadata } from "next";
import Link from "next/link";

import { getAllPosts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "搜索",
  description: "使用关键词搜索博客文章。",
};

export default function BlogSearchPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const q =
    typeof searchParams?.q === "string" ? searchParams.q.trim() : "";

  const posts = getAllPosts();

  const query = q.toLowerCase();
  const results = q
    ? posts.filter((p) => {
        const haystack = `${p.meta.title}\n${p.meta.description}\n${p.content}`.toLowerCase();
        return haystack.includes(query);
      })
    : [];

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
          搜索
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          输入关键词，搜索文章标题、描述和正文内容。
        </p>
      </header>

      <form
        method="get"
        action="/blog/search"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="例如：Tailwind、Notion、Next.js"
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-4 py-3 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-800"
        />
        <button
          type="submit"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          搜索
        </button>
      </form>

      {q.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          还没有输入关键词。
        </p>
      ) : results.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          没有找到匹配的文章：{q}
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            共 {results.length} 篇结果
          </p>
          <ul className="space-y-3">
            {results.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30 px-4 py-3 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">
                        {post.meta.title}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {post.meta.category}
                      </div>
                    </div>
                    <time className="text-xs text-zinc-500 dark:text-zinc-400">
                      {post.meta.date}
                    </time>
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {post.meta.description}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

