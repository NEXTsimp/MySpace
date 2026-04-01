"use client";

import { useEffect } from "react";

function getCodeTextFromButton(btn: HTMLButtonElement): string {
  const pre = btn.closest("pre");
  const code = pre?.querySelector("code");
  const text = (code?.textContent ?? "").replace(/\n$/, "");
  return text;
}

export function CodeCopyEnhancer() {
  useEffect(() => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button[data-copy-code]")
    );

    if (buttons.length === 0) return;

    const onClick = async (e: Event) => {
      const btn = e.currentTarget as HTMLButtonElement;
      const text = getCodeTextFromButton(btn);
      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
        const prev = btn.textContent;
        btn.textContent = "已复制";
        btn.dataset.copied = "true";
        window.setTimeout(() => {
          btn.textContent = prev ?? "复制";
          delete btn.dataset.copied;
        }, 1200);
      } catch {
        // ignore
      }
    };

    for (const btn of buttons) btn.addEventListener("click", onClick);
    return () => {
      for (const btn of buttons) btn.removeEventListener("click", onClick);
    };
  }, []);

  return null;
}

