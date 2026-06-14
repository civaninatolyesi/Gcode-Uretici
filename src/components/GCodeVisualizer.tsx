/**
 * GCodeVisualizer — renders the GENERATED G-code inside a TRUE-SCALE view of the
 * physical machine table, so a non-expert can instantly answer the three
 * questions a professional CNC operator always checks before pressing start:
 *
 *   1. "How big is my drawing?"      -> dimension lines (kotalar) in mm.
 *   2. "Where does it sit on the table?" -> the table is drawn to scale with a
 *      mm grid, rulers, and the part placed in its real corner (origin = 0,0).
 *   3. "Does it fit?"                -> the table turns red and a banner warns
 *      when the geometry spills past the work-area limits.
 *
 * Toolpath colors:
 *   G0 (rapid / air moves)  -> dashed red lines
 *   G1 (feed / cutting)     -> solid blue lines
 *
 * The whole scene (table + part) is fit into the canvas, so the part keeps its
 * real proportion RELATIVE TO THE TABLE — a tiny label looks tiny, a part that
 * nearly fills the bed looks nearly full. This is the core fix for "I can't tell
 * how much space it takes."
 */

import { useEffect, useRef } from "react";
import { useMachineStore } from "../store";
import { useSimPlayer } from "../useSimPlayer";
import type { GMove } from "../types";

/** Outer canvas padding that leaves room for the rulers and dimension labels. */
const MARGIN = { top: 28, right: 28, bottom: 40, left: 48 };

