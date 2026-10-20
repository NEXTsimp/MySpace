import { notion } from "@/lib/notion";

/** 允许读取的页面「文件」属性（目前只有游戏日常的封面） */
const ALLOWED_PROPS = new Set(["Cover"]);

/** 取页面某个「文件」属性里的第一个文件链接 */
async function getPagePropFileUrl(pageId: string, prop: string): Promise<string | null> {
  const page = await notion!.pages.retrieve({ page_id: pageId });
  if (!("properties" in page)) return null;
  const p = page.properties[prop];
  const first = p?.type === "files" ? p.files[0] : undefined;
  if (!first) return null;
  return "file" in first ? first.file.url : first.external.url;
}

/** 取图片块的链接 */
async function getImageBlockUrl(blockId: string): Promise<string | null> {
  const block = await notion!.blocks.retrieve({ block_id: blockId });
  if (!("type" in block) || block.type !== "image") return null;
  return block.image.type === "file" ? block.image.file.url : block.image.external.url;
}

/**
 * Notion 托管图片的链接约 1 小时后失效。文章图片（/api/notion-image/<blockId>）
 * 和游戏封面（/api/notion-image/<pageId>?prop=Cover）都指向这里，
 * 每次请求时向 Notion 取最新链接再跳转过去，缓存的页面就不会出现裂图。
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ blockId: string }> }
) {
  const { blockId } = await params;
  const prop = new URL(req.url).searchParams.get("prop");
  if (!notion || !/^[0-9a-f-]{32,36}$/i.test(blockId) || (prop !== null && !ALLOWED_PROPS.has(prop))) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const url = prop ? await getPagePropFileUrl(blockId, prop) : await getImageBlockUrl(blockId);
    if (!url) return new Response("Not found", { status: 404 });
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        // 比 Notion 链接的有效期（约 1 小时）短，保证跳转目标始终有效
        "Cache-Control": "public, max-age=0, s-maxage=2400",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
