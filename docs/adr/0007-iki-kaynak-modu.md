# ADR-0007: İki kaynaklı (Metin + SVG) mod yapısı

- **Durum:** Accepted
- **Tarih:** 2026-06-14
- **Karar verenler:** Proje sahibi + geliştirici

## Bağlam

Uygulama önce SVG→G-code aracıydı, sonra ana özellik **etiket makinesine
(metin→G-code)** dönüştürüldü. Proje sahibi SVG yeteneğinin de kalmasını,
ancak **ikincil** bir özellik olarak durmasını istedi: ana iş akışı metin,
yan iş akışı SVG.

## Karar

Tek bir **kaynak modu** durumu ekledik: `mode: "text" | "svg"`
([`store.ts`](../../src/store.ts)). UI'da sekme (`ModeSwitch`,
[`App.tsx`](../../src/App.tsx)) ile geçilir. Her iki kaynak da **aynı worker
pipeline'ını** besler; tek fark, polyline üretiminin nereden geldiğidir:

- `text` → `textToPaths.ts` (opentype.js)
- `svg`  → `svgFlatten.ts` (tarayıcı geometri motoru)

Dallanma tek noktada: [`useGcodeGenerator.ts`](../../src/useGcodeGenerator.ts)
`generate()`. Mod değişince önceki çıktı (`gcode/moves/stats`) temizlenir ki
iki kaynağın sonuçları asla karışmasın.

## Gerekçe

| Seçenek                       | Artı                                          | Eksi                            | Sonuç     |
| ----------------------------- | --------------------------------------------- | ------------------------------- | --------- |
| Tek mod state + ortak pipeline (seçilen) | DRY: optimizasyon/G-code/güvenlik tek yerde; iki kaynak eşit davranır | `generate()` içinde küçük dallanma | ✅ Seçildi |
| İki ayrı sayfa/uygulama       | Tam izolasyon                                 | Kod tekrarı, iki ayrı bakım     | ❌         |
| Otomatik algılama (girdiye göre) | Sekme yok                                   | Belirsiz UX, yanlış mod riski   | ❌         |

## Sonuçlar

- **Ortak sözleşme:** Her iki üretici de "polyline'lar mm cinsinden, Y-yukarı,
  sol-alt köşe (0,0)" döndürür. Yeni bir kaynak eklemek (örn. DXF) yalnızca
  yeni bir üretici + `generate()` içinde bir dal demektir.
- Worker, güvenlik kontrolü ve simülasyon **kaynaktan habersizdir**; sadece
  polyline görür. Bu, [ADR-0006](./0006-tabla-siniri-guvenlik.md) güvenliğinin
  her iki modda da otomatik geçerli olmasını sağlar.
- Sekme değişimi sonucu sıfırlar (`setMode`), böylece "metin sonucu SVG modunda
  görünüyor" gibi tutarsızlıklar oluşmaz.

## İlgili

- Kod: `src/store.ts` (`mode`, `setMode`), `src/App.tsx` (`ModeSwitch`),
  `src/useGcodeGenerator.ts` (`generate` dallanması)
- Diğer ADR'ler: ADR-0003, ADR-0004
