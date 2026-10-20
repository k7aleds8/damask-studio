import type { preview as en } from './en';

export const preview: typeof en = {
  show: 'Önizleme',
  close: 'Kapat',
  now: 'Şu an',
  after: 'Sonra',
  on: 'Açık',
  off: 'Kapalı',
  setting: 'Seçenek önizlemeleri',
  settingDesc: 'Bir seçeneğe dokunmadan önce neyin değişeceğini kısa bir animasyonla gösterir.',
  scenes: {
    mod: {
      home: 'Ana notunuz bir panoya dönüşür: selamlama, saat, kasa sayıları ve gününüz tek bakışta.',
      inserter: 'Düzenleyici menüsüne “Blok ekle” seçeneğini, blok galerisini ve kısayollarını ekler.',
      embeds: 'Çizimleri ve görselleri düzenler; hizalama, genişlik ve çerçeve. Üzerine gelince bir araç çubuğu çıkar.',
      folders: 'Her ana klasörü ve içindeki her şeyi renklendirir, ağaç boyunca kılavuz çizgileri çizer.',
      headings: 'Her başlık düzeyine tüm notlarınızda kendi rengini ve stilini verir.',
      variants: 'Temanın koyu ve açık mod renk paletini doğrudan bu panelden seçin.',
      pomodoro: 'Bir odak zamanlayıcısı ekler: şeritte bir düğme, bir yan panel ve durum çubuğunda geri sayım.',
      health: 'Kırık bağlantıları, boş notları ve sahipsiz dosyaları bulur, tek tıkla düzeltmeyi önerir.',
      ticktick: 'Açıkken görev ve odak istatistikleri TickTick’ten gelir. Kapalıyken kendi notlarınızdan hesaplanır.',
    },
    ins: {
      menu: 'Notta sağ tıklayın; “Blok ekle” menüde sizi bekliyor.',
      suggest: 'Herhangi bir satırda ;; yazın, klavyeden ayrılmadan blok seçin.',
      ribbon: 'Şeritte bir galeri düğmesi; her nottan tek tık uzakta.',
    },
    emb: {
      enabled: 'Varsayılan düzeninizi her çizime uygular. Kapalıyken Obsidian onları olduğu gibi gösterir.',
      toolbar: 'Bir çizim ya da görselin üzerine gelince küçük bir düzen çubuğu belirir.',
      trigger: 'Çubuk ya her üzerine gelişte ya da yalnızca Alt basılıyken görünür.',
      images: 'Aynı düzeni yalnızca Excalidraw çizimlerine değil, sıradan görsellere de uygular.',
      align: 'Çizimin sayfanın bir ucundan öbürüne nerede duracağı.',
      width: 'Çizimin sayfa genişliğinden ne kadar yer kaplayacağı; otomatik, doğal boyutunu korur.',
      maxWidth: 'Geniş çizimler büyük ekranlarda durmadan uzamasın diye bir genişlik sınırı.',
      frame: 'Çizimin çevresine çizilen çerçeve.',
      shadow: 'Çizimi sayfadan hafifçe kaldıran yumuşak bir gölge.',
      invert: 'Açık renkli bir çizimin renklerini çevirir, böylece koyu sayfaya uyum sağlar.',
    },
  },
};
