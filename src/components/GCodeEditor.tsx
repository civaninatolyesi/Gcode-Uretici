/**
 * GCodeEditor — editable, validating G-code viewer and editor.
 * 
 * Features:
 * - Edit G-code with live validation
 * - Syntax highlighting
 * - Line-by-line error/warning display
 * - Save and reset functionality
 * - Download capability
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateGCode, gcodeEquivalent, type GCodeValidationError } from "../gcodeValidator";

interface GCodeEditorProps {
  originalGCode: string;
  onGCodeChange?: (newGCode: string) => void;
}

export function GCodeEditor({ originalGCode, onGCodeChange }: GCodeEditorProps) {
  const [editedGCode, setEditedGCode] = useState(originalGCode);
  const [isEditing, setIsEditing] = useState(false);
  const [errors, setErrors] = useState<GCodeValidationError[]>([]);
  const [showPanel, setShowPanel] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  // Re-sync when a fresh G-code is generated upstream.
  useEffect(() => {
    setEditedGCode(originalGCode);
    setIsEditing(false);
  }, [originalGCode]);

  // Validate on edit
  useEffect(() => {
    const validationErrors = validateGCode(editedGCode);
    setErrors(validationErrors);

    if (onGCodeChange && !gcodeEquivalent(originalGCode, editedGCode)) {
      onGCodeChange(editedGCode);
    }
  }, [editedGCode, originalGCode, onGCodeChange]);

  // Jump to a 1-based line in whichever pane is active.
  const goToLine = useCallback(
    (lineNum: number) => {
      if (isEditing) {
        const ta = textareaRef.current;
        if (!ta) return;
        const allLines = editedGCode.split("\n");
        const start = allLines.slice(0, lineNum - 1).reduce((n, l) => n + l.length + 1, 0);
        const end = start + (allLines[lineNum - 1]?.length ?? 0);
        ta.focus();
        ta.setSelectionRange(start, end);
        // Approximate scroll: line height ~ 1.25rem at text-xs.
        ta.scrollTop = Math.max(0, (lineNum - 3) * 20);
      } else {
        const row = viewRef.current?.querySelector<HTMLElement>(`[data-line="${lineNum}"]`);
        row?.scrollIntoView({ block: "center", behavior: "smooth" });
        row?.classList.add("ring-1", "ring-sky-500");
        window.setTimeout(() => row?.classList.remove("ring-1", "ring-sky-500"), 1200);
      }
    },
    [isEditing, editedGCode]
  );

  const handleReset = useCallback(() => {
    setEditedGCode(originalGCode);
    setIsEditing(false);
  }, [originalGCode]);

  const handleSave = useCallback(() => {
    // If there are errors, ask for confirmation
    const hasErrors = errors.some((e) => e.type === "error");
    if (hasErrors) {
      const confirmed = window.confirm(
        "Hatalar var! Yine de kaydedilsin mi? G-code bozulabilir."
      );
      if (!confirmed) return;
    }
    setIsEditing(false);
  }, [errors]);

  const handleToggleEdit = useCallback(() => {
    if (isEditing) {
      handleSave();
    } else {
      setIsEditing(true);
    }
  }, [isEditing, handleSave]);

  const errorCount = errors.filter((e) => e.type === "error").length;
  const warningCount = errors.filter((e) => e.type === "warning").length;

  // Get error map for quick lookup by line
  const errorsByLine = useMemo(() => {
    const map = new Map<number, GCodeValidationError[]>();
    errors.forEach((err) => {
      const list = map.get(err.lineNumber);
      if (list) list.push(err);
      else map.set(err.lineNumber, [err]);
    });
    return map;
  }, [errors]);

  const lines = useMemo(() => editedGCode.split("\n"), [editedGCode]);
  const isModified = !gcodeEquivalent(originalGCode, editedGCode);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header with validation status and controls */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-700 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-300">G-Code Editörü</span>
          {isModified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-200">
              ✏️ Düzenlendi
            </span>
          )}
        </div>

        {/* Validation status badges */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[11px] text-slate-500">{lines.length} satır</span>
          {errorCount > 0 && (
            <div className="inline-flex items-center gap-1 rounded px-2 py-1 bg-red-950 text-red-200 text-xs font-medium">
              ❌ {errorCount} Hata
            </div>
          )}
          {warningCount > 0 && (
            <div className="inline-flex items-center gap-1 rounded px-2 py-1 bg-amber-950 text-amber-200 text-xs font-medium">
              ⚠️ {warningCount} Uyarı
            </div>
          )}
          {errorCount === 0 && warningCount === 0 && (
            <div className="inline-flex items-center gap-1 rounded px-2 py-1 bg-green-950 text-green-200 text-xs font-medium">
              ✓ Geçerli
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleToggleEdit}
          className={[
            "rounded-md px-3 py-1.5 text-sm font-medium transition",
            isEditing
              ? "bg-green-600 text-white hover:bg-green-500"
              : "bg-blue-600 text-white hover:bg-blue-500",
          ].join(" ")}
        >
          {isEditing ? "💾 Kaydet" : "✏️ Düzenle"}
        </button>

        {isEditing && (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:bg-slate-600"
          >
            ↶ Geri Al
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            const blob = new Blob([editedGCode], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "program.gcode";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          }}
          className="ml-auto rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:bg-slate-600"
          title="Bu editörden indir (değişiklikler dahil)"
        >
          ⬇ İndir (Düzenlenmiş)
        </button>
      </div>

      {/* Main editing area */}
      <div className="flex-1 min-h-0 flex gap-3">
        {/* Line numbers + code */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-lg bg-slate-950 border border-slate-800">
          {isEditing ? (
            <div className="flex-1 min-h-0 flex font-mono text-xs leading-5">
              {/* synced line-number gutter */}
              <div
                aria-hidden
                className="select-none overflow-hidden bg-slate-900/60 px-3 py-4 text-right text-slate-600"
                ref={(el) => {
                  // keep gutter scroll in sync via the textarea handler below
                  if (el) el.dataset.gutter = "1";
                }}
                id="gcode-gutter"
              >
                {lines.map((_, i) => (
                  <div key={i} className={errorsByLine.has(i + 1) ? "text-red-400" : ""}>
                    {i + 1}
                  </div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                value={editedGCode}
                onChange={(e) => setEditedGCode(e.target.value)}
                onScroll={(e) => {
                  const g = document.getElementById("gcode-gutter");
                  if (g) g.scrollTop = e.currentTarget.scrollTop;
                }}
                className="flex-1 px-4 py-4 bg-slate-950 text-slate-100 font-mono text-xs leading-5 border-0 outline-none resize-none overflow-auto"
                placeholder="G-code editöründe değişiklik yapın..."
                spellCheck="false"
              />
            </div>
          ) : (
            <div ref={viewRef} className="flex-1 overflow-auto p-4">
              <table className="w-full border-collapse">
                <tbody>
                  {lines.map((line, idx) => {
                    const lineNum = idx + 1;
                    const lineErrors = errorsByLine.get(lineNum) || [];
                    const hasError = lineErrors.some((e) => e.type === "error");
                    const hasWarning = lineErrors.some((e) => e.type === "warning");

                    return (
                      <tr
                        key={idx}
                        data-line={lineNum}
                        className={[
                          "hover:bg-slate-900 transition",
                          hasError ? "bg-red-950/40" : hasWarning ? "bg-amber-950/30" : "",
                        ].join(" ")}
                      >
                        <td className="w-8 select-none text-right pr-3 text-slate-600 font-mono text-xs border-r border-slate-800">
                          {lineNum}
                        </td>
                        <td className="pl-3 py-1 font-mono text-xs text-slate-300 break-all">
                          <code>{line}</code>
                        </td>
                        {(hasError || hasWarning) && (
                          <td className="pl-2 w-6">
                            <span
                              className={[
                                "inline-block text-lg leading-none",
                                hasError ? "text-red-500" : "text-amber-500",
                              ].join(" ")}
                              title={lineErrors.map((e) => e.message).join("\n")}
                            >
                              {hasError ? "❌" : "⚠️"}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Error/warning panel */}
        {errors.length > 0 && showPanel && (
          <div className="w-80 shrink-0 min-h-0 overflow-auto rounded-lg bg-slate-950 border border-slate-800 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300">Doğrulama Sonuçları</h3>
              <button
                type="button"
                onClick={() => setShowPanel(false)}
                className="text-slate-500 hover:text-slate-300"
                title="Paneli gizle"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {errors.map((error, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => goToLine(error.lineNumber)}
                  title="Bu satıra git"
                  className={[
                    "block w-full text-left rounded-lg p-3 border-l-4 text-xs space-y-1 transition hover:brightness-125 cursor-pointer",
                    error.type === "error"
                      ? "bg-red-950/50 border-red-600 text-red-200"
                      : error.type === "warning"
                        ? "bg-amber-950/50 border-amber-600 text-amber-200"
                        : "bg-blue-950/50 border-blue-600 text-blue-200",
                  ].join(" ")}
                >
                  <div className="font-semibold">
                    {error.type === "error"
                      ? "❌"
                      : error.type === "warning"
                        ? "⚠️"
                        : "ℹ️"}{" "}
                    Satır {error.lineNumber}
                  </div>
                  <div>{error.message}</div>
                  <div className="text-[10px] opacity-70">{error.code}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Re-open panel tab when collapsed */}
        {errors.length > 0 && !showPanel && (
          <button
            type="button"
            onClick={() => setShowPanel(true)}
            className="shrink-0 self-start rounded-lg border border-slate-800 bg-slate-950 px-2 py-3 text-xs text-slate-400 hover:text-slate-200"
            title="Doğrulama panelini göster"
          >
            ◀ {errors.length}
          </button>
        )}
      </div>

      {/* Helpful tips — collapsed by default so they don't steal editor height */}
      {isEditing && (
        <details className="shrink-0 text-xs text-slate-500 bg-slate-900/50 rounded-lg px-3 py-2">
          <summary className="cursor-pointer select-none font-semibold">İpuçları</summary>
          <ul className="mt-1 space-y-1 ml-3 list-disc">
            <li>G0 = hızlı hareket (boşta), G1 = beslemeli hareket (kesim)</li>
            <li>X, Y, Z eksen koordinatları, F hız parametresidir</li>
            <li>Satır başında ; ile başlayan satırlar açıklamadır</li>
            <li>Program sonunda güvenli Z yüksekliğine dönülmesi önerilir</li>
          </ul>
        </details>
      )}
    </div>
  );
}
