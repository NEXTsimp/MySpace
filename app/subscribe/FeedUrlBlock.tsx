"use client";

import { useState } from "react";

const FEED_PATH = "/feed.xml";

export function FeedUrlBlock({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  const feedUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${FEED_PATH}`
      : FEED_PATH;

  const handleCopy = async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${FEED_PATH}`
        : FEED_PATH;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select and show
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
          {feedUrl}
        </code>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="min-h-[44px] rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {copied ? "已复制" : "复制地址"}
          </button>
          <a
            href={FEED_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            在浏览器中打开
          </a>
        </div>
      </div>
    </div>
  );
}
