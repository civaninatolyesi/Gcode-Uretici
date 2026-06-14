# Geliştirme Rehberi — "Nereye Dokunacağım?"

Bu belge görev odaklıdır. "Şunu değiştirmek/eklemek istiyorum, hangi dosya?"
sorusunun cevabını verir. Önce hızlı haritaya bak, sonra ilgili reçeteye git.

> Sistemin _nasıl_ çalıştığı → [ARCHITECTURE.md](./ARCHITECTURE.md)
> Kararların _nedeni_ → [adr/](./adr/)

---

## Dosya haritası

| Dosya | Sorumluluk | Thread |
| ----- | ---------- | ------ |
| [src/main.tsx](../src/main.tsx) | React kök montajı | ana |
| [src/App.tsx](../src/App.tsx) | Yerleşim, sekme (`ModeSwitch`), boyut paneli, indirme | ana |
| [src/store.ts](../src/store.ts) | Zustand global durum + `checkWithinLimits` | ana |
| [src/types.ts](../src/types.ts) | **Ana↔worker sözleşmesi** (tüm paylaşılan tipler) | ortak |
| [src/useGcodeGenerator.ts](../src/useGcodeGenerator.ts) | Worker yaşam döngüsü + `generate()` orkestrasyonu | ana |
| [src/textToPaths.ts](../src/textToPaths.ts) | Metin → polyline (opentype.js) + `normalizeToOrigin` (paylaşılan) | ana |
| [src/fonts/index.ts](../src/fonts/index.ts) | **Font kayıt defteri** (`FontProvider` arayüzü + registry) | ana |
| [src/fonts/hersheyData.ts](../src/fonts/hersheyData.ts) | Tek-çizgi (Hershey) glyph verisi (gömülü) | ana |
| [src/fonts/hersheyFont.ts](../src/fonts/hersheyFont.ts) | Hershey metin dizilimi → ham polyline | ana |
| [src/useSimPlayer.ts](../src/useSimPlayer.ts) | Simülasyon oynatma (oynat/duraklat/hız/ilerleme) | ana |
| [src/svgFlatten.ts](../src/svgFlatten.ts) | SVG → polyline (tarayıcı geometri motoru) | ana |
| [src/gcode.worker.ts](../src/gcode.worker.ts) | NN sıralama + G-code + bbox + moves | **worker** |
| [src/components/TextInputPanel.tsx](../src/components/TextInputPanel.tsx) | Metin + yazı boyutu girişi | ana |
| [src/components/Dropzone.tsx](../src/components/Dropzone.tsx) | SVG sürükle-bırak | ana |
| [src/components/ConfigPanel.tsx](../src/components/ConfigPanel.tsx) | Tabla sınırları + makine parametreleri formu | ana |
| [src/components/GCodeVisualizer.tsx](../src/components/GCodeVisualizer.tsx) | Canvas simülasyonu | ana |
| [public/fonts/Roboto-Regular.ttf](../public/fonts/Roboto-Regular.ttf) | Varsayılan font | varlık |

---

## Reçeteler

### 🟢 Yeni bir makine parametresi eklemek (örn. "Dwell süresi")

1. [src/types.ts](../src/types.ts) → `MachineParams` arayüzüne alanı ekle.
2. [src/store.ts](../src/store.ts) → varsayılan değerini ve `getParams()`
   dönüşüne ekle. (Setter hazır: `setParam` generic.)
3. [src/components/ConfigPanel.tsx](../src/components/ConfigPanel.tsx) →
   `PARAM_FIELDS` dizisine bir `FieldDef` ekle. Form otomatik üretir.
4. [src/gcode.worker.ts](../src/gcode.worker.ts) → `generateGcode` içinde
   `assertFinite(params.yeniAlan, "...")` ile doğrula ve G-code'da kullan.

TypeScript, `MachineParams`'ı genişletince eksik kalan yerleri sana derleme
hatasıyla gösterir.

