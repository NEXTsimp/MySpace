import type { Metadata } from "next";
import { FeedUrlBlock } from "./FeedUrlBlock";

export const metadata: Metadata = {
  title: "RSS 订阅",
  description: "通过 RSS 订阅本站更新，使用 Feedly、Inoreader 等阅读器即可。",
};

export default function SubscribePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
          RSS 订阅
        </h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          通过 RSS 可以在一处订阅本站更新，有新文章时会在你的阅读器里出现，无需反复打开网站。
        </p>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          订阅地址
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          将下方地址添加到任意 RSS 阅读器即可订阅。
        </p>
        <FeedUrlBlock className="mt-4" />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          推荐阅读器
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          任选其一，在应用内「添加订阅」并粘贴上方地址即可。
        </p>
        <ul className="mt-4 space-y-3">
          <li>
            <a
              href="https://feedly.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
            >
              <span className="font-medium">Feedly</span>
              <span className="text-zinc-500 dark:text-zinc-400">— 网页 / 移动端</span>
            </a>
          </li>
          <li>
            <a
              href="https://www.inoreader.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
            >
              <span className="font-medium">Inoreader</span>
              <span className="text-zinc-500 dark:text-zinc-400">— 网页 / 移动端</span>
            </a>
          </li>
          <li>
            <a
              href="https://netnewswire.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
            >
              <span className="font-medium">NetNewsWire</span>
              <span className="text-zinc-500 dark:text-zinc-400">— Mac / iOS 免费</span>
            </a>
          </li>
          <li>
            <span className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <span className="font-medium">浏览器扩展</span>
              <span className="text-zinc-500 dark:text-zinc-400">— 如 Chrome / Edge 的 RSS 扩展</span>
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
