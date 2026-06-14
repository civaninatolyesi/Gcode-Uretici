# ADR-0003: SVG flatten için tarayıcı geometri motoru (maker.js yerine)

- **Durum:** Accepted
- **Tarih:** 2026-06-14
- **Karar verenler:** Geliştirici

## Bağlam

İlk istek `maker.js` ile SVG ayrıştırmaktı. Ancak hedef, **her tür** SVG
ilkelini (path, arc, kübik/kuadratik bézier, circle, rect, ellipse, polygon,
polyline) ve **iç içe transform'ları** sağlam biçimde, eğri matematiğini elle
yazmadan düz çizgi parçalarına (polyline) dönüştürmek.

## Karar

`maker.js` yerine **tarayıcının kendi SVG geometri motorunu** kullanıyoruz:
SVG'yi geçici olarak ekran dışına mount edip her şekli `<path>`'e normalize
ediyor, sonra `getTotalLength()` + `getPointAtLength()` ile toleransa göre
örnekliyoruz. Transform'lar `getCTM()` ile noktalara uygulanıyor. Tümü
[`src/svgFlatten.ts`](../../src/svgFlatten.ts) içinde, **ana thread'de**.

## Gerekçe

| Seçenek                              | Artı                                                        | Eksi                                            | Sonuç     |
| ------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------- | --------- |
| Tarayıcı geometri motoru (seçilen)   | Elle eğri/arc matematiği yok → `NaN`/yuvarlama bug'ı yok; her path tipini ve transform'u tarayıcı çözer | Yalnızca ana thread'de çalışır (DOM gerekir) | ✅ Seçildi |
| maker.js                             | Hazır API                                                   | Worker'da sorunlu, ağır API, yine de örnekleme gerek | ❌         |
| Elle SVG path parser + bézier flatten | Worker'da da çalışır                                       | Çok sayıda kenar durum, hata riski yüksek       | ❌         |

## Sonuçlar

- **SVG flatten ana thread'de** olmak zorunda (DOM/`getPointAtLength`).
  Worker'a yalnızca sonuç polyline'lar gider. Bu, [ADR-0002](./0002-web-worker-kullanimi.md)
  ile uyumludur.
- Geometri **normalize edilir**: Y ekseni çevrilir (SVG Y-aşağı → makine
  Y-yukarı) ve sınırlayıcı kutu sol-alt köşesi (0,0)'a kaydırılır.
- Aynı normalize sözleşmesi metin yolu için de geçerli
  ([ADR-0004](./0004-metin-yol-opentype.md)) → worker her iki kaynağı da aynı
  şekilde işler.

## İlgili

- Kod: `src/svgFlatten.ts`
- Diğer ADR'ler: ADR-0002, ADR-0004
