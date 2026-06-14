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
import type {
  FrameStyle,
  GMove,
  JobStats,
  LabelLayout,
  MachineParams,
  TableLimits,
} from "./types";

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

  /**
   * Composition around the text: multi-line spacing, optional frame, and grid
   * copies. Kept as one object so a single `setLayout` patch covers them all.
   */
  layout: LabelLayout;

  // SVG source.
  svgText: string | null;
  svgFileName: string | null;

  // Results.
  gcode: string | null;
  /** User-edited version of gcode (for the editor). If null, use gcode. */
  editedGCode: string | null;
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
  /** Patch one or more layout fields (frame, spacing, grid copies). */
  setLayout: (patch: Partial<LabelLayout>) => void;
  setSvg: (fileName: string, svgText: string) => void;
  clearSvg: () => void;

  // Job lifecycle.
  setStatus: (status: JobStatus) => void;
  setError: (message: string | null) => void;
  setResult: (gcode: string, moves: GMove[], stats: JobStats) => void;
  invalidateResult: () => void;
  setEditedGCode: (gcode: string) => void;

  getParams: () => MachineParams;
  getLimits: () => TableLimits;
}

const STORAGE_KEY = "gcode-uretici.settings";

type PersistedState = Pick<
  MachineState,
  | "safeZ"
  | "drawZ"
  | "feedRate"
  | "travelRate"
  | "tolerance"
  | "penDiameterMm"
  | "maxX"
  | "maxY"
  | "mode"
  | "text"
  | "fontSizeMm"
  | "fontId"
  | "layout"
  | "svgText"
  | "svgFileName"
>;

const DEFAULT_LAYOUT: LabelLayout = {
  frameStyle: "none",
  framePaddingMm: null,
  lineSpacing: 1.4,
  blockGapMm: null,
  copyRows: 1,
  copyCols: 1,
};

const FRAME_STYLES: FrameStyle[] = ["none", "rect", "rounded", "dashed"];

/** Coerce an unknown persisted value into a valid LabelLayout. */
function sanitizeLayout(raw: unknown): LabelLayout {
  if (!raw || typeof raw !== "object") return DEFAULT_LAYOUT;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const numOrNull = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    frameStyle: FRAME_STYLES.includes(r.frameStyle as FrameStyle)
      ? (r.frameStyle as FrameStyle)
      : DEFAULT_LAYOUT.frameStyle,
    framePaddingMm: r.framePaddingMm === null ? null : numOrNull(r.framePaddingMm),
    lineSpacing: num(r.lineSpacing, DEFAULT_LAYOUT.lineSpacing),
    blockGapMm: r.blockGapMm === null ? null : numOrNull(r.blockGapMm),
    copyRows: Math.max(1, Math.floor(num(r.copyRows, 1))),
    copyCols: Math.max(1, Math.floor(num(r.copyCols, 1))),
  };
}

function loadPersistedState(): Partial<PersistedState> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    return {
      safeZ: typeof parsed.safeZ === "number" ? parsed.safeZ : undefined,
      drawZ: typeof parsed.drawZ === "number" ? parsed.drawZ : undefined,
      feedRate: typeof parsed.feedRate === "number" ? parsed.feedRate : undefined,
      travelRate:
        typeof parsed.travelRate === "number" ? parsed.travelRate : undefined,
      tolerance:
        typeof parsed.tolerance === "number" ? parsed.tolerance : undefined,
      penDiameterMm:
        typeof parsed.penDiameterMm === "number"
          ? parsed.penDiameterMm
          : undefined,
      maxX: typeof parsed.maxX === "number" ? parsed.maxX : undefined,
      maxY: typeof parsed.maxY === "number" ? parsed.maxY : undefined,
      mode: parsed.mode === "svg" ? "svg" : "text",
      text: typeof parsed.text === "string" ? parsed.text : undefined,
      fontSizeMm:
        typeof parsed.fontSizeMm === "number" ? parsed.fontSizeMm : undefined,
      fontId:
        typeof parsed.fontId === "string" ? (parsed.fontId as any) : undefined,
      // Always return a valid layout: an older saved payload has no `layout`
      // key, and returning `undefined` here would overwrite DEFAULT_LAYOUT in
      // the store spread and crash every `s.layout.*` read (white screen).
      layout: sanitizeLayout(parsed.layout),
      svgText:
        typeof parsed.svgText === "string" ? parsed.svgText : undefined,
      svgFileName:
        typeof parsed.svgFileName === "string"
          ? parsed.svgFileName
          : undefined,
    };
  } catch {
    return {};
  }
}

function getPersistedState(state: MachineState): PersistedState {
  return {
    safeZ: state.safeZ,
    drawZ: state.drawZ,
    feedRate: state.feedRate,
    travelRate: state.travelRate,
    tolerance: state.tolerance,
    penDiameterMm: state.penDiameterMm,
    maxX: state.maxX,
    maxY: state.maxY,
    mode: state.mode,
    text: state.text,
    fontSizeMm: state.fontSizeMm,
    fontId: state.fontId,
    layout: state.layout,
    svgText: state.svgText,
    svgFileName: state.svgFileName,
  };
}

function savePersistedState(state: MachineState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(getPersistedState(state)),
    );
  } catch {
    // Ignore storage errors (private mode, quota exceeded, etc.).
  }
}

const persistedSettings = loadPersistedState();

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
  editedGCode: null;
} {
  const hadResult = s.gcode !== null;
  return {
    gcode: null,
    moves: [],
    stats: null,
    status: hadResult ? "stale" : "idle",
    error: null,
    stale: hadResult,
    editedGCode: null,
  };
}

export const useMachineStore = create<MachineState>((set, get) => ({
  ...{
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
    layout: DEFAULT_LAYOUT,

    // SVG defaults.
    svgText: null,
    svgFileName: null,

    gcode: null,
    moves: [],
    stats: null,

    status: "idle",
    error: null,
    stale: false,
    editedGCode: null,
  },
  ...persistedSettings,
  // Guard: a persisted payload must never leave `layout` undefined (every
  // `s.layout.*` read would throw). `sanitizeLayout` already enforces this, but
  // we re-assert it here so the store is robust to any future persistence bug.
  layout: persistedSettings.layout ?? DEFAULT_LAYOUT,

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
      editedGCode: null,
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

  // Frame/spacing/copies all change the geometry, so a layout change must
  // invalidate the result exactly like a font or size change does.
  setLayout: (patch) =>
    set((s) => ({ layout: { ...s.layout, ...patch }, ...invalidate(s) })),

  setSvg: (svgFileName, svgText) =>
    set((s) => ({ svgFileName, svgText, ...invalidate(s) })),

  clearSvg: () =>
    set((s) => ({ svgFileName: null, svgText: null, ...invalidate(s) })),

  setStatus: (status) => set({ status }),

  setError: (message) =>
    set({ error: message, status: message ? "error" : "idle" }),

  setResult: (gcode, moves, stats) =>
    set({ gcode, moves, stats, status: "ready", error: null, stale: false, editedGCode: null }),

  invalidateResult: () =>
    set({ gcode: null, moves: [], stats: null, status: "idle", stale: false }),

  setEditedGCode: (editedGCode) => set({ editedGCode }),

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

useMachineStore.subscribe((state) => {
  savePersistedState(state);
});

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
