/**
 * Label text input + font size. Typing here is the source of geometry
 * (replaces the old SVG dropzone). Changing the text/size invalidates any
 * previously generated G-code so stale output is never downloaded.
 */

import { useMachineStore } from "../store";

export function TextInputPanel() {
  const text = useMachineStore((s) => s.text);
  const setText = useMachineStore((s) => s.setText);
  const fontSizeMm = useMachineStore((s) => s.fontSizeMm);
  const setFontSize = useMachineStore((s) => s.setFontSize);

  const sizeInvalid = !Number.isFinite(fontSizeMm) || fontSizeMm <= 0;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Etiket Metni
      </h2>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-200">
          Yazılacak Metin
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Örn. SERİ NO: 12345"
          className="w-full resize-y rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-400"
        />
      </label>

      <label className="block max-w-[200px]">
        <span className="mb-1 flex items-baseline justify-between">
          <span className="text-sm font-medium text-slate-200">Yazı Boyutu</span>
          <span className="text-[11px] text-slate-500">mm (yükseklik)</span>
        </span>
        <input
          type="number"
          inputMode="decimal"
          step={1}
          min={0.1}
          value={Number.isFinite(fontSizeMm) ? fontSizeMm : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            setFontSize(e.target.value.trim() === "" ? NaN : n);
          }}
          className={[
            "w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition",
            sizeInvalid
              ? "border-red-500 focus:border-red-400"
              : "border-slate-700 focus:border-blue-400",
          ].join(" ")}
        />
        {sizeInvalid && (
          <span className="mt-1 block text-[11px] text-red-400">
            Geçerli bir boyut girin (&gt; 0).
          </span>
        )}
      </label>
    </div>
  );
}
