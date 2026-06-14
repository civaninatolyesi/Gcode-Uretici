/**
 * App — CNC Etiket Makinesi (Label Maker).
 *
 * Type text -> opentype.js outlines -> worker (Nearest Neighbor + G-code).
 * The occupied physical size is shown live and checked against the table
 * limits; if it overflows, a warning is shown and the download is disabled so
 * the machine never tries to move outside its boundaries.
 */

import { useCallback } from "react";
import { AdvancedPanel } from "./components/AdvancedPanel";
import { ConfigPanel } from "./components/ConfigPanel";
import { Dropzone } from "./components/Dropzone";
import { GCodeVisualizer } from "./components/GCodeVisualizer";
import { GCodeEditor } from "./components/GCodeEditor";
import { TextInputPanel } from "./components/TextInputPanel";
import { checkWithinLimits, useMachineStore } from "./store";
import type { SourceMode } from "./store";
import { useGcodeGenerator } from "./useGcodeGenerator";

/** Tab switch between the primary (text) and secondary (SVG) sources. */
function ModeSwitch() {
  const mode = useMachineStore((s) => s.mode);
  const setMode = useMachineStore((s) => s.setMode);

  const tabs: { id: SourceMode; label: string }[] = [
    { id: "text", label: "Etiket (Metin)" },
    { id: "svg", label: "SVG Dosyası" },
  ];

  return (
    <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setMode(t.id)}
          className={[
            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition",
            mode === t.id
              ? "bg-blue-600 text-white"
              : "text-slate-300 hover:bg-slate-700",
          ].join(" ")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function StatusBadge() {
  const status = useMachineStore((s) => s.status);
  const error = useMachineStore((s) => s.error);

  const map: Record<string, { label: string; cls: string }> = {
    idle: { label: "Hazır", cls: "bg-slate-700 text-slate-200" },
    parsing: { label: "Geometri işleniyor…", cls: "bg-amber-600 text-white" },
    generating: { label: "G-code üretiliyor…", cls: "bg-amber-600 text-white" },
    ready: { label: "Tamamlandı", cls: "bg-green-600 text-white" },
    error: { label: "Hata", cls: "bg-red-600 text-white" },
    stale: { label: "Güncel değil", cls: "bg-amber-600 text-white" },
  };
  const s = map[status] ?? map.idle;

  return (
    <div className="flex flex-col gap-1">
      <span
        className={`inline-block w-fit rounded-full px-3 py-1 text-xs font-medium ${s.cls}`}
      >
        {s.label}
      </span>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

/** A single axis dimension with a fill bar showing how full the table is. */
function AxisGauge({
  label,
  value,
  max,
  pct,
  exceeds,
}: {
  label: string;
  value: number;
  max: number;
  pct: number;
  exceeds: boolean;
}) {
  const barPct = Math.min(100, pct);
  const barColor = exceeds
    ? "bg-red-500"
    : pct > 90
      ? "bg-amber-400"
      : "bg-sky-500";

  return (
    <div
      className={[
        "rounded-lg p-3",
        exceeds ? "bg-red-950/60 ring-1 ring-red-600" : "bg-slate-800",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-semibold text-slate-100">
          {value.toFixed(1)}
        </span>
        <span className="text-[11px] text-slate-400">/ {max} mm</span>
      </div>
      <div className="mt-1 mb-1.5 text-[11px] text-slate-400">{label}</div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="mt-1 text-right text-[10px] text-slate-500">
        %{pct.toFixed(0)} dolu
      </div>
    </div>
  );
}

/** Live physical dimensions + table-limit safety check. */
function DimensionPanel() {
  const stats = useMachineStore((s) => s.stats);
  const maxX = useMachineStore((s) => s.maxX);
  const maxY = useMachineStore((s) => s.maxY);

  if (!stats) {
    return (
      <p className="text-xs text-slate-500">
        Boyut bilgisi için “G-Code Üret”e basın.
      </p>
    );
  }

  const { width, height } = stats.bbox;
  const check = checkWithinLimits(stats, { maxX, maxY });
  const fits = check?.ok ?? true;
  const pctX = maxX > 0 ? (width / maxX) * 100 : 0;
  const pctY = maxY > 0 ? (height / maxY) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <AxisGauge
          label="Genişlik (X)"
          value={width}
          max={maxX}
          pct={pctX}
          exceeds={!!check?.exceedsX}
        />
        <AxisGauge
          label="Yükseklik (Y)"
          value={height}
          max={maxY}
          pct={pctY}
          exceeds={!!check?.exceedsY}
        />
      </div>

      {fits && (
        <p className="text-center text-xs text-green-400">
          ✓ Çizim tablaya sığıyor. Tablanın sol-alt köşesinden başlar.
        </p>
      )}

      {!fits && (
        <div className="rounded-lg border border-red-600 bg-red-950/50 p-3 text-sm text-red-200">
          <strong className="block">⚠️ Tabla sınırları aşıldı!</strong>
          <span className="text-xs">
            {check?.exceedsX && (
              <>
                Genişlik {width.toFixed(1)} mm &gt; {maxX} mm.{" "}
              </>
            )}
            {check?.exceedsY && (
              <>
                Yükseklik {height.toFixed(1)} mm &gt; {maxY} mm.{" "}
              </>
            )}
            Yazı boyutunu küçültün veya tabla sınırlarını artırın. İndirme devre
            dışı bırakıldı.
          </span>
        </div>
      )}
    </div>
  );
}

function StatsRow() {
  const stats = useMachineStore((s) => s.stats);
  if (!stats) return null;
  return (
    <div className="grid grid-cols-3 gap-3 text-center">
      <div className="rounded-lg bg-slate-800 p-3">
        <div className="text-lg font-semibold text-slate-100">
          {stats.pathCount}
        </div>
        <div className="text-[11px] text-slate-400">Yol sayısı</div>
      </div>
      <div className="rounded-lg bg-slate-800 p-3">
        <div className="text-lg font-semibold text-blue-300">
          {stats.cutDistance.toFixed(1)}
        </div>
        <div className="text-[11px] text-slate-400">Kesim mesafesi (mm)</div>
      </div>
      <div className="rounded-lg bg-slate-800 p-3">
        <div className="text-lg font-semibold text-red-300">
          {stats.travelDistance.toFixed(1)}
        </div>
        <div className="text-[11px] text-slate-400">Boşta mesafe (mm)</div>
      </div>
    </div>
  );
}

/**
 * Sticky control bar — always visible at the top of the viewport so the user
 * never has to scroll to find "Üret" / "İndir". It also carries the
 * safety-critical "settings changed, regenerate" warning and the download
 * lock: the download button is disabled the instant any setting changes and
 * only re-enables after a fresh, in-bounds generation.
 */
function ActionBar({
  onGenerate,
  onDownload,
  onFit,
  fitting,
}: {
  onGenerate: () => void;
  onDownload: () => void;
  onFit: () => void;
  fitting: boolean;
}) {
  const mode = useMachineStore((s) => s.mode);
  const text = useMachineStore((s) => s.text);
  const svgText = useMachineStore((s) => s.svgText);
  const gcode = useMachineStore((s) => s.gcode);
  const stats = useMachineStore((s) => s.stats);
  const maxX = useMachineStore((s) => s.maxX);
  const maxY = useMachineStore((s) => s.maxY);
  const status = useMachineStore((s) => s.status);
  const stale = useMachineStore((s) => s.stale);

  const busy = status === "parsing" || status === "generating";
  const hasInput = mode === "svg" ? !!svgText : !!text.trim();

  const check = checkWithinLimits(stats, { maxX, maxY });
  const withinLimits = check?.ok ?? false;
  // The download is allowed ONLY when there is a fresh result that fits the
  // table. Any setting change nulls `gcode` (and sets `stale`), so this turns
  // false immediately — the core "never download stale G-code" guarantee.
  const canDownload = !!gcode && withinLimits && !stale;

  return (
    <div className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-slate-900/80">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-2 hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-bold tracking-tight text-slate-100">
              CNC Etiket Makinesi
            </span>
            <span className="text-[11px] text-slate-500">
              Metinden / SVG'den G-code
            </span>
          </div>

          <button
            type="button"
            onClick={onGenerate}
            disabled={!hasInput || busy}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {busy ? "İşleniyor…" : "⚙ G-Code Üret"}
          </button>

          {mode === "text" && (
            <button
              type="button"
              onClick={onFit}
              disabled={!hasInput || busy || fitting}
              className="rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              title="Yazı boyutunu tabla sınırlarına sığacak şekilde otomatik ayarla"
            >
              {fitting ? "Hesaplanıyor…" : "⤢ Tablaya Sığdır"}
            </button>
          )}

          <button
            type="button"
            onClick={onDownload}
            disabled={!canDownload}
            className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            title={
              !gcode
                ? "Önce G-code üretin"
                : stale
                  ? "Ayarlar değişti — önce G-code'u yeniden üretin"
                  : !withinLimits
                    ? "Tabla sınırları aşıldığı için indirme devre dışı"
                    : "G-code dosyasını indir"
            }
          >
            ⬇ G-Code İndir
          </button>

          <div className="ml-auto">
            <StatusBadge />
          </div>
        </div>

        {/* Safety-critical warning: settings changed after a generation. */}
        {stale && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500 bg-amber-950/60 px-4 py-2 text-sm font-medium text-amber-200">
            <span className="text-lg leading-none">⚠️</span>
            <span>
              Ayarlar değiştirildi, lütfen G-Code'u yeniden üretin! Mevcut çıktı
              artık geçerli değil ve indirme kilitlendi.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { generate, fitToWorkspace, fitting } = useGcodeGenerator();

  const mode = useMachineStore((s) => s.mode);
  const gcode = useMachineStore((s) => s.gcode);

  const handleDownload = useCallback(() => {
    const s = useMachineStore.getState();
    if (!s.gcode || s.stale) return;
    // Final guard: never let an out-of-bounds program leave the app.
    const c = checkWithinLimits(s.stats, { maxX: s.maxX, maxY: s.maxY });
    if (!c?.ok) return;

    // Use edited version if available, otherwise use original
    const gcodeToDownload = s.editedGCode || s.gcode;

    const blob = new Blob([gcodeToDownload], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const rawName =
      s.mode === "svg"
        ? (s.svgFileName ?? "cizim").replace(/\.svg$/i, "")
        : s.text;
    const base =
      rawName.trim().replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 32) ||
      (s.mode === "svg" ? "cizim" : "etiket");
    a.href = url;
    a.download = `${base}.gcode`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  return (
    // Full-viewport flex column: the action bar stays pinned, and the body
    // fills the rest of the screen so the simulation can use the full height.
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <ActionBar
        onGenerate={generate}
        onDownload={handleDownload}
        onFit={fitToWorkspace}
        fitting={fitting}
      />

      {/* Body: two columns on desktop, filling the remaining viewport height. */}
      <main className="mx-auto grid min-h-0 w-full max-w-[1800px] flex-1 grid-cols-1 gap-6 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[380px_1fr]">
        {/* Left: controls (scrolls independently on desktop).
            min-w-0 guards against grid blowout from any long unbroken content. */}
        <section className="space-y-6 lg:min-h-0 lg:min-w-0 lg:overflow-y-auto lg:pr-1">
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <ModeSwitch />
            {mode === "svg" ? <Dropzone /> : <TextInputPanel />}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <ConfigPanel />
          </div>

          <AdvancedPanel />

          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Fiziksel Boyut & Güvenlik
              </h3>
              <DimensionPanel />
            </div>

            <p className="text-[11px] leading-snug text-slate-400">
              Lütfen bu çıktıyı kullanmadan önce makine sınırlarını, malzeme
              koşullarını ve güvenlik gereksinimlerini kendi sorumluluğunuzda
              doğrulayın.
            </p>

            <StatsRow />
          </div>
        </section>

        {/* Right: visualizer + raw output — fills the full viewport height.
            min-w-0 is essential: a grid item defaults to min-width:auto, which
            lets the canvas/long G-code push the `1fr` column wider than its
            track and overflow the viewport (worst exactly at the lg breakpoint).
            min-w-0 lets the column shrink to its track. */}
        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex min-h-[70vh] flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Tabla Önizleme & G-Code Simülasyonu
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Çizim, makine tablasının üzerinde gerçek oran ve konumuyla
              gösterilir. Tabla kenarındaki sayılar milimetredir.
            </p>
            <div className="min-h-0 flex-1">
              <GCodeVisualizer />
            </div>
          </div>

          {gcode && (
            <div className="flex h-[420px] max-h-[45vh] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <GCodeEditor
                originalGCode={gcode}
                onGCodeChange={(newGCode) => useMachineStore.setState({ editedGCode: newGCode })}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
