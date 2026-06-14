/**
 * Hershey "simplex" single-stroke font data (public domain).
 *
 * Unlike a TrueType font (which describes the *outline* of each letter as a
 * closed contour), a Hershey font describes each glyph as the *centerline* — a
 * set of pen strokes that run THROUGH the middle of the letter. That is exactly
 * what a thick CNC pen needs: it traces the skeleton of the character once,
 * instead of tracing around its border twice. It also produces far less G-code.
 *
 * Encoding (kept deliberately tiny and self-contained — no runtime dependency):
 *   - Each glyph is `[advanceWidth, "stroke1 stroke2 ..."]`.
 *   - A stroke is a run of points separated by spaces; a point is "x,y".
 *   - Strokes within a glyph are separated by a literal "|".
 *   - Coordinates are in Hershey font units, Y pointing UP, baseline at y=0.
 *
 * Source: Dr. A. V. Hershey's vector font (1967), as digitized into the public
 * domain. We embed only the printable ASCII range (32..126).
 */

export interface HersheyGlyph {
  /** Horizontal advance to the next glyph, in font units. */
  advance: number;
  /** One polyline per pen-down stroke (font units, Y-up, baseline at 0). */
  strokes: number[][][];
}

/** Raw, compact glyph table. Parsed once into HersheyGlyph on first use. */
const RAW: Record<string, [number, string]> = {
  " ": [16, ""],
  "!": [10, "5,21 5,7|5,2 4,1 5,0 6,1 5,2"],
  '"': [16, "4,21 4,14|12,21 12,14"],
  "#": [21, "11,25 4,-7|17,25 10,-7|4,12 18,12|3,6 17,6"],
  "$": [20, "8,25 8,-4|12,25 12,-4|17,18 15,20 12,21 8,21 5,20 3,18 3,16 4,14 5,13 7,12 13,10 15,9 16,8 17,6 17,3 15,1 12,0 8,0 5,1 3,3"],
  "%": [24, "21,21 3,0|8,21 10,19 10,17 9,15 7,14 5,14 3,16 3,18 4,20 6,21 8,21 10,20 13,19 16,19 19,20 21,21|17,7 15,6 14,4 14,2 16,0 18,0 20,1 21,3 21,5 19,7 17,7"],
  "&": [26, "23,12 23,13 22,14 21,14 20,13 19,11 17,6 15,3 13,1 11,0 7,0 5,1 4,2 3,4 3,6 4,8 5,9 12,13 13,14 14,16 14,18 13,20 11,21 9,20 8,18 8,16 9,13 11,10 16,3 18,1 20,0 22,0 23,1 23,2"],
  "'": [10, "5,19 4,20 5,21 6,20 6,18 5,16 4,15"],
  "(": [14, "11,25 9,23 7,20 5,16 4,11 4,7 5,2 7,-2 9,-5 11,-7"],
  ")": [14, "3,25 5,23 7,20 9,16 10,11 10,7 9,2 7,-2 5,-5 3,-7"],
  "*": [16, "8,21 8,9|1,18 15,12|15,18 1,12"],
  "+": [26, "13,18 13,0|4,9 22,9"],
  ",": [10, "6,1 5,0 4,1 5,2 6,1 6,-1 5,-3 4,-4"],
  "-": [26, "4,9 22,9"],
  ".": [10, "5,2 4,1 5,0 6,1 5,2"],
  "/": [22, "20,25 2,-7"],
  "0": [20, "9,21 6,20 4,17 3,12 3,9 4,4 6,1 9,0 11,0 14,1 16,4 17,9 17,12 16,17 14,20 11,21 9,21"],
  "1": [20, "6,17 8,18 11,21 11,0"],
  "2": [20, "4,16 4,17 5,19 6,20 8,21 12,21 14,20 15,19 16,17 16,15 15,13 13,10 3,0 17,0"],
  "3": [20, "5,21 16,21 10,13 13,13 15,12 16,11 17,8 17,6 16,3 14,1 11,0 8,0 5,1 4,2 3,4"],
  "4": [20, "13,21 3,7 18,7|13,21 13,0"],
  "5": [20, "15,21 5,21 4,12 5,13 8,14 11,14 14,13 16,11 17,8 17,6 16,3 14,1 11,0 8,0 5,1 4,2 3,4"],
  "6": [20, "16,18 15,20 12,21 10,21 7,20 5,17 4,12 4,7 5,3 7,1 10,0 11,0 14,1 16,3 17,6 17,7 16,10 14,12 11,13 10,13 7,12 5,10 4,7"],
  "7": [20, "17,21 7,0|3,21 17,21"],
  "8": [20, "8,21 5,20 4,18 4,16 5,14 7,13 11,12 14,11 16,9 17,7 17,4 16,2 15,1 12,0 8,0 5,1 4,2 3,4 3,7 4,9 6,11 9,12 13,13 15,14 16,16 16,18 15,20 12,21 8,21"],
  "9": [20, "16,14 15,11 13,9 10,8 9,8 6,9 4,11 3,14 3,15 4,18 6,20 9,21 10,21 13,20 15,18 16,14 16,9 15,4 13,1 10,0 8,0 5,1 4,3"],
  ":": [10, "5,14 4,13 5,12 6,13 5,14|5,2 4,1 5,0 6,1 5,2"],
  ";": [10, "5,14 4,13 5,12 6,13 5,14|6,1 5,0 4,1 5,2 6,1 6,-1 5,-3 4,-4"],
  "<": [24, "20,18 4,9 20,0"],
  "=": [26, "4,12 22,12|4,6 22,6"],
  ">": [24, "4,18 20,9 4,0"],
  "?": [18, "3,16 3,17 4,19 5,20 7,21 11,21 13,20 14,19 15,17 15,15 14,13 13,12 9,10 9,7|9,2 8,1 9,0 10,1 9,2"],
  "@": [27, "18,13 17,15 15,16 12,16 10,15 9,14 8,11 8,8 9,6 11,5 14,5 16,6 17,8|12,16 10,14 9,11 9,8 10,6 11,5|18,16 17,8 17,6 19,5 21,5 23,7 24,10 24,12 23,15 22,17 20,19 18,20 15,21 12,21 9,20 7,19 5,17 4,15 3,12 3,9 4,6 5,4 7,2 9,1 12,0 15,0 18,1 20,2 21,3"],
  "A": [18, "9,21 1,0|9,21 17,0|4,7 14,7"],
  "B": [21, "4,21 4,0|4,21 13,21 16,20 17,19 18,17 18,15 17,13 16,12 13,11|4,11 13,11 16,10 17,9 18,7 18,4 17,2 16,1 13,0 4,0"],
  "C": [21, "18,16 17,18 15,20 13,21 9,21 7,20 5,18 4,16 3,13 3,8 4,5 5,3 7,1 9,0 13,0 15,1 17,3 18,5"],
  "D": [21, "4,21 4,0|4,21 11,21 14,20 16,18 17,16 18,13 18,8 17,5 16,3 14,1 11,0 4,0"],
  "E": [19, "4,21 4,0|4,21 17,21|4,11 12,11|4,0 17,0"],
  "F": [18, "4,21 4,0|4,21 17,21|4,11 12,11"],
  "G": [21, "18,16 17,18 15,20 13,21 9,21 7,20 5,18 4,16 3,13 3,8 4,5 5,3 7,1 9,0 13,0 15,1 17,3 18,5 18,8|13,8 18,8"],
  "H": [22, "4,21 4,0|18,21 18,0|4,11 18,11"],
  "I": [8, "4,21 4,0"],
  "J": [16, "12,21 12,5 11,2 10,1 8,0 6,0 4,1 3,2 2,5 2,7"],
  "K": [21, "4,21 4,0|18,21 4,7|9,12 18,0"],
  "L": [17, "4,21 4,0|4,0 16,0"],
  "M": [24, "4,21 4,0|4,21 12,0|20,21 12,0|20,21 20,0"],
  "N": [22, "4,21 4,0|4,21 18,0|18,21 18,0"],
  "O": [22, "9,21 7,20 5,18 4,16 3,13 3,8 4,5 5,3 7,1 9,0 13,0 15,1 17,3 18,5 19,8 19,13 18,16 17,18 15,20 13,21 9,21"],
  "P": [21, "4,21 4,0|4,21 13,21 16,20 17,19 18,17 18,14 17,12 16,11 13,10 4,10"],
  "Q": [22, "9,21 7,20 5,18 4,16 3,13 3,8 4,5 5,3 7,1 9,0 13,0 15,1 17,3 18,5 19,8 19,13 18,16 17,18 15,20 13,21 9,21|12,4 18,-2"],
  "R": [21, "4,21 4,0|4,21 13,21 16,20 17,19 18,17 18,15 17,13 16,12 13,11 4,11|11,11 18,0"],
  "S": [20, "17,18 15,20 12,21 8,21 5,20 3,18 3,16 4,14 5,13 7,12 13,10 15,9 16,8 17,6 17,3 15,1 12,0 8,0 5,1 3,3"],
  "T": [16, "8,21 8,0|1,21 15,21"],
  "U": [22, "4,21 4,6 5,3 7,1 10,0 12,0 15,1 17,3 18,6 18,21"],
  "V": [18, "1,21 9,0|17,21 9,0"],
  "W": [24, "2,21 7,0|12,21 7,0|12,21 17,0|22,21 17,0"],
  "X": [20, "3,21 17,0|17,21 3,0"],
  "Y": [18, "1,21 9,11 9,0|17,21 9,11"],
  "Z": [20, "17,21 3,0|3,21 17,21|3,0 17,0"],
  "[": [14, "4,25 4,-7|5,25 5,-7|4,25 11,25|4,-7 11,-7"],
  "\\": [22, "0,21 18,-7"],
  "]": [14, "9,25 9,-7|10,25 10,-7|3,25 10,25|3,-7 10,-7"],
  "^": [16, "6,15 8,18 10,15|3,12 8,17 13,12|8,17 8,0"],
  "_": [16, "0,-2 16,-2"],
  "`": [10, "6,21 5,20 4,18 4,16 5,15 6,16 5,17"],
  "a": [19, "15,14 15,0|15,11 13,13 11,14 8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3"],
  "b": [19, "4,21 4,0|4,11 6,13 8,14 11,14 13,13 15,11 16,8 16,6 15,3 13,1 11,0 8,0 6,1 4,3"],
  "c": [18, "15,11 13,13 11,14 8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3"],
  "d": [19, "15,21 15,0|15,11 13,13 11,14 8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3"],
  "e": [18, "3,8 15,8 15,10 14,12 13,13 11,14 8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3"],
  "f": [12, "10,21 8,21 6,20 5,17 5,0|2,14 9,14"],
  "g": [19, "15,14 15,-2 14,-5 13,-6 11,-7 8,-7 6,-6|15,11 13,13 11,14 8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3"],
  "h": [19, "4,21 4,0|4,10 7,13 9,14 12,14 14,13 15,10 15,0"],
  "i": [8, "3,21 4,20 5,21 4,22 3,21|4,14 4,0"],
  "j": [10, "5,21 6,20 7,21 6,22 5,21|6,14 6,-3 5,-6 3,-7 1,-7"],
  "k": [17, "4,21 4,0|14,14 4,4|8,8 15,0"],
  "l": [8, "4,21 4,0"],
  "m": [30, "4,14 4,0|4,10 7,13 9,14 12,14 14,13 15,10 15,0|15,10 18,13 20,14 23,14 25,13 26,10 26,0"],
  "n": [19, "4,14 4,0|4,10 7,13 9,14 12,14 14,13 15,10 15,0"],
  "o": [19, "8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3 16,6 16,8 15,11 13,13 11,14 8,14"],
  "p": [19, "4,14 4,-7|4,11 6,13 8,14 11,14 13,13 15,11 16,8 16,6 15,3 13,1 11,0 8,0 6,1 4,3"],
  "q": [19, "15,14 15,-7|15,11 13,13 11,14 8,14 6,13 4,11 3,8 3,6 4,3 6,1 8,0 11,0 13,1 15,3"],
  "r": [13, "4,14 4,0|4,8 5,11 7,13 9,14 12,14"],
  "s": [17, "14,11 13,13 10,14 7,14 4,13 3,11 4,9 6,8 11,7 13,6 14,4 14,3 13,1 10,0 7,0 4,1 3,3"],
  "t": [12, "5,21 5,4 6,1 8,0 10,0|2,14 9,14"],
  "u": [19, "4,14 4,4 5,1 7,0 10,0 12,1 15,4|15,14 15,0"],
  "v": [16, "2,14 8,0|14,14 8,0"],
  "w": [22, "3,14 7,0|11,14 7,0|11,14 15,0|19,14 15,0"],
  "x": [17, "3,14 14,0|14,14 3,0"],
  "y": [16, "2,14 8,0|14,14 8,0 6,-4 4,-6 2,-7 1,-7"],
  "z": [17, "14,14 3,0|3,14 14,14|3,0 14,0"],
  "{": [14, "9,25 7,24 6,23 5,21 5,19 6,17 7,16 8,14 8,12 6,10|7,24 6,22 6,20 7,18 8,17 9,15 9,13 8,11 4,9 8,7 9,5 9,3 8,1 7,0 6,-2 6,-4 7,-6|6,8 8,6 8,4 7,2 6,1 5,-1 5,-3 6,-5 7,-6 9,-7"],
  "|": [8, "4,25 4,-7"],
  "}": [14, "5,25 7,24 8,23 9,21 9,19 8,17 7,16 6,14 6,12 8,10|7,24 8,22 8,20 7,18 6,17 5,15 5,13 6,11 10,9 6,7 5,5 5,3 6,1 7,0 8,-2 8,-4 7,-6|8,8 6,6 6,4 7,2 8,1 9,-1 9,-3 8,-5 7,-6 5,-7"],
  "~": [24, "3,6 3,8 4,11 6,12 8,12 10,11 14,8 16,7 18,7 20,8 21,10|3,8 4,10 6,11 8,11 10,10 14,7 16,6 18,6 20,7 21,10 21,12"],
};

