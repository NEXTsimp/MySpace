import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { getNotionPostContent, getNotionPostMetas } from "@/lib/notion-posts";

const postsDirectory = path.join(process.cwd(), "posts");

export interface PostMeta {
  title: string;
  date: string;
  category: string;
  description: string;
}

export interface Post {
  slug: string;
  meta: PostMeta;
  /** 列表里 Notion 文章的 content 为空，只有 getPostBySlug 会取正文 */
  content: string;
  source: "markdown" | "notion";
}

function requireNonEmptyString(
  value: unknown,
  field: "title" | "date" | "category",
  file: string
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(
      `[posts] ${file}: frontmatter 缺少或无效的「${field}」（需为非空字符串）`
    );
  }
  return value.trim();
}

function parsePostMeta(data: unknown, file: string): PostMeta {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`[posts] ${file}: frontmatter 无效（需为 YAML 对象）`);
  }

  const record = data as Record<string, unknown>;
  const title = requireNonEmptyString(record.title, "title", file);
  const date = requireNonEmptyString(record.date, "date", file);
  const category = requireNonEmptyString(record.category, "category", file);

  if (Number.isNaN(Date.parse(date))) {
    throw new Error(
      `[posts] ${file}: frontmatter「date」无法解析为有效日期：${JSON.stringify(date)}`
    );
  }

  const description =
    typeof record.description === "string" ? record.description.trim() : "";

  return { title, date, category, description };
}

function loadPost(slug: string, filename: string): Post {
  const fullPath = path.join(postsDirectory, filename);
  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);
  return {
    slug,
    meta: parsePostMeta(data, filename),
    content,
    source: "markdown",
  };
}

function getPostSlugs(): string[] {
  if (!fs.existsSync(postsDirectory)) return [];
  return fs.readdirSync(postsDirectory).filter(
    (name) =>
      name.endsWith(".md") &&
      !/^readme\.md$/i.test(name) &&
      !name.startsWith("_")
  );
}

function getMarkdownPosts(): Post[] {
  return getPostSlugs().map((filename) =>
    loadPost(filename.replace(/\.md$/, ""), filename)
  );
}

/** 所有文章（posts/*.md + Notion），按日期倒序 */
export async function getAllPosts(): Promise<Post[]> {
  const mdPosts = getMarkdownPosts();
  const mdSlugs = new Set(mdPosts.map((p) => p.slug));

  const notionPosts: Post[] = [];
  for (const n of await getNotionPostMetas()) {
    if (mdSlugs.has(n.slug)) {
      console.warn(`[posts] Notion 文章 Slug「${n.slug}」与 posts/${n.slug}.md 重复，以 md 为准`);
      continue;
    }
    notionPosts.push({
      slug: n.slug,
      meta: { title: n.title, date: n.date, category: n.category, description: n.description },
      content: "",
      source: "notion",
    });
  }

  const posts = [...mdPosts, ...notionPosts];
  posts.sort((a, b) => (b.meta.date > a.meta.date ? 1 : -1));
  return posts;
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  // 新发布的 Notion 文章会在运行时按 slug 访问，所以只接受合法 slug，防止读到 posts/ 以外的文件
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(slug)) return null;

  const fullPath = path.join(postsDirectory, `${slug}.md`);
  if (!/^readme$/i.test(slug) && fs.existsSync(fullPath)) {
    return loadPost(slug, `${slug}.md`);
  }

  const n = (await getNotionPostMetas()).find((m) => m.slug === slug);
  if (!n) return null;
  return {
    slug: n.slug,
    meta: { title: n.title, date: n.date, category: n.category, description: n.description },
    content: await getNotionPostContent(n.pageId),
    source: "notion",
  };
}

export async function getLatestPosts(count: number): Promise<Post[]> {
  return (await getAllPosts()).slice(0, count);
}

/** 获取所有不重复的分类列表（按文章中出现顺序） */
export async function getAllCategories(): Promise<string[]> {
  const posts = await getAllPosts();
  const set = new Set<string>();
  for (const post of posts) {
    if (post.meta.category?.trim()) set.add(post.meta.category.trim());
  }
  return Array.from(set);
}