### 🟢 Tabla sınırı / güvenlik mantığını değiştirmek

- Sınır kıyas mantığı **tek yerde**: [src/store.ts](../src/store.ts) →
  `checkWithinLimits()`. Buton durumu, uyarı ve indirme guard'ı hep bunu
  kullanır. Kuralı buradan değiştir.
- Sınır alanları: [ConfigPanel.tsx](../src/components/ConfigPanel.tsx) →
  `LIMIT_FIELDS`.
- bbox'un nasıl hesaplandığı: [gcode.worker.ts](../src/gcode.worker.ts) →
  `computeBoundingBox`. → İlgili karar: [ADR-0006](./adr/0006-tabla-siniri-guvenlik.md).

### 🟢 G-code çıktı biçimini değiştirmek (header/footer/komut sırası)

- Tek yer: [src/gcode.worker.ts](../src/gcode.worker.ts) → `generateGcode`.
- Sayı formatı: aynı dosyada `fmt()` (3 ondalık, `-0` temizlenir).
- **Dikkat:** Güvenlik sırasını bozma — her X/Y'den önce `G0 Z[SafeZ]`, yol
  sonunda geri çekilme. Tam sözleşme: [GCODE-REFERANSI.md](./GCODE-REFERANSI.md).
- `moves` dizisini de tutarlı güncelle, yoksa simülasyon gerçekten sapar.

### 🟢 Simülasyon görünümünü değiştirmek (renk, çizgi, ölçek)

- Tek yer: [src/components/GCodeVisualizer.tsx](../src/components/GCodeVisualizer.tsx).
- G0 = kesik kırmızı, G1 = düz mavi; `zOnly` hareketler XY'de çizilmez (sadece
  kalem pozisyonu güncellenir). Otomatik ölçek + Y-çevirme buradadır.

### 🟢 Yeni bir geometri kaynağı eklemek (örn. DXF içe aktarma)

Mevcut iki kaynağı (text/svg) örnek al:

1. Yeni üretici dosyası yaz (örn. `src/dxfToPaths.ts`). **Sözleşme:** mm,
   Y-yukarı, sol-alt köşe (0,0) polyline'lar döndür.
2. [src/store.ts](../src/store.ts) → `SourceMode`'a `"dxf"` ekle, gerekli
   kaynak state + setter'ı ekle.
3. [src/useGcodeGenerator.ts](../src/useGcodeGenerator.ts) → `generate()`
   içinde yeni bir `else if (mode === "dxf")` dalı.
4. [src/App.tsx](../src/App.tsx) → `ModeSwitch` sekmelerine ekle ve ilgili
   giriş panelini koşullu render et.

Worker, güvenlik ve simülasyon **hiç değişmez** — hepsi sadece polyline görür.
→ Tasarım: [ADR-0007](./adr/0007-iki-kaynak-modu.md).

### 🟢 Yeni bir yazı tipi eklemek (outline veya tek-çizgi)

Fontlar [src/fonts/index.ts](../src/fonts/index.ts) içindeki `FONTS` kayıt
defterinde toplanır; her font `FontProvider` arayüzünü uygular. Açık/Kapalı:
yeni font = yeni provider, çağıran hiçbir yer (store/generator/UI) değişmez.

- **Outline (TTF) font:** `.ttf`'i [public/fonts/](../public/fonts/) içine koy,
  yeni bir provider ekle (`toPolylines` → `loadFont` benzeri + `textToPolylines`).
  opentype.js import'u `import * as opentype` olmalı (default export yok).
  → [ADR-0004](./adr/0004-metin-yol-opentype.md).
- **Tek-çizgi (Hershey) font:** glyph verisini
  [src/fonts/hersheyData.ts](../src/fonts/hersheyData.ts) biçiminde gömüp bir
  provider ekle. Tek-çizgi fontlar kalın kalem için harfin **ortasından** geçer
  ve çok daha az G-code üretir.
