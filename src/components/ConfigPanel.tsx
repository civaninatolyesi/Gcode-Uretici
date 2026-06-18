/**
 * Responsive configuration panel for CNC parameters AND the physical table
 * (workspace) limits.
 *
 * Each field keeps its own raw text so the user can clear/retype freely; the
 * parsed numeric value is pushed to the store. Invalid (NaN) entries are
 * flagged and reported, preventing corrupt parameters from reaching the worker.
 */

import { useEffect, useState } from "react";
import { useMachineStore } from "../store";
import type { MachineParams, TableLimits } from "../types";

interface FieldDef<K extends string> {
  key: K;
  label: string;
  hint: string;
  step: number;
  min?: number;
}

const PARAM_FIELDS: FieldDef<keyof MachineParams>[] = [
  { key: "safeZ", label: "Güvenli Z Yüksekliği", hint: "mm", step: 0.5 },
  { key: "drawZ", label: "Çizim / Dalış Z", hint: "mm", step: 0.1 },
  { key: "feedRate", label: "Kesim Hızı (F)", hint: "mm/dk", step: 50, min: 1 },
  {
    key: "tolerance",
    label: "Hassasiyet (Tolerans)",
    hint: "mm",
    step: 0.05,
    min: 0.001,
  },
];

const LIMIT_FIELDS: FieldDef<keyof TableLimits>[] = [
  { key: "maxX", label: "Tabla Max X (Genişlik)", hint: "mm", step: 10, min: 1 },
  { key: "maxY", label: "Tabla Max Y (Yükseklik)", hint: "mm", step: 10, min: 1 },
];

/** Generic numeric field bound to a store value + setter. */
function NumberField({
  def,
  value,
  onCommit,
}: {
  def: FieldDef<string>;
  value: number;
  onCommit: (n: number) => void;
}) {
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
            onCommit(n);
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

function ParamField({ def }: { def: FieldDef<keyof MachineParams> }) {
  const value = useMachineStore((s) => s[def.key]);
  const setParam = useMachineStore((s) => s.setParam);
  return (
    <NumberField
      def={def}
      value={value}
      onCommit={(n) => setParam(def.key, n)}
    />
  );
}

function LimitField({ def }: { def: FieldDef<keyof TableLimits> }) {
  const value = useMachineStore((s) => s[def.key]);
  const setLimit = useMachineStore((s) => s.setLimit);
  return (
    <NumberField
      def={def}
      value={value}
      onCommit={(n) => setLimit(def.key, n)}
    />
  );
}

export function ConfigPanel() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Tabla Sınırları
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {LIMIT_FIELDS.map((def) => (
            <LimitField key={def.key} def={def} />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Makine Parametreleri
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PARAM_FIELDS.map((def) => (
            <ParamField key={def.key} def={def} />
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Güvenli Z, Çizim Z'den büyük olmalıdır. Hassasiyet değeri düştükçe eğriler
          daha pürüzsüz, dosya daha büyük olur.
        </p>
      </div>
    </div>
  );
}
