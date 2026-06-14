/**
 * G-code validation utilities.
 * Checks edited G-code for compliance with CNC machine rules and common issues.
 */

export interface GCodeValidationError {
  lineNumber: number;
  type: "error" | "warning" | "info";
  message: string;
  code: string;
}

interface ParsedMove {
  line: string;
  code?: string; // G0, G1, M104, etc.
  x?: number;
  y?: number;
  z?: number;
  f?: number;
}

/** Parse a single G-code line into its components. */
function parseLine(line: string): ParsedMove {
  const trimmed = line.trim().toUpperCase();
  const result: ParsedMove = { line: trimmed };

  if (!trimmed || trimmed.startsWith(";")) return result;

  // Extract motion code (G0, G1, etc.)
  const codeMatch = trimmed.match(/^(G\d+|M\d+)/);
  if (codeMatch) {
    result.code = codeMatch[1];
  }

  // Extract axis positions
  const xMatch = trimmed.match(/X([-\d.]+)/);
  const yMatch = trimmed.match(/Y([-\d.]+)/);
  const zMatch = trimmed.match(/Z([-\d.]+)/);
  const fMatch = trimmed.match(/F([-\d.]+)/);

  if (xMatch) result.x = parseFloat(xMatch[1]);
  if (yMatch) result.y = parseFloat(yMatch[1]);
  if (zMatch) result.z = parseFloat(zMatch[1]);
  if (fMatch) result.f = parseFloat(fMatch[1]);

  return result;
}

/** Validate G-code for common issues and rule violations. */
export function validateGCode(gcode: string): GCodeValidationError[] {
  const errors: GCodeValidationError[] = [];
  const lines = gcode.split("\n");
  let lastF: number | undefined;

  // Validate
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith(";")) continue;

    const parsed = parseLine(line);
    if (!parsed.code) {
      errors.push({
        lineNumber: lineNum,
        type: "warning",
        message: "Tanınan G-code komutu bulunamadı. Satır yoksayılabilir.",
        code: "UNRECOGNIZED_COMMAND",
      });
      continue;
    }

    // Rule: G0/G1 lines should have at least one axis or Z movement
    if ((parsed.code === "G0" || parsed.code === "G1") && 
        parsed.x === undefined && 
        parsed.y === undefined && 
        parsed.z === undefined) {
      errors.push({
        lineNumber: lineNum,
        type: "warning",
        message: `${parsed.code} komutu eksik hareket. X/Y/Z parametrelerinden biri gerekli.`,
        code: "INCOMPLETE_MOVE",
      });
    }

    // Rule: G1 (feed move) should have F (feedrate) or use last F
    if (parsed.code === "G1") {
      if (parsed.f !== undefined) {
        lastF = parsed.f;
      } else if (lastF === undefined) {
        errors.push({
          lineNumber: lineNum,
          type: "warning",
          message: "G1 komutu hız (F) parametresi olmadan. Önceki F kullanılacak veya makine uyarı verebilir.",
          code: "MISSING_FEEDRATE",
        });
      }

      // Warn about Z positions on G1 (usually should be G0)
      if (parsed.z !== undefined && (parsed.x !== undefined || parsed.y !== undefined)) {
        errors.push({
          lineNumber: lineNum,
          type: "info",
          message: "G1 sırasında X/Y ve Z birlikte hareket ediliyor. Z eksen hareketinin G0 olması genellikle daha hızlı olur.",
          code: "Z_WITH_XY",
        });
      }
    }

    // Rule: Negative positions are usually mistakes (unless intentional offset)
    if (parsed.x !== undefined && parsed.x < 0) {
      errors.push({
        lineNumber: lineNum,
        type: "warning",
        message: `Negatif X pozisyonu: ${parsed.x}. Makine sınırları dışına çıkabilir.`,
        code: "NEGATIVE_POSITION",
      });
    }
    if (parsed.y !== undefined && parsed.y < 0) {
      errors.push({
        lineNumber: lineNum,
        type: "warning",
        message: `Negatif Y pozisyonu: ${parsed.y}. Makine sınırları dışına çıkabilir.`,
        code: "NEGATIVE_POSITION",
      });
    }

    // Rule: Very high feedrates might be unrealistic
    if (parsed.f !== undefined && parsed.f > 5000) {
      errors.push({
        lineNumber: lineNum,
        type: "warning",
        message: `Çok yüksek hız değeri: ${parsed.f} mm/dak. Makine buna uyum sağlayamayabilir.`,
        code: "UNREALISTIC_FEEDRATE",
      });
    }
  }

  // Final check: ensure program ends with Z safe move
  const lastCodeLine = lines
    .map((l, i) => ({ line: l.trim(), idx: i }))
    .reverse()
    .find((item) => item.line && !item.line.startsWith(";"));

  if (lastCodeLine) {
    const lastParsed = parseLine(lastCodeLine.line);
    if (lastParsed.code && lastParsed.code !== "G0") {
      // Check if it's a Z-safe move
      if (!(lastParsed.z !== undefined && lastParsed.z > 3)) {
        errors.push({
          lineNumber: lastCodeLine.idx + 1,
          type: "info",
          message: "Program son satırında güvenli Z yüksekliğine (Safe Z) dönülmüyor. Güvenlik önerir.",
          code: "MISSING_SAFE_Z",
        });
      }
    }
  }

  return errors;
}

/** Check if two G-code strings are functionally equivalent (ignoring whitespace/comments). */
export function gcodeEquivalent(original: string, edited: string): boolean {
  const normalize = (code: string) =>
    code
      .split("\n")
      .map((line) => line.trim().toUpperCase())
      .filter((line) => line && !line.startsWith(";"))
      .join("\n");

  return normalize(original) === normalize(edited);
}
