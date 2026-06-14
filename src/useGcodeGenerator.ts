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

import { useCallback, useEffect, useRef } from "react";
import { useMachineStore } from "./store";
import { flattenSvg } from "./svgFlatten";
import { loadFont, textToPolylines } from "./textToPaths";
import type { GenerateRequest, Polyline, WorkerResponse } from "./types";

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
        const font = await loadFont();
        polylines = textToPolylines(font, {
          text: store.text,
          fontSizeMm: store.fontSizeMm,
          tolerance: params.tolerance,
        }).polylines;
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

  return { generate };
}
