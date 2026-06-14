/**
 * Drag-and-drop zone for .svg files (also clickable to open the file picker).
 */

import { useCallback, useRef, useState } from "react";
import { useMachineStore } from "../store";

export function Dropzone() {
  const setFile = useMachineStore((s) => s.setFile);
  const setError = useMachineStore((s) => s.setError);
  const fileName = useMachineStore((s) => s.fileName);
  const clearFile = useMachineStore((s) => s.clearFile);

  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const isSvg =
        file.type === "image/svg+xml" ||
        file.name.toLowerCase().endsWith(".svg");
      if (!isSvg) {
        setError("Lütfen geçerli bir .svg dosyası seçin.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        if (!text.trim()) {
          setError("Dosya boş görünüyor.");
          return;
        }
        setFile(file.name, text);
      };
      reader.onerror = () => setError("Dosya okunamadı.");
      reader.readAsText(file);
    },
    [setFile, setError],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
      onClick={() => inputRef.current?.click()}
      className={[
        "cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors",
        dragging
          ? "border-blue-400 bg-blue-500/10"
          : "border-slate-600 bg-slate-800/40 hover:border-slate-500",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".svg,image/svg+xml"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {fileName ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-300">
            Yüklenen dosya:{" "}
            <span className="font-semibold text-blue-300">{fileName}</span>
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearFile();
            }}
            className="rounded-md bg-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-600"
          >
            Dosyayı kaldır
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-base font-medium text-slate-200">
            SVG dosyasını buraya sürükleyin
          </p>
          <p className="text-xs text-slate-400">
            ya da tıklayarak seçin (.svg)
          </p>
        </div>
      )}
    </div>
  );
}