const COLORS = {
  bg: "#0f172a",
  tableFill: "#0b1220",
  tableFillBad: "#2a0d12",
  tableStroke: "#475569",
  tableStrokeBad: "#ef4444",
  gridMinor: "#1e293b",
  gridMajor: "#334155",
  ruler: "#64748b",
  rulerText: "#94a3b8",
  cut: "#3b82f6",
  rapid: "#ef4444",
  origin: "#22c55e",
  dim: "#fbbf24",
  dimText: "#fde68a",
  partBox: "#38bdf8",
  pen: "#fde047",
  penInk: "#60a5fa",
};

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function computeBounds(moves: GMove[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let seen = false;

  for (const m of moves) {
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    if (m.zOnly) continue; // Z-only moves don't define XY extent.
    seen = true;
    if (m.x < minX) minX = m.x;
    if (m.y < minY) minY = m.y;
    if (m.x > maxX) maxX = m.x;
    if (m.y > maxY) maxY = m.y;
  }
  if (!seen) return null;
  return { minX, minY, maxX, maxY };
}

/** Pick a "nice" grid step (1,2,5 × 10ⁿ) so ~6–12 lines fall across `span` mm. */
function niceStep(span: number): number {
  const target = span / 8;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const candidates = [1, 2, 5, 10].map((m) => m * pow);
  for (const c of candidates) if (c >= target) return c;
  return candidates[candidates.length - 1];
}

export function GCodeVisualizer() {
  const moves = useMachineStore((s) => s.moves);
  const status = useMachineStore((s) => s.status);
  const stats = useMachineStore((s) => s.stats);
  const maxX = useMachineStore((s) => s.maxX);
  const maxY = useMachineStore((s) => s.maxY);
  const penDiameterMm = useMachineStore((s) => s.penDiameterMm);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Playback: how far along the toolpath the pen currently is.
  const player = useSimPlayer(moves);
  const { progress, tip } = player;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;

      canvas.width = Math.max(1, Math.floor(cssW * dpr));
      canvas.height = Math.max(1, Math.floor(cssH * dpr));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, cssW, cssH);

      const part = computeBounds(moves);
      const hasPart = !!part && moves.length >= 2;

      // The "world" we map to the canvas is the whole table (0..maxX, 0..maxY).
      // If the part overflows the table, we extend the world to keep it visible
      // (so the user actually SEES the overflow instead of it being clipped).
      const worldMaxX = Math.max(maxX, hasPart ? part!.maxX : 0);
      const worldMaxY = Math.max(maxY, hasPart ? part!.maxY : 0);
      const worldMinX = Math.min(0, hasPart ? part!.minX : 0);
      const worldMinY = Math.min(0, hasPart ? part!.minY : 0);

      const worldW = Math.max(1e-6, worldMaxX - worldMinX);
      const worldH = Math.max(1e-6, worldMaxY - worldMinY);

      const plotW = cssW - MARGIN.left - MARGIN.right;
      const plotH = cssH - MARGIN.top - MARGIN.bottom;
      if (plotW <= 0 || plotH <= 0) return;

      // Uniform scale (mm -> px) keeps the table and part undistorted.
      const scale = Math.min(plotW / worldW, plotH / worldH);

      const drawW = worldW * scale;
      const drawH = worldH * scale;
      // Center the scene within the plot region.
      const originPxX = MARGIN.left + (plotW - drawW) / 2;
      const originPxY = MARGIN.top + (plotH - drawH) / 2;

      // World (mm, Y-up) -> screen (px, Y-down).
      const tx = (xmm: number) => originPxX + (xmm - worldMinX) * scale;
      const ty = (ymm: number) => originPxY + (worldMaxY - ymm) * scale;

      // ---------------------------------------------------------------------
      // Empty state.
      // ---------------------------------------------------------------------
      if (!hasPart) {
        // Still draw the empty table so users see the canvas to scale.
        drawTable(ctx, tx, ty, maxX, maxY, false);
        ctx.fillStyle = COLORS.ruler;
        ctx.font = "13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          status === "generating"
            ? "G-code üretiliyor…"
            : "Tablayı görüyorsunuz. Çizim için “G-Code Üret”e basın.",
          cssW / 2,
          MARGIN.top + plotH / 2,
        );
        return;
      }

      const fits =
        part!.maxX <= maxX + 1e-6 &&
        part!.maxY <= maxY + 1e-6 &&
        part!.minX >= -1e-6 &&
        part!.minY >= -1e-6;

      // ---------------------------------------------------------------------
      // 1. Table + grid + rulers (the spatial reference).
      // ---------------------------------------------------------------------
      drawTable(ctx, tx, ty, maxX, maxY, !fits);

      // ---------------------------------------------------------------------
      // 2. Toolpath — drawn only up to the current playback `progress`.
      //    Each drawing (G1) segment is rendered at the REAL pen width (mm ->
      //    px) so the operator sees how thick the physical line will be; a
      //    pen diameter of 0 falls back to a thin preview line.
      // ---------------------------------------------------------------------
      // Total XY length, to translate progress fraction -> a length cutoff.
      let totalLen = 0;
      {
        let p: GMove | null = null;
        for (const m of moves) {
          if (m.zOnly || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
          if (p) totalLen += Math.hypot(m.x - p.x, m.y - p.y);
          p = m;
        }
      }
      const lenCutoff = totalLen * progress;
      const penPx = penDiameterMm > 0 ? Math.max(1, penDiameterMm * scale) : 0;

      let drawn = 0;
      let prev: GMove | null = null;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const m of moves) {
        if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) {
          prev = m;
          continue;
        }
        if (m.zOnly) {
          prev = { ...m };
          continue;
        }
        if (prev) {
          const segLen = Math.hypot(m.x - prev.x, m.y - prev.y);
          // Clip this segment at the playback cutoff so the pen "draws" live.
          let ex = m.x;
          let ey = m.y;
          let visible = true;
          if (drawn >= lenCutoff) {
            visible = false;
          } else if (drawn + segLen > lenCutoff && segLen > 0) {
            const t = (lenCutoff - drawn) / segLen;
            ex = prev.x + (m.x - prev.x) * t;
            ey = prev.y + (m.y - prev.y) * t;
          }

          if (visible) {
            ctx.beginPath();
            ctx.moveTo(tx(prev.x), ty(prev.y));
            ctx.lineTo(tx(ex), ty(ey));
            if (m.rapid) {
              ctx.strokeStyle = COLORS.rapid;
              ctx.lineWidth = 1;
              ctx.setLineDash([5, 4]);
            } else {
              // Real-width ink when a pen diameter is set, else a thin line.
              ctx.strokeStyle = penPx > 0 ? COLORS.penInk : COLORS.cut;
              ctx.lineWidth = penPx > 0 ? penPx : 1.6;
              ctx.setLineDash([]);
            }
            ctx.stroke();
          }
          drawn += segLen;
        }
        prev = m;
      }
      ctx.setLineDash([]);
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";

      // Moving pen-tip marker at the current playback position.
      if (tip && progress > 0 && progress < 1) {
        const px = tx(tip.x);
        const py = ty(tip.y);
        const r = penPx > 0 ? penPx / 2 : 4;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(3, r), 0, Math.PI * 2);
        ctx.fillStyle = tip.drawing ? COLORS.penInk : COLORS.rapid;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = COLORS.pen;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // ---------------------------------------------------------------------
      // 3. Part bounding box + dimension lines (the "how big / where" answer).
      // ---------------------------------------------------------------------
      const bw = stats ? stats.bbox.width : part!.maxX - part!.minX;
      const bh = stats ? stats.bbox.height : part!.maxY - part!.minY;
      drawPartBox(ctx, tx, ty, part!, bw, bh, !fits);

      // ---------------------------------------------------------------------
      // 4. Origin marker (drawn last so it's always on top).
      // ---------------------------------------------------------------------
      const ox = tx(0);
      const oy = ty(0);
      ctx.fillStyle = COLORS.origin;
      ctx.beginPath();
      ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.origin;
      ctx.lineWidth = 1;
      // Small axis arrows: X right, Y up.
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + 18, oy);
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox, oy - 18);
      ctx.stroke();
      ctx.fillStyle = "#4ade80";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("X", ox + 22, oy + 3);
      ctx.fillText("Y", ox + 3, oy - 22);
      ctx.fillText("0,0", ox + 8, oy - 6);
    };

    /** Draw the work-area rectangle, mm grid, and edge rulers. */
    function drawTable(
      ctx: CanvasRenderingContext2D,
      tx: (x: number) => number,
      ty: (y: number) => number,
      tMaxX: number,
      tMaxY: number,
      bad: boolean,
    ) {
      const x0 = tx(0);
      const y0 = ty(0);
      const x1 = tx(tMaxX);
      const y1 = ty(tMaxY);
      const left = Math.min(x0, x1);
      const top = Math.min(y0, y1);
      const w = Math.abs(x1 - x0);
      const h = Math.abs(y1 - y0);

      // Table fill.
      ctx.fillStyle = bad ? COLORS.tableFillBad : COLORS.tableFill;
      ctx.fillRect(left, top, w, h);

      // Grid.
      const stepX = niceStep(tMaxX);
      const stepY = niceStep(tMaxY);
      ctx.lineWidth = 1;
      ctx.font = "9px system-ui, sans-serif";
      ctx.textBaseline = "middle";

      for (let xmm = 0; xmm <= tMaxX + 1e-6; xmm += stepX) {
        const px = tx(xmm);
        const major = Math.round(xmm / stepX) % 5 === 0;
        ctx.strokeStyle = major ? COLORS.gridMajor : COLORS.gridMinor;
        ctx.beginPath();
        ctx.moveTo(px, top);
        ctx.lineTo(px, top + h);
        ctx.stroke();
        if (major) {
          ctx.fillStyle = COLORS.rulerText;
          ctx.textAlign = "center";
          ctx.fillText(String(Math.round(xmm)), px, top + h + 12);
        }
      }
      for (let ymm = 0; ymm <= tMaxY + 1e-6; ymm += stepY) {
        const py = ty(ymm);
        const major = Math.round(ymm / stepY) % 5 === 0;
        ctx.strokeStyle = major ? COLORS.gridMajor : COLORS.gridMinor;
        ctx.beginPath();
        ctx.moveTo(left, py);
        ctx.lineTo(left + w, py);
        ctx.stroke();
        if (major) {
          ctx.fillStyle = COLORS.rulerText;
          ctx.textAlign = "right";
          ctx.fillText(String(Math.round(ymm)), left - 6, py);
        }
      }

      // Table border (drawn over the grid).
      ctx.strokeStyle = bad ? COLORS.tableStrokeBad : COLORS.tableStroke;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(left, top, w, h);

      // Axis unit labels.
      ctx.fillStyle = COLORS.ruler;
      ctx.font = "9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Tabla ${tMaxX} × ${tMaxY} mm`, left + w / 2, top - 12);
      ctx.textBaseline = "alphabetic";
    }

    /** Draw the part's bounding box with width/height dimension lines. */
    function drawPartBox(
      ctx: CanvasRenderingContext2D,
      tx: (x: number) => number,
      ty: (y: number) => number,
      b: Bounds,
      widthMm: number,
      heightMm: number,
      bad: boolean,
    ) {
      const left = tx(b.minX);
      const right = tx(b.maxX);
      const top = ty(b.maxY);
      const bottom = ty(b.minY);
      const boxW = right - left;
      const boxH = bottom - top;

      // Dashed bounding rectangle around the geometry.
      ctx.strokeStyle = bad ? COLORS.tableStrokeBad : COLORS.partBox;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(left, top, boxW, boxH);
      ctx.setLineDash([]);

      // Only draw dimension lines when the box is big enough to be legible.
      if (boxW < 24 || boxH < 24) {
        // Compact label near the box instead.
        ctx.fillStyle = COLORS.dimText;
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(
          `${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm`,
          right + 6,
          top + 4,
        );
        return;
      }

      ctx.strokeStyle = COLORS.dim;
      ctx.fillStyle = COLORS.dimText;
      ctx.lineWidth = 1;
      ctx.font = "10px system-ui, sans-serif";

      // Width dimension (above the box).
      const wy = top - 10;
      drawDimLine(ctx, left, wy, right, wy, true);
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS.bg;
      const wLabel = `${widthMm.toFixed(1)} mm`;
      const wm = ctx.measureText(wLabel).width;
      ctx.fillRect((left + right) / 2 - wm / 2 - 3, wy - 8, wm + 6, 13);
      ctx.fillStyle = COLORS.dimText;
      ctx.fillText(wLabel, (left + right) / 2, wy + 3);

      // Height dimension (right of the box).
      const hx = right + 10;
      drawDimLine(ctx, hx, top, hx, bottom, false);
      ctx.save();
      ctx.translate(hx + 4, (top + bottom) / 2);
      ctx.rotate(-Math.PI / 2);
      const hLabel = `${heightMm.toFixed(1)} mm`;
      const hm = ctx.measureText(hLabel).width;
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(-hm / 2 - 3, -8, hm + 6, 13);
      ctx.fillStyle = COLORS.dimText;
      ctx.textAlign = "center";
      ctx.fillText(hLabel, 0, 3);
      ctx.restore();
    }

    /** A dimension line with end ticks. Horizontal when `horiz`, else vertical. */
    function drawDimLine(
      ctx: CanvasRenderingContext2D,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      horiz: boolean,
    ) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      const t = 4;
      if (horiz) {
        ctx.moveTo(x1, y1 - t);
        ctx.lineTo(x1, y1 + t);
        ctx.moveTo(x2, y2 - t);
        ctx.lineTo(x2, y2 + t);
      } else {
        ctx.moveTo(x1 - t, y1);
        ctx.lineTo(x1 + t, y1);
        ctx.moveTo(x2 - t, y2);
        ctx.lineTo(x2 + t, y2);
      }
      ctx.stroke();
    }

    draw();

    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [moves, status, stats, maxX, maxY, penDiameterMm, progress, tip]);

  // Coverage: how much of the table the part occupies (area %).
  const coverage =
    stats && maxX > 0 && maxY > 0
      ? Math.min(
          100,
          ((stats.bbox.width * stats.bbox.height) / (maxX * maxY)) * 100,
        )
      : null;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 text-slate-300">
          <span className="inline-block h-0.5 w-5 bg-blue-500" />
          G1 — Kesim (çizim)
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          <span
            className="inline-block h-0 w-5 border-t-2 border-dashed border-red-500"
            aria-hidden
          />
          G0 — Boşta hareket
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          <span
            className="inline-block h-0 w-5 border-t border-dashed border-sky-400"
            aria-hidden
          />
          Çizim alanı
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          Orijin (0,0)
        </span>
        {coverage !== null && (
          <span className="ml-auto text-slate-400">
            Tabla doluluğu:{" "}
            <span className="font-semibold text-slate-200">
              %{coverage.toFixed(0)}
            </span>
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        className="relative min-h-[360px] flex-1 overflow-hidden rounded-xl border border-slate-700 bg-slate-900"
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>

      <SimControls player={player} hasPath={moves.length >= 2} />
    </div>
  );
}

