import type { Metadata } from "next";
import { tools } from "@/lib/data/tools";

export const metadata: Metadata = {
  title: "工具箱",
  description: "常用工具与网站导航，AI 工具与开发利器合集。",
};

export default function ToolsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
          工具箱
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          常用或自研的工具与网站，点击卡片在新标签页打开。
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <li key={tool.link}>
            <a
              href={tool.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-h-[44px] flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-4 sm:p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900 active:scale-[0.99]"
            >
              <span className="text-2xl" aria-hidden>
                {tool.icon}
              </span>
              <span className="mt-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {tool.category}
              </span>
              <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-700 dark:group-hover:text-zinc-200">
                {tool.name}
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {tool.description}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
