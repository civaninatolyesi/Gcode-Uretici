# CNC Etiket Makinesi (Label Maker)

Tarayıcı tabanlı bir 2D CAM aracı. **Yazdığınız metni** (ana özellik) veya bir
**SVG dosyasını** (yan özellik) güvenli, optimize edilmiş **G-code**'a
dönüştürür; sonucu canvas üzerinde simüle eder ve fiziksel boyutu makine tabla
sınırlarıyla kontrol eder. CNC çizici / plotter / kalem-plotter için tasarlandı.

![mod](https://img.shields.io/badge/mod-Metin%20%2B%20SVG-blue) ![dil](https://img.shields.io/badge/aray%C3%BCz-T%C3%BCrk%C3%A7e-red) ![lisans](https://img.shields.io/badge/font-Roboto%20(Apache--2.0)-green)

---

## Özellikler

- ✍️ **Metin → G-code** (opentype.js): yazdığınız etiketi vektör yola çevirir,
  Türkçe karakterler dahil. Varsayılan font gömülü (offline çalışır).
- 🖼️ **SVG → G-code** (yan özellik): path, line, rect, circle, ellipse,
  polyline, polygon + iç içe transform desteği.
- ⚡ **Web Worker**: ağır hesap (optimizasyon + G-code üretimi) UI'yi bloklamaz.
- 🧭 **Nearest-Neighbor** yol optimizasyonu: boşta gezinme süresini azaltır.
- 📐 **Canlı fiziksel boyut + tabla sınırı güvenliği**: çizim tablayı aşarsa
  uyarı verir ve **indirmeyi kilitler** — makine sınır dışına çıkmaz.
- 👁️ **G-code simülasyonu**: G0 (boşta) kesik kırmızı, G1 (kesim) düz mavi.
- 🛡️ **Makine güvenliği**: her X/Y'den önce Güvenli Z, yol sonunda anında geri
  çekilme, `NaN` koruması.
- 🇹🇷 Tamamen Türkçe, responsive arayüz.

## Hızlı başlangıç

> Node.js 18+ gereklidir → https://nodejs.org

```bash
npm install
npm run dev        # http://localhost:5173
```

Üretim derlemesi:

```bash
npm run build      # tsc + Vite → dist/   (statik, herhangi bir host'a koyulabilir)
npm run preview    # derlemeyi yerelde önizle
```

## Kullanım

1. Üstteki sekmeden modu seç: **Etiket (Metin)** veya **SVG Dosyası**.
2. **Metin modu:** yazıyı ve yazı boyutunu (mm) gir.
   **SVG modu:** `.svg` dosyasını sürükle-bırak.
3. **Tabla Sınırları** (Max X / Max Y) ve **Makine Parametreleri**ni ayarla.
4. **G-Code Üret** → simülasyonu ve canlı boyutu incele.
5. Boyut tablaya sığıyorsa **G-Code İndir** ile `.gcode` dosyasını kaydet.
   (Sığmıyorsa kırmızı uyarı çıkar ve indirme kilitlenir.)

## CNC parametreleri (varsayılanlar)

| Parametre | Açıklama | Varsayılan |
| --------- | -------- | ---------- |
| Güvenli Z | Güvenli/yukarı yükseklik | 5 mm |
| Çizim Z   | Dalış/çizim derinliği | 0 mm |
| Kesim Hızı (F) | Çizim feed | 1000 mm/dk |
| Boşta Gezinme Hızı | G0 feed | 2000 mm/dk |
| Hassasiyet (Tolerans) | Eğri flatten adımı | 0.1 mm |
| Tabla Max X / Max Y | Fiziksel çalışma alanı | 200 × 200 mm |

> **Güvenli Z > Çizim Z** zorunludur; tüm hızlar > 0 olmalıdır.

## G-code güvenlik özeti

- Header `G21` (metrik) + `G90` (mutlak).
- Herhangi bir X/Y hareketinden **önce** `G0 Z[SafeZ]`.
- Yol: `G0 X Y` → `G1 Z[DrawZ] F[Feed]` (dalış) → `G1 X Y` (çizim) →
  `G0 Z[SafeZ]` (geri çekil).
- Footer: Güvenli Z → `G0 X0 Y0` → `M30`.
- Origin sol-alt **(0,0)**; tüm geometri pozitif kadranda.

Tam biçim ve örnek çıktı → [docs/GCODE-REFERANSI.md](./docs/GCODE-REFERANSI.md).

## Dokümantasyon

| Belge | İçerik |
| ----- | ------ |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Sistem tasarımı, veri akışı, thread sınırı, katman haritası |
| [docs/GELISTIRME-REHBERI.md](./docs/GELISTIRME-REHBERI.md) | "Şunu değiştirmek istiyorum, hangi dosya?" görev odaklı reçeteler |
| [docs/GCODE-REFERANSI.md](./docs/GCODE-REFERANSI.md) | Üretilen G-code'un tam ve bağlayıcı biçimi |
| [docs/adr/](./docs/adr/) | Mimari Karar Kayıtları (neden bu teknolojiler/yapı seçildi) |

**Yeni geliştirici misin?** Önce [ARCHITECTURE.md](./docs/ARCHITECTURE.md)'i
oku (akışı kavra), sonra dokunacağın görev için
[GELISTIRME-REHBERI.md](./docs/GELISTIRME-REHBERI.md)'ndeki reçeteye bak.

## Proje yapısı

```
src/
├─ main.tsx                 React kök montajı
├─ App.tsx                  Yerleşim, sekme, boyut paneli, indirme
├─ store.ts                 Zustand durum + checkWithinLimits()
├─ types.ts                 Ana↔worker sözleşmesi (paylaşılan tipler)
├─ useGcodeGenerator.ts     Worker yaşam döngüsü + generate() orkestrasyonu
├─ textToPaths.ts           Metin → polyline (opentype.js)         [ana thread]
├─ svgFlatten.ts            SVG → polyline (tarayıcı geometri)     [ana thread]
├─ gcode.worker.ts          NN sıralama + G-code + bbox + moves    [WEB WORKER]
└─ components/
   ├─ TextInputPanel.tsx    Metin + yazı boyutu
   ├─ Dropzone.tsx          SVG sürükle-bırak
   ├─ ConfigPanel.tsx       Tabla sınırları + makine parametreleri
   └─ GCodeVisualizer.tsx   Canvas simülasyonu
public/fonts/Roboto-Regular.ttf   Varsayılan font (Apache-2.0)
docs/                       Mimari, rehber, G-code referansı, ADR'ler
```

## Teknoloji yığını

React · TypeScript (strict) · Vite · Tailwind CSS · Zustand · Web Worker ·
opentype.js · tarayıcı SVG geometri motoru.

## Lisans / atıf

Varsayılan font **Roboto** (Apache License 2.0, Google Fonts).
