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

function getPostSlugs(): string[] {
  if (!fs.existsSync(postsDirectory)) return [];
  return fs.readdirSync(postsDirectory).filter((name) => name.endsWith(".md"));
}

export function getAllPosts(): Post[] {
  const slugs = getPostSlugs();
  const posts: Post[] = slugs.map((slug) => {
    const name = slug.replace(/\.md$/, "");
    const fullPath = path.join(postsDirectory, slug);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);
    return {
      slug: name,
      meta: data as PostMeta,
      content,
    };
  });
  posts.sort((a, b) => (b.meta.date > a.meta.date ? 1 : -1));
  return posts;
}

export function getPostBySlug(slug: string): Post | null {
  const fullPath = path.join(postsDirectory, `${slug}.md`);
  if (!fs.existsSync(fullPath)) return null;
  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);
  return {
    slug,
    meta: data as PostMeta,
    content,
  };
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
