# Mimari Genel Bakış

Bu belge, **CNC Etiket Makinesi**'nin nasıl çalıştığını uçtan uca anlatır:
veri nereden gelir, nasıl dönüşür, nereye gider. Tek bir dosyaya dokunmadan
önce buradaki akışı zihninde canlandırabilmelisin.

> Kod düzeyinde "neyi nereye yazarım?" sorusu için → [GELISTIRME-REHBERI.md](./GELISTIRME-REHBERI.md)
> Tasarım kararlarının _nedenleri_ için → [adr/](./adr/)
> G-code çıktısının tam biçimi için → [GCODE-REFERANSI.md](./GCODE-REFERANSI.md)

---

## 1. Tek cümlede

Kullanıcının **metni** (veya bir **SVG dosyası**) ana thread'de düz çizgi
parçalarına (**polyline**) çevrilir; bu saf sayılar bir **Web Worker**'a
gönderilir; worker yolları **optimize edip güvenli G-code** üretir; sonuç
**canvas'ta simüle edilir** ve fiziksel boyut **tabla sınırlarıyla** kontrol
edilip `.gcode` olarak indirilebilir.

## 2. Katmanlar

```
┌─────────────────────────────────────────────────────────────────┐
│  UI KATMANI (React bileşenleri)                                   │
│  App · ModeSwitch · TextInputPanel · Dropzone · ConfigPanel ·     │
│  GCodeVisualizer · DimensionPanel · StatusBadge · StatsRow        │
└───────────────▲───────────────────────────────┬──────────────────┘
                │ okur (selector)                │ yazar (action)
┌───────────────┴───────────────────────────────▼──────────────────┐
│  DURUM KATMANI — Zustand (src/store.ts)                           │
│  Parametreler · sınırlar · mod · kaynak · sonuç · durum · hata    │
│  + saf yardımcı: checkWithinLimits()                              │
└───────────────▲───────────────────────────────┬──────────────────┘
                │ getState/setState              │
┌───────────────┴───────────────────────────────▼──────────────────┐
│  ORKESTRASYON — useGcodeGenerator (hook)                          │
│  worker yaşam döngüsü · generate() · kaynağa göre dallanma        │
└──────┬──────────────────────────────────────────────┬───────────┘
       │ (ANA THREAD: DOM gerektiren geometri)         │ postMessage
┌──────▼───────────────────────┐        ┌──────────────▼───────────┐
│ GEOMETRİ ÜRETİCİLERİ          │        │  WEB WORKER               │
│ textToPaths.ts (opentype.js)  │ polyl. │  gcode.worker.ts          │
│ svgFlatten.ts  (tarayıcı SVG) │──────► │  NN sıralama + G-code +   │
│                               │        │  bbox + moves             │
└───────────────────────────────┘        └──────────────┬───────────┘
                                                          │ result
                                          (geri store'a → UI günceller)
```

## 3. Ana veri akışı (adım adım)

Kullanıcı **"G-Code Üret"**'e bastığında:

1. **`useGcodeGenerator.generate()`** çağrılır
   ([src/useGcodeGenerator.ts](../src/useGcodeGenerator.ts)).
2. Store'dan `mode`, girdi ve parametreler okunur. Durum → `"parsing"`.
3. **Kaynağa göre polyline üretimi (ANA THREAD)** — DOM gerektiği için
   worker'da yapılamaz:
   - `mode === "text"` → `textToPolylines()` ([textToPaths.ts](../src/textToPaths.ts))
   - `mode === "svg"`  → `flattenSvg()` ([svgFlatten.ts](../src/svgFlatten.ts))
   - **Çıktı sözleşmesi (her iki kaynak için aynı):** mm cinsinden, Y-yukarı,
     sınırlayıcı kutu **sol-alt köşesi (0,0)**.
4. Durum → `"generating"`. Polyline'lar + parametreler `postMessage` ile
   **worker'a** gönderilir (`GenerateRequest`).
