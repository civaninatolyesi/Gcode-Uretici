/**
 * Responsive configuration panel for CNC parameters.
 *
 * Each field keeps its own raw text so the user can clear/retype freely; the
 * parsed numeric value is pushed to the store. Invalid (NaN) entries are
 * flagged and reported, preventing corrupt parameters from reaching the worker.
 */

import { useEffect, useState } from "react";
import { useMachineStore } from "../store";
import type { MachineParams } from "../types";

interface FieldDef {
  key: keyof MachineParams;
  label: string;
  hint: string;
  step: number;
  min?: number;
}

const FIELDS: FieldDef[] = [
  { key: "safeZ", label: "Güvenli Z Yüksekliği", hint: "mm", step: 0.5 },
  { key: "drawZ", label: "Çizim / Dalış Z", hint: "mm", step: 0.1 },
  { key: "feedRate", label: "Kesim Hızı (F)", hint: "mm/dk", step: 50, min: 1 },
  {
    key: "travelRate",
    label: "Boşta Gezinme Hızı",
    hint: "mm/dk",
    step: 50,
    min: 1,
  },
  {
    key: "tolerance",
    label: "Hassasiyet (Tolerans)",
    hint: "mm",
    step: 0.05,
    min: 0.001,
  },
];

function NumberField({ def }: { def: FieldDef }) {
  const value = useMachineStore((s) => s[def.key]);
  const setParam = useMachineStore((s) => s.setParam);

  const [raw, setRaw] = useState<string>(String(value));

  // Keep the input synced if the store value changes externally.
  useEffect(() => {
    setRaw((prev) => (Number(prev) === value ? prev : String(value)));
  }, [value]);

  const parsed = Number(raw);
  const invalid =
    raw.trim() === "" ||
    !Number.isFinite(parsed) ||
    (def.min !== undefined && parsed < def.min);

  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-200">{def.label}</span>
        <span className="text-[11px] text-slate-500">{def.hint}</span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={def.step}
        value={raw}
        onChange={(e) => {
          const next = e.target.value;
          setRaw(next);
          const n = Number(next);
          if (next.trim() !== "" && Number.isFinite(n)) {
            setParam(def.key, n);
          }
        }}
        className={[
          "w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition",
          invalid
            ? "border-red-500 focus:border-red-400"
            : "border-slate-700 focus:border-blue-400",
        ].join(" ")}
      />
      {invalid && (
        <span className="mt-1 block text-[11px] text-red-400">
          Geçerli bir değer girin{def.min !== undefined ? ` (≥ ${def.min})` : ""}.
        </span>
      )}
    </label>
  );
}

export function ConfigPanel() {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Makine Parametreleri
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map((def) => (
          <NumberField key={def.key} def={def} />
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Güvenli Z, Çizim Z'den büyük olmalıdır. Hassasiyet değeri düştükçe eğriler
        daha pürüzsüz, dosya daha büyük olur.
      </p>
    </div>
  );
}
