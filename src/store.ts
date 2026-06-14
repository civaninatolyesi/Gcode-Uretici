/**
 * Global state (Zustand).
 *
 * useMachineStore holds the CNC parameters and the current job state
 * (loaded SVG, generated G-code, parsed moves, stats, status, errors).
 *
 * Parameter setters accept the raw string from the inputs and coerce safely:
 * empty / non-numeric input is stored as NaN in a transient field but the
 * worker request guards against NaN, and the UI surfaces invalid fields.
 */

import { create } from "zustand";
import type { GMove, MachineParams } from "./types";

export type JobStatus = "idle" | "parsing" | "generating" | "ready" | "error";

interface JobStats {
  pathCount: number;
  travelDistance: number;
  cutDistance: number;
}

interface MachineState extends MachineParams {
  // Loaded source.
  fileName: string | null;
  svgText: string | null;

  // Results.
  gcode: string | null;
  moves: GMove[];
  stats: JobStats | null;

  status: JobStatus;
  error: string | null;

  // Param setters (number).
  setParam: (key: keyof MachineParams, value: number) => void;

  // Job lifecycle.
  setFile: (name: string, text: string) => void;
  clearFile: () => void;
  setStatus: (status: JobStatus) => void;
  setError: (message: string | null) => void;
  setResult: (gcode: string, moves: GMove[], stats: JobStats) => void;

  getParams: () => MachineParams;
}

export const useMachineStore = create<MachineState>((set, get) => ({
  // Defaults from the spec.
  safeZ: 5,
  drawZ: 0,
  feedRate: 1000,
  travelRate: 2000,
  tolerance: 0.1,

  fileName: null,
  svgText: null,

  gcode: null,
  moves: [],
  stats: null,

  status: "idle",
  error: null,

  setParam: (key, value) => set({ [key]: value } as Partial<MachineState>),

  setFile: (name, text) =>
    set({
      fileName: name,
      svgText: text,
      gcode: null,
      moves: [],
      stats: null,
      status: "idle",
      error: null,
    }),

  clearFile: () =>
    set({
      fileName: null,
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
}));
