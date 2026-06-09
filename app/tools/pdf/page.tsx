"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, PageSizes, degrees, rgb } from "pdf-lib";
import JSZip from "jszip";
import Sortable from "sortablejs";

type NupPreset = 2 | 4 | 6 | 9;
type Orientation = "portrait" | "landscape";
type NotesArea = "none" | "right" | "bottom";
type PaperSize = "A4" | "A3" | "A5" | "Letter" | "Legal";
type PreviewZoom = "50" | "75" | "100" | "fit";

type PdfPageThumb = {
  id: string; // stable id for sorting
  index: number; // original page index (0-based)
  dataUrl: string;
};

type WorkStatus = "idle" | "loading" | "processing" | "done" | "error";

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

/** 让出主线程，便于响应「取消」与 UI 更新 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

function bytesToKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(bytes < 1024 * 1024 ? 1 : 0)} KB`;
}

function makeId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getGrid(n: NupPreset): { rows: number; cols: number } {
  if (n === 2) return { rows: 2, cols: 1 };
  if (n === 4) return { rows: 2, cols: 2 };
  if (n === 6) return { rows: 3, cols: 2 };
  return { rows: 3, cols: 3 };
}

function getPaperSize(size: PaperSize): [number, number] {
  if (size === "A3") return PageSizes.A3;
  if (size === "A5") return PageSizes.A5;
  if (size === "Letter") return PageSizes.Letter;
  if (size === "Legal") return PageSizes.Legal;
  return PageSizes.A4;
}

async function loadPdfJs() {
  // pdfjs-dist v5 uses ESM build
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist");
  // worker from CDN (avoid bundler worker config)
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs";
  return pdfjs;
}

async function renderPdfThumbnails(pdfBytes: Uint8Array, maxThumbW = 220) {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: cloneBytes(pdfBytes) });
  const doc = await loadingTask.promise;

  const out: PdfPageThumb[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const page = await doc.getPage(i);
    const viewport1 = page.getViewport({ scale: 1 });
    const scale = maxThumbW / viewport1.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 初始化失败");

    // eslint-disable-next-line no-await-in-loop
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push({
      id: makeId(),
      index: i - 1,
      dataUrl: canvas.toDataURL("image/jpeg", 0.82),
    });
  }

  return out;
}

async function renderPdfPageToDataUrl(pdfBytes: Uint8Array, pageNo: number) {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: cloneBytes(pdfBytes) });
  const doc = await loadingTask.promise;
  const safePageNo = Math.max(1, Math.min(doc.numPages, pageNo));
  const page = await doc.getPage(safePageNo);

  const viewport1 = page.getViewport({ scale: 1 });
  const maxW = 560;
  const scale = maxW / viewport1.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 初始化失败");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.86);
}

async function buildNupPdf(params: {
  srcBytes: Uint8Array;
  orderedPageIndices: number[]; // 0-based
  preset: NupPreset;
  paperSize: PaperSize;
  orientation: Orientation;
  marginMm: number;
  gapMm: number;
  border: boolean;
  cutGuides: boolean;
  notesArea: NotesArea;
  notesRatio: number;
}) {
  const {
    srcBytes,
    orderedPageIndices,
    preset,
    paperSize,
    orientation,
    marginMm,
    gapMm,
    border,
    cutGuides,
    notesArea,
    notesRatio,
  } = params;

  const src = await PDFDocument.load(cloneBytes(srcBytes));
  const out = await PDFDocument.create();

  const paper = getPaperSize(paperSize);
  const pageW = orientation === "portrait" ? paper[0] : paper[1];
  const pageH = orientation === "portrait" ? paper[1] : paper[0];

  const margin = mmToPt(Math.max(0, marginMm));
  const gap = mmToPt(Math.max(0, gapMm));

  const notesFrac = Math.max(0, Math.min(0.45, notesRatio));
  const notesRight = notesArea === "right" ? pageW * notesFrac : 0;
  const notesBottom = notesArea === "bottom" ? pageH * notesFrac : 0;

  const contentX = margin;
  const contentY = margin + notesBottom;
  const contentW = Math.max(1, pageW - margin * 2 - notesRight);
  const contentH = Math.max(1, pageH - margin * 2 - notesBottom);

  const { rows, cols } = getGrid(preset);
  const rawCellW = (contentW - gap * (cols - 1)) / cols;
  const rawCellH = (contentH - gap * (rows - 1)) / rows;
  const cellW = Math.max(1, rawCellW);
  const cellH = Math.max(1, rawCellH);

  // embed all pages once to preserve vector quality
  const embeddedPages = await out.embedPdf(cloneBytes(srcBytes), src.getPageIndices());

  for (let i = 0; i < orderedPageIndices.length; i += preset) {
    const page = out.addPage([pageW, pageH]);
    const chunk = orderedPageIndices.slice(i, i + preset);

    chunk.forEach((srcIndex, idxInSheet) => {
      const r = Math.floor(idxInSheet / cols);
      const c = idxInSheet % cols;

      const x = contentX + c * (cellW + gap);
      // PDF coordinate: bottom-left origin
      const yTop = contentY + contentH - r * (cellH + gap);
      const y = yTop - cellH;

      const srcPage = embeddedPages[srcIndex];
      const { width: sw, height: sh } = srcPage.size();
      const scale = Math.min(cellW / sw, cellH / sh);
      const drawW = sw * scale;
      const drawH = sh * scale;

      const dx = x + (cellW - drawW) / 2;
      const dy = y + (cellH - drawH) / 2;

      page.drawPage(srcPage, { x: dx, y: dy, xScale: scale, yScale: scale });

      if (border) {
        page.drawRectangle({
          x,
          y,
          width: cellW,
          height: cellH,
          borderWidth: 0.5,
          borderColor: rgb(0.72, 0.72, 0.72),
          color: undefined,
        });
      }
    });

    if (cutGuides && gap > 0) {
      for (let c = 1; c < cols; c += 1) {
        const xLine = contentX + c * cellW + (c - 0.5) * gap;
        page.drawLine({
          start: { x: xLine, y: contentY },
          end: { x: xLine, y: contentY + contentH },
          color: rgb(0.86, 0.86, 0.86),
          thickness: 0.4,
        });
      }
      for (let r = 1; r < rows; r += 1) {
        const yLine = contentY + r * cellH + (r - 0.5) * gap;
        page.drawLine({
          start: { x: contentX, y: yLine },
          end: { x: contentX + contentW, y: yLine },
          color: rgb(0.86, 0.86, 0.86),
          thickness: 0.4,
        });
      }
    }

    // Optional notes guide line
    if (notesArea === "right" && notesRight > 0) {
      const xLine = pageW - margin - notesRight;
      page.drawLine({
        start: { x: xLine, y: margin },
        end: { x: xLine, y: pageH - margin },
        color: rgb(0.85, 0.85, 0.85),
        thickness: 0.6,
      });
    }
    if (notesArea === "bottom" && notesBottom > 0) {
      const yLine = margin + notesBottom;
      page.drawLine({
        start: { x: margin, y: yLine },
        end: { x: pageW - margin, y: yLine },
        color: rgb(0.85, 0.85, 0.85),
        thickness: 0.6,
      });
    }
  }

  return await out.save();
}

async function mergePdfs(files: File[]) {
  const out = await PDFDocument.create();
  for (const f of files) {
    const bytes = await f.arrayBuffer();
    const pdf = await PDFDocument.load(bytes);
    const indices = pdf.getPageIndices();
    // eslint-disable-next-line no-await-in-loop
    const copied = await out.copyPages(pdf, indices);
    copied.forEach((p) => out.addPage(p));
  }
  return await out.save();
}

async function splitPdf(file: File, from: number, to: number) {
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const total = src.getPageCount();
  const start = Math.max(1, Math.min(total, from));
  const end = Math.max(start, Math.min(total, to));
  const indices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
  const copied = await out.copyPages(src, indices);
  copied.forEach((p) => out.addPage(p));
  return await out.save();
}

async function rotatePdf(file: File, rotationDeg: 90 | 180 | 270) {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  pdf.getPages().forEach((p) => {
    const cur = p.getRotation().angle;
    p.setRotation(degrees((cur + rotationDeg) % 360));
  });
  return await pdf.save();
}

async function imagesToA4Pdf(images: File[], marginMm: number) {
  const out = await PDFDocument.create();
  const a4 = PageSizes.A4;
  const pageW = a4[0];
  const pageH = a4[1];
  const margin = mmToPt(Math.max(0, marginMm));

  for (const imgFile of images) {
    const bytes = await imgFile.arrayBuffer();
    let embedded;
    if (imgFile.type === "image/png") embedded = await out.embedPng(bytes);
    else embedded = await out.embedJpg(bytes);

    const page = out.addPage([pageW, pageH]);
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const scale = Math.min(maxW / embedded.width, maxH / embedded.height);
    const w = embedded.width * scale;
    const h = embedded.height * scale;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    page.drawImage(embedded, { x, y, width: w, height: h });
  }

  return await out.save();
}

function downloadBytes(bytes: Uint8Array, filename: string) {
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 用于 ZIP 内文件名（不含扩展名） */
function sanitizeFilenameBase(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 180);
}

