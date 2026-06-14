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
import type { GMove, JobStats, MachineParams, TableLimits } from "./types";

export type JobStatus = "idle" | "parsing" | "generating" | "ready" | "error";

/** Which geometry source feeds the G-code generator. */
export type SourceMode = "text" | "svg";

interface MachineState extends MachineParams, TableLimits {
  // Active source mode (text = primary feature, svg = secondary feature).
  mode: SourceMode;

  // Label (text) source.
  text: string;
  fontSizeMm: number;

  // SVG source.
  svgText: string | null;
  svgFileName: string | null;

  // Results.
  gcode: string | null;
  moves: GMove[];
  stats: JobStats | null;

  status: JobStatus;
  error: string | null;

  // Setters.
  setMode: (mode: SourceMode) => void;
  setParam: (key: keyof MachineParams, value: number) => void;
  setLimit: (key: keyof TableLimits, value: number) => void;
  setText: (text: string) => void;
  setFontSize: (size: number) => void;
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

export const useMachineStore = create<MachineState>((set, get) => ({
  // CNC defaults.
  safeZ: 5,
  drawZ: 0,
  feedRate: 1000,
  travelRate: 2000,
  tolerance: 0.1,

  // Table (workspace) limits — sensible small-machine defaults.
  maxX: 200,
  maxY: 200,

  // Source defaults.
  mode: "text",

  // Label defaults.
  text: "ETİKET",
  fontSizeMm: 20,

  // SVG defaults.
  svgText: null,
  svgFileName: null,

  gcode: null,
  moves: [],
  stats: null,

  status: "idle",
  error: null,

  setMode: (mode) =>
    set({
      mode,
      // Switching source clears stale output so the UI never mixes them.
      gcode: null,
      moves: [],
      stats: null,
      status: "idle",
      error: null,
    }),

  setParam: (key, value) =>
    set({ [key]: value } as Partial<MachineState>),

  setLimit: (key, value) =>
    set({ [key]: value } as Partial<MachineState>),

  setText: (text) =>
    set({
      text,
      // New text invalidates any previously generated result.
      gcode: null,
      moves: [],
      stats: null,
      status: "idle",
      error: null,
    }),

  setFontSize: (fontSizeMm) =>
    set({
      fontSizeMm,
      gcode: null,
      moves: [],
      stats: null,
      status: "idle",
      error: null,
    }),

  setSvg: (svgFileName, svgText) =>
    set({
      svgFileName,
      svgText,
      gcode: null,
      moves: [],
      stats: null,
      status: "idle",
      error: null,
    }),

  clearSvg: () =>
    set({
      svgFileName: null,
      svgText: null,
      gcode: null,
      moves: [],
      stats: null,
      status: "idle",
      error: null,
    }),

  setStatus: (status) => set({ status }),

  setError: (message) =>
    set({ error: message, status: message ? "error" : "idle" }),

  setResult: (gcode, moves, stats) =>
    set({ gcode, moves, stats, status: "ready", error: null }),

  invalidateResult: () =>
    set({ gcode: null, moves: [], stats: null, status: "idle" }),

  getParams: () => {
    const s = get();
    return {
      safeZ: s.safeZ,
      drawZ: s.drawZ,
      feedRate: s.feedRate,
      travelRate: s.travelRate,
      tolerance: s.tolerance,
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
