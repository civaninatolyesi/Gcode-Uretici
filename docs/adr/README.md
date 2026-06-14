# Mimari Karar Kayıtları (ADR)

Bu klasör, projedeki **önemli ve geri dönüşü maliyetli** teknik kararları
belgeler. Her ADR; o anki bağlamı, alınan kararı ve sonuçlarını dondurur ki
ileride "bu neden böyle yapılmış?" sorusu kod arkeolojisine dönüşmesin.

## ADR nedir, ne zaman yazılır?

ADR (Architecture Decision Record), tek bir mimari kararı anlatan kısa bir
belgedir. Yeni bir ADR şu durumlarda yazılır:

- Bir kütüphane/teknoloji seçimi veya **değişimi** (örn. bir parser'ı bırakmak)
- Thread/process sınırı, veri akışı yönü gibi **yapısal** kararlar
- Güvenlikle ilgili, ihlal edilemez **kural** koymak
- Geriye dönmenin pahalı olduğu her seçim

Önemsiz, kolayca geri alınabilen kararlar (değişken adı, klasör düzeni) ADR
gerektirmez.

## Durum (status) anlamları

- **Accepted** — yürürlükte, kod bunu yansıtıyor.
- **Superseded by ADR-XXXX** — yerini başka bir karara bıraktı.
- **Deprecated** — artık geçerli değil ama tarih için duruyor.

## Yeni ADR ekleme

1. Bir sonraki numarayı al (örn. `0007`).
2. [`_template.md`](./_template.md) dosyasını kopyala:
   `docs/adr/0007-kisa-baslik.md`.
3. Doldur, bu README'deki listeye bir satır ekle.
4. Bir kararın yerini alıyorsan eski ADR'nin durumunu **Superseded** yap ve
   yeni ADR'ye link ver.

## Dizin

| #    | Başlık                                                              | Durum    |
| ---- | ------------------------------------------------------------------ | -------- |
| 0001 | [Tarayıcı tabanlı CAM mimarisi](./0001-tarayici-tabanli-cam.md)    | Accepted |
| 0002 | [Ağır işler için Web Worker](./0002-web-worker-kullanimi.md)       | Accepted |
| 0003 | [SVG flatten için tarayıcı geometri motoru (maker.js yerine)](./0003-svg-flatten-tarayici-motoru.md) | Accepted |
| 0004 | [Metin→yol için opentype.js](./0004-metin-yol-opentype.md)         | Accepted |
| 0005 | [Yol optimizasyonu: Nearest Neighbor](./0005-nearest-neighbor.md)  | Accepted |
| 0006 | [Tabla sınırı güvenlik kontrolü ve indirme kilidi](./0006-tabla-siniri-guvenlik.md) | Accepted |
| 0007 | [İki kaynaklı (Metin + SVG) mod yapısı](./0007-iki-kaynak-modu.md) | Accepted |