/** 行首：第×章/节/部分 + 至少 2 个非换行字符（章节标题主体），避免只匹配到页码 */
const CHAPTER_LINE_STRICT_RE =
  /^(第[一二三四五六七八九十百零〇\d]+[章节部分])\s*([^\n\r]{2,})/m;
/** 英文教材行首 Chapter + 副标题 */
const CHAPTER_EN_LINE_STRICT_RE = /^(Chapter\s*\d+)\s+([^\n\r]{2,})/im;

function isPureNumericTitle(t: string): boolean {
  const s = t.trim().replace(/[\s\u200b\u3000]/g, "");
  if (!s) return true;
  if (/^\d+$/.test(s)) return true;
  return !Number.isNaN(Number(s)) && String(Number(s)) === s;
}

function isValidChapterTitleLength(t: string): boolean {
  const len = t.trim().length;
  return len >= 3 && len <= 50;
}

/** 标题须含「章」「节」「部分」之一，或英文 Chapter 样式 */
function titleHasChapterKeyword(t: string): boolean {
  return /[章节部分]/.test(t) || /^Chapter\s*\d/i.test(t.trim());
}

function normalizeChapterTitleFromMatch(
  part1: string,
  part2: string
): string | null {
  const full = `${part1} ${part2}`.trim().replace(/\s+/g, " ");
  if (!titleHasChapterKeyword(full)) return null;
  if (isPureNumericTitle(full)) return null;
  if (!isValidChapterTitleLength(full)) return null;
  return full.slice(0, 50);
}

/** 从页眉区域（约前两行）尝试匹配章节标题 */
function extractChapterTitleFromHeaderText(headerText: string): string | null {
  const block = headerText.trim();
  if (!block) return null;
  const lines = block.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const toScan = lines.length > 0 ? lines : [block];
  for (const line of toScan) {
    const m = line.match(CHAPTER_LINE_STRICT_RE);
    if (m?.[1] && m[2]) {
      const title = normalizeChapterTitleFromMatch(m[1], m[2]);
      if (title) return title;
    }
    const me = line.match(CHAPTER_EN_LINE_STRICT_RE);
    if (me?.[1] && me[2]) {
      const title = normalizeChapterTitleFromMatch(me[1], me[2]);
      if (title) return title;
    }
  }
  return null;
}

/** 将 pdfjs 文本按竖坐标聚成行，取页面最上方约两行（减少页脚页码干扰） */
function getPageHeaderTwoLinesText(tc: {
  items: Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>;
}): string {
  const items = tc.items.filter((it) => it.str && String(it.str).trim());
  if (items.length === 0) return "";
  const rows = items.map((it) => {
    const tr = it.transform;
    const y = tr && tr.length >= 6 ? tr[5]! : 0;
    const x = tr && tr.length >= 6 ? tr[4]! : 0;
    return { str: String(it.str), y, x };
  });
  rows.sort((a, b) => b.y - a.y || a.x - b.x);
  const lineMergeTol = 4;
  const lines: string[] = [];
  let cur: { y: number; buf: string } | null = null;
  for (const r of rows) {
    if (!cur) {
      cur = { y: r.y, buf: r.str };
      continue;
    }
    if (Math.abs(r.y - cur.y) <= lineMergeTol) {
      cur.buf += r.str;
    } else {
      lines.push(cur.buf.replace(/\s+/g, " ").trim());
      if (lines.length >= 2) break;
      cur = { y: r.y, buf: r.str };
    }
  }
  if (cur && lines.length < 2) {
    lines.push(cur.buf.replace(/\s+/g, " ").trim());
  }
  return lines
    .filter(Boolean)
    .slice(0, 2)
    .join("\n");
}

/** 书签标题校验（非文本扫描） */
function normalizeOutlineChapterTitle(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (isPureNumericTitle(t)) return null;
  if (!isValidChapterTitleLength(t)) return null;
  if (!titleHasChapterKeyword(t)) return null;
  return t.slice(0, 50);
}

const MIN_CHAPTER_GAP_PAGES = 5;
const TOP_REGION_FRAC = 0.2;
const HEADER_TITLE_SIMILARITY_SKIP = 0.9;

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + c
      );
    }
  }
  return dp[m]![n]!;
}

/** 1 = 完全相同，0 = 完全不同 */
function textSimilarityRatio(a: string, b: string): number {
  const s1 = a.trim();
  const s2 = b.trim();
  if (s1.length === 0 && s2.length === 0) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  if (s1 === s2) return 1;
  const d = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - d / maxLen;
}

/**
 * 仅使用页面顶部 topFrac 区域内的文字；按行聚类后，取 transform[0]（字号）最大的一行作为候选标题行。
 */
function pickLargestFontLineInTopRegion(
  tc: { items: Array<{ str?: string; transform?: number[] }> },
  topFrac: number
): string | null {
  const raw = tc.items.filter(
    (it) => it.str && it.transform && it.transform.length >= 6
  );
  if (raw.length === 0) return null;

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const it of raw) {
    const y = it.transform![5]!;
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }
  if (!Number.isFinite(yMin) || yMax <= yMin) return null;

  const yCut = yMax - topFrac * (yMax - yMin);
  const topItems = raw.filter((it) => it.transform![5]! >= yCut);
  if (topItems.length === 0) return null;

  const yTol = 3;
  const lines: { y: number; items: typeof raw }[] = [];
  for (const it of topItems) {
    const y = it.transform![5]!;
    let bucket = lines.find((L) => Math.abs(L.y - y) <= yTol);
    if (!bucket) {
      bucket = { y, items: [] };
      lines.push(bucket);
    }
    bucket.items.push(it);
  }

  let bestItems: typeof raw | null = null;
  let bestFont = -1;
  for (const L of lines) {
    const font = Math.max(
      ...L.items.map((it) => Math.abs(it.transform![0] ?? 0))
    );
    if (font > bestFont) {
      bestFont = font;
      bestItems = L.items;
    }
  }
  if (!bestItems || bestItems.length === 0) return null;

  bestItems.sort((a, b) => a.transform![4]! - b.transform![4]!);
  return bestItems
    .map((it) => String(it.str))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** 相邻章节起始页至少间隔 minDiff（0-based 页下标差） */
function enforceMinimumStartPageGap(
  chapters: { title: string; startPage0: number }[],
  minDiff: number
): { title: string; startPage0: number }[] {
  const sorted = [...chapters].sort((a, b) => a.startPage0 - b.startPage0);
  const out: typeof chapters = [];
  for (const ch of sorted) {
    if (out.length === 0) {
      out.push(ch);
      continue;
    }
    const prev = out[out.length - 1];
    if (ch.startPage0 - prev.startPage0 < minDiff) {
      continue;
    }
    out.push(ch);
  }
  return out;
}

async function resolveDestToPageIndexZeroBased(
  doc: {
    numPages: number;
    getDestination: (id: string) => Promise<unknown[] | null>;
    getPageIndex: (ref: unknown) => Promise<number>;
  },
  dest: string | unknown[] | null | undefined
): Promise<number | null> {
  if (dest == null) return null;
  let explicit: unknown[] | null = null;
  if (typeof dest === "string") {
    explicit = await doc.getDestination(dest);
  } else if (Array.isArray(dest)) {
    explicit = dest;
  }
  if (!explicit || explicit.length === 0) return null;
  const first = explicit[0];
  if (typeof first === "number") {
    const idx = Math.trunc(first);
    if (idx >= 0 && idx < doc.numPages) return idx;
    return null;
  }
  if (
    first &&
    typeof first === "object" &&
    "num" in first &&
    "gen" in first
  ) {
    try {
      return await doc.getPageIndex(first);
    } catch {
      return null;
    }
  }
  return null;
}

