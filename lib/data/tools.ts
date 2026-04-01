export interface ToolItem {
  name: string;
  link: string;
  description: string;
  icon: string;
  category: string;
}

export const tools: ToolItem[] = [
  {
    name: "图片处理工具箱",
    link: "/tools/image",
    description: "纯前端：转 WebP / 压缩 / 缩放 / 水印 / 批量打包下载。",
    icon: "🖼️",
    category: "自研工具",
  },
  {
    name: "PDF 排版与处理工具箱",
    link: "/tools/pdf",
    description: "N-up 打印排版（2/4/6/9）+ 合并/拆分/旋转/图片转 PDF。",
    icon: "📄",
    category: "自研工具",
  },
  {
    name: "万能美化二维码生成器",
    link: "/tools/qr",
    description: "支持渐变/圆角/Logo 嵌入，实时预览并导出 PNG/SVG。",
    icon: "🔳",
    category: "自研工具",
  },
  {
    name: "Cursor",
    link: "https://cursor.com",
    description: "AI 驱动的代码编辑器，提升开发效率。",
    icon: "⌘",
    category: "AI工具",
  },
  {
    name: "Vercel",
    link: "https://vercel.com",
    description: "一键部署前端与 Serverless，与 Next.js 绝配。",
    icon: "▲",
    category: "开发利器",
  },
  {
    name: "GitHub",
    link: "https://github.com",
    description: "代码托管与协作，开源项目大本营。",
    icon: "🐙",
    category: "开发利器",
  },
  {
    name: "ChatGPT",
    link: "https://chat.openai.com",
    description: "日常查资料、写草稿、理思路的助手。",
    icon: "🤖",
    category: "AI工具",
  },
  {
    name: "Tailwind CSS",
    link: "https://tailwindcss.com",
    description: "原子化 CSS，快速搭建现代界面。",
    icon: "🎨",
    category: "开发利器",
  },
  {
    name: "MDN",
    link: "https://developer.mozilla.org",
    description: "Web 标准与 API 文档，前端必备。",
    icon: "📚",
    category: "开发利器",
  },
];

export const categories = Array.from(new Set(tools.map((t) => t.category)));
