import type { Metadata } from "next";
import Link from "next/link";

import { getAllPosts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "归档",
  description: "按年月归档浏览博客文章。",
};

function formatYearMonth(dateStr: string): string {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function BlogArchivePage() {
  const posts = getAllPosts();

  const groups = new Map<string, typeof posts>();
  for (const post of posts) {
    const key = formatYearMonth(post.meta.date);
    const arr = groups.get(key);
    if (arr) arr.push(post);
    else groups.set(key, [post]);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
          归档
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          按年月分组展示你的文章（最新在前）。
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">暂无文章。</p>
      ) : (
        <div className="space-y-10">
          {Array.from(groups.entries()).map(([key, items]) => (
            <section key={key} className="space-y-3">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {key}
              </h2>
              <ul className="space-y-2">
                {items.map((post) => (
                  <li key={post.slug}>
                    <Link
                      href={`/blog/${post.slug}`}
                      className="block rounded-lg border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30 px-3 py-2 transition-colors"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {post.meta.title}
                        </span>
                        <time className="text-xs text-zinc-500 dark:text-zinc-400">
                          {post.meta.date}
                        </time>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {post.meta.category}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