async function analyzePdfChapters(
  bytes: Uint8Array,
  onProgress: (pct: number, msg: string) => void,
  shouldCancel?: () => boolean
): Promise<{
  chapters: { title: string; startPage0: number }[];
  numPages: number;
  recognitionAbnormal: boolean;
}> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: cloneBytes(bytes) });
  const doc = await loadingTask.promise;
  const numPages = doc.numPages;

  onProgress(4, "正在读取书签…");
  await yieldToMain();
  if (shouldCancel?.()) {
    onProgress(0, "已取消");
    return { chapters: [], numPages, recognitionAbnormal: false };
  }

  const outline = await doc.getOutline();

  const level1: { title: string; startPage0: number }[] = [];

  if (outline && outline.length > 0) {
    const n = outline.length;
    for (let i = 0; i < n; i++) {
      await yieldToMain();
      if (shouldCancel?.()) {
        onProgress(0, "已取消");
        return { chapters: [], numPages, recognitionAbnormal: false };
      }
      const item = outline[i];
      if (item.url) continue;
      const idx = await resolveDestToPageIndexZeroBased(doc, item.dest);
      if (idx != null) {
        const t = normalizeOutlineChapterTitle(String(item.title ?? ""));
        if (t) {
          level1.push({ title: t, startPage0: idx });
        }
      }
      onProgress(
        4 + Math.round((36 * (i + 1)) / Math.max(n, 1)),
        `解析书签 ${i + 1}/${n}…`
      );
    }
  }

  if (level1.length === 0) {
    onProgress(42, "无书签或书签无法解析，正在扫描页眉文本…");
    let prevPageTitle: string | null = null;
    let lastSplitPage0 = -9999;
    for (let p = 1; p <= numPages; p++) {
      await yieldToMain();
      if (shouldCancel?.()) {
        onProgress(0, "已取消");
        return { chapters: [], numPages, recognitionAbnormal: false };
      }
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const line = pickLargestFontLineInTopRegion(tc, TOP_REGION_FRAC);
      if (line) {
        const title = extractChapterTitleFromHeaderText(line);
        if (title) {
          const dupHeader =
            prevPageTitle !== null &&
            textSimilarityRatio(title, prevPageTitle) >
              HEADER_TITLE_SIMILARITY_SKIP;
          if (!dupHeader) {
            const page0 = p - 1;
            const tooSoon =
              lastSplitPage0 >= 0 &&
              page0 - lastSplitPage0 < MIN_CHAPTER_GAP_PAGES;
            if (!tooSoon) {
              level1.push({ title, startPage0: page0 });
              lastSplitPage0 = page0;
            }
          }
          prevPageTitle = title;
        } else {
          prevPageTitle = null;
        }
      } else {
        prevPageTitle = null;
      }
      onProgress(
        42 + Math.round((55 * p) / numPages),
        `扫描页眉 ${p}/${numPages} 页…`
      );
    }
  }

  level1.sort((a, b) => a.startPage0 - b.startPage0);
  const samePageDeduped: typeof level1 = [];
  for (const ch of level1) {
    if (
      samePageDeduped.length === 0 ||
      samePageDeduped[samePageDeduped.length - 1].startPage0 !== ch.startPage0
    ) {
      samePageDeduped.push(ch);
    }
  }

  const gapFiltered = enforceMinimumStartPageGap(
    samePageDeduped,
    MIN_CHAPTER_GAP_PAGES
  );
  const recognitionAbnormal = gapFiltered.length > 100;

  onProgress(100, "分析完成");
  return {
    chapters: gapFiltered,
    numPages,
    recognitionAbnormal,
  };
}

/**
 * 从目录页合并文本中解析「标题 …… 页码」行（如：第一章 进程管理 ....... 45）。
 *
 * @param offset 将目录中的**印刷页码**换算为当前 PDF 的 **0 起始页下标**时的加数：
 *   `startPage0 = (目录页码 - 1) + offset`。
 *   例如目录标为 1 的页在 PDF 第 20 页（1-based）时，offset = 19。
 */
export function parseTOCFromPages(
  text: string,
  offset: number
): { title: string; startPage0: number }[] {
  const re = /(.+)\.{3,}(\d+)/g;
  const out: { title: string; startPage0: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const rawTitle = (m[1] ?? "").replace(/\s+/g, " ").trim();
    const printed = parseInt(m[2] ?? "0", 10);
    if (!rawTitle || !Number.isFinite(printed) || printed < 1) continue;
    const startPage0 = printed - 1 + offset;
    if (startPage0 < 0) continue;
    out.push({ title: rawTitle, startPage0 });
  }
  out.sort((a, b) => a.startPage0 - b.startPage0);
  const deduped: typeof out = [];
  let lastPage = -1;
  for (const ch of out) {
    if (ch.startPage0 === lastPage) continue;
    lastPage = ch.startPage0;
    deduped.push(ch);
  }
  return deduped;
}

async function extractPdfTextFromPageRange(
  bytes: Uint8Array,
  fromPage1: number,
  toPage1: number,
  onProgress?: (pct: number, msg: string) => void
): Promise<string> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: cloneBytes(bytes) }).promise;
  const from = Math.max(1, Math.min(fromPage1, doc.numPages));
  const to = Math.max(from, Math.min(toPage1, doc.numPages));
  const parts: string[] = [];
  const total = to - from + 1;
  for (let p = from; p <= to; p++) {
    await yieldToMain();
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items as Array<{ str?: string }>;
    parts.push(items.map((it) => it.str ?? "").join(""));
    onProgress?.(
      Math.round(((p - from + 1) / total) * 92) + 4,
      `提取目录页 ${p - from + 1}/${total}…`
    );
  }
  return parts.join("\n");
}

export type ManualSegmentParseResult =
  | { ok: true; chapters: { title: string; startPage0: number }[] }
  | { ok: false; error: string };

/**
 * 手动分段：格式 A 每行「物理页码 标题」；格式 B 仅数字与分隔符（逗号、空格、换行等），如 `1, 45, 89`。
 */
export function parseManualSegmentInput(
  raw: string,
  totalPages: number
): ManualSegmentParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "请输入分段内容" };
  }
  if (totalPages < 1) {
    return { ok: false, error: "请先加载 PDF 以获取总页数" };
  }

  const formatBChars = /^[\d\s,\n\r\t\u3000\uFF0C]+$/;
  const lineFormatA = /^(\d+)\s+(.+)$/;

  if (formatBChars.test(trimmed)) {
    const nums =
      trimmed.match(/\d+/g)?.map((n) => parseInt(n, 10)).filter(Number.isFinite) ??
      [];
    const uniq = [...new Set(nums)]
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b);
    if (uniq.length === 0) {
      return { ok: false, error: "未解析到有效页码（须在 1～总页数之间）" };
    }
    const chapters: { title: string; startPage0: number }[] = [];
    for (let i = 0; i < uniq.length; i++) {
      const from1 = uniq[i]!;
      const to1 =
        i < uniq.length - 1 ? uniq[i + 1]! - 1 : totalPages;
      const title = `Chapter_${i + 1}_P${from1}_P${to1}`;
      chapters.push({ title, startPage0: from1 - 1 });
    }
    return { ok: true, chapters };
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { ok: false, error: "请输入分段内容" };
  }

  const chapters: { title: string; startPage0: number }[] = [];
  const seenStarts = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(lineFormatA);
    if (!m?.[1] || m[2] == null) {
      return {
        ok: false,
        error: `第 ${i + 1} 行格式错误：应为「页码 标题」（例：1 绪论）`,
      };
    }
    const page1 = parseInt(m[1], 10);
    const title = m[2].replace(/\s+/g, " ").trim();
    if (!Number.isFinite(page1) || page1 < 1 || page1 > totalPages) {
      return {
        ok: false,
        error: `第 ${i + 1} 行页码无效（须在 1～${totalPages}）`,
      };
    }
    if (!title) {
      return { ok: false, error: `第 ${i + 1} 行缺少标题` };
    }
    const startPage0 = page1 - 1;
    if (seenStarts.has(startPage0)) {
      return { ok: false, error: `重复的章节起始页：第 ${page1} 页` };
    }
    seenStarts.add(startPage0);
    chapters.push({ title, startPage0 });
  }
  chapters.sort((a, b) => a.startPage0 - b.startPage0);
  return { ok: true, chapters };
}

function buildChapterRanges(
  chapters: { title: string; startPage0: number }[],
  totalPages: number
): { title: string; from0: number; to0: number }[] {
  const sorted = [...chapters].sort((a, b) => a.startPage0 - b.startPage0);
  const out: { title: string; from0: number; to0: number }[] = [];
  if (sorted.length > 0 && sorted[0].startPage0 > 0) {
    out.push({
      title: "文档前部",
      from0: 0,
      to0: sorted[0].startPage0 - 1,
    });
  }
  for (let i = 0; i < sorted.length; i++) {
    const from0 = sorted[i].startPage0;
    const to0 =
      i < sorted.length - 1 ? sorted[i + 1].startPage0 - 1 : totalPages - 1;
    out.push({ title: sorted[i].title, from0, to0 });
  }
  return out.filter((r) => r.from0 <= r.to0);
}

async function extractChapterPdfStripped(
  srcBytes: Uint8Array,
  from0: number,
  to0: number,
  options?: { isCancelled?: () => boolean }
): Promise<Uint8Array | null> {
  await yieldToMain();
  if (options?.isCancelled?.()) return null;

  const src = await PDFDocument.load(cloneBytes(srcBytes));
  const out = await PDFDocument.create();
  const total = src.getPageCount();
  const start = Math.max(0, Math.min(total - 1, from0));
  const end = Math.max(start, Math.min(total - 1, to0));

  for (let pageIdx = start; pageIdx <= end; pageIdx += 1) {
    await yieldToMain();
    if (options?.isCancelled?.()) return null;
    const copied = await out.copyPages(src, [pageIdx]);
    copied.forEach((p) => out.addPage(p));
  }

  try {
    out.setTitle("");
    out.setAuthor("");
    out.setSubject("");
    out.setKeywords([]);
    out.setCreator("");
  } catch {
    /* ignore */
  }
  return new Uint8Array(await out.save());
}