- Her provider çıktısını `normalizeToOrigin` ile aynı sözleşmeye sokar (mm,
  Y-yukarı, sol-alt (0,0)) — worker/güvenlik/simülasyon değişmez.
- Yeni `FontId`'yi [src/store.ts](../src/store.ts)'deki birleşim tipine TS
  zaten zorlar; UI seçimi [AdvancedPanel](../src/components/AdvancedPanel.tsx)
  otomatik listeler.

### 🟢 Kalem ucu kalınlığı / simülasyon oynatma

- **Kalem ucu:** `penDiameterMm` bir `MachineParams` alanıdır ama **G-code'u
  değiştirmez** — yalnızca [GCodeVisualizer](../src/components/GCodeVisualizer.tsx)
  çizgiyi gerçek mm genişlikte çizmek için kullanır. Yeni parametre reçetesini
  izler ama worker'da kullanılmaz.
- **Oynatma:** zaman/ilerleme mantığı tek yerde,
  [src/useSimPlayer.ts](../src/useSimPlayer.ts) (kümülatif yol uzunluğu →
  ilerleme [0,1] + interpolasyonlu uç konumu). Görsel çizim Visualizer'da.

### 🟢 Yeni bir SVG ilkel/öznitelik desteklemek

- [src/svgFlatten.ts](../src/svgFlatten.ts) → `elementToPathDefs` (şekli
  `<path>` d-string'e çevirir) ve `SHAPE_SELECTOR` (taranan elemanlar).

### 🟢 UI metnini / dilini değiştirmek

- Tüm görünür metin Türkçe ve ilgili bileşenin içinde gömülü (i18n katmanı
  yok). İlgili `.tsx` dosyasında düzenle.

---

## Durum (store)

`useMachineStore` tek global mağaza. Önemli davranışlar:

- **Sonuç geçersiz kılma:** `setText`, `setFontSize`, `setSvg`, `clearSvg`,
  `setMode` çağrıldığında `gcode/moves/stats` sıfırlanır → ekranda hiçbir zaman
  güncel olmayan çıktı kalmaz.
- **Mod:** `mode: "text" | "svg"`. `setMode` kaynağı değiştirir ve sonucu
  temizler.
- **Saf yardımcı:** `checkWithinLimits(stats, limits)` — store dışında da
  çağrılabilen, yan etkisiz fonksiyon. Hem UI hem indirme guard'ı kullanır.
- **Selector kullan:** Bileşenlerde `useMachineStore((s) => s.x)` ile sadece
  ihtiyacın olan alanı seç (gereksiz render'ı önler).

---

## Yerel geliştirme

```bash
npm install      # ilk sefer
npm run dev      # http://localhost:5173
npm run build    # tip kontrolü (tsc -b) + üretim derlemesi → dist/
npm run preview  # üretim derlemesini yerelde önizle
```

### Doğru çalıştığını kontrol etme

- `npm run build` **hem** `tsc` hem Vite derlemesini yapar. Tip hatası varsa
  burada görürsün.
- ⚠️ **`tsc` her şeyi yakalamaz.** opentype.js default-import hatası gibi bazı
  sorunlar yalnızca **çalışma anında** ortaya çıkar (tip doğru görünür ama
  modül tarayıcıda yüklenemez). Şüphedeysen uygulamayı gerçekten aç ve
  tarayıcı konsoluna bak (boş/beyaz ekran = JS exception).
- Otomatik doğrulama için headless tarayıcı (Playwright) ile sayfayı açıp
  `pageerror`/`console.error` yakalamak en kesin yöntemdir.

---

## Kod stili

- TypeScript **strict**; `noUnusedLocals`/`noUnusedParameters` açık → kullanılmayan
  şey bırakma.
- Worker'a giden her sayı `assertFinite` ile veya üretici tarafında temizlenmeli;
  **`NaN` asla G-code'a sızmamalı**.
- Yorumlar "ne" değil "neden"i anlatır; mevcut dosyaların yorum yoğunluğunu
  taklit et.
