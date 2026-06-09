"use client";

import { useTheme } from "next-themes";
import { useMemo } from "react";
import Giscus from "@giscus/react";

function readEnv(): {
  repo: `${string}/${string}`;
  repoId: string;
  category: string;
  categoryId: string;
} | null {
  const repo = process.env.NEXT_PUBLIC_GISCUS_REPO?.trim();
  const repoId = process.env.NEXT_PUBLIC_GISCUS_REPOSITORY_ID?.trim();
  const category = process.env.NEXT_PUBLIC_GISCUS_CATEGORY?.trim();
  const categoryId = process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID?.trim();

  if (!repo || !repoId || !category || !categoryId) return null;
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) return null;

  return { repo: repo as `${string}/${string}`, repoId, category, categoryId };
}

export function Comments() {
  const config = useMemo(() => readEnv(), []);
  const { resolvedTheme } = useTheme();

  const theme = resolvedTheme === "dark" ? "dark" : "light";

  if (!config) return null;

  return (
    <section
      aria-label="评论"
      className="border-t border-zinc-200 pt-10 dark:border-zinc-800"
    >
      <h2 className="mb-6 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        评论
      </h2>
      <Giscus
        id="giscus-comments"
        repo={config.repo}
        repoId={config.repoId}
        category={config.category}
        categoryId={config.categoryId}
        mapping="pathname"
        reactionsEnabled="1"
        emitMetadata="0"
        inputPosition="top"
        lang="zh-CN"
        loading="lazy"
        theme={theme}
      />
    </section>
  );
}