async function mergeRangesToSinglePdf(
  srcBytes: Uint8Array,
  ranges: { title: string; from0: number; to0: number }[],
  options?: { isCancelled?: () => boolean }
): Promise<Uint8Array | null> {
  await yieldToMain();
  if (options?.isCancelled?.()) return null;

  const src = await PDFDocument.load(cloneBytes(srcBytes));
  const out = await PDFDocument.create();
  const total = src.getPageCount();

  for (let r = 0; r < ranges.length; r += 1) {
    await yieldToMain();
    if (options?.isCancelled?.()) return null;
    const rng = ranges[r];
    const start = Math.max(0, Math.min(total - 1, rng.from0));
    const end = Math.max(start, Math.min(total - 1, rng.to0));
    const indices = Array.from(
      { length: end - start + 1 },
      (_, i) => start + i
    );
    const copied = await out.copyPages(src, indices);
    copied.forEach((p) => out.addPage(p));
  }

  try {
    out.setTitle("");
    out.setAuthor("");
    out.setSubject("");
    out.setKeywords([]);
    out.setCreator("");
  } catch {
    /* ignore */
  }
  return new Uint8Array(await out.save());
}

type Tab = "nup" | "merge" | "split" | "rotate" | "img2pdf" | "autoSplit";

export default function PdfToolPage() {
  const [tab, setTab] = useState<Tab>("nup");

  // N-up state
  const [status, setStatus] = useState<WorkStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [srcFile, setSrcFile] = useState<File | null>(null);
  const [srcBytes, setSrcBytes] = useState<Uint8Array | null>(null);
  const [thumbs, setThumbs] = useState<PdfPageThumb[]>([]);
  const [preset, setPreset] = useState<NupPreset>(4);
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [marginMm, setMarginMm] = useState(10);
  const [gapMm, setGapMm] = useState(6);
  const [border, setBorder] = useState(false);
  const [cutGuides, setCutGuides] = useState(false);
  const [notesArea, setNotesArea] = useState<NotesArea>("none");
  const [notesRatio, setNotesRatio] = useState(0.22);
  const [outBytes, setOutBytes] = useState<Uint8Array | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewTotalPages, setPreviewTotalPages] = useState(1);
  const [previewZoom, setPreviewZoom] = useState<PreviewZoom>("fit");
  const [printMode, setPrintMode] = useState(false);
  const [showThumbsDrawer, setShowThumbsDrawer] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);

  const thumbsRef = useRef<HTMLUListElement | null>(null);
  const sortableRef = useRef<Sortable | null>(null);

  // basic tools state
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [splitFile, setSplitFile] = useState<File | null>(null);
  const [splitFrom, setSplitFrom] = useState(1);
  const [splitTo, setSplitTo] = useState(1);
  const [rotateFile, setRotateFile] = useState<File | null>(null);
  const [rotateDeg, setRotateDeg] = useState<90 | 180 | 270>(90);
  const [imgFiles, setImgFiles] = useState<File[]>([]);
  const [imgMarginMm, setImgMarginMm] = useState(10);

  const [autoSplitFile, setAutoSplitFile] = useState<File | null>(null);
  const [autoSplitBytes, setAutoSplitBytes] = useState<Uint8Array | null>(null);
  const [autoSplitProgress, setAutoSplitProgress] = useState(0);
  const [autoSplitStatus, setAutoSplitStatus] = useState("");
  const [chapterPlan, setChapterPlan] = useState<
    { title: string; startPage0: number }[]
  >([]);
  const [autoSplitTotalPages, setAutoSplitTotalPages] = useState(0);
  const [autoSplitPhase, setAutoSplitPhase] = useState<
    "idle" | "analyzing" | "selecting" | "processing"
  >("idle");
  const [rangeSelected, setRangeSelected] = useState<boolean[]>([]);
  const [exportPackageMode, setExportPackageMode] = useState<
    "zip" | "singlePdf"
  >("zip");
  const [chapterRecognitionAbnormal, setChapterRecognitionAbnormal] =
    useState(false);
  const [chapterAnalyzeMode, setChapterAnalyzeMode] = useState<
    "auto" | "toc" | "manual"
  >("auto");
  const [tocFromPageInput, setTocFromPageInput] = useState("1");
  const [tocToPageInput, setTocToPageInput] = useState("1");
  const [tocOffset, setTocOffset] = useState(0);
  const [manualSegmentText, setManualSegmentText] = useState("");
  const [tocExtractedRawText, setTocExtractedRawText] = useState("");
  const isCancellingRef = useRef(false);

  const manualChapterParse = useMemo((): ManualSegmentParseResult => {
    if (chapterAnalyzeMode !== "manual" || autoSplitTotalPages < 1) {
      return { ok: false, error: "" };
    }
    return parseManualSegmentInput(manualSegmentText, autoSplitTotalPages);
  }, [chapterAnalyzeMode, manualSegmentText, autoSplitTotalPages]);

  const effectiveChapterPlan = useMemo(() => {
    if (chapterAnalyzeMode === "manual") {
      if (manualChapterParse.ok && manualChapterParse.chapters.length > 0) {
        return manualChapterParse.chapters;
      }
      return [];
    }
    return chapterPlan;
  }, [chapterAnalyzeMode, manualChapterParse, chapterPlan]);

  const chapterRangesPreview = useMemo(() => {
    if (effectiveChapterPlan.length === 0 || autoSplitTotalPages < 1) return [];
    return buildChapterRanges(effectiveChapterPlan, autoSplitTotalPages);
  }, [effectiveChapterPlan, autoSplitTotalPages]);

  const manualSegmentReady =
    chapterAnalyzeMode === "manual" &&
    manualChapterParse.ok &&
    manualChapterParse.chapters.length > 0;

  const manualTooManySegments =
    chapterAnalyzeMode === "manual" &&
    manualChapterParse.ok &&
    manualChapterParse.chapters.length > 100;

  const hasAutoSplitChapterResults =
    chapterRangesPreview.length > 0 &&
    (manualSegmentReady || autoSplitPhase === "selecting");

  useEffect(() => {
    const showPreview =
      chapterRangesPreview.length > 0 &&
      (autoSplitPhase === "selecting" || chapterAnalyzeMode === "manual");
    if (!showPreview) return;
    setRangeSelected((prev) => {
      if (prev.length === chapterRangesPreview.length) return prev;
      return chapterRangesPreview.map(() => true);
    });
  }, [autoSplitPhase, chapterRangesPreview, chapterAnalyzeMode]);

  useEffect(() => {
    if (chapterAnalyzeMode === "manual") {
      setChapterRecognitionAbnormal(false);
    }
  }, [chapterAnalyzeMode]);

  const selectedChapterExportCount = useMemo(() => {
    if (
      rangeSelected.length !== chapterRangesPreview.length ||
      chapterRangesPreview.length === 0
    ) {
      return 0;
    }
    return rangeSelected.filter(Boolean).length;
  }, [rangeSelected, chapterRangesPreview]);

  const runExportChapterPicked = useCallback(
    async (
      picked: { title: string; from0: number; to0: number }[]
    ) => {
      if (!autoSplitBytes || picked.length === 0) return;
      isCancellingRef.current = false;
      setAutoSplitPhase("processing");
      setAutoSplitProgress(0);
      try {
        if (exportPackageMode === "singlePdf") {
          setAutoSplitStatus("正在合并为单个 PDF…");
          const merged = await mergeRangesToSinglePdf(
            autoSplitBytes,
            picked,
            { isCancelled: () => isCancellingRef.current }
          );
          if (isCancellingRef.current || merged == null) {
            setAutoSplitStatus("已取消导出");
            setAutoSplitPhase("selecting");
            setAutoSplitProgress(0);
            return;
          }
          setAutoSplitProgress(100);
          downloadBytes(
            merged,
            `${sanitizeFilenameBase("合并章节")}_${new Date().toISOString().slice(0, 10)}.pdf`
          );
          setAutoSplitStatus("已下载合并 PDF");
          setAutoSplitPhase("selecting");
        } else {
          const zip = new JSZip();
          const n = picked.length;
          for (let i = 0; i < n; i += 1) {
            await yieldToMain();
            if (isCancellingRef.current) {
              setAutoSplitStatus("已取消导出");
              setAutoSplitPhase("selecting");
              setAutoSplitProgress(0);
              return;
            }
            const r = picked[i]!;
            setAutoSplitStatus(`正在生成第 ${i + 1}/${n} 个 PDF…`);
            setAutoSplitProgress(Math.round((i / Math.max(n, 1)) * 85));
            const pdfBytes = await extractChapterPdfStripped(
              autoSplitBytes,
              r.from0,
              r.to0,
              { isCancelled: () => isCancellingRef.current }
            );
            if (pdfBytes == null) {
              setAutoSplitStatus("已取消导出");
              setAutoSplitPhase("selecting");
              setAutoSplitProgress(0);
              return;
            }
            const base = sanitizeFilenameBase(`[${i + 1}] ${r.title}`);
            zip.file(`${base}.pdf`, pdfBytes);
          }
          setAutoSplitStatus("正在打包 ZIP…");
          setAutoSplitProgress(94);
          await yieldToMain();
          const blob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `chapters_${new Date().toISOString().slice(0, 10)}.zip`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          setAutoSplitProgress(100);
          setAutoSplitStatus("已完成 ZIP 下载");
          setAutoSplitPhase("selecting");
        }
      } catch (err) {
        setAutoSplitStatus(
          err instanceof Error ? err.message : "导出失败"
        );
        setAutoSplitPhase("selecting");
      } finally {
        isCancellingRef.current = false;
      }
    },
    [autoSplitBytes, exportPackageMode]
  );

  useEffect(() => {
    if (!autoSplitBytes) {
      setAutoSplitTotalPages(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument({ data: cloneBytes(autoSplitBytes) }).promise;
      if (cancelled) return;
      setAutoSplitTotalPages(doc.numPages);
    })();
    return () => {
      cancelled = true;
    };
  }, [autoSplitBytes]);

  const nupPageCount = thumbs.length;
  const orderedIndices = useMemo(() => thumbs.map((t) => t.index), [thumbs]);

  useEffect(() => {
    if (!thumbsRef.current) return;
    if (sortableRef.current) sortableRef.current.destroy();

    sortableRef.current = new Sortable(thumbsRef.current, {
      animation: 150,
      ghostClass: "opacity-60",
      onEnd: (evt) => {
        setThumbs((prev) => {
          const next = [...prev];
          const [moved] = next.splice(evt.oldIndex ?? 0, 1);
          next.splice(evt.newIndex ?? 0, 0, moved);
          return next;
        });
      },
    });

    return () => {
      sortableRef.current?.destroy();
      sortableRef.current = null;
    };
  }, [thumbs.length]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function onPickPdf(file: File) {
    setError(null);
    setOutBytes(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setStatus("loading");
    setSrcFile(file);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setSrcBytes(bytes);
      const t = await renderPdfThumbnails(bytes, 220);
      setThumbs(t);
      setPreviewPage(1);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  async function runNup() {
    if (!srcBytes || thumbs.length === 0) return;
    setError(null);
    setStatus("processing");
    setIsGenerating(true);

    try {
      const out = await buildNupPdf({
        srcBytes,
        orderedPageIndices: orderedIndices,
        preset,
        paperSize,
        orientation,
        marginMm,
        gapMm,
        border,
        cutGuides,
        notesArea,
        notesRatio,
      });
      const nextBytes = new Uint8Array(out);
      const doc = await PDFDocument.load(cloneBytes(nextBytes));
      const total = doc.getPageCount();
      const nextPage = Math.max(1, Math.min(total, previewPage));
      const nextPreviewUrl = await renderPdfPageToDataUrl(nextBytes, nextPage);

      setOutBytes(nextBytes);
      setPreviewTotalPages(total);
      setPreviewPage(nextPage);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextPreviewUrl;
      });
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "处理失败");
    } finally {
      setIsGenerating(false);
    }
  }

  // Debounced live rebuild on param change
  useEffect(() => {
    if (!srcBytes || thumbs.length === 0) return;
    const t = window.setTimeout(() => {
      void runNup();
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcBytes, thumbs, preset, paperSize, orientation, marginMm, gapMm, border, cutGuides, notesArea, notesRatio]);

  // Preview page switch only (keep current PDF)
  useEffect(() => {
    if (!outBytes || isGenerating) return;
    const t = window.setTimeout(() => {
      void (async () => {
        const dataUrl = await renderPdfPageToDataUrl(outBytes, previewPage);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return dataUrl;
        });
      })();
    }, 80);
    return () => window.clearTimeout(t);
  }, [outBytes, previewPage, isGenerating]);

  // Show loading overlay only if generation takes >200ms
  useEffect(() => {
    if (!isGenerating) {
      setShowLoadingOverlay(false);
      return;
    }
    const t = window.setTimeout(() => setShowLoadingOverlay(true), 200);
    return () => window.clearTimeout(t);
  }, [isGenerating]);

  // N-up 快捷键：2/4/6/9 切换排版，P/L 切纸张方向
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (tab !== "nup") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "2") setPreset(2);
      if (e.key === "4") setPreset(4);
      if (e.key === "6") setPreset(6);
      if (e.key === "9") setPreset(9);
      if (e.key.toLowerCase() === "p") setOrientation("portrait");
      if (e.key.toLowerCase() === "l") setOrientation("landscape");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tab]);

  const headline = (
    <div className="rounded-2xl bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md shadow-sm px-5 py-4">
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        🔒 所有排版处理均在本地浏览器完成，绝不上传文件，保护学习隐私。
      </div>
      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        建议使用桌面端 Chrome/Edge 获取更稳定的预览与更快的处理速度。
      </div>
    </div>
  );

  const tabs = (
    <div className="flex flex-wrap gap-2">
      {(
        [
          ["nup", "N-up 排版"],
          ["merge", "合并"],
          ["split", "拆分/提取"],
          ["autoSplit", "按章节拆分"],
          ["rotate", "旋转"],
          ["img2pdf", "图片转 PDF"],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => setTab(k)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
            tab === k
              ? "bg-gradient-to-r from-zinc-900 to-zinc-700 text-white dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900 shadow-sm"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const dropzone = (
    <div className="rounded-3xl border-2 border-dashed border-zinc-300/70 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md p-8 sm:p-12 text-center shadow-sm">
      <div className="mx-auto max-w-xl space-y-3">
        <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          拖拽上传 PDF
        </div>
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          支持 PPT 导出的 PDF。上传后可进入参数配置与实时打印预览。
        </div>
        <div className="pt-2">
          <label className="inline-flex min-h-[46px] cursor-pointer items-center justify-center rounded-xl bg-gradient-to-r from-zinc-900 to-zinc-700 px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900">
            选择 PDF
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickPdf(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {srcFile ? (
          <div className="pt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {srcFile.name} · {bytesToKB(srcFile.size)} · 页数：{nupPageCount}
          </div>
        ) : null}
        {error ? (
          <div className="text-sm text-red-600 dark:text-red-300">{error}</div>
        ) : null}
      </div>
    </div>
  );

  const nupSidebar = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-zinc-900/70 backdrop-blur-md shadow-[0_8px_24px_rgba(15,23,42,0.06)] p-5">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          排版参数
        </h2>
        <label className="mt-3 inline-flex min-h-[40px] cursor-pointer items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900">
          更换 PDF
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickPdf(f);
              e.target.value = "";
            }}
          />
        </label>

        <div className="mt-4 grid gap-4">
          <label className="space-y-2 text-sm">
            <div className="text-zinc-600 dark:text-zinc-400">每页张数</div>
            <select
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-zinc-900 dark:text-zinc-100"
              value={preset}
              onChange={(e) => setPreset(Number(e.target.value) as NupPreset)}
            >
              <option value={2}>一页 2 张</option>
              <option value={4}>一页 4 张 (2×2)</option>
              <option value={6}>一页 6 张 (2×3)</option>
              <option value={9}>一页 9 张 (3×3)</option>
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <div className="text-zinc-600 dark:text-zinc-400">纸张方向</div>
            <select
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-zinc-900 dark:text-zinc-100"
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as Orientation)}
            >
              <option value="portrait">纵向 (Portrait)</option>
              <option value="landscape">横向 (Landscape)</option>
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <div className="text-zinc-600 dark:text-zinc-400">纸张大小</div>
            <select
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-zinc-900 dark:text-zinc-100"
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as PaperSize)}
            >
              <option value="A4">A4（默认）</option>
              <option value="A3">A3</option>
              <option value="A5">A5</option>
              <option value="Letter">Letter</option>
              <option value="Legal">Legal</option>
            </select>
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">页边距</span>
              <div className="flex items-center gap-2">
                <input
                  inputMode="numeric"
                  className="w-16 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-2 py-1 text-right text-zinc-900 dark:text-zinc-100"
                  value={marginMm}
                  onChange={(e) => setMarginMm(Math.max(0, Number(e.target.value) || 0))}
                />
                <span className="text-xs text-zinc-500">mm</span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={marginMm}
              onChange={(e) => setMarginMm(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">缩略图间距 Gap</span>
              <div className="flex items-center gap-2">
                <input
                  inputMode="numeric"
                  className="w-16 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-2 py-1 text-right text-zinc-900 dark:text-zinc-100"
                  value={gapMm}
                  onChange={(e) => setGapMm(Math.max(0, Number(e.target.value) || 0))}
                />
                <span className="text-xs text-zinc-500">mm</span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={gapMm}
              onChange={(e) => setGapMm(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={border}
              onChange={(e) => setBorder(e.target.checked)}
              className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
            />
            为每张缩略图添加细边框
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={cutGuides}
              onChange={(e) => setCutGuides(e.target.checked)}
              className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
            />
            显示裁切辅助线（建议间距较大时）
          </label>

          <label className="space-y-2 text-sm">
            <div className="text-zinc-600 dark:text-zinc-400">留笔记区</div>
            <select
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-zinc-900 dark:text-zinc-100"
              value={notesArea}
              onChange={(e) => setNotesArea(e.target.value as NotesArea)}
            >
              <option value="none">不留白</option>
              <option value="right">右侧留白</option>
              <option value="bottom">下方留白</option>
            </select>
          </label>

          {notesArea !== "none" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">留白比例</span>
                <span className="font-mono text-zinc-900 dark:text-zinc-100">
                  {Math.round(notesRatio * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.4}
                step={0.01}
                value={notesRatio}
                onChange={(e) => setNotesRatio(Number(e.target.value))}
                className="w-full"
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void runNup()}
            disabled={!srcBytes || thumbs.length === 0 || status === "processing"}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gradient-to-r from-slate-900 to-slate-700 px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900"
          >
            生成排版 PDF
          </button>

          <button
            type="button"
            disabled={thumbs.length === 0}
            onClick={() => setShowThumbsDrawer(true)}
            className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
          >
            管理页面顺序（{thumbs.length}）
          </button>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!outBytes}
              onClick={() =>
                outBytes
                  ? downloadBytes(
                      outBytes,
                      `nup_${new Date().toISOString().slice(0, 10)}.pdf`
                    )
                  : undefined
              }
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
            >
              下载 PDF
            </button>
            <button
              type="button"
              disabled={!outBytes}
              onClick={async () => {
                if (!outBytes) return;
                const zip = new JSZip();
                zip.file(
                  `nup_${new Date().toISOString().slice(0, 10)}.pdf`,
                  outBytes
                );
                const blob = await zip.generateAsync({
                  type: "blob",
                  compression: "DEFLATE",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `nup_${new Date().toISOString().slice(0, 10)}.zip`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
            >
              ZIP
            </button>
          </div>

          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            小提示：调整参数会自动刷新预览（有 0.45s 防抖）。
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            快捷键：<span className="font-mono">2/4/6/9</span> 切换每页张数，
            <span className="font-mono"> P</span> 纵向，
            <span className="font-mono"> L</span> 横向。
          </div>
        </div>
      </div>
    </div>
  );

  const nupThumbs = showThumbsDrawer ? (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/35 p-3 sm:p-6">
      <div className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            管理页面顺序（拖拽）
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={thumbs.length === 0}
              onClick={() => setThumbs((prev) => [...prev].reverse())}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300"
            >
              反转
            </button>
            <button
              type="button"
              onClick={() => setShowThumbsDrawer(false)}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300"
            >
              关闭
            </button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto max-h-[calc(85vh-60px)]">
          {thumbs.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">暂无页面。</p>
          ) : (
            <ul ref={thumbsRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {thumbs.map((t, i) => (
                <li
                  key={t.id}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/20 overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.dataUrl} alt="" className="w-full h-auto" />
                  <div className="px-2 py-1 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
                    <span>#{i + 1}</span>
                    <span>p{t.index + 1}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const nupPreview = (
    <div className="pdf-print-preview rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-slate-50 dark:bg-zinc-900/70 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          打印预览（WYSIWYG）
        </h2>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="inline-flex rounded-lg border border-zinc-300 dark:border-zinc-700 overflow-hidden">
            {(["50", "75", "100", "fit"] as const).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setPreviewZoom(z)}
                className={`px-2.5 py-1.5 text-xs ${
                  previewZoom === z
                    ? "bg-slate-800 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-white text-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                }`}
              >
                {z === "fit" ? "Fit" : `${z}%`}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!outBytes || previewPage <= 1}
            onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-100 disabled:opacity-50"
          >
            上一页
          </button>
          <span className="text-xs text-zinc-500 dark:text-zinc-300">
            {previewPage}/{previewTotalPages}
          </span>
          <button
            type="button"
            disabled={!outBytes || previewPage >= previewTotalPages}
            onClick={() =>
              setPreviewPage((p) => Math.min(previewTotalPages, p + 1))
            }
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-100 disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>
      <div className="relative mt-4 rounded-xl bg-slate-100 dark:bg-zinc-800/40 p-4 flex items-center justify-center min-h-[620px]">
        {previewUrl ? (
          <div
            className="bg-white p-3 shadow-[0_14px_30px_rgba(15,23,42,0.14)] rounded-sm transition-all duration-200 origin-center"
            style={{
              width: previewZoom === "fit" ? "100%" : `${previewZoom}%`,
              maxWidth: "100%",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="预览"
              className="w-full h-auto"
            />
          </div>
        ) : (
          <div className="text-sm text-zinc-500 dark:text-zinc-300 text-center">
            生成排版 PDF 后会自动显示预览图。
          </div>
        )}
        {showLoadingOverlay ? (
          <div className="absolute inset-0 rounded-xl bg-white/55 dark:bg-zinc-900/45 backdrop-blur-[1px] flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-full bg-white/80 dark:bg-zinc-900/70 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 shadow-sm">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
              正在更新预览...
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-300">
        预览为栅格化缩略图，仅用于所见即所得；最终 PDF 仍保持矢量质量。
      </div>
      <div className="mt-3 pdf-print-hidden">
        <button
          type="button"
          onClick={() => {
            setPrintMode(true);
            window.setTimeout(() => {
              window.print();
              setPrintMode(false);
            }, 50);
          }}
          className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-100 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700/70"
        >
          打印当前预览
        </button>
      </div>
    </div>
  );

  const mergePane = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-5">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          合并多个 PDF
        </h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            选择多个 PDF
            <input
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setMergeFiles(files);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            disabled={mergeFiles.length < 2}
            onClick={async () => {
              const bytes = await mergePdfs(mergeFiles);
              downloadBytes(new Uint8Array(bytes), "merged.pdf");
            }}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-5 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
          >
            合并并下载
          </button>
        </div>
        {mergeFiles.length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {mergeFiles.map((f) => (
              <li key={f.name} className="flex justify-between gap-3">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0">{bytesToKB(f.size)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );

  const splitPane = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-5">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          拆分 / 提取页
        </h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            选择 PDF
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setSplitFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric"
              className="w-20 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100"
              value={splitFrom}
              onChange={(e) => setSplitFrom(Math.max(1, Number(e.target.value) || 1))}
            />
            <span className="text-sm text-zinc-500 dark:text-zinc-400">到</span>
            <input
              inputMode="numeric"
              className="w-20 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100"
              value={splitTo}
              onChange={(e) => setSplitTo(Math.max(1, Number(e.target.value) || 1))}
            />
            <button
              type="button"
              disabled={!splitFile}
              onClick={async () => {
                if (!splitFile) return;
                const bytes = await splitPdf(splitFile, splitFrom, splitTo);
                downloadBytes(new Uint8Array(bytes), "extracted.pdf");
              }}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
            >
              提取并下载
            </button>
          </div>
        </div>
        {splitFile ? (
          <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            已选择：{splitFile.name}
          </div>
        ) : null}
      </div>
    </div>
  );

  const autoSplitPane = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800/90 dark:bg-zinc-950/30 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            按章节拆分
          </h2>
          <details className="max-w-sm shrink-0 text-right">
            <summary className="cursor-pointer list-none text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/90 bg-zinc-50/90 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900/80">
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 text-[10px] font-semibold text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
                  aria-hidden
                >
                  ?
                </span>
                使用说明
              </span>
            </summary>
            <div className="mt-3 space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 text-left text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
              <p>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  自动扫描
                </span>
                ：优先书签，否则按页眉识别。
              </p>
              <p>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  目录页解析
                </span>
                ：从指定页提取文字；默认匹配「标题 + 至少三个英文句点 + 页码」。识别不准时打开「高级选项」调整偏移或查看原文。
              </p>
              <p>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  手动分段
                </span>
                ：不依赖文本层。支持每行「页码 + 标题」，或仅数字列表（逗号/空格分隔）。
              </p>
            </div>
          </details>
        </div>

        {/* Step 1 */}
        <div className="mt-8 border-t border-zinc-100 pt-8 dark:border-zinc-800/80">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              1
            </span>
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              文件与分析模式
            </span>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-800 dark:text-zinc-200">
              <input
                type="radio"
                name="chapterAnalyzeMode"
                className="accent-zinc-900 dark:accent-zinc-100"
                checked={chapterAnalyzeMode === "auto"}
                onChange={() => setChapterAnalyzeMode("auto")}
              />
              自动扫描
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-800 dark:text-zinc-200">
              <input
                type="radio"
                name="chapterAnalyzeMode"
                className="accent-zinc-900 dark:accent-zinc-100"
                checked={chapterAnalyzeMode === "toc"}
                onChange={() => setChapterAnalyzeMode("toc")}
              />
              目录页解析
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-800 dark:text-zinc-200">
              <input
                type="radio"
                name="chapterAnalyzeMode"
                className="accent-zinc-900 dark:accent-zinc-100"
                checked={chapterAnalyzeMode === "manual"}
                onChange={() => setChapterAnalyzeMode("manual")}
              />
              手动分段
            </label>
          </div>

          {chapterAnalyzeMode === "manual" && autoSplitBytes ? (
            <div className="mt-3 space-y-3">
              <textarea
                className="min-h-[132px] w-full resize-y rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 font-mono text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100"
                placeholder={"例如：1 绪论\n45 第二章\n或：1, 45, 89"}
                value={manualSegmentText}
                onChange={(e) => setManualSegmentText(e.target.value)}
                spellCheck={false}
              />
              <details className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-900/30">
                <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 [&::-webkit-details-marker]:hidden">
                  输入格式说明
                </summary>
                <div className="border-t border-zinc-200/80 px-3 py-2 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                  <p className="mb-3">
                    每行「页码 + 标题」，或仅数字列表（逗号/空格/换行）。未命名章节文件名形如
                    <code className="mx-0.5 rounded bg-zinc-200/80 px-1 font-mono dark:bg-zinc-800">
                      Chapter_n_P…_P…
                    </code>
                    。
                  </p>
                </div>
              </details>
              {chapterAnalyzeMode === "manual" &&
              !manualChapterParse.ok &&
              manualChapterParse.error ? (
                <p
                  role="alert"
                  className="text-sm text-red-600 dark:text-red-400"
                >
                  {manualChapterParse.error}
                </p>
              ) : null}
            </div>
          ) : null}

          {chapterAnalyzeMode === "toc" && autoSplitBytes ? (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    目录范围（物理页）
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      inputMode="numeric"
                      className="min-w-[5rem] flex-1 rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100"
                      value={tocFromPageInput}
                      onChange={(e) => setTocFromPageInput(e.target.value)}
                      aria-label="目录起始页"
                    />
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      —
                    </span>
                    <input
                      inputMode="numeric"
                      className="min-w-[5rem] flex-1 rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100"
                      value={tocToPageInput}
                      onChange={(e) => setTocToPageInput(e.target.value)}
                      aria-label="目录结束页"
                    />
                  </div>
                </div>
              </div>
              <details className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-900/30">
                <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 [&::-webkit-details-marker]:hidden">
                  高级选项
                </summary>
                <div className="space-y-3 border-t border-zinc-200/80 px-3 py-3 dark:border-zinc-800">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      页码偏移（Offset）
                    </label>
                    <input
                      inputMode="numeric"
                      className="w-full max-w-xs rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100"
                      value={tocOffset}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setTocOffset(Number.isFinite(n) ? Math.trunc(n) : 0);
                      }}
                      placeholder="目录与 PDF 页码不一致时填写"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      目录原文（调试）
                    </label>
                    <textarea
                      readOnly
                      className="min-h-[120px] w-full resize-y rounded-lg border border-zinc-200/90 bg-zinc-100/80 font-mono text-[11px] leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
                      value={tocExtractedRawText}
                      placeholder="分析后显示从目录页提取的原始文本"
                      spellCheck={false}
                    />
                  </div>
                </div>
              </details>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            选择 PDF
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (!f) return;
                isCancellingRef.current = false;
                setAutoSplitFile(f);
                setChapterPlan([]);
                setAutoSplitTotalPages(0);
                setRangeSelected([]);
                setChapterRecognitionAbnormal(false);
                setChapterAnalyzeMode("auto");
                setTocFromPageInput("1");
                setTocToPageInput("1");
                setTocOffset(0);
                setManualSegmentText("");
                setTocExtractedRawText("");
                setAutoSplitPhase("idle");
                setAutoSplitStatus("");
                setAutoSplitProgress(0);
                void (async () => {
                  const buf = await f.arrayBuffer();
                  setAutoSplitBytes(new Uint8Array(buf));
                })();
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            disabled={
              !autoSplitBytes ||
              autoSplitPhase === "analyzing" ||
              autoSplitPhase === "processing" ||
              chapterAnalyzeMode === "manual"
            }
            onClick={async () => {
              if (!autoSplitBytes) return;
              isCancellingRef.current = false;
              setAutoSplitPhase("analyzing");
              setChapterPlan([]);
              setRangeSelected([]);
              setChapterRecognitionAbnormal(false);
              setAutoSplitProgress(0);
              try {
                if (chapterAnalyzeMode === "toc") {
                  setAutoSplitStatus("正在读取 PDF…");
                  const pdfjs = await loadPdfJs();
                  const doc = await pdfjs
                    .getDocument({ data: cloneBytes(autoSplitBytes) })
                    .promise;
                  const numPages = doc.numPages;
                  setAutoSplitTotalPages(numPages);
                  if (isCancellingRef.current) {
                    setAutoSplitPhase("idle");
                    setAutoSplitStatus("已取消分析");
                    setAutoSplitProgress(0);
                    return;
                  }
                  const fromParsed = Number.parseInt(tocFromPageInput.trim(), 10);
                  const toParsed = Number.parseInt(tocToPageInput.trim(), 10);
                  if (
                    !Number.isFinite(fromParsed) ||
                    !Number.isFinite(toParsed)
                  ) {
                    setAutoSplitStatus(
                      "请填写有效的目录页范围（两个整数）"
                    );
                    setAutoSplitPhase("idle");
                    setAutoSplitProgress(0);
                    return;
                  }
                  const from = Math.min(fromParsed, toParsed);
                  const to = Math.max(fromParsed, toParsed);
                  const safeFrom = Math.max(1, Math.min(from, numPages));
                  const safeTo = Math.max(safeFrom, Math.min(to, numPages));
                  const text = await extractPdfTextFromPageRange(
                    autoSplitBytes,
                    safeFrom,
                    safeTo,
                    (pct, msg) => {
                      setAutoSplitProgress(pct);
                      setAutoSplitStatus(msg);
                    }
                  );
                  setTocExtractedRawText(text);
                  if (isCancellingRef.current) {
                    setAutoSplitPhase("idle");
                    setAutoSplitStatus("已取消分析");
                    setAutoSplitProgress(0);
                    return;
                  }
                  const chapters = parseTOCFromPages(text, tocOffset);
                  const recognitionAbnormal = chapters.length > 100;
                  setChapterPlan(chapters);
                  setChapterRecognitionAbnormal(recognitionAbnormal);
                  setAutoSplitProgress(100);
                  if (chapters.length === 0) {
                    setAutoSplitStatus(
                      "目录页中未匹配到「标题 …… 页码」格式（至少三个点）。请检查页范围、Offset 或 PDF 文字层。"
                    );
                    setAutoSplitPhase("idle");
                  } else {
                    setAutoSplitPhase("selecting");
                    setAutoSplitStatus("请勾选要导出的章节，然后选择导出方式。");
                  }
                  return;
                }

                const { chapters, numPages, recognitionAbnormal } =
                  await analyzePdfChapters(
                    autoSplitBytes,
                    (pct, msg) => {
                      setAutoSplitProgress(pct);
                      setAutoSplitStatus(msg);
                    },
                    () => isCancellingRef.current
                  );
                if (isCancellingRef.current) {
                  setAutoSplitPhase("idle");
                  setAutoSplitStatus("已取消分析");
                  setAutoSplitProgress(0);
                  return;
                }
                setChapterPlan(chapters);
                setAutoSplitTotalPages(numPages);
                setChapterRecognitionAbnormal(recognitionAbnormal);
                if (chapters.length === 0) {
                  setAutoSplitStatus(
                    "未找到书签或章节标题，请换一份带目录或带「第×章」字样的 PDF。"
                  );
                  setAutoSplitPhase("idle");
                } else {
                  setAutoSplitPhase("selecting");
                  setAutoSplitStatus("请勾选要导出的章节，然后选择导出方式。");
                }
              } catch (err) {
                setAutoSplitStatus(
                  err instanceof Error ? err.message : "分析失败"
                );
                setAutoSplitPhase("idle");
              }
            }}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-5 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
          >
            分析章节
          </button>
          {(autoSplitPhase === "analyzing" || autoSplitPhase === "processing") ? (
            <button
              type="button"
              onClick={() => {
                isCancellingRef.current = true;
                setAutoSplitStatus("正在停止…");
              }}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-red-300 bg-red-50 px-5 py-3 text-sm font-medium text-red-800 transition-colors hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/70"
            >
              停止
            </button>
          ) : null}
        </div>

        {autoSplitFile ? (
          <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            已选择：{autoSplitFile.name} · {bytesToKB(autoSplitFile.size)}
            {autoSplitTotalPages > 0 ? (
              <span className="ml-2">· 共 {autoSplitTotalPages} 页</span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/90 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-zinc-900 to-zinc-600 transition-[width] duration-300 dark:from-zinc-100 dark:to-zinc-400"
              style={{
                width: `${Math.min(100, Math.max(0, autoSplitProgress))}%`,
              }}
            />
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {autoSplitStatus ||
              (autoSplitPhase === "analyzing"
                ? "分析中…"
                : autoSplitPhase === "processing"
                  ? "导出中…"
                  : autoSplitPhase === "selecting"
                    ? "请选择章节并导出"
                    : "就绪")}
          </div>
        </div>
        </div>

        <div
          className={`mt-8 border-t border-zinc-100 pt-8 transition-opacity dark:border-zinc-800/80 ${
            hasAutoSplitChapterResults ? "" : "opacity-50"
          }`}
        >
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              2
            </span>
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              章节与区间
            </span>
          </div>
          {!hasAutoSplitChapterResults ? (
            <p className="rounded-xl border border-dashed border-zinc-200/90 bg-zinc-50/40 px-4 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/20 dark:text-zinc-500">
              完成分析或填写手动分段后，将显示可勾选的章节列表。
            </p>
          ) : (
            <div className="space-y-4">
              {chapterRecognitionAbnormal || manualTooManySegments ? (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-300/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100"
                >
                  <strong className="font-semibold">章节过多：</strong>
                  超过 100 段，请检查输入或取消部分勾选。
                </div>
              ) : null}
              <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/40 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  <span>章节列表</span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                      onClick={() =>
                        setRangeSelected(chapterRangesPreview.map(() => true))
                      }
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      className="text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-300"
                      onClick={() =>
                        setRangeSelected(chapterRangesPreview.map(() => false))
                      }
                    >
                      全不选
                    </button>
                  </div>
                </div>
                <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                  {chapterRangesPreview.map((r, i) => (
                    <li
                      key={`${r.from0}-${r.to0}-${i}`}
                      className="flex items-start gap-3 rounded-lg border border-zinc-200/80 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/40"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                        checked={rangeSelected[i] ?? false}
                        onChange={(e) => {
                          const next = [...rangeSelected];
                          next[i] = e.target.checked;
                          setRangeSelected(next);
                        }}
                      />
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {r.title}
                        </div>
                        <div className="mt-0.5 font-mono text-zinc-500 dark:text-zinc-400">
                          第 {r.from0 + 1} 页 — 第 {r.to0 + 1} 页 · 共{" "}
                          {r.to0 - r.from0 + 1} 页
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div
          className={`mt-8 border-t border-zinc-100 pt-8 transition-opacity dark:border-zinc-800/80 ${
            hasAutoSplitChapterResults ? "" : "opacity-50"
          }`}
        >
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              3
            </span>
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              导出与下载
            </span>
          </div>
          {!hasAutoSplitChapterResults ? (
            <p className="rounded-xl border border-dashed border-zinc-200/90 bg-zinc-50/40 px-4 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/20 dark:text-zinc-500">
              生成章节列表后，可在此选择 ZIP 或合并 PDF 并下载。
            </p>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                  导出方式
                </div>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-1 py-0.5 hover:border-zinc-200/80 dark:hover:border-zinc-700">
                  <input
                    type="radio"
                    name="exportPackageMode"
                    checked={exportPackageMode === "zip"}
                    onChange={() => setExportPackageMode("zip")}
                    className="accent-zinc-900 dark:accent-zinc-100"
                  />
                  <span>多文件 ZIP（每段一个 PDF）</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-1 py-0.5 hover:border-zinc-200/80 dark:hover:border-zinc-700">
                  <input
                    type="radio"
                    name="exportPackageMode"
                    checked={exportPackageMode === "singlePdf"}
                    onChange={() => setExportPackageMode("singlePdf")}
                    className="accent-zinc-900 dark:accent-zinc-100"
                  />
                  <span>合并为单个 PDF</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-950/80 dark:text-amber-200"
                  title="NotebookLM 提示"
                  aria-hidden
                >
                  i
                </span>
                <span>NotebookLM 等工具建议单库 ≤50 个 PDF</span>
                <details className="inline">
                  <summary className="cursor-pointer list-none text-zinc-400 underline decoration-zinc-300 underline-offset-2 [&::-webkit-details-marker]:hidden">
                    详情
                  </summary>
                  <p className="mt-2 max-w-sm rounded-lg border border-zinc-200/90 bg-zinc-50 px-3 py-2 text-left text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                    ZIP 导出时每个勾选章节生成一个文件。若超过 50
                    个，可取消部分勾选，或改用「合并为单个 PDF」整本导出后再上传。
                  </p>
                </details>
              </div>

              {manualSegmentReady ? (
                <button
                  type="button"
                  disabled={
                    !autoSplitBytes ||
                    autoSplitPhase === "analyzing" ||
                    autoSplitPhase === "processing"
                  }
                  onClick={() => {
                    void runExportChapterPicked(chapterRangesPreview);
                  }}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-emerald-600/40 bg-emerald-50/90 px-5 py-3 text-sm font-medium text-emerald-900 transition-colors hover:bg-emerald-100/90 disabled:opacity-50 dark:border-emerald-800/50 dark:bg-emerald-950/50 dark:text-emerald-100 dark:hover:bg-emerald-950/80 sm:w-auto"
                >
                  一键导出全部区间
                </button>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  disabled={
                    selectedChapterExportCount === 0 ||
                    !autoSplitBytes ||
                    autoSplitPhase === "analyzing" ||
                    autoSplitPhase === "processing" ||
                    (!manualSegmentReady && autoSplitPhase !== "selecting")
                  }
                  onClick={() => {
                    if (!autoSplitBytes || selectedChapterExportCount === 0)
                      return;
                    const picked = chapterRangesPreview.filter(
                      (_, i) => rangeSelected[i]
                    );
                    if (picked.length === 0) return;
                    void runExportChapterPicked(picked);
                  }}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-gradient-to-r from-emerald-800 to-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-50 sm:w-auto"
                >
                  {exportPackageMode === "singlePdf"
                    ? "下载合并 PDF"
                    : "下载 ZIP"}
                </button>
                {selectedChapterExportCount > 50 &&
                exportPackageMode === "zip" ? (
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">
                    已选 {selectedChapterExportCount} 个，超过 50
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const rotatePane = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-5">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          页面旋转
        </h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            选择 PDF
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setRotateFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <div className="flex items-center gap-2">
            <select
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100"
              value={rotateDeg}
              onChange={(e) => setRotateDeg(Number(e.target.value) as 90 | 180 | 270)}
            >
              <option value={90}>顺时针 90°</option>
              <option value={180}>180°</option>
              <option value={270}>270°</option>
            </select>
            <button
              type="button"
              disabled={!rotateFile}
              onClick={async () => {
                if (!rotateFile) return;
                const bytes = await rotatePdf(rotateFile, rotateDeg);
                downloadBytes(new Uint8Array(bytes), "rotated.pdf");
              }}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
            >
              旋转并下载
            </button>
          </div>
        </div>
        {rotateFile ? (
          <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            已选择：{rotateFile.name}
          </div>
        ) : null}
      </div>
    </div>
  );

  const img2pdfPane = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-5">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          图片转 A4 PDF
        </h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            选择多张图片
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).filter((f) =>
                  f.type.startsWith("image/")
                );
                setImgFiles(files);
                e.target.value = "";
              }}
            />
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              边距(mm)
            </span>
            <input
              inputMode="numeric"
              className="w-20 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100"
              value={imgMarginMm}
              onChange={(e) => setImgMarginMm(Math.max(0, Number(e.target.value) || 0))}
            />
            <button
              type="button"
              disabled={imgFiles.length === 0}
              onClick={async () => {
                const bytes = await imagesToA4Pdf(imgFiles, imgMarginMm);
                downloadBytes(new Uint8Array(bytes), "images.pdf");
              }}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
            >
              生成并下载
            </button>
          </div>
        </div>
        {imgFiles.length > 0 ? (
          <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            已选择 {imgFiles.length} 张图片
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className={`pdf-tool-page space-y-8 ${printMode ? "pdf-print-mode" : ""}`}>
      <header className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
          PDF 处理与打印排版工具箱
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          考试复习：PPT 打印神助攻（N-up 排版）+ 合并/拆分/按章节拆分/旋转/图片转
          PDF。纯前端处理。
        </p>
      </header>

      <div className="pdf-print-hidden">{headline}</div>
      <div className="pdf-print-hidden">{tabs}</div>

      {tab === "nup" ? (
        !srcFile ? (
          <div className="py-8">{dropzone}</div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-10">
            <aside className="lg:col-span-3 space-y-4 pdf-print-hidden">
              {nupSidebar}
            </aside>
            <main className="lg:col-span-7 space-y-4">{nupPreview}</main>
            {nupThumbs}
          </div>
        )
      ) : null}

      <div className="pdf-print-hidden">{tab === "merge" ? mergePane : null}</div>
      <div className="pdf-print-hidden">{tab === "split" ? splitPane : null}</div>
      <div className="pdf-print-hidden">{tab === "autoSplit" ? autoSplitPane : null}</div>
      <div className="pdf-print-hidden">{tab === "rotate" ? rotatePane : null}</div>
      <div className="pdf-print-hidden">{tab === "img2pdf" ? img2pdfPane : null}</div>
    </div>
  );
}

