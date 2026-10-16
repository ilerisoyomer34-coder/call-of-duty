// Düğmelerde yazı yerine simge (Ayarlar → "Düğmelerde simge", settings.buttonIcons). Dokunmatik eylem düğmeleri
// (ATEŞ, NİŞAN, ZIPLA, ŞARJÖR…) ve iletişim düğmeleri (İLETİŞİM, MİKROFON, TELSİZ) data-icon taşır. Açılışta bir kez
// her düğmenin yazısı .lbl içine alınır, yanına .ico (SVG) eklenir; ayar yalnız body.btnIcons sınıfını değiştirir
// (CSS hangisinin görüneceğini seçer). Yazı ekran okuyucu için aria-label olarak kalır. Simgeler 24×24, currentColor.
const S = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const LINE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const BUTTON_ICONS = {
  // Fişek: ateş
  fire: S('<path d="M12 2.5c2.3 2 3.2 4.4 3.2 7V17H8.8V9.5c0-2.6.9-5 3.2-7z" fill="currentColor"/><rect x="8" y="18.2" width="8" height="3.6" rx="1" fill="currentColor"/>'),
  // Dürbün artısı: nişan al
  ads: S(`<circle cx="12" cy="12" r="7.5" ${LINE}/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5" ${LINE}/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>`),
  // Yukarı ok: zıpla
  jump: S(`<path d="M12 3.5l6.5 6.5H15v6H9v-6H5.5z" fill="currentColor"/><path d="M5 20.5h14" ${LINE}/>`),
  // Aşağı ok: çömel
  crouch: S(`<path d="M12 17.5l6.5-6.5H15V4.5H9V11H5.5z" fill="currentColor"/><path d="M5 20.5h14" ${LINE}/>`),
  // Şarjör + dönen ok: şarjör değiştir
  reload: S(`<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" ${LINE}/><path d="M20.5 3.5v5.6h-5.6z" fill="currentColor"/><path d="M10 8.5h4l.6 7.5h-5.2z" fill="currentColor"/>`),
  // El bombası: gövde, tetik kolu, pim halkası
  grenade: S('<ellipse cx="11" cy="15" rx="5.8" ry="6.5" fill="currentColor"/><rect x="8.6" y="5.5" width="4.8" height="3" rx=".6" fill="currentColor"/><path d="M13.4 6.2h3.8l-1.6 5.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="6.6" cy="5.4" r="2.1" fill="none" stroke="currentColor" stroke-width="1.5"/>'),
  // Tüfek silueti: silah değiştir
  weapon: S('<path d="M1.5 9.2h3.8V9H16v1h6.5v1.4H16V12h-1.9l.8 4.6-2.3.3-1.1-4.9H10l-.9 4h-2l.6-4H5.3l-3.3 1.6z" fill="currentColor"/><rect x="9" y="7.4" width="3.2" height="1.4" rx=".4" fill="currentColor"/>'),
  // El: kullan / etkileşim
  use: S(`<path d="M9 11.5V5.2a1.5 1.5 0 0 1 3 0v5.3m0-1.6a1.5 1.5 0 0 1 3 0v1.6m0-.6a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.8a6 6 0 0 1-5-2.7L3.8 15a1.5 1.5 0 0 1 2.4-1.7L9 15.8" ${LINE}/>`),
  // Sağlık haçı: yardım çağır
  help: S('<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor"/>'),
  // Bayrak: pes et
  giveUp: S(`<path d="M5 21.5V3" ${LINE}/><path d="M6 4h12.5l-3 4 3 4H6z" fill="currentColor"/>`),
  // Kulaklık: iletişim bölmesi
  comms: S(`<path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" ${LINE}/><rect x="3" y="13" width="4" height="7" rx="1.5" fill="currentColor"/><rect x="17" y="13" width="4" height="7" rx="1.5" fill="currentColor"/><path d="M19 20.5c0 1-2 1.6-5 1.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`),
  // Mikrofon
  mic: S(`<rect x="9" y="2.5" width="6" height="11.5" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4M8.5 21.5h7" ${LINE}/>`),
  // El telsizi: yazılı komut paneli
  radio: S(`<rect x="6.5" y="7" width="11" height="14.5" rx="2" ${LINE}/><path d="M14.5 7V2.5" ${LINE}/><rect x="9" y="9.8" width="6" height="4" rx="1" fill="currentColor"/><path d="M9.2 17h5.6M9.2 19.2h5.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`),
};

// Açılışta bir kez: [data-icon] düğmelerinin yazısını .lbl'e al, .ico ekle. Alt yazı (<small>) ve rozet yerinde kalır
export function prepareButtonIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    if (el.querySelector(':scope > .ico')) continue;
    const svg = BUTTON_ICONS[el.dataset.icon];
    if (!svg) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    const label = text.map((n) => n.textContent.trim()).join(' ');
    if (text.length) {
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = label;
      text[0].replaceWith(lbl);
      for (const n of text.slice(1)) n.remove();
    }
    const ico = document.createElement('span');
    ico.className = 'ico';
    ico.innerHTML = svg; // sabit, kod içi SVG (kullanıcı verisi değil)
    el.prepend(ico);
    if (label && !el.getAttribute('aria-label')) el.setAttribute('aria-label', label);
  }
}

export function applyButtonIcons(on) {
  document.body.classList.toggle('btnIcons', !!on);
}
