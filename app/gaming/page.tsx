import Image from "next/image";
import { getGames } from "@/lib/notion";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "游戏日常",
  description: "记录玩过的游戏与一点随想。",
};

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function GamingPage() {
  const games = await getGames();

  return (
    <div className="space-y-10">
      {/* 标题区 */}
      <header className="text-center sm:text-left">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
          游乐场
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          玩过的游戏与一点随想，按时间倒序。
        </p>
      </header>

      {/* 瀑布流列表 */}
      {games.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-6 py-10 text-center text-zinc-500 dark:text-zinc-400">
          暂无游戏记录，去 Notion 里添加几条吧。
        </p>
      ) : (
        <ul className="columns-1 sm:columns-2 lg:columns-3 [column-gap:1.5rem]">
          {games.map((game) => (
            <li
              key={game.id}
              className="break-inside-avoid mb-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80"
            >
              <div className="relative w-full aspect-video overflow-hidden rounded-t-xl bg-zinc-200 dark:bg-zinc-800">
                {game.cover ? (
                  <Image
                    src={game.cover}
                    alt={game.name || "游戏封面"}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl text-zinc-400 dark:text-zinc-500">
                    🎮
                  </div>
                )}
              </div>
              <div className="p-4">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {game.name || "未命名"}
                </h2>
                <time
                  dateTime={game.date}
                  className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400"
                >
                  {formatDate(game.date)}
                </time>
                {game.comment ? (
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {game.comment}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
