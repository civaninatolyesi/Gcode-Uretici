/**
 * Text -> flat polylines, on the MAIN THREAD, using opentype.js.
 *
 * opentype.js turns a string into glyph outlines (a Path made of moveTo /
 * lineTo / quadraticCurveTo / curveTo / close commands). We flatten every
 * curve into line segments at the requested tolerance, normalize the geometry
 * so it sits with its bottom-left corner at the machine origin (0,0) and with
 * Y pointing up (font space is Y-up already, but the baseline puts most of the
 * glyph above y=0 and descenders below — we shift so the lowest drawn point is
 * exactly y=0). The resulting plain-number polylines feed the same worker
 * pipeline the SVG flow used.
 */

// opentype.js v2 ships as an ES module with named exports (no default export),
// so we import the namespace. This also exposes the `opentype.Font` type.
import * as opentype from "opentype.js";
import type { Point, Polyline } from "./types";

const FONT_URL = `${import.meta.env.BASE_URL}fonts/Roboto-Regular.ttf`;

let fontPromise: Promise<opentype.Font> | null = null;

/** Load (and cache) the bundled default font. */
export function loadFont(): Promise<opentype.Font> {
  if (!fontPromise) {
    fontPromise = fetch(FONT_URL)
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            `Yazı tipi yüklenemedi (HTTP ${res.status}). public/fonts/Roboto-Regular.ttf mevcut mu?`,
          );
        }
        return res.arrayBuffer();
      })
      .then((buf) => opentype.parse(buf))
      .catch((err) => {
        // Reset so a later attempt can retry after a transient failure.
        fontPromise = null;
        throw err instanceof Error
          ? err
          : new Error("Yazı tipi ayrıştırılamadı.");
      });
  }
  return fontPromise;
}

function isFiniteNum(n: number): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

/** Adaptive flatten of a quadratic Bézier into points (start excluded). */
function flattenQuadratic(
  p0: Point,
  c: Point,
  p1: Point,
  tolerance: number,
  out: Polyline,
): void {
  // Estimate segment count from the control-polygon length.
  const approxLen =
    Math.hypot(c.x - p0.x, c.y - p0.y) + Math.hypot(p1.x - c.x, p1.y - c.y);
  const steps = Math.max(2, Math.ceil(approxLen / Math.max(tolerance, 0.01)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x;
    const y = mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y;
    out.push({ x, y });
  }
}

/** Adaptive flatten of a cubic Bézier into points (start excluded). */
function flattenCubic(
  p0: Point,
  c1: Point,
  c2: Point,
  p1: Point,
  tolerance: number,
  out: Polyline,
): void {
  const approxLen =
    Math.hypot(c1.x - p0.x, c1.y - p0.y) +
    Math.hypot(c2.x - c1.x, c2.y - c1.y) +
    Math.hypot(p1.x - c2.x, p1.y - c2.y);
  const steps = Math.max(2, Math.ceil(approxLen / Math.max(tolerance, 0.01)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x =
      mt * mt * mt * p0.x +
      3 * mt * mt * t * c1.x +
      3 * mt * t * t * c2.x +
      t * t * t * p1.x;
    const y =
      mt * mt * mt * p0.y +
      3 * mt * mt * t * c1.y +
      3 * mt * t * t * c2.y +
      t * t * t * p1.y;
    out.push({ x, y });
  }
}

export interface TextLayoutResult {
  polylines: Polyline[];
}

export interface TextOptions {
  text: string;
  /** Cap/em height target in mm. */
  fontSizeMm: number;
  /** Flatten tolerance in mm. */
  tolerance: number;
}

/**
 * Convert text into normalized polylines (mm, Y-up, bottom-left at origin).
 */
export function textToPolylines(
  font: opentype.Font,
  opts: TextOptions,
): TextLayoutResult {
  const text = opts.text;
  if (!text.trim()) {
    throw new Error("Lütfen metin girin.");
  }
  if (!isFiniteNum(opts.fontSizeMm) || opts.fontSizeMm <= 0) {
    throw new Error("Yazı boyutu 0'dan büyük olmalıdır.");
  }

  // opentype works in font units; getPath(text, x, y, fontSize) returns a Path
  // already scaled to the given pixel/unit size with Y pointing DOWN (screen
  // convention). We request fontSize == fontSizeMm so 1 unit == 1 mm, then flip
  // Y afterwards. Baseline is at y=0 in opentype's path output.
  const path = font.getPath(text, 0, 0, opts.fontSizeMm);

  const polylines: Polyline[] = [];
  let current: Polyline = [];
  let start: Point = { x: 0, y: 0 };
  let pen: Point = { x: 0, y: 0 };

  const pushCurrent = () => {
    if (current.length >= 1) polylines.push(current);
    current = [];
  };

  for (const cmd of path.commands) {
    switch (cmd.type) {
      case "M": {
        pushCurrent();
        start = { x: cmd.x, y: cmd.y };
        pen = { x: cmd.x, y: cmd.y };
        current = [{ x: pen.x, y: pen.y }];
        break;
      }
      case "L": {
        pen = { x: cmd.x, y: cmd.y };
        current.push({ x: pen.x, y: pen.y });
        break;
      }
      case "Q": {
        const p1 = { x: cmd.x, y: cmd.y };
        const c = { x: cmd.x1, y: cmd.y1 };
        flattenQuadratic(pen, c, p1, opts.tolerance, current);
        pen = p1;
        break;
      }
      case "C": {
        const p1 = { x: cmd.x, y: cmd.y };
        const c1 = { x: cmd.x1, y: cmd.y1 };
        const c2 = { x: cmd.x2, y: cmd.y2 };
        flattenCubic(pen, c1, c2, p1, opts.tolerance, current);
        pen = p1;
        break;
      }
      case "Z": {
        // Close back to the contour start.
        if (current.length >= 1) {
          current.push({ x: start.x, y: start.y });
        }
        pushCurrent();
        pen = { x: start.x, y: start.y };
        break;
      }
      default:
        break;
    }
  }
  pushCurrent();

  // Filter non-finite points and drop degenerate contours.
  const cleaned = polylines
    .map((pl) => pl.filter((p) => isFiniteNum(p.x) && isFiniteNum(p.y)))
    .filter((pl) => pl.length >= 1);

  if (cleaned.length === 0) {
    throw new Error("Bu metin için çizilebilir bir şekil üretilemedi.");
  }

  // Flip Y (font/path space is Y-down) and shift bounding box to origin (0,0).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pl of cleaned) {
    for (const p of pl) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const height = maxY - minY;

  const normalized: Polyline[] = cleaned.map((pl) =>
    pl.map((p) => ({
      x: p.x - minX,
      y: height - (p.y - minY),
    })),
  );

  return { polylines: normalized };
}
