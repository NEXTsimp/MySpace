"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import JSZip from "jszip";

type OutputFormat = "keep" | "image/webp" | "image/jpeg" | "image/png" | "image/avif";
type WatermarkPos =
  | "tl"
  | "tc"
  | "tr"
  | "cl"
  | "cc"
  | "cr"
  | "bl"
  | "bc"
  | "br";

type ResizeMode = "none" | "percent" | "custom";

type JobStatus = "pending" | "processing" | "done" | "error";

type ImageJob = {
  id: string;
  file: File;
  originalUrl: string;
  processedUrl?: string;
  processedBlob?: Blob;
  outName?: string;
  status: JobStatus;
  error?: string;
  beforeBytes: number;
  afterBytes?: number;
};

function bytesToKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(bytes < 1024 * 1024 ? 1 : 0)} KB`;
}

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/avif") return "avif";
  return "img";
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function makeId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
  // createImageBitmap 更快也更省内存
  if ("createImageBitmap" in window) {
    return await createImageBitmap(file);
  }

  // fallback：HTMLImageElement
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("图片加载失败"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 初始化失败");
    ctx.drawImage(img, 0, 0);
    const bitmap = await createImageBitmap(canvas);
    return bitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function calcTargetSize(
  srcW: number,
  srcH: number,
  mode: ResizeMode,
  percent: number,
  customW: number,
  customH: number,
  keepAspect: boolean
): { w: number; h: number } {
  if (mode === "none") return { w: srcW, h: srcH };
  if (mode === "percent") {
    const p = Math.max(1, Math.min(100, percent)) / 100;
    return { w: Math.max(1, Math.round(srcW * p)), h: Math.max(1, Math.round(srcH * p)) };
  }

  // custom
  const w = Math.max(1, Math.round(customW || srcW));
  const h = Math.max(1, Math.round(customH || srcH));
  if (!keepAspect) return { w, h };

  const srcRatio = srcW / srcH;
  if (w && !customH) return { w, h: Math.max(1, Math.round(w / srcRatio)) };
  if (h && !customW) return { w: Math.max(1, Math.round(h * srcRatio)), h };

  // 两个都填了：按较小缩放比例
  const scale = Math.min(w / srcW, h / srcH);
  return {
    w: Math.max(1, Math.round(srcW * scale)),
    h: Math.max(1, Math.round(srcH * scale)),
  };
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  text: string,
  pos: WatermarkPos,
  opacity: number,
  canvasW: number,
  canvasH: number
) {
  const t = text.trim();
  if (!t) return;
  const o = Math.max(0, Math.min(1, opacity));

  const padding = Math.max(10, Math.round(Math.min(canvasW, canvasH) * 0.02));
  const fontSize = Math.max(12, Math.round(Math.min(canvasW, canvasH) * 0.035));
  ctx.save();
  ctx.globalAlpha = o;
  ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
  ctx.textBaseline = "top";

  const metrics = ctx.measureText(t);
  const textW = Math.ceil(metrics.width);
  const textH = Math.ceil(fontSize * 1.2);

  let x = padding;
  let y = padding;

  const horiz = pos[1];
  const vert = pos[0];

  if (horiz === "c") x = Math.round((canvasW - textW) / 2);
  if (horiz === "r") x = canvasW - textW - padding;
  if (vert === "c") y = Math.round((canvasH - textH) / 2);
  if (vert === "b") y = canvasH - textH - padding;

  // 背景轻描边，保证对比
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  const bgPad = Math.round(fontSize * 0.35);
  ctx.fillRect(x - bgPad, y - bgPad, textW + bgPad * 2, textH + bgPad * 2);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(t, x, y);
  ctx.restore();
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number
): Promise<Blob> {
  const q = Math.max(0.1, Math.min(1, quality));
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), mime, q)
  );
  if (!blob) {
    // fallback：webp
    const fallback = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", q)
    );
    if (!fallback) throw new Error("导出失败：浏览器不支持该格式");
    return fallback;
  }
  return blob;
}

export default function ImageToolPage() {
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [autoProcess, setAutoProcess] = useState(true);

  // options
  const [format, setFormat] = useState<OutputFormat>("image/webp");
  const [quality, setQuality] = useState(0.82);
  const [targetKB, setTargetKB] = useState<number | "">("");

  const [resizeMode, setResizeMode] = useState<ResizeMode>("none");
  const [resizePercent, setResizePercent] = useState(80);
  const [customW, setCustomW] = useState<number | "">("");
  const [customH, setCustomH] = useState<number | "">("");
  const [keepAspect, setKeepAspect] = useState(true);

  const [wmText, setWmText] = useState("");
  const [wmPos, setWmPos] = useState<WatermarkPos>("br");
  const [wmOpacity, setWmOpacity] = useState(0.35);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const totalBefore = useMemo(
    () => jobs.reduce((sum, j) => sum + (j.beforeBytes || 0), 0),
    [jobs]
  );
  const totalAfter = useMemo(
    () => jobs.reduce((sum, j) => sum + (j.afterBytes || 0), 0),
    [jobs]
  );

  function cleanupUrls(list: ImageJob[]) {
    for (const j of list) {
      if (j.originalUrl) URL.revokeObjectURL(j.originalUrl);
      if (j.processedUrl) URL.revokeObjectURL(j.processedUrl);
    }
  }

  useEffect(() => {
    return () => cleanupUrls(jobs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;

    const next: ImageJob[] = arr.map((file) => ({
      id: makeId(),
      file,
      originalUrl: URL.createObjectURL(file),
      status: "pending",
      beforeBytes: file.size,
    }));

    setJobs((prev) => [...next, ...prev]);

    if (autoProcess) {
      // 稍微让 UI 先渲染出来
      setTimeout(() => {
        next.forEach((j) => void processOne(j.id));
      }, 0);
    }
  }

  async function processOne(id: string) {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: "processing", error: undefined } : j))
    );

    const job = jobs.find((j) => j.id === id);
    if (!job) return;

    try {
      const bitmap = await fileToImageBitmap(job.file);
      const srcW = bitmap.width;
      const srcH = bitmap.height;

      const target = calcTargetSize(
        srcW,
        srcH,
        resizeMode,
        resizePercent,
        typeof customW === "number" ? customW : 0,
        typeof customH === "number" ? customH : 0,
        keepAspect
      );

      const canvas = document.createElement("canvas");
      canvas.width = target.w;
      canvas.height = target.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 初始化失败");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, target.w, target.h);

      // watermark (optional)
      drawWatermark(ctx, wmText, wmPos, wmOpacity, target.w, target.h);

      const desiredMime = format === "keep" ? job.file.type : format;
      const blob1 = await canvasToBlob(canvas, desiredMime || "image/webp", quality);
      const mime1 = blob1.type || desiredMime || "image/webp";

      // compression via browser-image-compression (target size)
      let outBlob: Blob = blob1;
      const wantTarget = typeof targetKB === "number" && targetKB > 0;
      if (wantTarget) {
        const maxSizeMB = targetKB / 1024;
        const tmpFile = new File([blob1], `${baseName(job.file.name)}.${extFromMime(mime1)}`, {
          type: mime1,
        });
        const compressed = await imageCompression(tmpFile, {
          maxSizeMB,
          useWebWorker: true,
          initialQuality: Math.max(0.1, Math.min(1, quality)),
        });
        outBlob = compressed;
      }

      const outMime = outBlob.type || mime1;
      const outExt = extFromMime(outMime);
      const outName = `${baseName(job.file.name)}.${outExt}`;

      const processedUrl = URL.createObjectURL(outBlob);

      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== id) return j;
          if (j.processedUrl) URL.revokeObjectURL(j.processedUrl);
          return {
            ...j,
            status: "done",
            processedBlob: outBlob,
            processedUrl,
            outName,
            afterBytes: outBlob.size,
          };
        })
      );
    } catch (e) {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id
            ? {
                ...j,
                status: "error",
                error: e instanceof Error ? e.message : "处理失败",
              }
            : j
        )
      );
    }
  }

  async function processAll() {
    const pending = jobs.filter((j) => j.status === "pending" || j.status === "error");
    for (const j of pending) {
      // eslint-disable-next-line no-await-in-loop
      await processOne(j.id);
    }
  }

  function removeJob(id: string) {
    setJobs((prev) => {
      const target = prev.find((j) => j.id === id);
      if (target) {
        URL.revokeObjectURL(target.originalUrl);
        if (target.processedUrl) URL.revokeObjectURL(target.processedUrl);
      }
      return prev.filter((j) => j.id !== id);
    });
  }

  function clearAll() {
    setJobs((prev) => {
      cleanupUrls(prev);
      return [];
    });
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadZip() {
    const done = jobs.filter((j) => j.status === "done" && j.processedBlob && j.outName);
    if (done.length === 0) return;

    const zip = new JSZip();
    for (const j of done) {
      zip.file(j.outName!, j.processedBlob!);
    }

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    downloadBlob(blob, `images_${new Date().toISOString().slice(0, 10)}.zip`);
  }

  // paste support
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of items) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f && f.type.startsWith("image/")) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoProcess, format, quality, targetKB, resizeMode, resizePercent, customW, customH, keepAspect, wmText, wmPos, wmOpacity]);

  const note = (
    <div className="text-xs text-zinc-500 dark:text-zinc-400">
      <div>隐私第一：所有处理仅在浏览器本地完成，不会上传任何图片。</div>
      <div className="mt-1">
        默认会通过重新编码（Canvas/压缩）来去除 EXIF 元数据（GPS/设备信息等）。
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
          图片处理工具箱
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          批量转 WebP / 压缩 / 缩放 / 水印 / 打包下载。纯前端处理，安全不出网。
        </p>
        {note}
      </header>

      {/* Dropzone */}
      <section>
        <div
          className={`rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-colors ${
            dragActive
              ? "border-zinc-400 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/40"
              : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/20"
          }`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
          }}
        >
          <div className="mx-auto max-w-xl space-y-3">
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              拖拽图片到这里
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              支持 JPG / PNG / WebP / AVIF。也支持直接粘贴（Ctrl+V）。
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                选择图片
              </button>
              <button
                type="button"
                onClick={() => void processAll()}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-5 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                disabled={jobs.length === 0}
              >
                开始处理
              </button>
              <label className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                  checked={autoProcess}
                  onChange={(e) => setAutoProcess(e.target.checked)}
                />
                自动处理
              </label>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      {/* Options */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            转换与压缩
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <div className="text-zinc-600 dark:text-zinc-400">输出格式</div>
              <select
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-zinc-900 dark:text-zinc-100"
                value={format}
                onChange={(e) => setFormat(e.target.value as OutputFormat)}
              >
                <option value="image/webp">WebP（推荐）</option>
                <option value="image/jpeg">JPG</option>
                <option value="image/png">PNG</option>
                <option value="image/avif">AVIF（浏览器支持因人而异）</option>
                <option value="keep">保持原格式</option>
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <div className="text-zinc-600 dark:text-zinc-400">
                目标体积（KB，可选）
              </div>
              <input
                inputMode="numeric"
                placeholder="例如 200"
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-zinc-900 dark:text-zinc-100"
                value={targetKB}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (v === "") setTargetKB("");
                  else setTargetKB(Math.max(1, Math.round(Number(v) || 0)));
                }}
              />
            </label>

            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">压缩质量</span>
                <span className="font-mono text-zinc-900 dark:text-zinc-100">
                  {quality.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.01}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                说明：JPG/WebP/AVIF 会受质量影响；PNG 主要依赖目标体积压缩。
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            缩放与水印
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <div className="text-zinc-600 dark:text-zinc-400">缩放模式</div>
              <select
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-zinc-900 dark:text-zinc-100"
                value={resizeMode}
                onChange={(e) => setResizeMode(e.target.value as ResizeMode)}
              >
                <option value="none">不缩放</option>
                <option value="percent">按比例缩放</option>
                <option value="custom">自定义尺寸</option>
              </select>
            </label>

            {resizeMode === "percent" ? (
              <label className="space-y-2 text-sm">
                <div className="text-zinc-600 dark:text-zinc-400">
                  缩放比例（%）
                </div>
                <input
                  inputMode="numeric"
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-zinc-900 dark:text-zinc-100"
                  value={resizePercent}
                  onChange={(e) => setResizePercent(Number(e.target.value) || 80)}
                />
              </label>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="text-zinc-600 dark:text-zinc-400">
                  自定义尺寸（px）
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    inputMode="numeric"
                    placeholder="宽"
                    disabled={resizeMode !== "custom"}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-zinc-900 dark:text-zinc-100 disabled:opacity-60"
                    value={customW}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setCustomW(v === "" ? "" : Math.max(1, Math.round(Number(v) || 0)));
                    }}
                  />
                  <input
                    inputMode="numeric"
                    placeholder="高"
                    disabled={resizeMode !== "custom"}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-zinc-900 dark:text-zinc-100 disabled:opacity-60"
                    value={customH}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setCustomH(v === "" ? "" : Math.max(1, Math.round(Number(v) || 0)));
                    }}
                  />
                </div>
              </div>
            )}

            <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={keepAspect}
                onChange={(e) => setKeepAspect(e.target.checked)}
                className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
              />
              保持比例
            </label>

            <label className="space-y-2 text-sm sm:col-span-2">
              <div className="text-zinc-600 dark:text-zinc-400">文字水印</div>
              <input
                placeholder="例如：My Space"
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-zinc-900 dark:text-zinc-100"
                value={wmText}
                onChange={(e) => setWmText(e.target.value)}
              />
            </label>

            <label className="space-y-2 text-sm">
              <div className="text-zinc-600 dark:text-zinc-400">水印位置</div>
              <select
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-zinc-900 dark:text-zinc-100"
                value={wmPos}
                onChange={(e) => setWmPos(e.target.value as WatermarkPos)}
              >
                <option value="tl">左上</option>
                <option value="tc">上中</option>
                <option value="tr">右上</option>
                <option value="cl">左中</option>
                <option value="cc">居中</option>
                <option value="cr">右中</option>
                <option value="bl">左下</option>
                <option value="bc">下中</option>
                <option value="br">右下</option>
              </select>
            </label>

            <div className="space-y-2 sm:col-span-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">透明度</span>
                <span className="font-mono text-zinc-900 dark:text-zinc-100">
                  {wmOpacity.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={wmOpacity}
                onChange={(e) => setWmOpacity(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Summary + Actions */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          {jobs.length === 0 ? (
            "还没有添加图片。"
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                共 <span className="font-semibold text-zinc-900 dark:text-zinc-100">{jobs.length}</span> 张
              </span>
              <span>原始：{bytesToKB(totalBefore)}</span>
              <span>处理后：{totalAfter > 0 ? bytesToKB(totalAfter) : "—"}</span>
              {totalAfter > 0 && totalBefore > 0 ? (
                <span>
                  压缩率：{`${Math.max(0, (1 - totalAfter / totalBefore) * 100).toFixed(1)}%`}
                </span>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void downloadZip()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-50"
            disabled={jobs.every((j) => j.status !== "done")}
          >
            打包下载 ZIP
          </button>
          <button
            type="button"
            onClick={() => clearAll()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 px-5 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
            disabled={jobs.length === 0}
          >
            清空
          </button>
        </div>
      </section>

      {/* Grid */}
      <section>
        {jobs.length === 0 ? null : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((j) => {
              const ratio =
                j.afterBytes && j.beforeBytes
                  ? (j.afterBytes / j.beforeBytes) * 100
                  : undefined;

              return (
                <li
                  key={j.id}
                  className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50"
                >
                  <div className="relative aspect-video bg-zinc-100 dark:bg-zinc-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={j.processedUrl ?? j.originalUrl}
                      alt=""
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                    <div className="absolute left-3 top-3 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          j.status === "processing"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : j.status === "done"
                              ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                              : j.status === "error"
                                ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200"
                                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                        }`}
                      >
                        {j.status === "processing"
                          ? "处理中"
                          : j.status === "done"
                            ? "完成"
                            : j.status === "error"
                              ? "失败"
                              : "待处理"}
                      </span>
                    </div>
                    <div className="absolute right-3 top-3 flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-white/80 px-3 py-2 text-xs font-medium text-zinc-700 backdrop-blur-sm hover:bg-white dark:bg-zinc-950/60 dark:text-zinc-200 dark:hover:bg-zinc-950"
                        onClick={() => void processOne(j.id)}
                      >
                        处理
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-white/80 px-3 py-2 text-xs font-medium text-zinc-700 backdrop-blur-sm hover:bg-white dark:bg-zinc-950/60 dark:text-zinc-200 dark:hover:bg-zinc-950"
                        onClick={() => removeJob(j.id)}
                      >
                        移除
                      </button>
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {j.file.name}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        原始：{bytesToKB(j.beforeBytes)}
                        {typeof j.afterBytes === "number" ? (
                          <>
                            {" "}
                            → 处理后：{bytesToKB(j.afterBytes)}
                            {typeof ratio === "number" ? (
                              <span className="ml-2">
                                ({(100 - ratio).toFixed(1)}%)
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>

                    {j.error ? (
                      <div className="text-xs text-red-600 dark:text-red-300">
                        {j.error}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {j.processedBlob && j.outName ? (
                        <button
                          type="button"
                          className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                          onClick={() => downloadBlob(j.processedBlob!, j.outName!)}
                        >
                          下载
                        </button>
                      ) : null}
                      <a
                        href={j.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      >
                        原图
                      </a>
                      {j.processedUrl ? (
                        <a
                          href={j.processedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/30 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                        >
                          处理后
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

