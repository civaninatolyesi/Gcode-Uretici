/**
 * GCodeVisualizer — renders the GENERATED G-code (not the SVG) onto a canvas,
 * so what you see is exactly what the machine will do.
 *
 *   G0 (rapid / air moves)  -> dashed red lines
 *   G1 (feed / cutting)     -> solid blue lines
 *
 * The component consumes the parsed `moves` list from the store (built by the
 * worker), auto-fits the drawing to the canvas, and flips Y so machine "up"
 * renders upward. It is resolution-aware (devicePixelRatio) for crisp lines.
 */

import { useEffect, useRef } from "react";
import { useMachineStore } from "../store";
import type { GMove } from "../types";

const PADDING = 24;

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
    seen = true;
    if (m.x < minX) minX = m.x;
    if (m.y < minY) minY = m.y;
    if (m.x > maxX) maxX = m.x;
    if (m.y > maxY) maxY = m.y;
  }
  if (!seen) return null;
  // Guard against zero-size bounds.
  if (maxX - minX < 1e-6) {
    minX -= 1;
    maxX += 1;
  }
  if (maxY - minY < 1e-6) {
    minY -= 1;
    maxY += 1;
  }
  return { minX, minY, maxX, maxY };
}

export function GCodeVisualizer() {
  const moves = useMachineStore((s) => s.moves);
  const status = useMachineStore((s) => s.status);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

      // Background.
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, cssW, cssH);

      const bounds = computeBounds(moves);
      if (!bounds || moves.length < 2) {
        ctx.fillStyle = "#64748b";
        ctx.font = "13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          status === "generating"
            ? "G-code üretiliyor…"
            : "Önizleme için bir SVG yükleyip G-code üretin.",
          cssW / 2,
          cssH / 2,
        );
        return;
      }

      const geomW = bounds.maxX - bounds.minX;
      const geomH = bounds.maxY - bounds.minY;
      const scale = Math.min(
        (cssW - PADDING * 2) / geomW,
        (cssH - PADDING * 2) / geomH,
      );

      // Center the drawing.
      const drawW = geomW * scale;
      const drawH = geomH * scale;
      const offsetX = (cssW - drawW) / 2;
      const offsetY = (cssH - drawH) / 2;

      // World (machine, Y-up) -> screen (Y-down).
      const tx = (x: number) => offsetX + (x - bounds.minX) * scale;
      const ty = (y: number) => offsetY + (bounds.maxY - y) * scale;

      // Origin marker.
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(tx(0), ty(0), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4ade80";
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("0,0", tx(0) + 6, ty(0) - 6);

      // Draw moves. Z-only moves (plunge/retract) don't move X/Y, so skip them
      // for line drawing but keep the pen position continuous.
      let prev: GMove | null = null;
      for (const m of moves) {
        if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) {
          prev = m;
          continue;
        }
        if (m.zOnly) {
          // Pure Z change: position is unchanged in XY; just remember it.
          prev = { ...m };
          continue;
        }
        if (prev) {
          ctx.beginPath();
          ctx.moveTo(tx(prev.x), ty(prev.y));
          ctx.lineTo(tx(m.x), ty(m.y));
          if (m.rapid) {
            // G0 — dashed red.
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 4]);
          } else {
            // G1 — solid blue.
            ctx.strokeStyle = "#3b82f6";
            ctx.lineWidth = 1.6;
            ctx.setLineDash([]);
          }
          ctx.stroke();
        }
        prev = m;
      }
      ctx.setLineDash([]);
    };

    draw();

    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [moves, status]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-4 text-xs">
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
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          Orijin (0,0)
        </span>
      </div>
      <div
        ref={containerRef}
        className="relative min-h-[320px] flex-1 overflow-hidden rounded-xl border border-slate-700 bg-slate-900"
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>
    </div>
  );
}
