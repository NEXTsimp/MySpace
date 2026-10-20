# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal blog / site ("My Space") built on Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4, deployed to Vercel (auto-deploys on push to `master`). Content and docs are written in Chinese (`<html lang="zh-CN">`); keep new user-facing text and commit messages in Chinese, matching existing style (e.g. `新文章：<标题>`, `修正：…`).

Deeper reference: `docs/ARCHITECTURE.md` (architecture + PDF tool data flow), `posts/README.md` (post authoring rules), `DEPLOY.md` (Vercel setup).

## Commands

```bash
npm run dev     # dev server at http://localhost:3000
npm run build   # production build — also validates every post's frontmatter
npm run lint    # eslint (next core-web-vitals + typescript configs)
```

There is no test suite. CI (`.github/workflows/ci.yml`, Node 20) runs `npm ci`, `npm run lint`, `npm run build` — run lint and build before considering a change done.

## Architecture

- **Blog content is Markdown files in `posts/`**, read from the filesystem at build time by `lib/posts.ts` (gray-matter). Filename = URL slug (`posts/foo.md` → `/blog/foo`). Files starting with `_` (drafts) and `README.md` are ignored. Frontmatter `title`, `date` (`YYYY-MM-DD`), `category` are required and validated — `parsePostMeta` throws, failing the build, if any is missing/invalid. `description` is optional but used in cards, search, SEO, and RSS. Posts sort by `date` descending; one `category` per post, and categories are derived automatically (no registry).
- `app/blog/[slug]/page.tsx` statically generates every post via `generateStaticParams`; rendering uses `react-markdown` + `remark-gfm` + `rehype-raw` (raw HTML in posts is rendered). `CodeCopyEnhancer.tsx` adds copy buttons to code blocks client-side. List/tags/archive/search pages and `app/feed.xml/route.ts` (RSS) all derive from `getAllPosts()`.
- **Tools (`app/tools/{image,pdf,qr}`) are pure client-side** (`"use client"`, no backend API): files are processed in the browser and downloaded via Blob URLs. PDF tool uses `pdfjs-dist` for reading/rendering and `pdf-lib` for writing; always pass bytes through its `cloneBytes` helper before handing them to either library to avoid detached-ArrayBuffer errors. Adding a tool = new `app/tools/<name>/page.tsx` + an entry in `lib/data/tools.ts` (drives the `/tools` index cards).
- **`/gaming`** pulls records server-side from a Notion database via `lib/notion.ts` (`getGames()`); returns `[]` gracefully when `NOTION_API_KEY` / `NOTION_DATABASE_ID` are unset.
- `app/layout.tsx` wraps all pages with `ThemeProvider` (next-themes, class strategy), Navbar, Footer, the music player, and Vercel `<Analytics />`. The music player (`app/components/music/NetEasePlayer.tsx`) has a hard-coded local track list pointing to MP3s in `public/music/VipSongsDownload/` — adding a song means adding both the file and an entry there.
- Comments use Giscus (`app/components/Comments.tsx`) and are hidden unless the `NEXT_PUBLIC_GISCUS_*` env vars are set.

## Environment

Copy `.env.example` to `.env.local`. `NEXT_PUBLIC_SITE_URL` sets `metadataBase` and RSS/OG absolute URLs (falls back to `https://example.com`). Notion and Giscus vars are optional.
