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
  /**
   * Physical pen/tool tip diameter in mm. Does NOT change the G-code (the
   * toolpath is the centerline either way); it is an advanced hint used only to
   * draw the stroke at its true width in the simulation, so the operator can see
   * how thick the real line will be. Default 0 = hairline preview.
   */
  penDiameterMm: number;
}

/** Physical workspace (table) limits in mm. */
export interface TableLimits {
  maxX: number;
  maxY: number;
}

/**
 * Frame (border) drawn around a label so the operator can cut it out with
 * scissors. "none" disables the frame entirely; the other styles control how
 * the rectangle is drawn.
 */
export type FrameStyle = "none" | "rect" | "rounded" | "dashed";

/**
 * How a label's text is laid out and (optionally) framed and repeated across
 * the table. This describes the COMPOSITION around the per-glyph geometry the
 * font providers produce; it never touches CNC parameters or table limits.
 */
export interface LabelLayout {
  /** Border style drawn around EACH label block. */
  frameStyle: FrameStyle;
  /**
   * Gap between the text and its frame, in mm. `null` = automatic (derived from
   * the font size); a number overrides it explicitly.
   */
  framePaddingMm: number | null;
  /**
   * Vertical line spacing as a multiple of the font size (1 = lines touch,
   * 1.4 = comfortable). Applies within a single label block.
   */
  lineSpacing: number;
  /**
   * Gap between separate label blocks (and between grid copies), in mm.
   * `null` = automatic (derived from the font size); a number overrides it.
   */
  blockGapMm: number | null;
  /** How many copies of the whole label set, laid out as rows × columns. */
  copyRows: number;
  copyCols: number;
  /**
   * Independent axis stretch factors (1.0 = no change, 2.0 = double).
   * Applied to the final polyline set before it reaches the worker, so
   * they affect the physical G-code dimensions without touching font metrics.
   */
  stretchX: number;
  stretchY: number;
}

/** Axis-aligned bounding box of generated geometry, in mm. */
export interface BoundingBox {
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Statistics returned alongside generated G-code. */
export interface JobStats {
  pathCount: number;
  travelDistance: number;
  cutDistance: number;
  bbox: BoundingBox;
}

/** Message: main thread -> worker. */
export interface GenerateRequest {
  type: "generate";
  polylines: Polyline[];
  params: MachineParams;
}

/** A single parsed motion command, used by the visualizer. */
export interface GMove {
  /** true = rapid (G0), false = feed (G1) */
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
      stats: JobStats;
    }
  | {
      type: "error";
      message: string;
    };
