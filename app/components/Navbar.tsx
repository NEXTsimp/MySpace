"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { ThemeToggle } from "./ThemeToggle";

type MobileNavContextValue = {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  pathname: string;
};

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) {
    throw new Error("useMobileNav must be used within MobileNavProvider");
  }
  return ctx;
}

const navLinks = [
  { href: "/", label: "首页" },
  { href: "/blog", label: "博客" },
  { href: "/tools", label: "工具箱" },
];

function MobileNavProvider({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <MobileNavContext.Provider
      value={{ mobileOpen, setMobileOpen, pathname }}
    >
      {children}
    </MobileNavContext.Provider>
  );
}

function MobileNavControls() {
  const { mobileOpen, setMobileOpen } = useMobileNav();

  return (
    <div className="flex sm:hidden items-center gap-2">
      <ThemeToggle />
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        aria-expanded={mobileOpen}
        aria-controls="mobile-nav"
        aria-label={mobileOpen ? "关闭菜单" : "打开菜单"}
      >
        {mobileOpen ? (
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

function MobileNavMenu() {
  const { mobileOpen, setMobileOpen, pathname } = useMobileNav();

  return (
    <div
      id="mobile-nav"
      className={`sm:hidden overflow-hidden transition-[height] duration-200 ease-out ${
        mobileOpen ? "h-[calc(100vh-3.5rem)]" : "h-0"
      }`}
      aria-hidden={!mobileOpen}
    >
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-4">
        <ul className="flex flex-col gap-1">
          {navLinks.map(({ href, label }) => {
            const isActive =
              pathname === href ||
              (href !== "/" && pathname.startsWith(href));
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`block rounded-lg px-4 py-3 text-base font-medium transition-colors min-h-[44px] flex items-center ${
                    isActive
                      ? "text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <MobileNavProvider key={pathname} pathname={pathname}>
      <header className="sticky top-0 z-50 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm">
        <nav
          className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6"
          aria-label="主导航"
        >
        <div className="flex items-center gap-2">
          {pathname !== "/" && (
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              aria-label="返回上一页"
              title="返回上一页"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <Link
            href="/"
            className="font-mono text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            My Space
          </Link>
        </div>

        {/* 桌面端导航 */}
        <div className="hidden sm:flex sm:items-center sm:gap-4">
          <ul className="flex items-center gap-1 sm:gap-2">
            {navLinks.map(({ href, label }) => {
              const isActive =
                pathname === href ||
                (href !== "/" && pathname.startsWith(href));
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <ThemeToggle />
        </div>

        <MobileNavControls />
        </nav>

        <MobileNavMenu />
      </header>
    </MobileNavProvider>
  );
}
