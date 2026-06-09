import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";

import { Footer } from "./components/Footer";
import { Navbar } from "./components/Navbar";
import { ThemeProvider } from "./components/ThemeProvider";
import { NetEasePlayer } from "./components/music/NetEasePlayer";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteDescription = "热爱技术的开发者，喜欢折腾好玩的工具。技术栈实践与生活感悟。";

function getMetadataBase(): URL | undefined {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    "";

  if (!raw) return undefined;

  // Vercel 的 VERCEL_URL 通常不带协议（例如 my-site.vercel.app）
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    return new URL(withProtocol);
  } catch {
    return undefined;
  }
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: "My Space",
    template: "%s | My Space",
  },
  description: siteDescription,
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "My Space",
    description: siteDescription,
    title: "My Space | 个人空间",
  },
  twitter: {
    card: "summary_large_image",
    title: "My Space | 个人空间",
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-background text-foreground`}>
        <ThemeProvider>
          <Navbar />
          <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            {children}
          </main>
          <Footer />
          <NetEasePlayer />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
