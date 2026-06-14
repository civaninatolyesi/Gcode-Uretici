/// <reference lib="webworker" />
/**
 * Dedicated Web Worker — pure computation, no DOM.
 *
 * Responsibilities:
 *   1. Receive flattened polylines (plain numbers) + machine params.
 *   2. Order paths with a greedy Nearest-Neighbor heuristic to cut air travel.
 *   3. Emit safe, strictly-formatted G-code, plus a parsed move list for the
 *      visualizer and some stats.
 *
 * Safety guarantees baked in here:
 *   - Every coordinate is validated; a non-finite number aborts generation
 *     rather than silently emitting "G1 X NaN".
 *   - Z always starts at Safe Z before any X/Y motion.
 *   - Every path retracts to Safe Z the instant it finishes.
 */

import type {
  BoundingBox,
  GenerateRequest,
  GMove,
  JobStats,
  MachineParams,
  Point,
  Polyline,
  WorkerResponse,
} from "./types";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function assertFinite(n: number, label: string): number {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(`Geçersiz sayısal değer (${label}): ${String(n)}`);
  }
  return n;
}

function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Drop consecutive duplicate points and empty polylines. */
function cleanPolylines(polylines: Polyline[]): Polyline[] {
  const out: Polyline[] = [];
  for (const pl of polylines) {
    const filtered: Polyline = [];
    for (const p of pl) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const last = filtered[filtered.length - 1];
      if (last && last.x === p.x && last.y === p.y) continue;
      filtered.push({ x: p.x, y: p.y });
    }
    if (filtered.length >= 1) out.push(filtered);
  }
  return out;
}

/**
 * Greedy Nearest-Neighbor ordering.
 *
 * Starting at the machine origin (0,0), repeatedly choose the unvisited
 * polyline whose *closest endpoint* (head OR tail) is nearest to the current
 * tool position. If the tail is closer, the polyline is reversed so we always
 * plunge at the near end and exit at the far end. The current position then
 * advances to that exit point. Classic O(n²) heuristic — ideal for plotting.
 */
function nearestNeighborOrder(polylines: Polyline[]): Polyline[] {
  const remaining = polylines.slice();
  const ordered: Polyline[] = [];
  let current: Point = { x: 0, y: 0 };

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDist = Infinity;
    let bestReversed = false;

    for (let i = 0; i < remaining.length; i++) {
      const pl = remaining[i];
      const head = pl[0];
      const tail = pl[pl.length - 1];

      const dHead = dist2(current, head);
      if (dHead < bestDist) {
        bestDist = dHead;
        bestIndex = i;
        bestReversed = false;
      }
      const dTail = dist2(current, tail);
      if (dTail < bestDist) {
        bestDist = dTail;
        bestIndex = i;
        bestReversed = true;
      }
    }

    const chosen = remaining.splice(bestIndex, 1)[0];
    const finalPl = bestReversed ? chosen.slice().reverse() : chosen;
    ordered.push(finalPl);
    current = finalPl[finalPl.length - 1];
  }

  return ordered;
}

/** Format a number for G-code: fixed 3 decimals, no negative zero. */
function fmt(n: number): string {
  const v = Object.is(n, -0) ? 0 : n;
  return v.toFixed(3);
}

interface GenerationOutput {
  gcode: string;
  moves: GMove[];
  stats: JobStats;
}

