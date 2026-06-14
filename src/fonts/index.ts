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

export type FontId = "roboto" | "hershey-simplex";

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

/** All available fonts, in display order. */
export const FONTS: readonly FontProvider[] = [robotoProvider, hersheyProvider];

export const DEFAULT_FONT_ID: FontId = "roboto";

export function getFont(id: FontId): FontProvider {
  return FONTS.find((f) => f.id === id) ?? robotoProvider;
}
