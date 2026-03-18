import { Client } from "@notionhq/client";

/** 游戏日常单条记录（与 Notion Database 字段对应） */
export interface GameRecord {
  id: string;
  name: string;
  comment: string;
  cover: string | null;
  date: string;
}

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
  console.warn(
    "[notion] NOTION_API_KEY 或 NOTION_DATABASE_ID 未配置，游戏日常数据将不可用。"
  );
}

const notion = NOTION_API_KEY ? new Client({ auth: NOTION_API_KEY }) : null;

/** Notion API 返回的 file 项（external 或 file） */
type NotionFileItem =
  | { type: "external"; external: { url: string } }
  | { type: "file"; file: { url: string; expiry_time?: string } };

/**
 * 从 Notion Files 属性中提取首张图片 URL。
 * 支持：外部链接 (external) 与 Notion 托管 (file，注意托管链接有时效约 1 小时)。
 */
function extractCoverUrl(files: NotionFileItem[] | undefined): string | null {
  const first = files?.[0];
  if (!first) return null;
  if (first.type === "external" && first.external?.url) return first.external.url;
  if (first.type === "file" && first.file?.url) return first.file.url;
  return null;
}

/**
 * 从 Notion 数据库获取游戏日常记录，按日期倒序。
 * 需在环境变量中配置 NOTION_API_KEY、NOTION_DATABASE_ID。
 */
export async function getGames(): Promise<GameRecord[]> {
  if (!notion || !NOTION_DATABASE_ID) return [];

  let results: Array<{ object: string; id: string; properties?: Record<string, unknown> }> = [];
  try {
    const response = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      sorts: [{ property: "Date", direction: "descending" }],
    });
    results = ((response as { results?: unknown[] }).results ?? []) as typeof results;
  } catch (err) {
    const isNotFound =
      err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "object_not_found";
    if (isNotFound) {
      console.warn(
        "[notion] 未找到数据库或无权限。请在 Notion 中打开该数据库 → 右上角 ••• → 连接 / Add connections → 选择你的 Integration（如 Identify five）并添加。"
      );
    } else {
      console.warn("[notion] getGames 请求失败（可能是网络问题，如国内直连 api.notion.com）:", err);
    }
    return [];
  }

  return results.map((page) => {
    if (page.object !== "page" || !("properties" in page)) {
      return { id: page.id, name: "", comment: "", cover: null, date: "" };
    }
    const props = page.properties as Record<
      string,
      { type: string; title?: { plain_text: string }[]; rich_text?: { plain_text: string }[]; files?: NotionFileItem[]; date?: { start: string } }
    >;
    const nameProp = props["Name"];
    const commentProp = props["Comment"];
    const coverProp = props["Cover"];
    const dateProp = props["Date"];

    const name =
      nameProp?.type === "title"
        ? (nameProp.title ?? []).map((t) => t.plain_text).join("")
        : "";
    const comment =
      commentProp?.type === "rich_text"
        ? (commentProp.rich_text ?? []).map((t) => t.plain_text).join("")
        : "";
    const cover =
      coverProp?.type === "files" ? extractCoverUrl(coverProp.files) : null;
    const date = dateProp?.type === "date" && dateProp.date?.start ? dateProp.date.start : "";

    return {
      id: page.id,
      name,
      comment,
      cover,
      date,
    };
  });
}
