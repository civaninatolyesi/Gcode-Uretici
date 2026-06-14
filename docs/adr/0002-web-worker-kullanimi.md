# ADR-0002: Ağır işler için Web Worker

- **Durum:** Accepted
- **Tarih:** 2026-06-14
- **Karar verenler:** Geliştirici

## Bağlam

Yol optimizasyonu (Nearest Neighbor, O(n²)) ve G-code string üretimi, çok
sayıda noktada (özellikle düşük tolerans / büyük metinde) UI thread'ini
kilitleyebilir. Kullanıcı arayüzünün her zaman akıcı kalması bir gereksinimdi.

## Karar

Optimizasyon + G-code üretimini **özel bir Web Worker** içinde çalıştırıyoruz:
[`src/gcode.worker.ts`](../../src/gcode.worker.ts). Ana thread ile worker
yalnızca **düz, serileştirilebilir sayısal veri** (polyline dizileri + makine
parametreleri) üzerinden `postMessage` ile haberleşir.

## Gerekçe

| Seçenek                       | Artı                                     | Eksi                                    | Sonuç     |
| ----------------------------- | ---------------------------------------- | --------------------------------------- | --------- |
| Web Worker (seçilen)          | UI bloklanmaz, temiz ana/işçi ayrımı     | İki ortam, mesajlaşma sınırı            | ✅ Seçildi |
| Ana thread'de senkron         | Basit                                    | Büyük girdide UI donar                  | ❌         |
| `requestIdleCallback` parçalama | Worker'sız                              | Karmaşık, yine de jank riski            | ❌         |

**Kritik kısıt:** Worker'da DOM yoktur. Bu yüzden DOM gerektiren geometri
çıkarımı (SVG ölçme, opentype glyph yolu) **ana thread'de** yapılır; worker'a
yalnızca saf sayılar gider. Bu, hem worker'ı taşınabilir tutar hem de
`NaN`/DOM referansı gibi şeylerin mesaj sınırını geçmesini imkânsız kılar.

## Sonuçlar

- Worker'a giren her şey `src/types.ts` içindeki **yalnızca-sayı** tiplerle
  tanımlı (`Polyline`, `MachineParams`). Buraya asla DOM nesnesi koyma.
- Worker tek seferde oluşturulur ve yeniden kullanılır
  ([`useGcodeGenerator.ts`](../../src/useGcodeGenerator.ts)).
- Hata yönetimi: worker `try/catch` ile `{type:"error"}` mesajı döner; ana
  thread bunu store'a yazar. Worker asla sessizce çökmemeli.

## İlgili

- Kod: `src/gcode.worker.ts`, `src/useGcodeGenerator.ts`, `src/types.ts`
- Diğer ADR'ler: ADR-0003, ADR-0004, ADR-0005
