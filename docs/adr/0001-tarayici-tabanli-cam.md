# ADR-0001: Tarayıcı tabanlı CAM mimarisi

- **Durum:** Accepted
- **Tarih:** 2026-06-14
- **Karar verenler:** Proje sahibi (CNC mühendisi) + geliştirici

## Bağlam

Bir CNC çizici / plotter için 2D bir CAM aracı (metin ve SVG → G-code)
gerekiyordu. Kurulum kolaylığı, taşınabilirlik ve hızlı iterasyon önemliydi.
Hedef kullanıcı tek bir mühendis; bir sunucu işletmek veya masaüstü uygulaması
kurmak/imzalamak istenmiyordu.

## Karar

Uygulamayı **tamamen tarayıcıda çalışan** bir SPA olarak yazıyoruz:
**React + TypeScript + Vite + Tailwind CSS + Zustand**. Backend yok; tüm
hesaplama istemcide. Çıktı, tarayıcıdan `.gcode` dosyası olarak indirilir.

## Gerekçe

| Seçenek                          | Artı                                              | Eksi                                          | Sonuç     |
| -------------------------------- | ------------------------------------------------- | --------------------------------------------- | --------- |
| Tarayıcı SPA (seçilen)           | Kurulum yok, çapraz platform, anında dağıtım, ücretsiz hosting | Tarayıcı API'lerine bağımlı | ✅ Seçildi |
| Electron masaüstü uygulaması     | Dosya sistemi erişimi, native his                 | Kurulum/imzalama yükü, büyük paket            | ❌         |
| Sunucu taraflı (Node servisi)    | Ağır hesap için güçlü                              | Hosting/işletme maliyeti, gereksiz karmaşıklık | ❌         |

TypeScript **strict** modu; `NaN` gibi değerlerin G-code'a sızmasını tip
düzeyinde ve çalışma anı kontrolleriyle engellemek için kritik. Zustand,
Redux'a göre çok daha az kalıp kodla global durum yönetimi sağlıyor.

## Sonuçlar

- Dağıtım = statik dosyalar (`npm run build` → `dist/`). Herhangi bir statik
  host (GitHub Pages, Netlify) yeterli.
- DOM'a ihtiyaç duyan işler (SVG ölçme) ancak ana thread'de yapılabilir →
  bkz. [ADR-0003](./0003-svg-flatten-tarayici-motoru.md).
- Yerel dosya yazma yoktur; çıktı indirme yoluyla alınır.

## İlgili

- Kod: `src/main.tsx`, `src/App.tsx`, `vite.config.ts`
- Diğer ADR'ler: ADR-0002
