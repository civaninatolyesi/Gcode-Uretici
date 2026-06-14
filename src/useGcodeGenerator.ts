/**
 * Owns the Web Worker lifecycle and the geometry -> G-code pipeline.
 *
 * Two sources feed the same worker:
 *   - "text" (primary): typed text -> opentype.js outlines -> polylines.
 *   - "svg"  (secondary): uploaded SVG -> browser geometry -> polylines.
 *
 * In both cases the polylines (Y-up, bottom-left origin) + params are posted to
 * the worker, which returns G-code + parsed moves + stats (incl. bounding box).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMachineStore } from "./store";
import { flattenSvg } from "./svgFlatten";
import { layoutTextToPolylines } from "./textLayout";
import { loadFont } from "./textToPaths";
import type { GenerateRequest, Polyline, WorkerResponse } from "./types";

/** Bounding-box size (mm) of a polyline set. */
function measurePolylines(polylines: Polyline[]): {
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pl of polylines) {
    for (const p of pl) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) {
    throw new Error("Bu metin için ölçülebilir bir şekil üretilemedi.");
  }
  return { width: maxX - minX, height: maxY - minY };
}

/** Leave a 2% breathing margin so the part never sits exactly on the edge. */
const FIT_MARGIN = 0.98;

export function useGcodeGenerator() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("./gcode.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const store = useMachineStore.getState();
      const data = e.data;
      if (data.type === "result") {
        store.setResult(data.gcode, data.moves, data.stats);
      } else {
        store.setError(data.message);
      }
    };

    worker.onerror = (e) => {
      useMachineStore
        .getState()
        .setError("Worker hatası: " + (e.message || "bilinmeyen"));
    };

    // Warm up the font in the background so the first generate is instant.
    loadFont().catch(() => {
      /* surfaced on first generate attempt */
    });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const generate = useCallback(async () => {
    const store = useMachineStore.getState();
    const worker = workerRef.current;
    if (!worker) {
      store.setError("Worker hazır değil.");
      return;
    }

    const params = store.getParams();

    try {
      store.setStatus("parsing");

      let polylines: Polyline[];

      if (store.mode === "svg") {
        if (!store.svgText) {
          store.setError("Lütfen önce bir SVG dosyası yükleyin.");
          return;
        }
        polylines = flattenSvg(store.svgText, params.tolerance).polylines;
      } else {
        if (!store.text.trim()) {
          store.setError("Lütfen önce bir metin girin.");
          return;
        }
        polylines = await layoutTextToPolylines({
          text: store.text,
          fontId: store.fontId,
          fontSizeMm: store.fontSizeMm,
          tolerance: params.tolerance,
          layout: store.layout,
        });
      }

      store.setStatus("generating");
      const req: GenerateRequest = {
        type: "generate",
        polylines,
        params,
      };
      worker.postMessage(req);
    } catch (err) {
      store.setError(
        err instanceof Error ? err.message : "Geometri işlenemedi.",
      );
    }
  }, []);

  /**
   * "Tablaya Sığdır" — text mode only. Measure the text at a reference size,
   * then scale the font size so the bounding box exactly fits inside Max X/Y
   * WITHOUT distorting the aspect ratio (the smaller of the two scale factors
   * wins). A small margin keeps the part off the very edge. The new font size
   * is written to the store, which invalidates the old result so the user must
   * regenerate — keeping the safety lock honest.
   */
  const [fitting, setFitting] = useState(false);
  const fitToWorkspace = useCallback(async () => {
    const store = useMachineStore.getState();
    if (store.mode !== "text") return; // Auto-fit is a text-mode feature.
    if (!store.text.trim()) {
      store.setError("Lütfen önce bir metin girin.");
      return;
    }

    const { maxX, maxY, tolerance, fontId, layout } = store;
    if (!(maxX > 0) || !(maxY > 0)) {
      store.setError("Geçerli bir tabla boyutu (Max X / Max Y) girin.");
      return;
    }

    setFitting(true);
    try {
      // Measure the FULL layout (lines, frame, copies) at a fixed reference
      // size; the whole composition scales linearly with the font size, so the
      // explicit-mm overrides (frame padding / block gap) are temporarily
      // dropped here to keep the proportional scaling honest.
      const refSize = 100;
      const refLayout = {
        ...layout,
        framePaddingMm: null,
        blockGapMm: null,
      };
      const refPolylines = await layoutTextToPolylines({
        text: store.text,
        fontId,
        fontSizeMm: refSize,
        tolerance,
        layout: refLayout,
      });
      const { width, height } = measurePolylines(refPolylines);

      if (!(width > 0) || !(height > 0)) {
        store.setError("Bu metin için ölçülebilir bir şekil üretilemedi.");
        return;
      }

      // How much we can scale the reference geometry on each axis, capped by
      // the tighter constraint so the aspect ratio is preserved.
      const scaleX = (maxX * FIT_MARGIN) / width;
      const scaleY = (maxY * FIT_MARGIN) / height;
      const scale = Math.min(scaleX, scaleY);

      const newSize = refSize * scale;
      // Round to 0.1 mm for a clean, repeatable value.
      const rounded = Math.max(0.1, Math.round(newSize * 10) / 10);

      useMachineStore.getState().setFontSize(rounded);
    } catch (err) {
      useMachineStore
        .getState()
        .setError(
          err instanceof Error ? err.message : "Tablaya sığdırma başarısız.",
        );
    } finally {
      setFitting(false);
    }
  }, []);

  return { generate, fitToWorkspace, fitting };
}
