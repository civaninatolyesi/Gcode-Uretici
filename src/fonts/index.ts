/**
 * Font registry — the single place that knows which fonts exist and how each
 * one turns text into polylines.
 *
 * Design (Open/Closed): the rest of the app only depends on the `FontProvider`
 * interface and the `FONTS` table. Adding a new font means adding one provider
 * here; no caller (store, generator, UI) needs to change. Two kinds ship today:
 *
 *   - "outline"      : a TrueType font via opentype.js (filled-look letters,
 *                      traced around the border — more G-code, classic look).
 *   - "single-stroke": a Hershey vector font whose glyphs are already the
 *                      *centerline* — perfect for a thick pen that should pass
 *                      ONCE through the middle of each letter, and far less
 *                      G-code. This is the "kalın kalem / basit font" answer.
 */

import { loadFont, normalizeToOrigin, textToPolylines } from "../textToPaths";
import type { Polyline } from "../types";
import { buildHersheyPolylines } from "./hersheyFont";
import { getGothicGlyphs } from "./hersheyGothic";
import { getScriptGlyphs } from "./hersheyScript";

export type FontId =
  | "roboto"
  | "hershey-simplex"
  | "hershey-script"
  | "hershey-gothic";

export interface FontTextOptions {
  text: string;
  /** Cap height target in mm. */
  fontSizeMm: number;
  /** Flatten tolerance in mm (used by curve-based fonts). */
  tolerance: number;
}

/** A font knows how to render text into normalized polylines (mm, Y-up, (0,0)). */
export interface FontProvider {
  readonly id: FontId;
  readonly label: string;
  /** Short, plain-language note shown next to the choice in the UI. */
  readonly description: string;
  /** true when glyphs are a single centerline stroke (ideal for a thick pen). */
  readonly singleStroke: boolean;
  toPolylines(opts: FontTextOptions): Promise<Polyline[]>;
}

const robotoProvider: FontProvider = {
  id: "roboto",
  label: "Roboto (dolgu hatlı)",
  description:
    "Klasik görünüm: harfin etrafından dolanır. Daha fazla G-code üretir.",
  singleStroke: false,
  async toPolylines(opts) {
    const font = await loadFont();
    return textToPolylines(font, opts).polylines;
  },
};

const hersheyProvider: FontProvider = {
  id: "hershey-simplex",
  label: "Tek Çizgi (Hershey)",
  description:
    "Kalın kalem için ideal: harfin ortasından tek geçer. Çok az G-code.",
  singleStroke: true,
  async toPolylines(opts) {
    // Hershey glyphs are already Y-up (baseline at 0), so we must NOT flip Y —
    // flipping would mirror the text vertically. Only translate to the origin.
    return normalizeToOrigin(buildHersheyPolylines(opts), false);
  },
};

const scriptProvider: FontProvider = {
  id: "hershey-script",
  label: "El Yazısı (Script)",
  description:
    "Akıcı, eğik el yazısı. Tek çizgi: kalın kalem için ideal, az G-code.",
  singleStroke: true,
  async toPolylines(opts) {
    return normalizeToOrigin(buildHersheyPolylines(opts, getScriptGlyphs()), false);
  },
};

const gothicProvider: FontProvider = {
  id: "hershey-gothic",
  label: "Gotik Blok (Gothic)",
  description:
    "Eski tarz, kalın görünümlü dekoratif blok harfler. Tek çizgi, az G-code.",
  singleStroke: true,
  async toPolylines(opts) {
    return normalizeToOrigin(buildHersheyPolylines(opts, getGothicGlyphs()), false);
  },
};

/** All available fonts, in display order. */
export const FONTS: readonly FontProvider[] = [
  robotoProvider,
  hersheyProvider,
  scriptProvider,
  gothicProvider,
];

export const DEFAULT_FONT_ID: FontId = "roboto";

export function getFont(id: FontId): FontProvider {
  return FONTS.find((f) => f.id === id) ?? robotoProvider;
}

/**
 * Measure the bounding box (in mm) that a string occupies at a given font
 * size, by running the SAME pipeline that generates the toolpath. Returns the
 * width/height the text would draw — used by "Tablaya Sığdır" to back-solve a
 * font size from the desired physical size.
 */
export async function measureTextSize(
  fontId: FontId,
  opts: FontTextOptions,
): Promise<{ width: number; height: number }> {
  const polylines = await getFont(fontId).toPolylines(opts);
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
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    throw new Error("Bu metin için ölçülebilir bir şekil üretilemedi.");
  }
  return { width: maxX - minX, height: maxY - minY };
}
