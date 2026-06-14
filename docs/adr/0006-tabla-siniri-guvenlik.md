# ADR-0006: Tabla sınırı güvenlik kontrolü ve indirme kilidi

- **Durum:** Accepted
- **Tarih:** 2026-06-14
- **Karar verenler:** Proje sahibi (CNC mühendisi) + geliştirici

## Bağlam

Makine fiziksel sınırlarının (tabla genişlik/yükseklik) dışına çıkmaya
çalışırsa donanım hasarı veya iş kaybı olur. Üretilen geometrinin fiziksel
boyutu, kullanıcının tanımladığı tabla sınırlarını aşmamalı. Bu bir **güvenlik
gereksinimi**, kozmetik bir uyarı değil.

## Karar

İki katmanlı koruma uyguluyoruz:

1. **Hesaplama:** Worker, üretilen geometrinin gerçek sınırlayıcı kutusunu
   (genişlik × yükseklik, mm) hesaplayıp `stats.bbox` içinde döner
   ([`gcode.worker.ts`](../../src/gcode.worker.ts) → `computeBoundingBox`).
2. **Kontrol + UI:** `checkWithinLimits()` ([`store.ts`](../../src/store.ts))
   bu kutuyu `maxX`/`maxY` ile karşılaştırır. Aşım varsa:
   - UI'da net bir **kırmızı uyarı** gösterilir, aşan eksen vurgulanır.
   - **"G-Code İndir" butonu devre dışı** bırakılır.
   - İndirme fonksiyonunda **son bir guard** daha vardır
     ([`App.tsx`](../../src/App.tsx) `handleDownload`): buton bir şekilde
     tetiklense bile sınır dışı program asla diske yazılmaz.

## Gerekçe

| Seçenek                               | Artı                                | Eksi                              | Sonuç     |
| ------------------------------------- | ----------------------------------- | --------------------------------- | --------- |
| Hesapla + UI kilit + indirme guard (seçilen) | Çok katmanlı, hatalı çıktı engellenir | Biraz fazladan kod              | ✅ Seçildi |
| Sadece uyarı göster                   | Basit                               | Kullanıcı yine de indirebilir → risk | ❌      |
| G-code'u sınıra kırpma (clip)         | "Çalışır" çıktı                     | Sessizce yanlış parça üretir, tehlikeli | ❌   |

Kırpma yerine **engelleme** seçildi: yanlış bir etiketi sessizce üretmektense
kullanıcıyı durdurup boyut/sınır düzeltmesini istemek daha güvenli.

## Sonuçlar

- `bbox` worker'dan gelen `JobStats`'ın parçasıdır; her üretimde güncellenir.
- Kontrol mantığı tek bir saf fonksiyonda (`checkWithinLimits`) toplandı; UI
  bunu hem boyut panelinde hem buton durumunda hem de indirme guard'ında
  kullanır. **Tek doğruluk kaynağı.**
- Origin sol-altta (0,0) olduğundan, "genişlik ≤ maxX ve yükseklik ≤ maxY"
  kontrolü makinenin pozitif çalışma alanına sığmayı temsil eder.

## İlgili

- Kod: `src/gcode.worker.ts` (`computeBoundingBox`), `src/store.ts`
  (`checkWithinLimits`), `src/App.tsx` (`DimensionPanel`, `handleDownload`)
- Diğer ADR'ler: ADR-0003, ADR-0004 (normalize → origin sol-altta)