/**
 * Turkish letters are not in the original Hershey ASCII table. Rather than hand-
 * digitize new glyphs, we COMPOSE them from an existing base letter plus a small
 * accent stroke, reusing the single-stroke data we already have. Each accent is
 * a tiny shape (in glyph units, Y-up) that the parser centers over/under the
 * base letter's drawn width. `base: null` means "use the empty-base accent as
 * the whole glyph" (e.g. dotless ı reuses i without its dot).
 */
type AccentKind = "dot" | "umlaut" | "breve" | "cedilla" | "none";

interface Composite {
  /** Base ASCII letter to clone, or null for a from-scratch case (e.g. ı). */
  base: string | null;
  accent: AccentKind;
}

const TURKISH: Record<string, Composite> = {
  "Ç": { base: "C", accent: "cedilla" },
  "ç": { base: "c", accent: "cedilla" },
  "Ş": { base: "S", accent: "cedilla" },
  "ş": { base: "s", accent: "cedilla" },
  "Ğ": { base: "G", accent: "breve" },
  "ğ": { base: "g", accent: "breve" },
  "Ö": { base: "O", accent: "umlaut" },
  "ö": { base: "o", accent: "umlaut" },
  "Ü": { base: "U", accent: "umlaut" },
  "ü": { base: "u", accent: "umlaut" },
  // İ = capital I with a dot above. ı = lowercase i with NO dot.
  "İ": { base: "I", accent: "dot" },
  "ı": { base: null, accent: "none" }, // special-cased below from "i"
};

