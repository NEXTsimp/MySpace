export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto w-full border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center sm:text-left">
          © {year} My Space. All rights reserved.
        </p>
        <a
          href="/subscribe"
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          title="RSS 订阅"
        >
          <svg
            className="h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1Z" />
          </svg>
          RSS 订阅
        </a>
      </div>
    </footer>
  );
}