/** Play / pause / restart + speed + scrubber for the simulation. */
function SimControls({
  player,
  hasPath,
}: {
  player: ReturnType<typeof useSimPlayer>;
  hasPath: boolean;
}) {
  const { playing, progress, speed, toggle, restart, seek, setSpeed } = player;
  const speeds = [0.5, 1, 2, 4];

  return (
    <div
      className={[
        "mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2",
        hasPath ? "" : "pointer-events-none opacity-40",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={!hasPath}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:bg-slate-700"
        title={playing ? "Duraklat" : "Oynat"}
      >
        {playing ? "⏸ Duraklat" : "▶ Oynat"}
      </button>
      <button
        type="button"
        onClick={restart}
        disabled={!hasPath}
        className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:bg-slate-600"
        title="Baştan oynat"
      >
        ⟲ Baştan
      </button>

      {/*
        The scrubber takes its own full-width row on small screens (basis-full)
        and shares the row on wider ones (sm:basis-0 → flex-grow). min-w-0 lets
        it shrink instead of overflowing/overlapping its neighbours — the bug
        where the bar "stayed behind / broke" on narrow layouts.
      */}
      <div className="flex min-w-0 basis-full items-center gap-3 sm:basis-0 sm:flex-1">
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={!hasPath}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-blue-500"
          aria-label="Simülasyon ilerlemesi"
        />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-300">
          %{Math.round(progress * 100)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {speeds.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={[
              "rounded px-2 py-1 text-xs font-medium transition",
              speed === s
                ? "bg-blue-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600",
            ].join(" ")}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
