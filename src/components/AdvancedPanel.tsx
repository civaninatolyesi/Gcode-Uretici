/**
 * Advanced (expert) settings — deliberately collapsed by default so a first-time
 * user is never confused by them. Only operators who know what they want open
 * this. It currently holds two related "thick pen" concerns:
 *
 *   1. Font choice: an outline font (draws around each letter) vs. a single-
 *      stroke Hershey font (draws ONCE through the centerline — the right choice
 *      for a thick pen, and far less G-code).
 *   2. Pen tip diameter: a simulation-only hint that renders the stroke at its
 *      true physical width so the operator can see how thick the line will be.
 *      It does not alter the G-code.
 */

import { FONTS } from "../fonts";
import { useMachineStore } from "../store";

function FontChooser() {
  const fontId = useMachineStore((s) => s.fontId);
  const setFontId = useMachineStore((s) => s.setFontId);

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-slate-200">Yazı Tipi</span>
      <div className="space-y-2">
        {FONTS.map((f) => {
          const active = f.id === fontId;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFontId(f.id)}
              className={[
                "block w-full rounded-lg border px-3 py-2 text-left transition",
                active
                  ? "border-blue-500 bg-blue-950/40"
                  : "border-slate-700 bg-slate-900 hover:border-slate-500",
              ].join(" ")}
            >
              <span className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-100">
                  {f.label}
                </span>
                {f.singleStroke && (
                  <span className="rounded bg-emerald-700/60 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
                    tek çizgi
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">
                {f.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PenDiameterField() {
  const penDiameterMm = useMachineStore((s) => s.penDiameterMm);
  const setParam = useMachineStore((s) => s.setParam);

  const invalid = !Number.isFinite(penDiameterMm) || penDiameterMm < 0;

  return (
    <label className="block max-w-[220px]">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-200">
          Kalem Ucu Kalınlığı
        </span>
        <span className="text-[11px] text-slate-500">mm</span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={0.1}
        min={0}
        value={Number.isFinite(penDiameterMm) ? penDiameterMm : ""}
        onChange={(e) => {
          const v = e.target.value;
          setParam("penDiameterMm", v.trim() === "" ? NaN : Number(v));
        }}
        className={[
          "w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition",
          invalid
            ? "border-red-500 focus:border-red-400"
            : "border-slate-700 focus:border-blue-400",
        ].join(" ")}
      />
      <span className="mt-1 block text-[11px] leading-snug text-slate-500">
        Yalnızca simülasyonda çizginin gerçek kalınlığını gösterir; G-code'u
        değiştirmez. 0 = ince önizleme.
      </span>
    </label>
  );
}

export function AdvancedPanel() {
  return (
    <details className="group rounded-2xl border border-slate-800 bg-slate-900/50">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold text-slate-300 transition hover:text-slate-100">
        <span className="flex items-center gap-2">
          <span className="text-slate-500">⚙</span>
          Gelişmiş Ayarlar (uzman)
        </span>
        <span className="text-slate-500 transition group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="space-y-5 border-t border-slate-800 px-5 py-4">
        <p className="text-[11px] leading-relaxed text-slate-500">
          Bu ayarları değiştirmeniz gerekmiyorsa olduğu gibi bırakın.
          Varsayılanlar çoğu etiket işi için uygundur.
        </p>
        <FontChooser />
        <PenDiameterField />
      </div>
    </details>
  );
}
