/**
 * Label composition layer (MAIN THREAD).
 *
 * The font providers (see `src/fonts/`) only know how to turn a SINGLE piece of
 * text into normalized polylines (mm, Y-up, bottom-left at (0,0)). This module
 * sits on top of them and builds the full label the operator asked for:
 *
 *   1. Multi-line — pressing Enter starts a new line, drawn BELOW the previous
 *      one on the table (line spacing scales with the font size).
 *   2. Multiple labels — a blank line (two Enters) splits the text into separate
 *      label blocks, each laid out as its own framed unit.
 *   3. Grid copies — the whole label set can be repeated rows × columns across
 *      the table for batch production.
 *   4. Frame — an optional border (rectangle / rounded / dashed) is drawn around
 *      each block so it can be cut out with scissors.
 *
 * The output keeps the exact same contract every other source obeys: plain
 * polylines, mm, Y-up, bottom-left corner at (0,0). So the worker pipeline is
 * untouched — composition is purely a main-thread geometry concern.
 */

import { getFont, type FontId, type FontTextOptions } from "./fonts";
import { normalizeToOrigin } from "./textToPaths";
import type { LabelLayout, Polyline } from "./types";

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/** Bounding box of a set of polylines; throws if there is nothing finite. */
function bboxOf(polylines: Polyline[]): Bbox {
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
    throw new Error("Bu metin için çizilebilir bir şekil üretilemedi.");
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Return a copy of `polylines` shifted by (dx, dy). */
function translate(polylines: Polyline[], dx: number, dy: number): Polyline[] {
  return polylines.map((pl) => pl.map((p) => ({ x: p.x + dx, y: p.y + dy })));
}

/**
 * Split the raw textarea value into label BLOCKS, each block a list of its
 * (non-empty) text LINES. A blank line (or a run of them) separates blocks. We
 * trim trailing whitespace per line but keep the user's character content.
 */
export function splitIntoBlocks(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/u, "");
    if (line.trim() === "") {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/** Build a rectangular frame polyline (optionally rounded / dashed). */
function buildFrame(
  bbox: Bbox,
  pad: number,
  style: LabelLayout["frameStyle"],
): Polyline[] {
  if (style === "none") return [];

  const x0 = bbox.minX - pad;
  const y0 = bbox.minY - pad;
  const x1 = bbox.maxX + pad;
  const y1 = bbox.maxY + pad;
  const w = x1 - x0;
  const h = y1 - y0;
  if (!(w > 0) || !(h > 0)) return [];

  if (style === "rounded") {
    // Corner radius: a fraction of the shorter side, capped so it never
    // overlaps itself on a small/narrow label.
    const r = Math.min(Math.min(w, h) * 0.18, pad * 2 || Math.min(w, h) * 0.18);
    const steps = 8; // points per 90° arc — smooth enough at label scale
    const pts: Polyline = [];
    // Corner centers (counter-clockwise from bottom-left), each with its arc
    // sweeping the matching 90°.
    const corners: { cx: number; cy: number; start: number }[] = [
      { cx: x0 + r, cy: y0 + r, start: Math.PI }, // bottom-left
      { cx: x1 - r, cy: y0 + r, start: 1.5 * Math.PI }, // bottom-right
      { cx: x1 - r, cy: y1 - r, start: 0 }, // top-right
      { cx: x0 + r, cy: y1 - r, start: 0.5 * Math.PI }, // top-left
    ];
    for (const c of corners) {
      for (let i = 0; i <= steps; i++) {
        const a = c.start + (i / steps) * (Math.PI / 2);
        pts.push({ x: c.cx + r * Math.cos(a), y: c.cy + r * Math.sin(a) });
      }
    }
    pts.push({ ...pts[0] }); // close
    return [pts];
  }

  // Sharp rectangle, as a single closed polyline.
  const rect: Polyline = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ];

  if (style === "dashed") {
    // Break each edge into on/off dash segments. Dash length scales with the
    // perimeter so it looks consistent on any label size.
    const dash = Math.max(2, Math.min(w, h) * 0.06);
    const out: Polyline[] = [];
    for (let i = 0; i < rect.length - 1; i++) {
      const a = rect[i];
      const b = rect[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      let d = 0;
      let on = true;
      while (d < len) {
        const seg = Math.min(dash, len - d);
        if (on) {
          out.push([
            { x: a.x + ux * d, y: a.y + uy * d },
            { x: a.x + ux * (d + seg), y: a.y + uy * (d + seg) },
          ]);
        }
        d += seg;
        on = !on;
      }
    }
    return out;
  }

  return [rect];
}

/**
 * Render one label block (its lines already split) into normalized polylines,
 * stacked top-to-bottom with the requested line spacing, then framed. The
 * result sits with its bottom-left corner at (0,0).
 */
async function buildBlock(
  fontId: FontId,
  lines: string[],
  baseOpts: Omit<FontTextOptions, "text">,
  layout: LabelLayout,
): Promise<Polyline[]> {
  const font = getFont(fontId);
  const fontSize = baseOpts.fontSizeMm;
  // Vertical step from one baseline to the next.
  const step = fontSize * Math.max(0.5, layout.lineSpacing);

  // Render each line independently (each already normalized to its own (0,0)),
  // then stack downward: first line on top, later lines below it.
  const rendered: { polylines: Polyline[]; box: Bbox }[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const polylines = await font.toPolylines({ ...baseOpts, text: line });
    rendered.push({ polylines, box: bboxOf(polylines) });
  }
  if (rendered.length === 0) {
    throw new Error("Bu metin için çizilebilir bir şekil üretilemedi.");
  }

  // Find the max line width for center/right alignment.
  const maxWidth = Math.max(...rendered.map((r) => r.box.width));

  const placed: Polyline[] = [];
  let topY = 0; // y of the current line's TOP; we walk downward (negative).
  for (const { polylines, box } of rendered) {
    const dy = topY - box.height;
    const align = layout.textAlign ?? "left";
    let xShift = -box.minX;
    if (align === "center") xShift += (maxWidth - box.width) / 2;
    else if (align === "right") xShift += maxWidth - box.width;
    placed.push(...translate(polylines, xShift, dy));
    topY = dy - (step - box.height);
  }

  // Frame the whole stacked block.
  const textBox = bboxOf(placed);
  const pad =
    layout.framePaddingMm != null
      ? Math.max(0, layout.framePaddingMm)
      : fontSize * 0.4; // automatic: 40% of the font size
  const frame = buildFrame(textBox, pad, layout.frameStyle);

  return normalizeToOrigin([...placed, ...frame], false);
}

/**
 * Arrange already-normalized units (blocks or grid cells) into a row × column
 * grid with a uniform gap, all left/bottom aligned, returning one normalized
 * polyline set. Used both to stack label blocks and to tile grid copies.
 */
function arrangeGrid(
  units: Polyline[][],
  rows: number,
  cols: number,
  gap: number,
): Polyline[] {
  const boxes = units.map(bboxOf);
  const cellW = Math.max(...boxes.map((b) => b.width));
  const cellH = Math.max(...boxes.map((b) => b.height));

  const out: Polyline[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) % units.length;
      const unit = units[idx];
      const box = boxes[idx];
      // Column advances in +X; rows advance DOWNWARD, so the first row sits on
      // top. We normalize the final result anyway, so absolute sign is fine.
      const dx = c * (cellW + gap) - box.minX;
      const dy = -r * (cellH + gap) - box.minY;
      out.push(...translate(unit, dx, dy));
    }
  }
  return out;
}