function parseBody(body: string): number[][][] {
  return body
    ? body.split("|").map((stroke) =>
        stroke
          .trim()
          .split(/\s+/)
          .map((pt) => {
            const [x, y] = pt.split(",").map(Number);
            return [x, y];
          }),
      )
    : [];
}

/** Horizontal extent [minX, maxX] of a glyph's drawn strokes. */
function strokeXSpan(strokes: number[][][]): [number, number] {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const s of strokes)
    for (const [x] of s) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  return Number.isFinite(minX) ? [minX, maxX] : [0, 0];
}

/** Build the accent stroke(s), centered horizontally on [minX,maxX]. */
function accentStrokes(kind: AccentKind, minX: number, maxX: number): number[][][] {
  const cx = (minX + maxX) / 2;
  switch (kind) {
    case "dot":
      // Small tick above the cap (capital İ dot).
      return [[[cx, 23], [cx, 25]]];
    case "umlaut":
      // Two short ticks above the letter.
      return [
        [[cx - 3, 23], [cx - 3, 25]],
        [[cx + 3, 23], [cx + 3, 25]],
      ];
    case "breve":
      // A small upward cup above the letter (ğ/Ğ).
      return [[[cx - 4, 24], [cx - 2, 26], [cx + 2, 26], [cx + 4, 24]]];
    case "cedilla":
      // A hook hanging below the baseline (ç/ş).
      return [[[cx, 0], [cx, -3], [cx - 2, -5], [cx - 4, -5]]];
    case "none":
      return [];
  }
}

