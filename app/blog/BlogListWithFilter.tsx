"use client";

import Link from "next/link";
import { useState } from "react";
import type { Post } from "@/lib/posts";

const ALL = "全部";

interface BlogListWithFilterProps {
  posts: Post[];
  categories: string[];
}

export function BlogListWithFilter({ posts, categories }: BlogListWithFilterProps) {
  const [selected, setSelected] = useState<string>(ALL);
  const filtered =
    selected === ALL ? posts : posts.filter((p) => p.meta.category === selected);

  return (
    <div className="space-y-8">
      {/* 分类切换 */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelected(ALL)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
            selected === ALL
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          }`}
        >
          {ALL}
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelected(cat)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
              selected === cat
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 文章列表 */}
      <ul className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2">
        {filtered.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className="block rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-5 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {post.meta.category}
              </span>
              <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {post.meta.title}
              </h2>
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

      {filtered.length === 0 && (
        <p className="text-zinc-500 dark:text-zinc-400">
          {selected === ALL ? "暂无文章。" : `「${selected}」分类下暂无文章。`}
        </p>
      )}
    </div>
  );
}
