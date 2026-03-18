import Link from "next/link";
import Image from "next/image";
import { getGames } from "@/lib/notion";

const MAX_ITEMS = 2;

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export async function GamingWidget() {
  const games = await getGames();
  const list = games.slice(0, MAX_ITEMS);

  return (
    <section>
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        游戏日常
      </h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm dark:shadow-none">
        {list.length > 0 ? (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {list.map((game) => (
              <li key={game.id}>
                <div className="flex gap-4 p-4">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                    {game.cover ? (
                      <Image
                        src={game.cover}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="80px"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl text-zinc-400 dark:text-zinc-500">
                        🎮
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {game.name || "未命名"}
                    </h3>
                    <time
                      dateTime={game.date}
                      className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400"
                    >
                      {formatDate(game.date)}
                    </time>
                    {game.comment ? (
                      <p className="mt-1.5 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {game.comment}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            暂无记录，或网络无法访问 Notion。开代理后刷新可拉取数据。
          </p>
        )}
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 text-right">
          <Link
            href="/gaming"
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            查看更多
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