/** Axis-aligned bounding box over all polyline points (in mm). */
function computeBoundingBox(polylines: Polyline[]): BoundingBox {
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
  if (!Number.isFinite(minX)) {
    return { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function generateGcode(
  rawPolylines: Polyline[],
  params: MachineParams,
): GenerationOutput {
  const safeZ = assertFinite(params.safeZ, "Güvenli Z");
  const drawZ = assertFinite(params.drawZ, "Çizim Z");
  const feedRate = assertFinite(params.feedRate, "Kesim Hızı");
  const travelRate = assertFinite(params.travelRate, "Boşta Gezinme Hızı");

  if (feedRate <= 0) throw new Error("Kesim Hızı 0'dan büyük olmalıdır.");
  if (travelRate <= 0)
    throw new Error("Boşta Gezinme Hızı 0'dan büyük olmalıdır.");
  if (safeZ <= drawZ)
    throw new Error("Güvenli Z, Çizim Z'den büyük olmalıdır (çarpışma riski).");

  const cleaned = cleanPolylines(rawPolylines);
  if (cleaned.length === 0) {
    throw new Error("Üretilecek geçerli yol bulunamadı.");
  }
  // Bounding box is computed on the geometry as-is (already normalized to start
  // at the origin by the producer), so it reflects true occupied dimensions.
  const bbox = computeBoundingBox(cleaned);
  const polylines = nearestNeighborOrder(cleaned);

  const lines: string[] = [];
  const moves: GMove[] = [];

  // --- Header ---
  lines.push("; Etiket Makinesi -> G-Code | Üretildi: " + new Date().toISOString());
  lines.push("G21 ; Milimetre");
  lines.push("G90 ; Mutlak konumlandirma");

  // --- Start sequence: ALWAYS retract to Safe Z before any X/Y move ---
  lines.push(`G0 Z${fmt(safeZ)} ; Baslangic: guvenli yukseklige cik`);
  moves.push({ rapid: true, x: 0, y: 0, zOnly: true });

  let cutDistance = 0;
  let travelDistance = 0;
  let cur: Point = { x: 0, y: 0 };

  for (let pIdx = 0; pIdx < polylines.length; pIdx++) {
    const pl = polylines[pIdx];
    const start = pl[0];

    assertFinite(start.x, "yol baslangic X");
    assertFinite(start.y, "yol baslangic Y");

    lines.push(`; --- Yol ${pIdx + 1}/${polylines.length} ---`);

    // a. Rapid to the start of the segment (at safe Z).
    lines.push(`G0 X${fmt(start.x)} Y${fmt(start.y)} F${fmt(travelRate)}`);
    travelDistance += Math.hypot(start.x - cur.x, start.y - cur.y);
    moves.push({ rapid: true, x: start.x, y: start.y, zOnly: false });
    cur = { x: start.x, y: start.y };

    // b. Plunge to draw Z at feed rate.
    lines.push(`G1 Z${fmt(drawZ)} F${fmt(feedRate)} ; Dalis`);
    moves.push({ rapid: false, x: cur.x, y: cur.y, zOnly: true });

    // c. Drawing moves.
    for (let i = 1; i < pl.length; i++) {
      const p = pl[i];
      assertFinite(p.x, "cizim X");
      assertFinite(p.y, "cizim Y");
      lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)}`);
      cutDistance += Math.hypot(p.x - cur.x, p.y - cur.y);
      moves.push({ rapid: false, x: p.x, y: p.y, zOnly: false });
      cur = { x: p.x, y: p.y };
    }

    // d. Retract immediately when the path is finished.
    lines.push(`G0 Z${fmt(safeZ)} ; Geri cekil`);
    moves.push({ rapid: true, x: cur.x, y: cur.y, zOnly: true });
  }

  // --- Footer ---
  lines.push("; --- Bitis ---");
  lines.push(`G0 Z${fmt(safeZ)} ; Guvenli yukseklik`);
  lines.push(`G0 X0.000 Y0.000 F${fmt(travelRate)} ; Sifir noktasina don`);
  travelDistance += Math.hypot(cur.x, cur.y);
  moves.push({ rapid: true, x: 0, y: 0, zOnly: false });
  lines.push("M30 ; Program sonu");

  return {
    gcode: lines.join("\n") + "\n",
    moves,
    stats: {
      pathCount: polylines.length,
      travelDistance,
      cutDistance,
      bbox,
    },
  };
}

ctx.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const data = e.data;
  if (!data || data.type !== "generate") return;

  try {
    const { gcode, moves, stats } = generateGcode(data.polylines, data.params);
    const res: WorkerResponse = { type: "result", gcode, moves, stats };
    ctx.postMessage(res);
  } catch (err) {
    const res: WorkerResponse = {
      type: "error",
      message: err instanceof Error ? err.message : "Bilinmeyen hata.",
    };
    ctx.postMessage(res);
  }
};
