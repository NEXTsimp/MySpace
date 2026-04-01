"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type Tab = "nup" | "merge" | "split" | "rotate" | "img2pdf";

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
          考试复习：PPT 打印神助攻（N-up 排版）+ 合并/拆分/旋转/图片转 PDF。纯前端处理。
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
      <div className="pdf-print-hidden">{tab === "rotate" ? rotatePane : null}</div>
      <div className="pdf-print-hidden">{tab === "img2pdf" ? img2pdfPane : null}</div>
    </div>
  );
}

