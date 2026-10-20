import type { Metadata } from "next";
import Link from "next/link";

import { getAllCategories, getAllPosts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "标签",
  description: "按类别（标签）浏览博客文章。",
};

/** 每 5 分钟重新读取一次文章（含 Notion），新发布的文章无需重新部署 */
export const revalidate = 300;

export default async function BlogTagsPage() {
  const [posts, categories] = await Promise.all([getAllPosts(), getAllCategories()]);

  const total = posts.length;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
          标签
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          这里的「标签」对应你文章里的分类（category）。
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/blog"
          className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
        >
          全部 <span className="text-zinc-500 dark:text-zinc-400">({total})</span>
        </Link>
        {categories.map((cat) => {
          const count = posts.filter((p) => p.meta.category === cat).length;
          return (
            <Link
              key={cat}
              href={`/blog?category=${encodeURIComponent(cat)}`}
              className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              {cat}{" "}
              <span className="text-zinc-500 dark:text-zinc-400">({count})</span>
            </Link>
          );
        })}
      </div>

      {categories.length === 0 && (
        <p className="text-zinc-500 dark:text-zinc-400">暂无文章。</p>
      )}
    </div>
  );
}

