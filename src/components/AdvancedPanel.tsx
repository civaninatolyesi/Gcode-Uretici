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
import type { FrameStyle } from "../types";

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

/**
 * Optional override field for a layout measurement that is in mm but may be
 * "automatic" (null). Empty input = automatic; a number = explicit override.
 */
function MmOverrideField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | null;
  placeholder: string;
  onChange: (v: number | null) => void;
}) {
  const invalid = value != null && (!Number.isFinite(value) || value < 0);
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span className="text-[11px] text-slate-500">mm</span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={0.5}
        min={0}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value.trim();
          onChange(v === "" ? null : Number(v));
        }}
        className={[
          "w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition",
          invalid
            ? "border-red-500 focus:border-red-400"
            : "border-slate-700 focus:border-blue-400",
        ].join(" ")}
      />
      <span className="mt-1 block text-[11px] leading-snug text-slate-500">
        {hint}
      </span>
    </label>
  );
}

function FrameChooser() {
  const frameStyle = useMachineStore((s) => s.layout.frameStyle);
  const framePaddingMm = useMachineStore((s) => s.layout.framePaddingMm);
  const setLayout = useMachineStore((s) => s.setLayout);

  const options: { id: FrameStyle; label: string; note: string }[] = [
    { id: "none", label: "Yok", note: "Çerçeve çizilmez" },
    { id: "rect", label: "Düz dikdörtgen", note: "Makasla kesmek için temel" },
    { id: "rounded", label: "Yuvarlak köşe", note: "Köşeleri yumuşatılmış" },
    { id: "dashed", label: "Kesik çizgi", note: "Kesme kılavuzu görünümü" },
  ];

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-slate-200">
        Çerçeve (etiket kenarı)
      </span>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const active = o.id === frameStyle;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setLayout({ frameStyle: o.id })}
              className={[
                "rounded-lg border px-3 py-2 text-left transition",
                active
                  ? "border-blue-500 bg-blue-950/40"
                  : "border-slate-700 bg-slate-900 hover:border-slate-500",
              ].join(" ")}
            >
              <span className="block text-sm font-medium text-slate-100">
                {o.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">
                {o.note}
              </span>
            </button>
          );
        })}
      </div>

      {frameStyle !== "none" && (
        <MmOverrideField
          label="Çerçeve boşluğu (padding)"
          hint="Metin ile çerçeve arası. Boş = otomatik (yazı boyutuna göre)."
          value={framePaddingMm}
          placeholder="otomatik"
          onChange={(v) => setLayout({ framePaddingMm: v })}
        />
      )}
    </div>
  );
}

function LineSpacingField() {
  const lineSpacing = useMachineStore((s) => s.layout.lineSpacing);
  const setLayout = useMachineStore((s) => s.setLayout);
  const invalid = !Number.isFinite(lineSpacing) || lineSpacing < 0.5;

  return (
    <label className="block max-w-[220px]">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-200">Satır aralığı</span>
        <span className="text-[11px] text-slate-500">× yazı boyutu</span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={0.1}
        min={0.5}
        value={Number.isFinite(lineSpacing) ? lineSpacing : ""}
        onChange={(e) => {
          const v = e.target.value;
          setLayout({ lineSpacing: v.trim() === "" ? NaN : Number(v) });
        }}
        className={[
          "w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition",
          invalid
            ? "border-red-500 focus:border-red-400"
            : "border-slate-700 focus:border-blue-400",
        ].join(" ")}
      />
      <span className="mt-1 block text-[11px] leading-snug text-slate-500">
        Alt alta satırlar arası dikey boşluk. 1.4 çoğu etiket için rahattır.
      </span>
    </label>
  );
}

function CopyGridFields() {
  const copyRows = useMachineStore((s) => s.layout.copyRows);
  const copyCols = useMachineStore((s) => s.layout.copyCols);
  const blockGapMm = useMachineStore((s) => s.layout.blockGapMm);
  const setLayout = useMachineStore((s) => s.setLayout);

  const intField = (
    key: "copyRows" | "copyCols",
    label: string,
    value: number,
  ) => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-200">
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        step={1}
        min={1}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const n = Math.max(1, Math.floor(Number(e.target.value)) || 1);
          setLayout({ [key]: n });
        }}
        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-400"
      />
    </label>
  );

  return (
    <div className="space-y-3">
      <span className="text-sm font-medium text-slate-200">
        Çoklu kopya (ızgara)
      </span>
      <div className="grid grid-cols-2 gap-3">
        {intField("copyRows", "Satır (↓)", copyRows)}
        {intField("copyCols", "Sütun (→)", copyCols)}
      </div>
      <MmOverrideField
        label="Etiketler arası boşluk"
        hint="Bloklar ve kopyalar arası. Boş = otomatik (yazı boyutuna göre)."
        value={blockGapMm}
        placeholder="otomatik"
        onChange={(v) => setLayout({ blockGapMm: v })}
      />
      <p className="text-[11px] leading-snug text-slate-500">
        Tüm etiket seti {copyRows}×{copyCols} = {copyRows * copyCols} kez
        tablaya dizilir. Toplam boyutun tablaya sığdığından emin olun.
      </p>
    </div>
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

        <div className="border-t border-slate-800 pt-4">
          <LineSpacingField />
        </div>
        <div className="border-t border-slate-800 pt-4">
          <FrameChooser />
        </div>
        <div className="border-t border-slate-800 pt-4">
          <CopyGridFields />
        </div>
      </div>
    </details>
  );
}
