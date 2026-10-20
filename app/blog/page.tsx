import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts, getAllCategories } from "@/lib/posts";
import { BlogListWithFilter } from "./BlogListWithFilter";

export const metadata: Metadata = {
  title: "博客",
  description: "技术栈与生活感悟，按时间倒序。",
};

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const [{ category: rawCategory }, posts, categories] = await Promise.all([
    searchParams,
    getAllPosts(),
    getAllCategories(),
  ]);
  const category = typeof rawCategory === "string" ? rawCategory : undefined;
  const initialSelected =
    category && category.trim().length > 0 ? category : undefined;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
          博客
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          技术栈与生活感悟，按时间倒序。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
          <Link
            href="/blog/tags"
            className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            标签
          </Link>
          <Link
            href="/blog/archive"
            className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            归档
          </Link>
          <Link
            href="/blog/search"
            className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            搜索
          </Link>
        </div>
      </div>

      <BlogListWithFilter
        posts={posts}
        categories={categories}
        initialSelected={initialSelected}
      />
    </div>
  );
}
