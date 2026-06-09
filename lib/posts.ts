import fs from "fs";
import path from "path";
import matter from "gray-matter";

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
  content: string;
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

export function getAllPosts(): Post[] {
  const slugs = getPostSlugs();
  const posts = slugs.map((filename) =>
    loadPost(filename.replace(/\.md$/, ""), filename)
  );
  posts.sort((a, b) => (b.meta.date > a.meta.date ? 1 : -1));
  return posts;
}

export function getPostBySlug(slug: string): Post | null {
  const fullPath = path.join(postsDirectory, `${slug}.md`);
  if (!fs.existsSync(fullPath)) return null;
  return loadPost(slug, `${slug}.md`);
}

export function getLatestPosts(count: number): Post[] {
  return getAllPosts().slice(0, count);
}

/** 获取所有不重复的分类列表（按文章中出现顺序） */
export function getAllCategories(): string[] {
  const posts = getAllPosts();
  const set = new Set<string>();
  for (const post of posts) {
    if (post.meta.category?.trim()) set.add(post.meta.category.trim());
  }
  return Array.from(set);
}
