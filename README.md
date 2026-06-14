# SVG → G-Code Üretici

CNC çizici / plotter için tarayıcı tabanlı CAM aracı. SVG dosyalarını güvenli,
optimize edilmiş G-code'a dönüştürür ve sonucu canvas üzerinde simüle eder.

## Özellikler

- **Sürükle-bırak SVG yükleme** (path, line, rect, circle, ellipse, polyline, polygon + nested transform desteği)
- **Web Worker** ile UI'yi bloklamayan G-code üretimi
- **Nearest Neighbor** yol optimizasyonu (boşta gezinme süresini azaltır)
- **G-code simülasyonu:** G0 (boşta) kesik kırmızı, G1 (kesim) düz mavi
- **Makine güvenliği:** her zaman önce Güvenli Z'ye çıkış, her yol sonunda anında geri çekilme, NaN koruması
- **Türkçe arayüz**, responsive konfigürasyon paneli

## Kurulum

> Node.js 18+ gereklidir. https://nodejs.org

```bash
npm install
npm run dev
```

Tarayıcıda açılan adrese gidin (genelde http://localhost:5173).

## Kullanım

1. SVG dosyasını sürükleyip bırakın.
2. Makine parametrelerini ayarlayın (Güvenli Z, Çizim Z, Kesim/Boşta hız, Hassasiyet).
3. **G-Code Üret**'e tıklayın → simülasyonu inceleyin.
4. **G-Code İndir** ile `.gcode` dosyasını kaydedin.

## G-Code güvenlik kuralları

- Header: `G21` (metrik), `G90` (mutlak)
- Başlangıç: herhangi bir X/Y hareketinden ÖNCE `G0 Z[SafeZ]`
- Yol: `G0 X Y` → `G1 Z[DrawZ] F[Feed]` (dalış) → `G1 X Y` (çizim) → `G0 Z[SafeZ]` (geri çekil)
- Footer: Güvenli Z → `G0 X0 Y0` → `M30`
- `Güvenli Z > Çizim Z` zorunlu (çarpışma koruması), tüm hızlar > 0

## Mimari

| Dosya | Sorumluluk |
|------|-----------|
| `src/store.ts` | Zustand: makine parametreleri + iş durumu |
| `src/svgFlatten.ts` | SVG → polyline (tarayıcı geometri motoru, ana thread) |
| `src/gcode.worker.ts` | Worker: Nearest Neighbor + G-code üretimi |
| `src/useGcodeGenerator.ts` | Worker yaşam döngüsü + pipeline |
| `src/components/GCodeVisualizer.tsx` | Canvas simülasyonu |
| `src/components/ConfigPanel.tsx` | Parametre formu |
| `src/components/Dropzone.tsx` | Dosya yükleme |
```
