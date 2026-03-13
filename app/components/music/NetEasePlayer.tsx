"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const APLAYER_CSS = "https://cdn.jsdelivr.net/npm/aplayer/dist/APlayer.min.css";
const APLAYER_JS = "https://cdn.jsdelivr.net/npm/aplayer/dist/APlayer.min.js";
const METING_JS = "https://cdn.jsdelivr.net/npm/meting@2/dist/Meting.min.js";

/** 本地歌曲项，符合 APlayer list 项格式（用于追加到 MetingJS 歌单末尾） */
export interface LocalSongItem {
  name: string;
  artist: string;
  url: string;
  cover: string;
}

/**
 * 本地音乐配置（public/music/VipSongsDownload 下的 .mp3），将追加到网易云歌单末尾。
 * 封面可在 public/music 下放 cover.jpg 共用。
 */
const localSongs: LocalSongItem[] = [
  { name: "大眠", artist: "王心凌", url: "/music/VipSongsDownload/王心凌 - 大眠.mp3", cover: "/music/cover.jpg" },
  { name: "幻听", artist: "许嵩", url: "/music/VipSongsDownload/许嵩 - 幻听.mp3", cover: "/music/cover.jpg" },
  { name: "特别的人", artist: "方大同", url: "/music/VipSongsDownload/方大同 - 特别的人.mp3", cover: "/music/cover.jpg" },
  { name: "树读", artist: "王俊凯", url: "/music/VipSongsDownload/王俊凯 - 树读.mp3", cover: "/music/cover.jpg" },
  { name: "Mine", artist: "Taylor Swift", url: "/music/VipSongsDownload/Taylor Swift - Mine.mp3", cover: "/music/cover.jpg" },
  { name: "你要的全拿走", artist: "胡彦斌", url: "/music/VipSongsDownload/胡彦斌 - 你要的全拿走.mp3", cover: "/music/cover.jpg" },
  { name: "雨爱", artist: "杨丞琳", url: "/music/VipSongsDownload/杨丞琳 - 雨爱.mp3", cover: "/music/cover.jpg" },
  { name: "Love Story", artist: "Taylor Swift", url: "/music/VipSongsDownload/Taylor Swift - Love Story.mp3", cover: "/music/cover.jpg" },
  { name: "Hug me (抱我)", artist: "蔡徐坤", url: "/music/VipSongsDownload/蔡徐坤 - Hug me (抱我).mp3", cover: "/music/cover.jpg" },
  { name: "猜不透", artist: "丁当", url: "/music/VipSongsDownload/丁当 - 猜不透.mp3", cover: "/music/cover.jpg" },
];

/** MetingJS 自定义元素上挂载的 APlayer 实例 */
interface MetingElement extends HTMLElement {
  aplayer?: {
    list: {
      add: (items: LocalSongItem | LocalSongItem[]) => void;
    };
  };
}

export interface NetEasePlayerProps {
  /** 网易云歌单 ID，可在歌单页 URL 的 id= 后获取 */
  playlistId?: string;
}

/**
 * 基于 APlayer + MetingJS 的网易云歌单悬浮播放器
 * 支持向实例追加本地音乐（网易云免费曲 + 本地 VIP 曲混合播放）
 * 仅客户端渲染，避免 SSR 与 meting-js 自定义元素冲突
 * 脚本加载顺序：APlayer → MetingJS（通过 Next.js Script 的 onLoad 串行加载）
 */
export function NetEasePlayer({ playlistId = "17828413099" }: NetEasePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [aplayerReady, setAPlayerReady] = useState(false);
  const [metingReady, setMetingReady] = useState(false);

  // 客户端注入 APlayer CSS，避免服务端无 document
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = APLAYER_CSS;
    document.head.appendChild(link);
    return () => {
      if (document.head.contains(link)) document.head.removeChild(link);
    };
  }, []);

  // Meting 加载完成后在客户端挂载 <meting-js>，并轮询注入本地歌曲
  useEffect(() => {
    if (!metingReady || !containerRef.current) return;
    // React Strict Mode 下会重复执行 effect，避免重复挂载
    if (containerRef.current.querySelector("meting-js")) return;

    containerRef.current.innerHTML = "";
    const meting = document.createElement("meting-js") as MetingElement;
    meting.setAttribute("server", "netease");
    meting.setAttribute("type", "playlist");
    meting.setAttribute("id", playlistId);
    meting.setAttribute("name", "Blog BGM");
    meting.setAttribute("fixed", "true");
    meting.setAttribute("mini", "true");
    meting.setAttribute("autoplay", "false");
    meting.setAttribute("loop", "all");
    meting.setAttribute("order", "random");
    meting.setAttribute("volume", "0.7");
    containerRef.current.appendChild(meting);

    // 轮询等待 meting.aplayer 初始化完成后，追加本地音乐到列表末尾
    let pollId: ReturnType<typeof setInterval> | null = null;
    if (localSongs.length > 0) {
      pollId = setInterval(() => {
        const ap = (meting as MetingElement).aplayer?.list;
        if (ap) {
          try {
            ap.add(localSongs);
          } catch {
            localSongs.forEach((song) => ap.add(song));
          }
          if (pollId != null) clearInterval(pollId);
          pollId = null;
        }
      }, 100);
    }

    return () => {
      if (pollId != null) clearInterval(pollId);
    };
  }, [metingReady, playlistId]);

  // 监听播放错误（VIP/版权/403）：自动跳过并播下一首
  useEffect(() => {
    if (!metingReady) return;

    const skipToNext = () => {
      console.log("Skip VIP song");
      const nextBtn = document.querySelector(".aplayer-fixed .aplayer-icon-forward") as HTMLButtonElement | null;
      nextBtn?.click();
    };

    const onError = (e: Event) => {
      if ((e.target as HTMLMediaElement)?.tagName === "AUDIO") skipToNext();
    };

    const id = window.setInterval(() => {
      const container = document.querySelector(".aplayer-fixed");
      if (container) {
        window.clearInterval(id);
        container.addEventListener("error", onError, true);
        return () => container.removeEventListener("error", onError, true);
      }
    }, 200);

    return () => {
      window.clearInterval(id);
      const container = document.querySelector(".aplayer-fixed");
      container?.removeEventListener("error", onError, true);
    };
  }, [metingReady]);

  return (
    <>
      <Script
        src={APLAYER_JS}
        strategy="afterInteractive"
        onLoad={() => setAPlayerReady(true)}
      />
      {aplayerReady && (
        <Script
          src={METING_JS}
          strategy="afterInteractive"
          onLoad={() => setMetingReady(true)}
        />
      )}
      {/* 仅作为 meting-js 的挂载点，播放器由 APlayer 以 fixed 方式渲染在页面底部 */}
      <div ref={containerRef} className="aplayer-float" aria-hidden="true" />
    </>
  );
}
