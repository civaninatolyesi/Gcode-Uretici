/**
 * Global state (Zustand).
 *
 * useMachineStore holds the CNC parameters, the table (workspace) limits, the
 * label text to engrave, and the current job state (generated G-code, parsed
 * moves, stats, status, errors).
 *
 * Parameter setters coerce input safely; the worker request additionally guards
 * against NaN so invalid input can never corrupt the G-code.
 */

import { create } from "zustand";
import { DEFAULT_FONT_ID, type FontId } from "./fonts";
import type { GMove, JobStats, MachineParams, TableLimits } from "./types";

export type JobStatus =
  | "idle"
  | "parsing"
  | "generating"
  | "ready"
  | "error"
  | "stale";

/** Which geometry source feeds the G-code generator. */
export type SourceMode = "text" | "svg";

interface MachineState extends MachineParams, TableLimits {
  // Active source mode (text = primary feature, svg = secondary feature).
  mode: SourceMode;

  // Label (text) source.
  text: string;
  fontSizeMm: number;
  /** Which font renders the text (outline vs. single-stroke). */
  fontId: FontId;

  // SVG source.
  svgText: string | null;
  svgFileName: string | null;

  // Results.
  gcode: string | null;
  moves: GMove[];
  stats: JobStats | null;

  status: JobStatus;
  error: string | null;

  /**
   * True when the user changed a setting AFTER generating G-code, so the
   * on-screen output no longer matches the current settings. The download is
   * locked and a warning is shown until "G-Code Üret" is pressed again.
   */
  stale: boolean;

  // Setters.
  setMode: (mode: SourceMode) => void;
  setParam: (key: keyof MachineParams, value: number) => void;
  setLimit: (key: keyof TableLimits, value: number) => void;
  setText: (text: string) => void;
  setFontSize: (size: number) => void;
  setFontId: (fontId: FontId) => void;
  setSvg: (fileName: string, svgText: string) => void;
  clearSvg: () => void;

  // Job lifecycle.
  setStatus: (status: JobStatus) => void;
  setError: (message: string | null) => void;
  setResult: (gcode: string, moves: GMove[], stats: JobStats) => void;
  invalidateResult: () => void;

  getParams: () => MachineParams;
  getLimits: () => TableLimits;
}

/**
 * Compute the state patch that invalidates a generated result. Shared by every
 * setting setter so the rule is enforced in exactly one place: drop the stale
 * G-code/moves/stats, and — if a result actually existed — flip into the
 * "stale" status so the UI shows the "ayarlar değişti, yeniden üretin" warning
 * and keeps the download locked. If nothing was generated yet, stay idle.
 */
function invalidate(s: {
  gcode: string | null;
  status: JobStatus;
}): {
  gcode: null;
  moves: GMove[];
  stats: null;
  status: JobStatus;
  error: null;
  stale: boolean;
} {
  const hadResult = s.gcode !== null;
  return {
    gcode: null,
    moves: [],
    stats: null,
    status: hadResult ? "stale" : "idle",
    error: null,
    stale: hadResult,
  };
}

export const useMachineStore = create<MachineState>((set, get) => ({
  // CNC defaults.
  safeZ: 5,
  drawZ: 0,
  feedRate: 1000,
  travelRate: 2000,
  tolerance: 0.1,
  penDiameterMm: 0,

  // Table (workspace) limits — sensible small-machine defaults.
  maxX: 200,
  maxY: 200,

  // Source defaults.
  mode: "text",

  // Label defaults.
  text: "ETİKET",
  fontSizeMm: 20,
  fontId: DEFAULT_FONT_ID,

  // SVG defaults.
  svgText: null,
  svgFileName: null,

  gcode: null,
  moves: [],
  stats: null,

  status: "idle",
  error: null,
  stale: false,

  setMode: (mode) =>
    set({
      mode,
      // Switching source clears stale output so the UI never mixes them.
      gcode: null,
      moves: [],
      stats: null,
      status: "idle",
      error: null,
      stale: false,
    }),

  /**
   * SAFETY-CRITICAL: changing ANY machine parameter (Safe Z, Draw Z, feed
   * rates, tolerance…) means the G-code currently on screen no longer matches
   * the settings. We must invalidate it so the user cannot download a program
   * that, e.g., still plunges to the old Z. `invalidate` decides whether to
   * mark the output stale (a result existed → warn + lock download) or simply
   * stay idle (nothing was generated yet).
   */
  setParam: (key, value) =>
    set((s) => ({ [key]: value, ...invalidate(s) }) as Partial<MachineState>),

  // Changing a table limit (Max X/Y) likewise invalidates the result: the
  // fit check and the download guard both depend on it.
  setLimit: (key, value) =>
    set((s) => ({ [key]: value, ...invalidate(s) }) as Partial<MachineState>),

  setText: (text) => set((s) => ({ text, ...invalidate(s) })),

  setFontSize: (fontSizeMm) => set((s) => ({ fontSizeMm, ...invalidate(s) })),

  setFontId: (fontId) => set((s) => ({ fontId, ...invalidate(s) })),

  setSvg: (svgFileName, svgText) =>
    set((s) => ({ svgFileName, svgText, ...invalidate(s) })),

  clearSvg: () =>
    set((s) => ({ svgFileName: null, svgText: null, ...invalidate(s) })),

  setStatus: (status) => set({ status }),

  setError: (message) =>
    set({ error: message, status: message ? "error" : "idle" }),

  setResult: (gcode, moves, stats) =>
    set({ gcode, moves, stats, status: "ready", error: null, stale: false }),

  invalidateResult: () =>
    set({ gcode: null, moves: [], stats: null, status: "idle", stale: false }),

  getParams: () => {
    const s = get();
    return {
      safeZ: s.safeZ,
      drawZ: s.drawZ,
      feedRate: s.feedRate,
      travelRate: s.travelRate,
      tolerance: s.tolerance,
      penDiameterMm: s.penDiameterMm,
    };
  },

  getLimits: () => {
    const s = get();
    return { maxX: s.maxX, maxY: s.maxY };
  },
}));

/**
 * Pure helper: does the generated geometry fit inside the table limits?
 * Returns null when there is nothing to check yet.
 */
export function checkWithinLimits(
  stats: JobStats | null,
  limits: TableLimits,
): { ok: boolean; exceedsX: boolean; exceedsY: boolean } | null {
  if (!stats) return null;
  const { width, height } = stats.bbox;
  // A tiny epsilon avoids false positives from floating-point rounding.
  const eps = 1e-6;
  const exceedsX = width > limits.maxX + eps;
  const exceedsY = height > limits.maxY + eps;
  return { ok: !exceedsX && !exceedsY, exceedsX, exceedsY };
}
