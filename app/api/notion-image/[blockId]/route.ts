import { notion } from "@/lib/notion";

/**
 * Notion 托管图片的链接约 1 小时后失效。文章里的图片都指向这里，
 * 每次请求时向 Notion 取最新链接再跳转过去，缓存的页面就不会出现裂图。
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ blockId: string }> }
) {
  const { blockId } = await params;
  if (!notion || !/^[0-9a-f-]{32,36}$/i.test(blockId)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const block = await notion.blocks.retrieve({ block_id: blockId });
    if (!("type" in block) || block.type !== "image") {
      return new Response("Not found", { status: 404 });
    }
    const url = block.image.type === "file" ? block.image.file.url : block.image.external.url;
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
