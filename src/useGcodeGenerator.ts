/**
 * Owns the Web Worker lifecycle and the parse->generate pipeline.
 *
 * Flow:
 *   1. SVG flattened on the main thread (browser geometry) -> polylines.
 *   2. Polylines + params posted to the worker.
 *   3. Worker returns G-code + parsed moves + stats -> store.
 *
 * The worker instance is created once and reused; each generate call is
 * debounced via a request id so stale results are ignored.
 */

import { useCallback, useEffect, useRef } from "react";
import { useMachineStore } from "./store";
import { flattenSvg } from "./svgFlatten";
import type { GenerateRequest, WorkerResponse } from "./types";

export function useGcodeGenerator() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(
      new URL("./gcode.worker.ts", import.meta.url),
      { type: "module" },
    );
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

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const generate = useCallback(() => {
    const store = useMachineStore.getState();
    const { svgText } = store;
    if (!svgText) {
      store.setError("Önce bir SVG dosyası yükleyin.");
      return;
    }
    const worker = workerRef.current;
    if (!worker) {
      store.setError("Worker hazır değil.");
      return;
    }

    const params = store.getParams();
    requestIdRef.current += 1;

    try {
      store.setStatus("parsing");
      const { polylines } = flattenSvg(svgText, params.tolerance);

      store.setStatus("generating");
      const req: GenerateRequest = {
        type: "generate",
        polylines,
        params,
      };
      worker.postMessage(req);
    } catch (err) {
      store.setError(
        err instanceof Error ? err.message : "SVG işlenemedi.",
      );
    }
  }, []);

  return { generate };
}
