import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { getPostBySlug, getAllPosts } from "@/lib/posts";
import { CodeCopyEnhancer } from "@/app/blog/CodeCopyEnhancer";
import { Comments } from "@/app/components/Comments";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post)
    return { title: "文章未找到" };

  const title = post.meta.title;
  const description = post.meta.description;
  const url = `/blog/${slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "article",
      publishedTime: post.meta.date,
      authors: undefined,
      section: post.meta.category,
      tags: [post.meta.category],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <Link
          href="/blog"
          className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← 返回博客列表
        </Link>
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {post.meta.category}
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
          {post.meta.title}
        </h1>
        <time
          dateTime={post.meta.date}
          className="block text-sm text-zinc-500 dark:text-zinc-400"
        >
          {post.meta.date}
        </time>
      </header>

      <div className="prose prose-zinc dark:prose-invert prose-headings:font-semibold max-w-none prose-img:max-w-full prose-pre:overflow-x-auto prose-table:block prose-table:overflow-x-auto">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            code({ className, children, ...props }) {
              const isInline = !className;
              if (isInline) {
                return (
                  <code
                    className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.9em] text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }

              return (
                <pre className="group relative overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <button
                    type="button"
                    data-copy-code
                    className="absolute right-3 top-3 inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white/80 px-2 py-1 text-xs font-medium text-zinc-600 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300"
                    aria-label="复制代码"
                    title="复制代码"
                  >
                    复制
                  </button>
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              );
            },
          }}
        >
          {post.content}
        </ReactMarkdown>
        <CodeCopyEnhancer />
      </div>

      <Comments />
    </article>
  );
}
