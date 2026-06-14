/**
 * SVG -> flat polylines, on the MAIN THREAD.
 *
 * Why on the main thread: we lean on the browser's own SVG geometry engine
 * (getTotalLength / getPointAtLength) to sample EVERY shape — paths, arcs,
 * beziers, circles, rects, polygons, lines — into points. This is the most
 * robust approach: zero hand-written curve/arc math, so no rounding or NaN
 * bugs creep into the geometry. The shapes are temporarily mounted off-screen,
 * normalized to <path> geometry, sampled, and removed. The resulting numeric
 * polylines are then shipped to the worker for the heavy CPU work.
 */

import type { Point, Polyline } from "./types";

const SVG_NS = "http://www.w3.org/2000/svg";

function isFiniteNum(n: number): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

/** Convert any supported SVG element into one or more <path> d-strings. */
function elementToPathDefs(el: Element): string[] {
  const tag = el.tagName.toLowerCase();
  const num = (name: string, fallback = 0): number => {
    const v = parseFloat(el.getAttribute(name) ?? "");
    return isFiniteNum(v) ? v : fallback;
  };

  switch (tag) {
    case "path": {
      const d = el.getAttribute("d");
      return d ? [d] : [];
    }
    case "line": {
      return [`M ${num("x1")} ${num("y1")} L ${num("x2")} ${num("y2")}`];
    }
    case "rect": {
      const x = num("x");
      const y = num("y");
      const w = num("width");
      const h = num("height");
      if (w <= 0 || h <= 0) return [];
      return [`M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`];
    }
    case "circle": {
      const cx = num("cx");
      const cy = num("cy");
      const r = num("r");
      if (r <= 0) return [];
      // Two arcs make a full circle.
      return [
        `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`,
      ];
    }
    case "ellipse": {
      const cx = num("cx");
      const cy = num("cy");
      const rx = num("rx");
      const ry = num("ry");
      if (rx <= 0 || ry <= 0) return [];
      return [
        `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`,
      ];
    }
    case "polyline":
    case "polygon": {
      const raw = (el.getAttribute("points") ?? "").trim();
      if (!raw) return [];
      const nums = raw
        .split(/[\s,]+/)
        .map(Number)
        .filter(isFiniteNum);
      if (nums.length < 4) return [];
      let d = `M ${nums[0]} ${nums[1]}`;
      for (let i = 2; i + 1 < nums.length; i += 2) {
        d += ` L ${nums[i]} ${nums[i + 1]}`;
      }
      if (tag === "polygon") d += " Z";
      return [d];
    }
    default:
      return [];
  }
}

/**
 * Sample a single <path> element (already carrying the correct geometry +
 * inherited transform via the live SVG) into a polyline at the given tolerance.
 */
function samplePathElement(
  pathEl: SVGPathElement,
  tolerance: number,
): Polyline {
  let total = 0;
  try {
    total = pathEl.getTotalLength();
  } catch {
    return [];
  }
  if (!isFiniteNum(total) || total <= 0) {
    // Degenerate path (e.g. a single move). Try the start point only.
    try {
      const p = pathEl.getPointAtLength(0);
      return isFiniteNum(p.x) && isFiniteNum(p.y) ? [{ x: p.x, y: p.y }] : [];
    } catch {
      return [];
    }
  }

  const step = Math.max(tolerance, 0.001);
  const count = Math.max(2, Math.ceil(total / step));
  const pts: Polyline = [];

  for (let i = 0; i <= count; i++) {
    const dist = (i / count) * total;
    let p: DOMPoint;
    try {
      p = pathEl.getPointAtLength(dist);
    } catch {
      continue;
    }
    if (isFiniteNum(p.x) && isFiniteNum(p.y)) {
      pts.push({ x: p.x, y: p.y });
    }
  }
  return pts;
}

/** Apply a flattened CTM (matrix) to a point. */
function applyMatrix(m: DOMMatrix, pt: Point): Point {
  return {
    x: m.a * pt.x + m.c * pt.y + m.e,
    y: m.b * pt.x + m.d * pt.y + m.f,
  };
}

export interface FlattenResult {
  polylines: Polyline[];
  /** Bounding box of all geometry (in source SVG user units, pre Y-flip). */
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * Parse raw SVG text and return flattened polylines in machine space:
 *  - all transforms (including nested groups) baked in,
 *  - Y axis flipped so that "up" on screen = +Y on the machine,
 *  - geometry shifted so its bounding box starts at (0,0).
 */
export function flattenSvg(svgText: string, tolerance: number): FlattenResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("SVG dosyası ayrıştırılamadı (geçersiz XML).");
  }

  const srcSvg = doc.documentElement;
  if (srcSvg.tagName.toLowerCase() !== "svg") {
    throw new Error("Geçerli bir SVG kök elemanı bulunamadı.");
  }

  // Mount a working copy off-screen so the browser computes transforms & geometry.
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.left = "-100000px";
  host.style.top = "-100000px";
  host.style.width = "0";
  host.style.height = "0";
  host.style.overflow = "hidden";

  const liveSvg = document.importNode(srcSvg, true) as SVGSVGElement;
  host.appendChild(liveSvg);
  document.body.appendChild(host);

  const polylines: Polyline[] = [];

  try {
    const SHAPE_SELECTOR =
      "path, line, rect, circle, ellipse, polyline, polygon";
    const shapes = Array.from(liveSvg.querySelectorAll(SHAPE_SELECTOR));

    for (const shape of shapes) {
      const defs = elementToPathDefs(shape);
      if (defs.length === 0) continue;

      // Element's transform relative to the root SVG.
      let ctm: DOMMatrix | null = null;
      const graphical = shape as SVGGraphicsElement;
      if (typeof graphical.getCTM === "function") {
        ctm = graphical.getCTM();
      }

      for (const d of defs) {
        const tmp = document.createElementNS(SVG_NS, "path");
        tmp.setAttribute("d", d);
        // Insert as a sibling so it shares the same coordinate system as `shape`.
        shape.parentNode?.insertBefore(tmp, shape);

        const sampled = samplePathElement(tmp, tolerance);
        tmp.remove();

        if (sampled.length < 1) continue;

        const transformed =
          ctm && !isIdentity(ctm)
            ? sampled.map((p) => applyMatrix(ctm as DOMMatrix, p))
            : sampled;

        const clean = transformed.filter(
          (p) => isFiniteNum(p.x) && isFiniteNum(p.y),
        );
        if (clean.length >= 1) polylines.push(clean);
      }
    }
  } finally {
    host.remove();
  }

  if (polylines.length === 0) {
    throw new Error("SVG içinde çizilebilir bir şekil bulunamadı.");
  }

  // Compute bbox.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pl of polylines) {
    for (const p of pl) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  const height = maxY - minY;

  // Normalize: flip Y (SVG Y-down -> machine Y-up) and shift to origin (0,0).
  const normalized: Polyline[] = polylines.map((pl) =>
    pl.map((p) => ({
      x: p.x - minX,
      y: height - (p.y - minY),
    })),
  );

  return {
    polylines: normalized,
    bbox: { minX, minY, maxX, maxY },
  };
}

function isIdentity(m: DOMMatrix): boolean {
  return (
    m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0
  );
}
