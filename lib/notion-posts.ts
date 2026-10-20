import { cache } from "react";
import { NotionToMarkdown } from "notion-to-md";
import { notion } from "@/lib/notion";

/**
 * 从 Notion「博客文章」数据库读取文章。
 * 数据库列：Name（标题）、Date（日期）、Category（单选）、Description（文本）、
 * Slug（文本，可空）、Published（复选框，勾选才显示）。
 */

const NOTION_BLOG_DATABASE_ID = process.env.NOTION_BLOG_DATABASE_ID;

export interface NotionPostMeta {
  slug: string;
  pageId: string;
  title: string;
  date: string;
  category: string;
  description: string;
}

type RichText = { plain_text: string }[];
type NotionProp = {
  type: string;
  title?: RichText;
  rich_text?: RichText;
  select?: { name: string } | null;
  date?: { start: string } | null;
  checkbox?: boolean;
};

function plainText(prop: NotionProp | undefined): string {
  if (!prop) return "";
  const parts = prop.type === "title" ? prop.title : prop.type === "rich_text" ? prop.rich_text : undefined;
  return (parts ?? []).map((t) => t.plain_text).join("").trim();
}

/** Slug 只允许英文、数字、连字符；不合规或为空时用页面 ID */
function toSlug(raw: string, pageId: string): string {
  const s = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*$/.test(s) ? s : pageId.replace(/-/g, "");
}

function parsePage(page: { id: string; properties: Record<string, NotionProp> }): NotionPostMeta | null {
  const props = page.properties;
  const title = plainText(props["Name"]);
  const category = props["Category"]?.type === "select" ? (props["Category"].select?.name ?? "").trim() : "";
  // 日期可能带时间（2026-10-20T10:00:00+08:00），只取日期部分
  const date = props["Date"]?.type === "date" ? (props["Date"].date?.start ?? "").slice(0, 10) : "";

  if (!title || !category || !date || Number.isNaN(Date.parse(date))) {
    console.warn(
      `[notion-posts] 跳过页面 ${page.id}：Name / Date / Category 有缺失或无效（标题：${title || "空"}）`
    );
    return null;
  }

  return {
    slug: toSlug(plainText(props["Slug"]), page.id),
    pageId: page.id,
    title,
    date,
    category,
    description: plainText(props["Description"]),
  };
}

/** 所有已发布文章的元数据（按日期倒序）。未配置或请求失败时返回 []。 */
export const getNotionPostMetas = cache(async (): Promise<NotionPostMeta[]> => {
  if (!notion || !NOTION_BLOG_DATABASE_ID) return [];

  const metas: NotionPostMeta[] = [];
  const seen = new Set<string>();
  try {
    let cursor: string | undefined;
    do {
      const res = await notion.databases.query({
        database_id: NOTION_BLOG_DATABASE_ID,
        filter: { property: "Published", checkbox: { equals: true } },
        sorts: [{ property: "Date", direction: "descending" }],
        start_cursor: cursor,
        page_size: 100,
      });
      for (const page of res.results) {
        if (page.object !== "page" || !("properties" in page)) continue;
        const meta = parsePage(page as unknown as { id: string; properties: Record<string, NotionProp> });
        if (!meta) continue;
        if (seen.has(meta.slug)) {
          console.warn(`[notion-posts] Slug 重复「${meta.slug}」，已跳过页面 ${page.id}`);
          continue;
        }
        seen.add(meta.slug);
        metas.push(meta);
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
  } catch (err) {
    console.warn("[notion-posts] 读取博客数据库失败（检查数据库 ID、Integration 连接或网络）:", err);
    return [];
  }
  return metas;
});

/** 把 Notion 页面正文转成 Markdown，交给现有的 ReactMarkdown 渲染 */
export const getNotionPostContent = cache(async (pageId: string): Promise<string> => {
  if (!notion) return "";

  const n2m = new NotionToMarkdown({ notionClient: notion });
  // Notion 托管图片链接约 1 小时失效，改走 /api/notion-image 每次取最新链接
  n2m.setCustomTransformer("image", async (block) => {
    if (!("image" in block)) return false;
    const image = block.image;
    const caption = image.caption.map((t) => t.plain_text).join("");
    const src = image.type === "file" ? `/api/notion-image/${block.id}` : image.external.url;
    return `![${caption}](${src})`;
  });

  const blocks = await n2m.pageToMarkdown(pageId);
  return n2m.toMarkdownString(blocks).parent ?? "";
});
