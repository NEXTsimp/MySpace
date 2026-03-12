export interface ToolItem {
  name: string;
  link: string;
  description: string;
  icon: string;
  category: string;
}

export const tools: ToolItem[] = [
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
