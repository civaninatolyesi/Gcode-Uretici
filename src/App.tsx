/**
 * App — top-level layout wiring together the dropzone, config panel,
 * generate/download actions, status, stats and the G-code visualizer.
 */

import { useCallback } from "react";
import { ConfigPanel } from "./components/ConfigPanel";
import { Dropzone } from "./components/Dropzone";
import { GCodeVisualizer } from "./components/GCodeVisualizer";
import { useMachineStore } from "./store";
import { useGcodeGenerator } from "./useGcodeGenerator";

function StatusBadge() {
  const status = useMachineStore((s) => s.status);
  const error = useMachineStore((s) => s.error);

  const map: Record<string, { label: string; cls: string }> = {
    idle: { label: "Hazır", cls: "bg-slate-700 text-slate-200" },
    parsing: { label: "SVG işleniyor…", cls: "bg-amber-600 text-white" },
    generating: { label: "G-code üretiliyor…", cls: "bg-amber-600 text-white" },
    ready: { label: "Tamamlandı", cls: "bg-green-600 text-white" },
    error: { label: "Hata", cls: "bg-red-600 text-white" },
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

function Stats() {
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

export default function App() {
  const { generate } = useGcodeGenerator();

  const svgText = useMachineStore((s) => s.svgText);
  const gcode = useMachineStore((s) => s.gcode);
  const fileName = useMachineStore((s) => s.fileName);
  const status = useMachineStore((s) => s.status);

  const busy = status === "parsing" || status === "generating";

  const handleDownload = useCallback(() => {
    if (!gcode) return;
    const blob = new Blob([gcode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = (fileName ?? "cizim").replace(/\.svg$/i, "");
    a.href = url;
    a.download = `${base}.gcode`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [gcode, fileName]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight">
          SVG → G-Code Üretici
        </h1>
        <p className="text-xs text-slate-400">
          CNC çizici / plotter için tarayıcı tabanlı CAM aracı
        </p>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 p-6 lg:grid-cols-[380px_1fr]">
        {/* Left: controls */}
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <Dropzone />
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <ConfigPanel />
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <StatusBadge />
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={generate}
                disabled={!svgText || busy}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {busy ? "İşleniyor…" : "G-Code Üret"}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!gcode}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                G-Code İndir
              </button>
            </div>
            <Stats />
          </div>
        </section>

        {/* Right: visualizer + raw output */}
        <section className="flex flex-col gap-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
              G-Code Simülasyonu
            </h2>
            <div className="h-[420px]">
              <GCodeVisualizer />
            </div>
          </div>

          {gcode && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Üretilen G-Code
              </h2>
              <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-300">
                {gcode}
              </pre>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
