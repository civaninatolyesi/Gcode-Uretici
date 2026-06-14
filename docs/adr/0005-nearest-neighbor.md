# ADR-0005: Yol optimizasyonu — Nearest Neighbor

- **Durum:** Accepted
- **Tarih:** 2026-06-14
- **Karar verenler:** Geliştirici

## Bağlam

Bir çizimde çok sayıda ayrı yol (polyline) bulunur. Bunları girdi sırasında
işlemek, kalemin boşta (G0) çok dolaşmasına ve süre kaybına yol açar. Yolların,
"havada geçen" mesafeyi azaltacak şekilde sıralanması gerekir.

## Karar

Worker içinde **açgözlü (greedy) Nearest-Neighbor** sezgiseli kullanıyoruz
([`src/gcode.worker.ts`](../../src/gcode.worker.ts) → `nearestNeighborOrder`).
Origin (0,0)'dan başlayıp her adımda, mevcut konuma **en yakın uç noktası**
(baş veya kuyruk) olan ziyaret edilmemiş yolu seçiyoruz; kuyruk daha yakınsa
yolu ters çevirip yakın uçtan dalış yapıyoruz.

## Gerekçe

| Seçenek                       | Artı                                              | Eksi                                    | Sonuç     |
| ----------------------------- | ------------------------------------------------- | --------------------------------------- | --------- |
| Greedy Nearest-Neighbor (seçilen) | Basit, O(n²) ama plotter yükü için yeterince hızlı, boşta mesafeyi ciddi azaltır | Optimal değil (TSP yaklaşık çözümü) | ✅ Seçildi |
| Optimize etmeme               | Sıfır kod                                          | Çok fazla boşta gezinme                 | ❌         |
| 2-opt / tam TSP               | Daha kısa toplam yol                               | Karmaşık, bu ölçekte gereksiz           | ❌         |

## Sonuçlar

- Karmaşıklık O(n²); tipik etiket/çizim yol sayısında anında çalışır. Çok büyük
  girdilerde (on binlerce yol) yavaşlayabilir — gerekirse uzamsal index (grid /
  k-d tree) ile hızlandırılabilir.
- Sonuç **deterministiktir** (aynı girdi → aynı sıra).
- Ters çevirme sayesinde her yola **en yakın ucundan** girilir; bu, dalış
  öncesi konumlanmayı da iyileştirir.

## İlgili

- Kod: `src/gcode.worker.ts` (`nearestNeighborOrder`, `dist2`)
- Diğer ADR'ler: ADR-0002