/**
 * Build a full structured glyph table (ASCII + Turkish) from a compact RAW map.
 *
 * The Turkish-letter composition (base glyph + accent stroke) and the parsing
 * are font-agnostic, so every Hershey style we ship reuses this exact logic and
 * therefore gets correct ç/ğ/ı/İ/ö/ş/ü "for free" — there is no per-font Turkish
 * work to forget. Pass a different RAW table to get a different style.
 */
export function buildGlyphTable(
  raw: Record<string, [number, string]>,
): Record<string, HersheyGlyph> {
  const out: Record<string, HersheyGlyph> = {};

  // 1. Base ASCII glyphs.
  for (const ch of Object.keys(raw)) {
    const [advance, body] = raw[ch];
    out[ch] = { advance, strokes: parseBody(body) };
  }

  // 2. Turkish letters, composed from a base glyph + accent.
  for (const ch of Object.keys(TURKISH)) {
    const spec = TURKISH[ch];

    // Special case ı: lowercase "i" without its dot (drop the top dot stroke).
    if (ch === "ı") {
      const i = out["i"];
      if (!i) continue;
      // "i" data: first stroke is the dot, second is the stem. Keep the stem.
      const stem = i.strokes[i.strokes.length - 1];
      out[ch] = { advance: i.advance, strokes: [stem.map(([x, y]) => [x, y])] };
      continue;
    }

    const base = spec.base ? out[spec.base] : null;
    if (!base) continue;
    const [minX, maxX] = strokeXSpan(base.strokes);
    const accent = accentStrokes(spec.accent, minX, maxX);
    out[ch] = {
      advance: base.advance,
      strokes: [...base.strokes.map((s) => s.map(([x, y]) => [x, y])), ...accent],
    };
  }

  return out;
}

let parsed: Record<string, HersheyGlyph> | null = null;

/** Parse the compact "simplex" table once into structured glyphs (incl. Turkish). */
export function getHersheyGlyphs(): Record<string, HersheyGlyph> {
  if (!parsed) parsed = buildGlyphTable(RAW);
  return parsed;
}
