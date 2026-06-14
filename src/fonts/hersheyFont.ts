/**
 * Lays out a string with the Hershey single-stroke font: advances a pen across
 * the baseline glyph by glyph, emitting each stroke as a polyline scaled to the
 * requested cap height in mm.
 *
 * Output here is raw (Y-up, baseline at 0, NOT yet shifted to the origin); the
 * caller runs `normalizeToOrigin` so it shares the exact same contract as the
 * opentype path (mm, Y-up, bottom-left corner at (0,0)).
 */

import type { Point, Polyline } from "../types";
import type { FontTextOptions } from "./index";
import { getHersheyGlyphs } from "./hersheyData";

/** Extra spacing between glyphs, in font units (small, for legibility). */
const LETTER_SPACING = 2;

function isFiniteNum(n: number): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

export function buildHersheyPolylines(opts: FontTextOptions): Polyline[] {
  const { text, fontSizeMm } = opts;
  if (!text.trim()) {
    throw new Error("Lütfen metin girin.");
  }
  if (!isFiniteNum(fontSizeMm) || fontSizeMm <= 0) {
    throw new Error("Yazı boyutu 0'dan büyük olmalıdır.");
  }

  const glyphs = getHersheyGlyphs();

  // 1) Lay out the text in raw font units (Y-up, baseline at 0). Coordinates
  //    are validated here so a malformed glyph can never leak a NaN downstream.
  const raw: Polyline[] = [];
  let cursorX = 0;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const ch of text) {
    if (ch === "\n") {
      // Single-line layout for labels; ignore explicit newlines for now.
      continue;
    }
    const glyph = glyphs[ch] ?? glyphs["?"];
    if (!glyph) {
      cursorX += 16; // Unknown char with no fallback: advance a blank space.
      continue;
    }

    for (const stroke of glyph.strokes) {
      const pl: Polyline = [];
      for (const [x, y] of stroke) {
        if (!isFiniteNum(x) || !isFiniteNum(y)) continue; // skip corrupt points
        pl.push({ x: cursorX + x, y });
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (pl.length >= 1) raw.push(pl);
    }
    cursorX += glyph.advance + LETTER_SPACING;
  }

  if (raw.length === 0 || !Number.isFinite(minY)) {
    throw new Error("Bu metin için çizilebilir bir şekil üretilemedi.");
  }

  // 2) Scale so the text's REAL total height (ascenders, accents AND descenders)
  //    equals fontSizeMm. This keeps the requested size honest: "20 mm" really
  //    produces a 20 mm-tall result even for accented letters like Ö/Ğ/Ş.
  const rawHeight = maxY - minY;
  const scale = rawHeight > 0 ? fontSizeMm / rawHeight : fontSizeMm;

  return raw.map((pl): Polyline =>
    pl.map((p): Point => ({ x: p.x * scale, y: p.y * scale })),
  );
}
