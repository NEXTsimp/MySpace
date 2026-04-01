"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCodeStyling from "qr-code-styling";

type InputMode = "url" | "text" | "wifi" | "vcard";
type PresetKey = "minimal" | "blue" | "purple" | "soft";
type ColorMode = "solid" | "linear" | "radial";
type DotType =
  | "square"
  | "rounded"
  | "extra-rounded"
  | "dots"
  | "classy"
  | "classy-rounded";
type MockupType = "phone" | "card" | "poster";

const PREVIEW_QR_SIZE = 420;
const INPUT_DEBOUNCE_MS = 200;

function buildWifiString(
  ssid: string,
  password: string,
  auth: string,
  hidden: boolean
) {
  const s = ssid.replace(/([\\;,:"])/g, "\\$1");
  const p = password.replace(/([\\;,:"])/g, "\\$1");
  return `WIFI:T:${auth};S:${s};P:${p};H:${hidden ? "true" : "false"};;`;
}

function buildVCard(
  name: string,
  phone: string,
  email: string,
  org: string,
  title: string
) {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${name}`,
    org ? `ORG:${org}` : "",
    title ? `TITLE:${title}` : "",
    phone ? `TEL;TYPE=CELL:${phone}` : "",
    email ? `EMAIL:${email}` : "",
    "END:VCARD",
  ]
    .filter(Boolean)
    .join("\n");
}

function useDebounced<T>(value: T, delay = INPUT_DEBOUNCE_MS) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("读取失败"));
    r.readAsDataURL(blob);
  });
}

function safeClamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function Segmented<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ value: T; label: string }>;
}) {
  const { value, onChange, items } = props;
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onChange(it.value)}
          className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition-transform active:scale-[0.98] ${
            it.value === value
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function FieldRow(props: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-28 shrink-0 pt-2">
        <div className="text-xs font-medium text-slate-700">{props.label}</div>
        {props.hint ? <div className="mt-0.5 text-[11px] text-slate-400">{props.hint}</div> : null}
      </div>
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  );
}

export default function QrToolPage() {
  const [tab, setTab] = useState<"content" | "style" | "scene">("content");
  // content
  const [mode, setMode] = useState<InputMode>("url");
  const [urlValue, setUrlValue] = useState("https://example.com");
  const [textValue, setTextValue] = useState("Hello, My Space");
  const [wifiSsid, setWifiSsid] = useState("MyWifi");
  const [wifiPass, setWifiPass] = useState("12345678");
  const [wifiAuth, setWifiAuth] = useState("WPA");
  const [wifiHidden, setWifiHidden] = useState(false);
  const [cardName, setCardName] = useState("Your Name");
  const [cardPhone, setCardPhone] = useState("");
  const [cardEmail, setCardEmail] = useState("");
  const [cardOrg, setCardOrg] = useState("");
  const [cardTitle, setCardTitle] = useState("");

  // design
  const [preset, setPreset] = useState<PresetKey>("blue");
  const [dotsType, setDotsType] = useState<DotType>("rounded");
  const [cornerSquareType, setCornerSquareType] = useState<
    "square" | "dot" | "extra-rounded"
  >("extra-rounded");
  const [cornerDotType, setCornerDotType] = useState<"dot" | "square">("dot");
  const [colorMode, setColorMode] = useState<ColorMode>("linear");
  const [color1, setColor1] = useState("#2563eb");
  const [color2, setColor2] = useState("#7c3aed");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [animatedGlow, setAnimatedGlow] = useState(true);

  // logo
  const [logoEnabled, setLogoEnabled] = useState(true);
  const [logoSizeRatio, setLogoSizeRatio] = useState(0.2);
  const [logoMargin, setLogoMargin] = useState(10);
  const [logoDataUrl, setLogoDataUrl] = useState("");

  // background fusion (export & preview)
  const [bgImageUrl, setBgImageUrl] = useState("");
  const [qrOpacity, setQrOpacity] = useState(1);
  const [bgBlendMode, setBgBlendMode] = useState<
    "normal" | "multiply" | "soft-light" | "overlay" | "screen"
  >("multiply");

  // export
  const [exportSize, setExportSize] = useState<400 | 1000>(1000);
  const [safeExport, setSafeExport] = useState(true);
  const [safeExportKeepBg, setSafeExportKeepBg] = useState(true);

  // result / mockup
  const [mockup, setMockup] = useState<MockupType>("phone");
  const [frameText, setFrameText] = useState("Scan Me");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [copyOk, setCopyOk] = useState(false);

  const qrHostRef = useRef<HTMLDivElement | null>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);
  const lastQrUrlRef = useRef("");

  const data = useMemo(() => {
    if (mode === "url") return urlValue.trim() || "https://example.com";
    if (mode === "text") return textValue || " ";
    if (mode === "wifi") return buildWifiString(wifiSsid, wifiPass, wifiAuth, wifiHidden);
    return buildVCard(cardName, cardPhone, cardEmail, cardOrg, cardTitle);
  }, [
    mode,
    urlValue,
    textValue,
    wifiSsid,
    wifiPass,
    wifiAuth,
    wifiHidden,
    cardName,
    cardPhone,
    cardEmail,
    cardOrg,
    cardTitle,
  ]);

  const debouncedData = useDebounced(data, INPUT_DEBOUNCE_MS);

  const gradient =
    colorMode === "solid"
      ? undefined
      : {
          type: colorMode,
          rotation: colorMode === "linear" ? Math.PI / 4 : 0,
          colorStops: [
            { offset: 0, color: color1 },
            { offset: 1, color: color2 },
          ],
        };

  // Apply preset -> controlled values (predictable, minimal palette)
  useEffect(() => {
    if (preset === "minimal") {
      setDotsType("square");
      setCornerSquareType("square");
      setCornerDotType("square");
      setColorMode("solid");
      setColor1("#0f172a");
      setColor2("#0f172a");
      setBgColor("#ffffff");
      setAnimatedGlow(false);
      return;
    }
    if (preset === "blue") {
      setDotsType("rounded");
      setCornerSquareType("extra-rounded");
      setCornerDotType("dot");
      setColorMode("linear");
      setColor1("#2563eb");
      setColor2("#06b6d4");
      setBgColor("#ffffff");
      setAnimatedGlow(true);
      return;
    }
    if (preset === "purple") {
      setDotsType("extra-rounded");
      setCornerSquareType("extra-rounded");
      setCornerDotType("dot");
      setColorMode("linear");
      setColor1("#7c3aed");
      setColor2("#2563eb");
      setBgColor("#ffffff");
      setAnimatedGlow(true);
      return;
    }
    setDotsType("rounded");
    setCornerSquareType("extra-rounded");
    setCornerDotType("dot");
    setColorMode("radial");
    setColor1("#2563eb");
    setColor2("#7c3aed");
    setBgColor("#ffffff");
    setAnimatedGlow(true);
  }, [preset]);

  // init qr instance once
  useEffect(() => {
    const qr = new QRCodeStyling({
      width: PREVIEW_QR_SIZE,
      height: PREVIEW_QR_SIZE,
      type: "canvas",
      data: debouncedData,
      margin: 0,
      qrOptions: { errorCorrectionLevel: "H" },
      dotsOptions: {
        type: dotsType,
        color: color1,
        gradient,
      },
      cornersSquareOptions: { type: cornerSquareType, color: color1 },
      cornersDotOptions: { type: cornerDotType, color: color1 },
      backgroundOptions: { color: bgColor },
      image: logoEnabled ? logoDataUrl : "",
      imageOptions: {
        hideBackgroundDots: true,
        imageSize: safeClamp(logoSizeRatio, 0.12, 0.24),
        margin: Math.max(8, logoMargin),
      },
    });
    qrRef.current = qr;
    if (qrHostRef.current) qr.append(qrHostRef.current);
  }, []); // once

  // update qr + double-buffer preview image (avoid flicker)
  useEffect(() => {
    const run = async () => {
      if (!qrRef.current) return;
      setIsUpdating(true);
      try {
        qrRef.current.update({
          data: debouncedData,
          dotsOptions: {
            type: dotsType,
            color: color1,
            gradient,
          },
          cornersSquareOptions: { type: cornerSquareType, color: color1 },
          cornersDotOptions: { type: cornerDotType, color: color1 },
          backgroundOptions: { color: bgColor },
          image: logoEnabled ? logoDataUrl : "",
          imageOptions: {
            hideBackgroundDots: true,
            imageSize: safeClamp(logoSizeRatio, 0.12, 0.24),
            margin: Math.max(8, logoMargin),
          },
        });

        const blob = await qrRef.current.getRawData("png");
        if (!blob) return;
        const nextUrl = await readBlobAsDataUrl(blob as Blob);
        lastQrUrlRef.current = nextUrl;
        setQrDataUrl(nextUrl);
      } finally {
        setIsUpdating(false);
      }
    };

    const t = window.setTimeout(() => void run(), INPUT_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [
    debouncedData,
    dotsType,
    cornerSquareType,
    cornerDotType,
    colorMode,
    color1,
    color2,
    bgColor,
    logoEnabled,
    logoDataUrl,
    logoSizeRatio,
    logoMargin,
    gradient,
  ]);

  async function download(ext: "png" | "svg") {
    if (!qrRef.current) return;

    // SVG stays pure QR (vector).
    if (ext === "svg") {
      qrRef.current.update({ width: exportSize, height: exportSize, type: "svg" });
      await qrRef.current.download({ extension: "svg", name: `qr_${exportSize}` });
      qrRef.current.update({ width: PREVIEW_QR_SIZE, height: PREVIEW_QR_SIZE, type: "canvas" });
      return;
    }

    // PNG export: optionally force safer scan settings while keeping UI unchanged.
    const snapshot = {
      qrOpacity,
      bgBlendMode,
      logoSizeRatio,
      logoMargin,
    };

    const exportOpacity = safeExport ? 1 : qrOpacity;
    const exportBlend: GlobalCompositeOperation = safeExport ? "source-over" : bgBlendMode === "normal" ? "source-over" : (bgBlendMode as GlobalCompositeOperation);
    const exportLogoSize = safeExport ? Math.min(0.2, logoSizeRatio) : logoSizeRatio;
    const exportLogoMargin = safeExport ? Math.max(10, logoMargin) : logoMargin;

    qrRef.current.update({
      width: exportSize,
      height: exportSize,
      type: "canvas",
      imageOptions: {
        hideBackgroundDots: true,
        imageSize: safeClamp(exportLogoSize, 0.12, 0.24),
        margin: Math.max(8, exportLogoMargin),
      },
    });

    const qrBlob = await qrRef.current.getRawData("png");
    if (!qrBlob) {
      qrRef.current.update({ width: PREVIEW_QR_SIZE, height: PREVIEW_QR_SIZE, type: "canvas" });
      return;
    }
    const qrUrl = await readBlobAsDataUrl(qrBlob as Blob);

    const canvas = document.createElement("canvas");
    canvas.width = exportSize;
    canvas.height = exportSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // base background
    ctx.fillStyle = bgColor || "#ffffff";
    ctx.fillRect(0, 0, exportSize, exportSize);

    const drawBg = bgImageUrl && (!safeExport || safeExportKeepBg);
    if (drawBg) {
      try {
        const bgImg = new Image();
        bgImg.crossOrigin = "anonymous";
        bgImg.src = bgImageUrl;
        await new Promise<void>((resolve) => {
          bgImg.onload = () => resolve();
          bgImg.onerror = () => resolve();
        });
        ctx.globalAlpha = 0.45;
        ctx.drawImage(bgImg, 0, 0, exportSize, exportSize);
        ctx.globalAlpha = 1;
      } catch {
        // ignore
      }
    }

    const qrImg = new Image();
    qrImg.src = qrUrl;
    await new Promise<void>((resolve, reject) => {
      qrImg.onload = () => resolve();
      qrImg.onerror = () => reject(new Error("二维码导出失败"));
    });

    ctx.save();
    ctx.globalAlpha = exportOpacity;
    ctx.globalCompositeOperation = exportBlend;
    ctx.drawImage(qrImg, 0, 0, exportSize, exportSize);
    ctx.restore();

    const outUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = outUrl;
    a.download = `qr_${exportSize}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // restore preview config
    qrRef.current.update({
      width: PREVIEW_QR_SIZE,
      height: PREVIEW_QR_SIZE,
      type: "canvas",
      imageOptions: {
        hideBackgroundDots: true,
        imageSize: safeClamp(snapshot.logoSizeRatio, 0.12, 0.24),
        margin: Math.max(8, snapshot.logoMargin),
      },
    });
  }

  async function copyToClipboard() {
    if (!qrRef.current) return;
    const blob = await qrRef.current.getRawData("png");
    if (!blob) return;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob as Blob })]);
    setCopyOk(true);
    window.setTimeout(() => setCopyOk(false), 1200);
  }

  const emptyHint = debouncedData.trim().length === 0;

  return (
    <div className="bg-[#f8fafc]">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6">
        <header className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">二维码生成器</h1>
          <p className="mt-1 text-sm text-slate-600">
            工业级布局：固定两栏、无嵌套滚动、稳定预览、导出可靠。
          </p>
        </header>

        <div className="grid grid-cols-[400px_1fr] gap-6 items-start">
          {/* Sidebar */}
          <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">Controls</div>
              <Segmented
                value={tab}
                onChange={setTab}
                items={[
                  { value: "content", label: "内容" },
                  { value: "style", label: "样式" },
                  { value: "scene", label: "场景" },
                ]}
              />
            </div>

            <div className="mt-4 space-y-4">
              {tab === "content" ? (
                <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-900">Content</div>
                  <div className="mt-3">
                    <FieldRow label="类型">
                      <Segmented
                        value={mode}
                        onChange={setMode}
                        items={[
                          { value: "url", label: "URL" },
                          { value: "text", label: "Text" },
                          { value: "wifi", label: "Wi‑Fi" },
                          { value: "vcard", label: "vCard" },
                        ]}
                      />
                    </FieldRow>
                    <div className="mt-3 space-y-3">
                      {mode === "url" ? (
                        <FieldRow label="URL">
                          <input
                            value={urlValue}
                            onChange={(e) => setUrlValue(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                            placeholder="https://..."
                          />
                        </FieldRow>
                      ) : null}
                      {mode === "text" ? (
                        <FieldRow label="Text">
                          <textarea
                            value={textValue}
                            onChange={(e) => setTextValue(e.target.value)}
                            rows={4}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                          />
                        </FieldRow>
                      ) : null}
                      {mode === "wifi" ? (
                        <div className="space-y-3">
                          <FieldRow label="SSID">
                            <input
                              value={wifiSsid}
                              onChange={(e) => setWifiSsid(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                            />
                          </FieldRow>
                          <FieldRow label="Password">
                            <input
                              value={wifiPass}
                              onChange={(e) => setWifiPass(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                            />
                          </FieldRow>
                          <FieldRow label="Auth">
                            <div className="flex items-center gap-3">
                              <select
                                value={wifiAuth}
                                onChange={(e) => setWifiAuth(e.target.value)}
                                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              >
                                <option value="WPA">WPA/WPA2</option>
                                <option value="WEP">WEP</option>
                                <option value="nopass">No pass</option>
                              </select>
                              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={wifiHidden}
                                  onChange={(e) => setWifiHidden(e.target.checked)}
                                />
                                Hidden
                              </label>
                            </div>
                          </FieldRow>
                        </div>
                      ) : null}
                      {mode === "vcard" ? (
                        <div className="space-y-3">
                          <FieldRow label="Name">
                            <input
                              value={cardName}
                              onChange={(e) => setCardName(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </FieldRow>
                          <FieldRow label="Phone">
                            <input
                              value={cardPhone}
                              onChange={(e) => setCardPhone(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </FieldRow>
                          <FieldRow label="Email">
                            <input
                              value={cardEmail}
                              onChange={(e) => setCardEmail(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </FieldRow>
                          <FieldRow label="Org">
                            <input
                              value={cardOrg}
                              onChange={(e) => setCardOrg(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </FieldRow>
                          <FieldRow label="Title">
                            <input
                              value={cardTitle}
                              onChange={(e) => setCardTitle(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </FieldRow>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}

              {tab === "style" ? (
                <div className="space-y-4">
                  <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
                    <div className="text-sm font-semibold text-slate-900">Preset</div>
                    <div className="mt-3">
                      <FieldRow label="模板">
                        <Segmented
                          value={preset}
                          onChange={setPreset}
                          items={[
                            { value: "minimal", label: "Minimal" },
                            { value: "blue", label: "Blue" },
                            { value: "purple", label: "Purple" },
                            { value: "soft", label: "Soft" },
                          ]}
                        />
                      </FieldRow>
                    </div>
                  </section>

                  <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
                    <div className="text-sm font-semibold text-slate-900">Style</div>
                    <div className="mt-3 space-y-3">
                      <FieldRow label="Dots">
                        <select
                          value={dotsType}
                          onChange={(e) => setDotsType(e.target.value as DotType)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <option value="square">Square</option>
                          <option value="rounded">Rounded</option>
                          <option value="extra-rounded">Extra Rounded</option>
                          <option value="dots">Dots</option>
                          <option value="classy">Classy</option>
                          <option value="classy-rounded">Classy Rounded</option>
                        </select>
                      </FieldRow>
                      <FieldRow label="Corners">
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={cornerSquareType}
                            onChange={(e) =>
                              setCornerSquareType(e.target.value as typeof cornerSquareType)
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="square">Outer Square</option>
                            <option value="dot">Outer Dot</option>
                            <option value="extra-rounded">Outer Rounded</option>
                          </select>
                          <select
                            value={cornerDotType}
                            onChange={(e) => setCornerDotType(e.target.value as typeof cornerDotType)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="dot">Inner Dot</option>
                            <option value="square">Inner Square</option>
                          </select>
                        </div>
                      </FieldRow>
                      <FieldRow label="Colors">
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={colorMode}
                            onChange={(e) => setColorMode(e.target.value as ColorMode)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="solid">Solid</option>
                            <option value="linear">Linear</option>
                            <option value="radial">Radial</option>
                          </select>
                          <input
                            type="color"
                            value={color1}
                            onChange={(e) => setColor1(e.target.value)}
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white"
                          />
                          <input
                            type="color"
                            value={color2}
                            onChange={(e) => setColor2(e.target.value)}
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white"
                          />
                        </div>
                      </FieldRow>
                      <FieldRow label="Background">
                        <input
                          type="color"
                          value={bgColor}
                          onChange={(e) => setBgColor(e.target.value)}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white"
                        />
                      </FieldRow>
                      <FieldRow label="Glow">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={animatedGlow}
                            onChange={(e) => setAnimatedGlow(e.target.checked)}
                          />
                          Preview only
                        </label>
                      </FieldRow>
                    </div>
                  </section>

                  <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
                    <div className="text-sm font-semibold text-slate-900">Logo</div>
                    <div className="mt-3 space-y-3">
                      <FieldRow label="Enable">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={logoEnabled}
                            onChange={(e) => setLogoEnabled(e.target.checked)}
                          />
                          Use Logo
                        </label>
                      </FieldRow>
                      <FieldRow label="Upload">
                        <label className="inline-flex min-h-[40px] cursor-pointer items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-transform active:scale-[0.98]">
                          Upload
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const url = URL.createObjectURL(f);
                              setLogoDataUrl(url);
                            }}
                          />
                        </label>
                      </FieldRow>
                      <FieldRow label="Size" hint={`${Math.round(logoSizeRatio * 100)}%`}>
                        <input
                          type="range"
                          min={0.12}
                          max={0.24}
                          step={0.01}
                          value={logoSizeRatio}
                          onChange={(e) => setLogoSizeRatio(Number(e.target.value))}
                          className="w-full"
                        />
                      </FieldRow>
                      <FieldRow label="Margin" hint={`${logoMargin}px`}>
                        <input
                          type="range"
                          min={0}
                          max={24}
                          step={1}
                          value={logoMargin}
                          onChange={(e) => setLogoMargin(Number(e.target.value))}
                          className="w-full"
                        />
                      </FieldRow>
                    </div>
                  </section>
                </div>
              ) : null}

              {tab === "scene" ? (
                <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-900">Scene</div>
                  <div className="mt-3 space-y-3">
                    <FieldRow label="Mockup">
                      <Segmented
                        value={mockup}
                        onChange={setMockup}
                        items={[
                          { value: "phone", label: "Phone" },
                          { value: "card", label: "Card" },
                          { value: "poster", label: "Poster" },
                        ]}
                      />
                    </FieldRow>
                    <FieldRow label="Frame text">
                      <input
                        value={frameText}
                        onChange={(e) => setFrameText(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </FieldRow>
                    <FieldRow label="Background">
                      <label className="inline-flex min-h-[40px] cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-transform active:scale-[0.98]">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            setBgImageUrl(URL.createObjectURL(f));
                          }}
                        />
                      </label>
                    </FieldRow>
                    <FieldRow label="Blend">
                      <select
                        value={bgBlendMode}
                        onChange={(e) => setBgBlendMode(e.target.value as any)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="multiply">Multiply</option>
                        <option value="soft-light">Soft Light</option>
                        <option value="normal">Normal</option>
                        <option value="overlay">Overlay</option>
                        <option value="screen">Screen</option>
                      </select>
                    </FieldRow>
                    <FieldRow label="Opacity" hint={`${Math.round(qrOpacity * 100)}%`}>
                      <input
                        type="range"
                        min={0.35}
                        max={1}
                        step={0.01}
                        value={qrOpacity}
                        onChange={(e) => setQrOpacity(Number(e.target.value))}
                        className="w-full"
                      />
                    </FieldRow>
                  </div>
                </section>
              ) : null}
            </div>
          </aside>

          {/* Main */}
          <main className="rounded-2xl border border-slate-200 bg-[#f3f4f6] p-6">
            <div className="mx-auto w-full max-w-[860px]">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">Result</div>
                <div className="flex items-center gap-2">
                  <select
                    value={exportSize}
                    onChange={(e) => setExportSize(Number(e.target.value) as 400 | 1000)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  >
                    <option value={400}>400</option>
                    <option value={1000}>1000</option>
                  </select>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={safeExport}
                      onChange={(e) => setSafeExport(e.target.checked)}
                    />
                    Safe export
                  </label>
                  {safeExport ? (
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={safeExportKeepBg}
                        onChange={(e) => setSafeExportKeepBg(e.target.checked)}
                      />
                      Keep BG
                    </label>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void download("png")}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-transform active:scale-[0.98]"
                  >
                    PNG
                  </button>
                  <button
                    type="button"
                    onClick={() => void download("svg")}
                    className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-transform active:scale-[0.98]"
                  >
                    SVG
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard()}
                    className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-transform active:scale-[0.98]"
                  >
                    {copyOk ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Fixed-size preview card (no nested scroll, no layout shift) */}
              <div className={`mt-5 relative rounded-2xl bg-white shadow-lg ${animatedGlow ? "qr-glow" : ""}`}>
                <div className="p-6">
                  <div className="mx-auto aspect-[210/297] w-full max-w-[620px] min-h-[740px] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)] rounded-md overflow-hidden">
                    <div className="relative h-full w-full">
                      {bgImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={bgImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
                      ) : null}
                      <div className="absolute inset-0 p-10 flex flex-col">
                        <div className="text-sm font-semibold text-slate-900">{frameText}</div>
                        <div className="mt-6 flex-1 flex items-center justify-center">
                          <div
                            className="rounded-2xl bg-white/95 p-4 shadow-sm transition-opacity duration-200"
                            style={{
                              opacity: isUpdating ? 0.5 : (safeExport ? 1 : qrOpacity),
                              mixBlendMode: safeExport ? "normal" : (bgBlendMode as any),
                            }}
                          >
                            {emptyHint ? (
                              <div className="h-[360px] w-[360px] grid place-items-center text-sm text-slate-400">
                                输入内容后会显示二维码
                              </div>
                            ) : qrDataUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={qrDataUrl} alt="QR" className="h-[360px] w-[360px] object-contain" />
                            ) : (
                              <div className="h-[360px] w-[360px]" />
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">Local only</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* hidden live canvas host */}
                <div className="pointer-events-none absolute -left-[9999px] -top-[9999px]">
                  <div ref={qrHostRef} />
                </div>
              </div>

              {/* Bottom compact mockup switch */}
              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs font-medium text-slate-600">Mockup</div>
                <Segmented
                  value={mockup}
                  onChange={setMockup}
                  items={[
                    { value: "phone", label: "Phone" },
                    { value: "card", label: "Card" },
                    { value: "poster", label: "Poster" },
                  ]}
                />
              </div>
            </div>
          </main>
        </div>

        <style jsx>{`
          .qr-glow::before {
            content: "";
            position: absolute;
            inset: -20%;
            background: conic-gradient(
              from 180deg,
              rgba(37, 99, 235, 0.16),
              rgba(124, 58, 237, 0.14),
              rgba(6, 182, 212, 0.12),
              rgba(37, 99, 235, 0.16)
            );
            filter: blur(50px);
            animation: spin 10s linear infinite;
            pointer-events: none;
          }
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    </div>
  );
}