export interface LayoutTextOptions {
  text: string;
  fontId: FontId;
  fontSizeMm: number;
  tolerance: number;
  layout: LabelLayout;
}

/**
 * Top-level entry: text + layout -> normalized polylines (mm, Y-up, (0,0)),
 * ready for the worker. Handles multi-line, multi-block and grid copies.
 */
export async function layoutTextToPolylines(
  opts: LayoutTextOptions,
): Promise<Polyline[]> {
  const { text, fontId, fontSizeMm, tolerance, layout } = opts;
  if (!text.trim()) {
    throw new Error("Lütfen metin girin.");
  }

  const gap =
    layout.blockGapMm != null
      ? Math.max(0, layout.blockGapMm)
      : fontSizeMm * 0.6; // automatic: 60% of the font size

  // 1) Build each label block (multi-line + frame), stacked vertically.
  const blocks: Polyline[][] = [];
  for (const lines of splitIntoBlocks(text)) {
    blocks.push(
      await buildBlock(fontId, lines, { fontSizeMm, tolerance }, layout),
    );
  }
  if (blocks.length === 0) {
    throw new Error("Bu metin için çizilebilir bir şekil üretilemedi.");
  }

  // The "label set" = all blocks stacked in a single column.
  const labelSet =
    blocks.length === 1
      ? blocks[0]
      : arrangeGrid(blocks, blocks.length, 1, gap);

  // 2) Tile the whole set as a rows × cols grid of copies.
  const rows = Math.max(1, Math.floor(layout.copyRows) || 1);
  const cols = Math.max(1, Math.floor(layout.copyCols) || 1);
  const tiled =
    rows === 1 && cols === 1
      ? labelSet
      : arrangeGrid([labelSet], rows, cols, gap);

  const normalized = normalizeToOrigin(tiled, false);

  // 3) Apply independent axis stretch (1.0 = no change). The stretch is applied
  //    after normalization so (0,0) stays at the machine origin and the scale
  //    is a simple coordinate multiply.
  const sx = Math.max(0.01, layout.stretchX ?? 1);
  const sy = Math.max(0.01, layout.stretchY ?? 1);
  const stretched =
    sx === 1 && sy === 1
      ? normalized
      : normalized.map((pl) => pl.map((p) => ({ x: p.x * sx, y: p.y * sy })));

  // 4) Apply rotation around the centroid, then re-normalize to (0,0).
  const deg = layout.rotationDeg ?? 0;
  if (deg === 0) return stretched;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotated = stretched.map((pl) =>
    pl.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos })),
  );
  return normalizeToOrigin(rotated, false);
}
