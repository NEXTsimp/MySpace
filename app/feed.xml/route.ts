import { getAllPosts } from "@/lib/posts";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822Date(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toUTCString();
}

export async function GET() {
  const posts = getAllPosts();
  const lastBuildDate = new Date().toUTCString();

  const channelTitle = "My Space";
  const channelDescription = "热爱技术的开发者，喜欢折腾好玩的工具。技术栈实践与生活感悟。";

  const items = posts
    .map(
      (post) => {
        const link = `${SITE_URL}/blog/${post.slug}`;
        const pubDate = toRfc822Date(post.meta.date);
        return `
  <item>
    <title>${escapeXml(post.meta.title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(post.meta.description)}</description>
    <pubDate>${pubDate}</pubDate>
    <guid isPermaLink="true">${escapeXml(link)}</guid>
  </item>`;
      }
    )
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>${escapeXml(SITE_URL)}</link>
    <description>${escapeXml(channelDescription)}</description>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(`${SITE_URL}/feed.xml`)}" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;

  return new Response(rss.trim(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
