# G-Code Çıktı Referansı

Bu belge, uygulamanın ürettiği G-code'un **tam ve bağlayıcı** biçimini tanımlar.
Çıktıyı değiştirecek herkesin önce buraya uyması gerekir. Tek üretim noktası:
[src/gcode.worker.ts](../src/gcode.worker.ts) → `generateGcode`.

> Bu kuralların _nedeni_ (güvenlik gerekçesi) → [ADR-0006](./adr/0006-tabla-siniri-guvenlik.md)

---

## Genel kurallar

- **Birim:** milimetre (`G21`).
- **Konumlandırma:** mutlak (`G90`).
- **Sayı formatı:** sabit **3 ondalık** (`fmt()`); negatif sıfır `0.000`'a
  normalize edilir. Hiçbir koordinat `NaN`/`Infinity` olamaz (`assertFinite`).
- **Origin:** sol-alt köşe **(0,0)**; tüm geometri birinci kadranda, pozitif
  X/Y.
- **Z anlamı:** `SafeZ` (güvenli/yukarı) > `DrawZ` (çizim/dalış). Bu zorunlu;
  `SafeZ <= DrawZ` ise üretim hata verir.

## Program yapısı

```
1) HEADER
   ; Etiket Makinesi -> G-Code | Üretildi: <ISO tarih>
   G21 ; Milimetre
   G90 ; Mutlak konumlandirma

2) BAŞLANGIÇ GÜVENLİĞİ  (her X/Y hareketinden ÖNCE)
   G0 Z[SafeZ] ; Baslangic: guvenli yukseklige cik

3) HER YOL İÇİN (Nearest-Neighbor sırasıyla)
   ; --- Yol k/N ---
   G0 X[x0] Y[y0] F[TravelRate]      ; a. yol başına hızlı git (güvenli Z'de)
   G1 Z[DrawZ] F[FeedRate] ; Dalis    ; b. çizim derinliğine dal
   G1 X[x1] Y[y1]                     ; c. çizim hareketleri...
   G1 X[x2] Y[y2]
   ...
   G0 Z[SafeZ] ; Geri cekil           ; d. yol biter bitmez geri çekil

4) FOOTER
   ; --- Bitis ---
   G0 Z[SafeZ] ; Guvenli yukseklik
   G0 X0.000 Y0.000 F[TravelRate] ; Sifir noktasina don
   M30 ; Program sonu
```

### İhlal edilemez güvenlik sözleşmesi

1. **İlk X/Y hareketinden önce mutlaka `G0 Z[SafeZ]`.** Kalem/uç hiçbir zaman
   alçaktayken yatay seyahate başlamaz.
2. **Her yol bittiğinde anında `G0 Z[SafeZ]`** ile geri çekilme.
3. **Dalış `G1` (feed) ile**, hızlı (`G0`) değil — kontrollü iniş.
4. **Program sonunda** güvenli Z → origin (0,0) → `M30`.

Bu sırayı değiştiren her PR, hem `lines` (G-code metni) hem `moves` (simülasyon)
dizilerini tutarlı güncellemeli; aksi halde simülasyon gerçeği yansıtmaz.

## Hız (feed) kullanımı

| Hareket            | Komut | Hız parametresi |
| ------------------ | ----- | --------------- |
| Yola hızlı gidiş   | `G0`  | `TravelRate`    |
| Dalış (Z aşağı)    | `G1`  | `FeedRate`      |
| Çizim (X/Y)        | `G1`  | (dalışta verilen `FeedRate` geçerli) |
| Geri çekilme / dönüş | `G0` | `TravelRate`   |

## `moves` ile ilişki (simülasyon)

G-code üretilirken paralel bir `GMove[]` dizisi de doldurulur ve
[GCodeVisualizer](../src/components/GCodeVisualizer.tsx) bunu çizer:

- `rapid: true` → **G0**, kesik **kırmızı** çizgi (boşta/havada).
- `rapid: false` → **G1**, düz **mavi** çizgi (çizim).
- `zOnly: true` → yalnızca Z değişti (dalış/geri çekilme); XY'de çizilmez,
  sadece kalem pozisyonu güncellenir.

## Tam örnek

**Girdi:** 40×40 mm kare + ortasında r=15 daire (SVG modu). Aşağıda kısaltılmış
gerçek çıktı yapısı:

```gcode
; Etiket Makinesi -> G-Code | Üretildi: 2026-06-14T08:20:33.023Z
G21 ; Milimetre
G90 ; Mutlak konumlandirma
G0 Z5.000 ; Baslangic: guvenli yukseklige cik
; --- Yol 1/2 ---
G0 X0.000 Y0.000 F2000.000
G1 Z0.000 F1000.000 ; Dalis
G1 X40.000 Y0.000
G1 X40.000 Y40.000
G1 X0.000 Y40.000
G1 X0.000 Y0.000
G0 Z5.000 ; Geri cekil
; --- Yol 2/2 ---
G0 X35.000 Y20.000 F2000.000
G1 Z0.000 F1000.000 ; Dalis
G1 X34.93 Y21.95
... (daire çevresi)
G1 X35.000 Y20.000
G0 Z5.000 ; Geri cekil
; --- Bitis ---
G0 Z5.000 ; Guvenli yukseklik
G0 X0.000 Y0.000 F2000.000 ; Sifir noktasina don
M30 ; Program sonu
```

> Varsayılan parametreler: `SafeZ=5`, `DrawZ=0`, `FeedRate=1000`,
> `TravelRate=2000`, `Tolerance=0.1`. Bunlar [store.ts](../src/store.ts)
> içinde tanımlı ve UI'dan ayarlanabilir.

## Uyumluluk notu

Çıktı, yaygın 2D plotter/çizici yorumlayıcılarıyla (GRBL benzeri) uyumlu olacak
şekilde sade tutulmuştur: yay (`G2/G3`) üretilmez — tüm eğriler düz `G1`
parçalarına flatten edilir (tolerans = pürüzsüzlük/dosya boyutu dengesi).
Kontrolcün farklı bir lehçe bekliyorsa (örn. yazı tipi başlığı, `M3/M5` mil
komutları), eklemeyi `generateGcode` içinde yapıp burada belgele.