5. **Worker** ([gcode.worker.ts](../src/gcode.worker.ts)):
   a. `cleanPolylines` — geçersiz/yinelenen noktaları atar.
   b. `computeBoundingBox` — gerçek genişlik/yükseklik (mm).
   c. `nearestNeighborOrder` — boşta gezinmeyi azaltacak sıralama.
   d. `generateGcode` — güvenli G-code string + `moves` (simülasyon için) +
      `stats` üretir. Her sayı `assertFinite` ile doğrulanır.
   e. Sonuç `postMessage` ile geri döner (`WorkerResponse`).
6. Hook'taki `worker.onmessage`, sonucu **store'a** yazar (`setResult`),
   durum → `"ready"`. Hata olursa `setError`, durum → `"error"`.
7. **UI tepkisi (otomatik, store aboneliğiyle):**
   - `GCodeVisualizer` `moves`'u canvas'a çizer (G0 kesik kırmızı, G1 düz mavi).
   - `DimensionPanel` `stats.bbox`'u gösterir ve `checkWithinLimits` ile sınır
     kontrolü yapar; aşımda uyarı + indirme kilidi.
   - Ham G-code `<pre>` içinde listelenir; "G-Code İndir" aktifse indirilir.

## 4. Thread sınırı — altın kural

| Ana Thread (DOM var)                          | Web Worker (DOM yok)                    |
| --------------------------------------------- | --------------------------------------- |
| React, Zustand, UI                            | Saf hesaplama                           |
| `textToPaths.ts` (opentype.js glyph yolu)     | `gcode.worker.ts` (NN, G-code, bbox)    |
| `svgFlatten.ts` (`getPointAtLength`, `getCTM`) | —                                       |
| Sınır karşılaştırması (UI gösterimi)          | Sınır için gereken **bbox** hesabı      |

**Worker'a sadece düz sayılar gider.** `src/types.ts` içindeki tipler
(`Polyline`, `MachineParams`, `GMove`, `JobStats`) bu sözleşmedir. Buraya asla
DOM nesnesi, fonksiyon veya `NaN` koyma. Neden? → [ADR-0002](./adr/0002-web-worker-kullanimi.md).

## 5. Koordinat sistemi sözleşmesi

- **Kaynak (SVG/font):** Y aşağı doğru artar (ekran geleneği).
- **Makine/çıktı:** Y yukarı doğru artar; origin **sol-alt (0,0)**.
- Dönüşüm her iki üreticide de yapılır: `y' = (maxY - minY) - (y - minY)` ve
  `x' = x - minX`. Yani çizim her zaman birinci kadrana, (0,0)'dan başlayacak
  şekilde oturur.
- Bu sözleşme sayesinde "genişlik ≤ maxX, yükseklik ≤ maxY" kontrolü doğrudan
  fiziksel sığmayı temsil eder. → [ADR-0006](./adr/0006-tabla-siniri-guvenlik.md).

## 6. Durum modeli (kısa)

`status` makinesi: `idle → parsing → generating → ready` (veya herhangi bir
adımdan `error`). Girdi/mod/parametre değişimi sonuçları **geçersiz kılar**
(stale çıktı gösterilmez). Ayrıntı: [GELISTIRME-REHBERI.md](./GELISTIRME-REHBERI.md#durum-store).

## 7. Tipler tek kaynak

[src/types.ts](../src/types.ts) ana thread ile worker arasındaki **sözleşmedir**.
Mesaj biçimi (`GenerateRequest` / `WorkerResponse`) veya istatistikler
(`JobStats`, `BoundingBox`) değişecekse **önce burayı** güncelle; derleyici geri
kalan tüm dokunulması gereken yerleri sana gösterir.

## 8. Dış bağımlılıklar

| Bağımlılık     | Nerede                | Niçin                                | ADR |
| -------------- | --------------------- | ------------------------------------ | --- |
| React + Vite   | tüm UI / build        | SPA iskeleti                         | 0001 |
| Zustand        | `store.ts`            | Az kalıplı global durum              | 0001 |
| Tailwind CSS   | bileşenler            | Hızlı, tutarlı stil                  | 0001 |
| opentype.js    | `textToPaths.ts`      | Metin → glyph dış hatları            | 0004 |
| Roboto TTF     | `public/fonts/`       | Offline varsayılan font (Apache-2.0) | 0004 |
| Playwright*    | (geliştirme/test)     | Headless tarayıcı doğrulaması        | —   |

\* Yalnızca geliştirme aracı; üretim paketine girmez.
