/**
 * Shared, fully-serializable types passed between the main thread and the worker.
 * No DOM references live here — only plain numbers — so everything posts cleanly
 * through structured clone and can never carry a NaN into the worker unnoticed.
 */

export interface Point {
  x: number;
  y: number;
}

/** A flattened, open or closed sequence of points (already in mm, Y-up corrected). */
export type Polyline = Point[];

/** CNC parameters that drive G-code generation. */
export interface MachineParams {
  safeZ: number;
  drawZ: number;
  feedRate: number;
  travelRate: number;
  tolerance: number;
}

/** Message: main thread -> worker. */
export interface GenerateRequest {
  type: "generate";
  polylines: Polyline[];
  params: MachineParams;
}

/** A single parsed motion command, used by the visualizer. */
export interface GMove {
  /** 0 = rapid (G0), 1 = feed (G1) */
  rapid: boolean;
  x: number;
  y: number;
  /** true when this move only changes Z (a plunge/retract) — not drawn in 2D. */
  zOnly: boolean;
}

/** Message: worker -> main thread. */
export type WorkerResponse =
  | {
      type: "result";
      gcode: string;
      moves: GMove[];
      stats: {
        pathCount: number;
        travelDistance: number;
        cutDistance: number;
      };
    }
  | {
      type: "error";
      message: string;
    };
