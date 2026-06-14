# ADR-0004: Metin→yol için opentype.js

- **Durum:** Accepted
- **Tarih:** 2026-06-14
- **Karar verenler:** Geliştirici

## Bağlam

Ana özellik bir **etiket makinesi**: kullanıcının yazdığı metin G-code'a
dönüşmeli. Bunun için metnin glyph dış hatlarına (vektör) çevrilmesi gerekir.
Türkçe karakterler (İ, Ş, Ğ, Ç, Ö, Ü) doğru çizilmeli ve internet bağlantısı
gerekmemeli.

## Karar

Metni vektöre çevirmek için **opentype.js** kullanıyoruz
([`src/textToPaths.ts`](../../src/textToPaths.ts)). Varsayılan yazı tipi olarak
**Roboto Regular** (Apache-2.0) projeye **yerel** olarak gömülü:
`public/fonts/Roboto-Regular.ttf`. Glyph dış hatları (M/L/Q/C/Z komutları)
toleransa göre düz çizgi parçalarına flatten edilir.

## Gerekçe

| Seçenek                          | Artı                                                   | Eksi                                  | Sonuç     |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------- | --------- |
| opentype.js + yerel font (seçilen) | Tam glyph kontrolü, Unicode/Türkçe desteği, offline | Font dosyası paketlenmeli (~0.5 MB)   | ✅ Seçildi |
| Canvas `fillText` + kenar tarama | Basit                                                  | Vektör değil, kontur çıkarımı zor     | ❌         |
| Sistem fontu / Google Fonts CDN  | Font paketlemeden                                      | Offline çalışmaz, lisans/erişim riski | ❌         |

### Önemli uyarı (kayıt altına alındı)

opentype.js **v2 ESM** olarak **default export sağlamaz**. Doğru import:

```ts
import * as opentype from "opentype.js"; // ✅
// import opentype from "opentype.js";   // ❌ çalışma anında beyaz ekran
```

Yanlış import `tsc`'den geçer (çünkü `@types/opentype.js` default tanımlar) ama
tarayıcıda modül yüklenemez ve uygulama hiç render olmaz. Bu, yalnızca
çalıştırarak görülebilen bir hatadır.

## Sonuçlar

- Font yükleme **lazy + cache'li** (`loadFont()`), ilk üretimi hızlandırmak
  için uygulama açılışında arka planda ısıtılır.
- Çıktı geometrisi, SVG ile **aynı normalize sözleşmesini** izler: Y çevrilir,
  sınırlayıcı kutu (0,0)'a kaydırılır → worker tek tip girdi alır.
- Yeni font eklemek/değiştirmek: `public/fonts/` + `FONT_URL`. (Çoklu font
  desteği henüz yok; bkz. "Gelecek" notları.)

## İlgili

- Kod: `src/textToPaths.ts`, `public/fonts/Roboto-Regular.ttf`
- Diğer ADR'ler: ADR-0003 (ortak normalize), ADR-0007
